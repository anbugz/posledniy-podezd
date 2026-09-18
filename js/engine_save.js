/* «Последний подъезд» — engine: состояние, сейв, оффлайн-прогресс (ТЗ §6-§7).
   Правки v2: версия сейва 3 (training, bag, bagSize, loop-волны),
   миграция v2 → v3 без потери прогресса, оффлайн без пассивного дохода. */
(function (P) {
  "use strict";

  P.SAVE_KEY = "podezd_save_v3";
  P.OLD_SAVE_KEYS = ["podezd_save_v2"];
  P.OFFLINE_CAP_SEC = 12 * 3600;

  P.defaultState = function () {
    const skills = {};
    for (const id of Object.keys(P.SKILLS)) skills[id] = { readyAt: 0 };
    return {
      version: 3,
      supplies: 0,
      tech: 0,
      totalSupplies: 0,
      hero: { hp: 120 },
      equipment: P.startingEquipment(),
      bag: [],
      bagSize: P.CONFIG.BAG_START,
      training: { str: 0, vit: 0, def: 0, acc: 0 },
      zones: {
        apartment: { unlocked: true, level: 1, wave: 1, maxWave: 1 },
        entrance: { unlocked: false, level: 1, wave: 1, maxWave: 1 },
        yard: { unlocked: false, level: 1, wave: 1, maxWave: 1 },
        house: { unlocked: false, level: 1, wave: 1, maxWave: 1 },
        district: { unlocked: false, level: 1, wave: 1, maxWave: 1 },
      },
      activeZone: "apartment",
      autoFarm: false,
      // порог продажи по редкости: 0=выкл, 1=Обычный..4=Эпический (индекс+1)
      autoSell: 0,
      autoSellOn: false,     // авто-продажа по порогу (иначе — только кнопкой)
      hubUnlocked: false,    // зачистка Дома -> база/хаб
      veteranUnlocked: false, // зачистка Двора -> «Самоделки»
      upgradesUnlocked: false, // зачистка Района -> улучшение предметов
      skills,
      dayNight: { phase: "day", phaseEndsAt: 180 },
      event: { nextAt: 600, activeUntil: 0 },
      stats: { wavesCleared: 0, kills: 0, itemsFound: 0, deaths: 0, startedAt: Date.now() },
      lastTick: Date.now(),
    };
  };

  const memoryStorage = (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  })();
  // localStorage может быть недоступен (file:// с ограничениями, приватный режим) —
  // тогда игра работает в памяти без сейва.
  let storage = memoryStorage;
  try {
    if (typeof localStorage !== "undefined") {
      const probe = "__podezd_probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      storage = localStorage;
    }
  } catch (e) {
    storage = memoryStorage;
  }
  P.storage = storage;

  P.save = function (state) {
    state.lastTick = Date.now();
    P.storage.setItem(P.SAVE_KEY, JSON.stringify(state));
  };

  /* Миграция: v3 — как есть; v2 → v3 (переносим прогресс, добавляем
     training/bag/bagSize); повреждённый/чужой -> новая игра. */
  P.migrate = function (raw) {
    if (!raw) return P.defaultState();
    if (raw.version === 2) raw = migrateV2toV3(raw);
    if (raw.version !== 3) return P.defaultState();
    const d = P.defaultState();
    const s = Object.assign(d, raw);
    s.hero = Object.assign({ hp: 120 }, raw.hero);
    s.equipment = Object.assign(d.equipment, raw.equipment);
    s.bag = Array.isArray(raw.bag) ? raw.bag : [];
    s.training = Object.assign({ str: 0, vit: 0, def: 0, acc: 0 }, raw.training);
    s.zones = Object.assign(d.zones, raw.zones);
    for (const id of P.ZONE_ORDER) {
      s.zones[id] = Object.assign({ unlocked: false, level: 1, wave: 1, maxWave: 1 }, s.zones[id]);
      // старые сейвы без maxWave: потолок не ниже уже достигнутой волны
      s.zones[id].maxWave = Math.max(s.zones[id].maxWave || 1, s.zones[id].wave || 1);
    }
    // v3.2: ретроактивное открытие — если круг зоны уже зачищен в старом сейве,
    // следующая зона и гейты открываются без повторного убийства босса
    for (const id of P.ZONE_ORDER) {
      const zdef = P.ZONES[id];
      const z = s.zones[id];
      if ((z.maxWave || 1) < zdef.wavesCap) continue;
      if (zdef.next && s.zones[zdef.next] && !s.zones[zdef.next].unlocked)
        s.zones[zdef.next].unlocked = true;
      if (id === "yard") s.veteranUnlocked = true;
      if (id === "house") s.hubUnlocked = true;
      if (id === "district") s.upgradesUnlocked = true;
    }
    s.skills = Object.assign(d.skills, raw.skills);
    s.stats = Object.assign(d.stats, raw.stats);
    // v3.2: старый autoSell > 0 означал включённую авто-продажу
    s.autoSellOn = raw.autoSellOn != null ? !!raw.autoSellOn : (raw.autoSell || 0) > 0;
    return s;
  };

  function migrateV2toV3(raw) {
    return {
      version: 3,
      supplies: raw.supplies || 0,
      tech: raw.tech || 0,
      totalSupplies: raw.totalSupplies || 0,
      hero: raw.hero || { hp: 120 },
      equipment: raw.equipment || null, // null -> подставится starting в migrate
      bag: [],
      bagSize: P.CONFIG.BAG_START,
      training: { str: 0, vit: 0, def: 0, acc: 0 },
      zones: raw.zones || null,
      skills: raw.skills || {},
      dayNight: raw.dayNight || null,
      event: raw.event || null,
      stats: raw.stats || {},
      lastTick: raw.lastTick || Date.now(),
    };
  }

  /* Оффлайн-прогресс: те же формулы, fast-forward.
     Волны проходятся, пока build проходит дальше (T_kill < T_survive),
     дальше — стоп. Пассивного дохода нет: припасы только с волн.
     Возвращает отчёт для экрана возвращения. */
  P.applyOffline = function (state, elapsedSec) {
    const report = {
      elapsedSec: Math.min(elapsedSec, P.OFFLINE_CAP_SEC),
      supplies: 0,
      tech: 0,
      wavesFrom: state.zones.apartment.wave,
      wavesTo: state.zones.apartment.wave,
      items: [],
      capped: elapsedSec > P.OFFLINE_CAP_SEC,
    };
    if (report.elapsedSec <= 5) return report;

    const zdef = P.ZONES.apartment;
    const zone = state.zones.apartment;
    let t = report.elapsedSec;

    // волны: идут, пока герой проходит; цикл волны = бой + пауза
    const hero = P.calcHero(state);
    let guard = 0; // защита от бесконечного цикла
    while (t > 0 && guard++ < 100000) {
      const enemy = P.enemyStats(zone.wave, zdef.tier, zdef.wavesCap);
      const check = P.waveCheck(hero, enemy, hero.hpMax);
      if (!check.win) break;
      const cycleSec = check.tKill + P.WAVE_GAP;
      if (cycleSec > t) break;
      t -= cycleSec;
      // награды волны (loot chance x0.5 offline)
      const heroNow = P.calcHero(state);
      const sup = Math.floor(P.waveSupplies(zone.wave) * heroNow.supMult);
      state.supplies += sup;
      state.totalSupplies += sup;
      report.supplies += sup;
      state.tech += P.rollTech(enemy.kind, 0.5);
      // гарантированное оружие на 3-й волне круга
      if (P.waveCycle(zone.wave, zdef.wavesCap).nEff === 3) {
        const loot = P.rollGuaranteedWeapon(state, zdef.tier, Math.random, zone.wave);
        if (loot) report.items.push(loot);
      } else {
        const loot = P.rollLoot(state, enemy.kind, zdef.tier, true, Math.random, zone.wave);
        if (loot) report.items.push(loot);
      }
      // зачистка круга оффлайн -> открываем подъезд
      if (zone.wave % zdef.wavesCap === 0 && zdef.next && state.zones[zdef.next] && !state.zones[zdef.next].unlocked) {
        state.zones[zdef.next].unlocked = true;
        report.zoneUnlocked = zdef.next;
      }
      zone.wave += 1;
      zone.maxWave = Math.max(zone.maxWave || 1, zone.wave);
      state.stats.wavesCleared++;
    }
    report.tech = state.tech;
    report.wavesTo = zone.wave;

    // HP героя при возвращении — полный (реген вне боя)
    state.hero.hp = P.calcHero(state).hpMax;
    return report;
  };

  P.load = function () {
    let raw = P.storage.getItem(P.SAVE_KEY);
    if (!raw) {
      for (const k of P.OLD_SAVE_KEYS) {
        raw = P.storage.getItem(k);
        if (raw) break;
      }
    }
    if (!raw) return { state: P.defaultState(), report: null };
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { state: P.defaultState(), report: null };
    }
    const state = P.migrate(parsed);
    const elapsedSec = Math.max((Date.now() - state.lastTick) / 1000, 0);
    const report = P.applyOffline(state, elapsedSec);
    state.lastTick = Date.now();
    return { state, report };
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
