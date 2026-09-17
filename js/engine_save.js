/* «Последний подъезд» — engine: состояние, сейв, оффлайн-прогресс (ТЗ §6-§7). */
(function (P) {
  "use strict";

  P.SAVE_KEY = "podezd_save_v2";
  P.OFFLINE_CAP_SEC = 12 * 3600;

  P.defaultState = function () {
    const skills = {};
    for (const id of Object.keys(P.SKILLS)) skills[id] = { readyAt: 0 };
    return {
      version: 2,
      supplies: 0,
      tech: 0,
      totalSupplies: 0,
      hero: { hp: 120 },
      equipment: P.startingEquipment(),
      zones: {
        apartment: { unlocked: true, level: 1, wave: 1 },
        entrance: { unlocked: false, level: 1, wave: 1 },
      },
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

  P.migrate = function (raw) {
    // MVP: только свежий сейд v2. Повреждённый/чужой -> новая игра.
    if (!raw || raw.version !== 2) return P.defaultState();
    const d = P.defaultState();
    const s = Object.assign(d, raw);
    s.hero = Object.assign({ hp: 120 }, raw.hero);
    s.zones = Object.assign(d.zones, raw.zones);
    for (const id of P.ZONE_ORDER) {
      s.zones[id] = Object.assign({ unlocked: false, level: 1, wave: 1 }, s.zones[id]);
    }
    s.skills = Object.assign(d.skills, raw.skills);
    s.stats = Object.assign(d.stats, raw.stats);
    return s;
  };

  /* Оффлайн-прогресс: те же формулы, fast-forward.
     Волны проходятся, пока build проходит дальше (T_kill < T_survive),
     дальше — стоп. Возвращает отчёт для экрана возвращения. */
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

    // 1) доход зон: копится всё отсутствие
    const income = P.totalIncome(state) * t;
    state.supplies += income;
    state.totalSupplies += income;
    report.supplies += income;

    // 2) волны: идут, пока герой проходит; цикл волны = бой + пауза
    const hero = P.calcHero(state);
    while (t > 0 && zone.wave <= zdef.wavesCap) {
      const enemy = P.enemyStats(zone.wave, zdef.tier);
      const check = P.waveCheck(hero, enemy, hero.hpMax);
      if (!check.win) break;
      const cycleSec = check.tKill + P.WAVE_GAP;
      if (cycleSec > t) break;
      t -= cycleSec;
      // награды волны (loot chance x0.5 offline)
      const sup = P.waveSupplies(zone.wave);
      state.supplies += sup;
      state.totalSupplies += sup;
      report.supplies += sup;
      state.tech += P.rollTech(enemy.kind, 0.5);
      report.tech = state.tech - (report.techStart || 0);
      const loot = P.rollLoot(state, enemy.kind, zdef.tier, true);
      if (loot) report.items.push(loot);
      zone.wave += 1;
      state.stats.wavesCleared++;
    }
    report.tech = state.tech;
    report.wavesTo = zone.wave;

    // HP героя при возвращении — полный (реген вне боя)
    state.hero.hp = hero.hpMax;
    return report;
  };

  P.load = function () {
    const raw = P.storage.getItem(P.SAVE_KEY);
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
