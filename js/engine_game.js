/* «Последний подъезд» — engine: главный цикл игры.
   Тик: доход, бой, день/ночь, ивент, навыки. Независим от DOM — тестируется в node. */
(function (P) {
  "use strict";

  /* state.now — игровое время в секундах (накопительное). */
  P.createGame = function (state, hooks) {
    hooks = hooks || {};
    state.now = state.now || 0;

    const game = {
      state,
      combat: null,
      activeSkills: [], // {id, kind, value, endsAt}
      lootQueue: [],    // результаты лута для UI-попапов
      banner: null,     // {text, until} для баннеров ивентов
    };

    game.combat = P.createCombat(state, "apartment", (ev) => {
      if (ev.type === "waveWin") {
        state.stats.wavesCleared++;
        state.stats.kills++;
        const zdef = P.ZONES.apartment;
        const hero = P.calcHero(state);
        const sup = Math.floor(P.waveSupplies(ev.wave) * hero.supMult);
        state.supplies += sup;
        state.totalSupplies += sup;
        // технологии: множитель шанса ночью и на ивенте
        const nightMult = isNight() ? P.DAY_NIGHT.night.techChance : 1;
        const evMult = isEvent() ? P.EVENT.techChance : 1;
        state.tech += P.rollTech(ev.enemy.kind, nightMult * evMult);
        // лут: гарантированное оружие на волне 3, иначе обычный бросок
        let loot = null;
        if (ev.wave === 3) loot = P.rollGuaranteedWeapon(state, zdef.tier);
        else loot = P.rollLoot(state, ev.enemy.kind, zdef.tier, false);
        if (loot) game.lootQueue.push(loot);
        // авто-фарм: победили — если следующая волна тоже проходима, идём выше,
        // иначе остаёмся фармить текущую (осцилляция у «стены» сложности)
        if (state.autoFarm) {
          const zone = state.zones.apartment;
          const nextEnemy = P.enemyStats(zone.wave, zdef.tier, zdef.wavesCap);
          if (P.waveCheck(hero, nextEnemy, state.hero.hp).win) {
            zone.wave += 1;
            zone.maxWave = Math.max(zone.maxWave || 1, zone.wave);
          }
        }
        hooks.onWaveWin && hooks.onWaveWin(ev);
      } else if (ev.type === "knockout") {
        state.stats.deaths++;
        // авто-фарм: нокаут — отступаем на волну ниже
        if (state.autoFarm) {
          const zone = state.zones.apartment;
          zone.wave = Math.max(1, zone.wave - 1);
        }
        hooks.onKnockout && hooks.onKnockout(ev);
      } else if (ev.type === "waveLoss") {
        // авто-фарм: отступление — откатываемся на волну ниже
        if (state.autoFarm) {
          const zone = state.zones.apartment;
          zone.wave = Math.max(1, zone.wave - 1);
        }
        hooks.onWaveLoss && hooks.onWaveLoss(ev);
      } else if (ev.type === "zoneClear") {
        const next = P.ZONES[ev.zoneId].next;
        if (next && state.zones[next] && !state.zones[next].unlocked) {
          state.zones[next].unlocked = true;
          game.banner = {
            text: "🔓 ПОДЪЕЗД ОТКРЫТ! Следующая остановка — этаж выше.",
            until: state.now + 8,
          };
        }
        hooks.onZoneClear && hooks.onZoneClear(ev);
      } else {
        hooks.onEvent && hooks.onEvent(ev);
      }
    });

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
      if (def.unlockWave && state.zones.apartment.wave < def.unlockWave) return false;
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

    /* Переключить текущую волну (◀ ▶): только вне боя, в пределах
       [1, maxWave]. Возвращает true, если волна изменилась. */
    game.setWave = function (n) {
      const zone = state.zones.apartment;
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

      // бой (ночью волны идут чаще — бой тикает быстрее)
      const rate = isNight() ? P.DAY_NIGHT.night.waveRate : 1;
      game.combat.update(dt * rate, skillsMult());
    };

    return game;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
