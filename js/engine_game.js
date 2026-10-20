/* «Последний подъезд» — engine: главный цикл игры.
   Мультизоны (v3.1): бой идёт в ОДНОЙ активной зоне (state.activeZone),
   у каждой зоны свои wave/maxWave. Хаб открывается зачисткой Дома.
   Тик: бой, день/ночь, ивент, навыки. Независим от DOM — тестируется в node. */
(function (P) {
  "use strict";

  /* state.now — игровое время в секундах (накопительное). */
  P.createGame = function (state, hooks) {
    hooks = hooks || {};
    state.now = state.now || 0;
    if (!state.zones[state.activeZone]) state.activeZone = "apartment";

    const game = {
      state,
      combat: null,        // бой активной зоны (см. setZone)
      combatByZone: {},    // ленивые сессии боя по зонам
      activeSkills: [], // {id, kind, value, endsAt}
      lootQueue: [],    // результаты лута для UI-попапов
      banner: null,     // {text, until} для баннеров ивентов
    };

    function onCombatEvent(ev) {
      const zoneId = ev.zoneId;
      const zone = state.zones[zoneId];
      const zdef = P.ZONES[zoneId];
      if (ev.type === "waveWin") {
        state.stats.wavesCleared++;
        state.stats.kills++;
        const hero = P.calcHero(state);
        const sup = Math.floor(P.waveSupplies(ev.wave) * hero.supMult);
        state.supplies += sup;
        state.totalSupplies += sup;
        // технологии: множитель шанса ночью и на ивенте
        const nightMult = isNight() ? P.DAY_NIGHT.night.techChance : 1;
        const evMult = isEvent() ? P.EVENT.techChance : 1;
        state.tech += P.rollTech(ev.enemy.kind, nightMult * evMult);
        // v4.0: опыт выживания — валюта «Самоделок» (+1 волна / +2 элита / +5 босс)
        // v4.2: RL≥3 — +10% опыта
        state.exp = (state.exp || 0) + P.expGain(state, ev.enemy.kind);
        // v4.3: выбранный путь качается тем же опытом волн (без RL-бонуса)
        P.pathExpGain(state, ev.enemy.kind);
        // лут (v4.1): расписание гарант-дропов по слотам, золотая волна
        // (+2 ступени редкости), иначе обычный бросок
        // v4.5: каждая волна без оружия копит pity-таймер (сброс — в applyLoot);
        // приоритет бросков — в rollWaveLoot
        state.pityWeapon = (state.pityWeapon || 0) + 1;
        const nEff = P.waveCycle(ev.wave, zdef.wavesCap).nEff;
        const loot = P.rollWaveLoot(state, ev.enemy.kind, zdef.tier, ev.golden, false, Math.random, ev.wave, nEff);
        if (loot) {
          game.lootQueue.push(loot);
          // v4.2: RL≥16 — авто-«Надеть лучшее» после каждой находки в сумку
          if (loot.toBag && P.autoEquipBestOn(state)) P.equipBest(state);
        }
        // авто-фарм: +1 к волне делает combat.win(); здесь только проверка
        // «стены»: если следующая волна непроходима — ничего, фармим дальше
        // (раньше тут был второй +1 — волна перепрыгивала босса 20-й,
        // zoneClear не срабатывал и зона не открывалась без перезагрузки)
        hooks.onWaveWin && hooks.onWaveWin(ev);
      } else if (ev.type === "knockout") {
        state.stats.deaths++;
        // авто-фарм: нокаут — отступаем на волну ниже
        if (state.autoFarm) zone.wave = Math.max(1, zone.wave - 1);
        hooks.onKnockout && hooks.onKnockout(ev);
      } else if (ev.type === "waveLoss") {
        // авто-фарм: отступление — откатываемся на волну ниже
        if (state.autoFarm) zone.wave = Math.max(1, zone.wave - 1);
        hooks.onWaveLoss && hooks.onWaveLoss(ev);
      } else if (ev.type === "zoneClear") {
        // баннер зачистки собираем из частей: уник (v4.1) + открытие зоны/гейта
        const parts = [];
        // v4.2: повторный круг (RL≥5) — очко времени за круг, без повторных гейтов
        if (ev.cycle > 0) {
          state.prestige = state.prestige || P.defaultPrestige();
          state.prestige.circles = (state.prestige.circles || 0) + 1;
          parts.push("🔄 КРУГ " + (ev.cycle + 1) + " ЗАЧИЩЕН! +1 очко времени при возврате.");
          game.banner = { text: parts.join("  "), until: state.now + 12 };
          hooks.onZoneClear && hooks.onZoneClear(ev);
          return;
        }
        // v4.1: уник с первого зачистки зоны (один раз)
        const uniq = P.rollUnique(state, zoneId, zdef.tier, Math.random, zone.wave);
        if (uniq) {
          game.lootQueue.push(uniq);
          parts.push("🏆 УНИК: " + uniq.item.name + " — уже в сумке!");
        }
        const next = P.ZONES[zoneId].next;
        if (next && state.zones[next] && !state.zones[next].unlocked) {
          state.zones[next].unlocked = true;
          parts.push("🔓 " + P.ZONES[next].name.toUpperCase() + " ОТКРЫТ! Фронт подвинулся выше.");
        }
        // зачистка зон открывает прокачки (по цепочке фронтов)
        if (zoneId === "yard" && !state.veteranUnlocked) {
          state.veteranUnlocked = true;
          parts.push("🎖 ДВОР ЗАЧИЩЕН! Ветеран учит «Полевым приёмам» и предлагает выбрать Путь — на базе.");
        }
        if (zoneId === "house" && !state.hubUnlocked) {
          state.hubUnlocked = true;
          parts.push("🏠 ДОМ ЗАЧИЩЕН! База укреплена — дальше Район и Оружейник.");
        }
        if (zoneId === "district" && !state.upgradesUnlocked) {
          state.upgradesUnlocked = true;
          parts.push("🔧 РАЙОН ЗАЧИЩЕН! Оружейник снимает предел усиления (+5 → ∞) и берётся за перековку аффиксов.");
          parts.push("⏳ В пыльном ларце найдены часы «Слава» — на базе доступен «Возврат в первый день».");
        }
        if (parts.length) game.banner = { text: parts.join("  "), until: state.now + 12 };
        hooks.onZoneClear && hooks.onZoneClear(ev);
      } else {
        // v4.1: золотая волна — баннер «особой находки»
        if (ev.type === "waveStart" && ev.golden) {
          game.banner = { text: "✨ ОСОБАЯ НАХОДКА: волна золотится — дроп на 2 ступени выше!", until: state.now + 6 };
        }
        hooks.onEvent && hooks.onEvent(ev);
      }
    }

    /* Сессия боя зоны (лениво). */
    function getCombat(zoneId) {
      if (!game.combatByZone[zoneId]) {
        game.combatByZone[zoneId] = P.createCombat(state, zoneId, onCombatEvent);
      }
      return game.combatByZone[zoneId];
    }

    /* Переключить активную зону (вне боя, только открытые). */
    game.setZone = function (zoneId) {
      if (!state.zones[zoneId] || !state.zones[zoneId].unlocked) return false;
      if (game.combat && game.combat.phase === "fight") return false;
      state.activeZone = zoneId;
      game.combat = getCombat(zoneId);
      return true;
    };

    function isNight() {
      return state.dayNight.phase === "night";
    }
    function isEvent() {
      return state.now < state.event.activeUntil;
    }

    /* Множитель DPS от активных навыков */
    function skillsMult() {
      let m = 1;
      for (const s of game.activeSkills) {
        if (s.kind === "dpsMult") m *= s.value;
      }
      return m;
    }

    /* Активировать навык. Возвращает false если на кулдауне/залочен. */
    game.useSkill = function (id) {
      const def = P.SKILLS[id];
      if (!def) return false;
      const zone = state.zones[state.activeZone];
      if (def.unlockWave && zone.wave < def.unlockWave) return false;
      if (state.now < state.skills[id].readyAt) return false;
      state.skills[id].readyAt = state.now + def.cooldown;
      if (def.kind === "heal") {
        const hero = P.calcHero(state);
        state.hero.hp = Math.min(hero.hpMax, state.hero.hp + hero.hpMax * def.value);
      } else {
        game.activeSkills.push({
          id, kind: def.kind, value: def.value,
          endsAt: state.now + def.duration,
        });
      }
      hooks.onSkill && hooks.onSkill(id, def);
      return true;
    };

    game.activeSkillMult = skillsMult;
    game.isNight = isNight;
    game.isEvent = isEvent;

    /* Переключить текущую волну активной зоны (◀ ▶): только вне боя,
       в пределах [1, maxWave]. Возвращает true, если волна изменилась. */
    game.setWave = function (n) {
      const zone = state.zones[state.activeZone];
      if (game.combat.phase === "fight") return false;
      n = Math.max(1, Math.min(n, zone.maxWave || 1));
      if (n === zone.wave) return false;
      zone.wave = n;
      return true;
    };

    /* Главный тик. dt в секундах. */
    game.update = function (dt) {
      state.now += dt;

      // день/ночь
      const dn = state.dayNight;
      dn.phaseEndsAt -= dt;
      if (dn.phaseEndsAt <= 0) {
        if (dn.phase === "day") {
          dn.phase = "night";
          dn.phaseEndsAt = P.DAY_NIGHT.nightSec;
          game.banner = { text: "🌙 НОЧЬ: волны чаще, технологий больше", until: state.now + 5 };
        } else {
          dn.phase = "day";
          dn.phaseEndsAt = P.DAY_NIGHT.daySec;
          game.banner = { text: "☀ ДЕНЬ: спокойнее, можно перебить припасы", until: state.now + 5 };
        }
        hooks.onDayNight && hooks.onDayNight(dn.phase);
      }

      // ивент «Массированная волна»
      const ev = state.event;
      if (state.now >= ev.nextAt && ev.activeUntil === 0) {
        ev.activeUntil = state.now + P.EVENT.durationSec;
        game.banner = { text: "⚠ " + P.EVENT.name + ": ×3 врагов, ×3 технологий, ×2 редкого лута", until: state.now + P.EVENT.durationSec };
        hooks.onEventStart && hooks.onEventStart();
      }
      if (ev.activeUntil && state.now >= ev.activeUntil) {
        ev.activeUntil = 0;
        ev.nextAt = state.now + P.EVENT.everySec;
      }

      // кулдауны активных навыков
      game.activeSkills = game.activeSkills.filter((s) => state.now < s.endsAt);

      // бой активной зоны (ночью волны идут чаще — бой тикает быстрее)
      const rate = isNight() ? P.DAY_NIGHT.night.waveRate : 1;
      game.combat.update(dt * rate, skillsMult());
    };

    // стартовая активная зона
    game.combat = getCombat(state.activeZone);

    return game;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
