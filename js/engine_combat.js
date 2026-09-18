/* «Последний подъезд» — engine: авто-бой в реальном времени (ТЗ §3, правки v2).
   Бой тикает: герой и враг наносят DPS друг другу; исход = тот же
   T_kill vs T_survive, но растянутый во времени для живого рендера.
   Правки v2: нокаут из CONFIG (dev 3с), аффиксы (реген в бою, крит-урон,
   двойной удар), после wavesCap волны повторяются бесконечно сильнее. */
(function (P) {
  "use strict";

  const WAVE_GAP = 3.0;     // пауза между волнами, сек
  const REGEN_PCT = 0.05;   // HP/сек вне боя
  const KNOCKOUT_HP = 0.01; // при HP < 1% макс. — нокаут

  P.WAVE_GAP = WAVE_GAP;

  /* Создать сессию боя для зоны. cb(event) — события для UI/тестов:
     {type:'waveStart'|'waveWin'|'waveLoss'|'knockout'|'revive'|'zoneClear', ...}
     zoneClear приходит один раз — при первой зачистке круга (волна wavesCap). */
  P.createCombat = function (state, zoneId, cb) {
    const zone = state.zones[zoneId];
    const zdef = P.ZONES[zoneId];

    const combat = {
      zoneId,
      phase: "gap",        // gap | fight | knockout
      timer: WAVE_GAP,
      enemy: null,          // {hp, maxHp, dps, kind, name}
      elapsed: 0,
    };

    function startWave() {
      const n = zone.wave;
      combat.enemy = P.enemyStats(n, zdef.tier, zdef.wavesCap);
      combat.enemy.maxHp = combat.enemy.hp;
      combat.phase = "fight";
      combat.elapsed = 0;
      cb && cb({ type: "waveStart", wave: n, enemy: combat.enemy });
    }

    function win() {
      const n = zone.wave;
      const clearedCycle = n % zdef.wavesCap === 0; // убит босс круга
      cb && cb({ type: "waveWin", wave: n, enemy: combat.enemy });
      // награды начисляет engine_game (там же лут и технологии)
      zone.wave += 1;
      zone.maxWave = Math.max(zone.maxWave || 1, zone.wave); // потолок для ◀ ▶
      if (clearedCycle) {
        // зачистка круга: один раз — открытие следующей зоны, дальше фарм
        cb && cb({ type: "zoneClear", zoneId, cycle: Math.floor(n / zdef.wavesCap) });
      }
      combat.phase = "gap";
      combat.timer = WAVE_GAP;
      combat.enemy = null;
    }

    function loss() {
      state.hero.hp = Math.max(0, state.hero.hp);
      if (state.hero.hp <= P.calcHero(state).hpMax * KNOCKOUT_HP) {
        combat.phase = "knockout";
        combat.timer = P.CONFIG.KNOCKOUT_SEC;
        cb && cb({ type: "knockout" });
      } else {
        // отступление: короткая пауза + реген вне боя
        combat.phase = "gap";
        combat.timer = 5;
        combat.enemy = null;
        cb && cb({ type: "waveLoss" });
      }
    }

    /* Тик боя. skillsMult — множитель DPS от активных навыков (engine_game). */
    combat.update = function (dt, skillsMult) {
      const hero = P.calcHero(state);
      if (combat.phase === "knockout") {
        combat.timer -= dt;
        if (combat.timer <= 0) {
          state.hero.hp = hero.hpMax * P.CONFIG.REVIVE_HP;
          combat.phase = "gap";
          combat.timer = 3;
          cb && cb({ type: "revive" });
        }
        return;
      }
      if (combat.phase === "gap") {
        state.hero.hp = Math.min(hero.hpMax, state.hero.hp + hero.hpMax * REGEN_PCT * dt);
        combat.timer -= dt;
        if (combat.timer <= 0) startWave();
        return;
      }
      // fight: урон героя — с критом (critDmg), крит-уроном и двойным ударом
      combat.elapsed += dt;
      const critRoll = Math.random() < hero.crit;
      const doubleRoll = Math.random() < hero.doubleHit;
      const mult = (critRoll ? hero.critDmg : 1) * (doubleRoll ? 2 : 1);
      const heroDps = hero.dps * (skillsMult || 1) * mult;
      combat.enemy.hp -= heroDps * dt;
      // враг бьёт в ответ; аффикс-реген поднимает HP в бою
      state.hero.hp -= combat.enemy.dps * (1 - hero.dr) * dt;
      state.hero.hp = Math.min(hero.hpMax, state.hero.hp + hero.hpMax * hero.regenCombat * dt);
      cb && cb({ type: "tick", crit: critRoll, dbl: doubleRoll });
      if (combat.enemy.hp <= 0) win();
      else if (state.hero.hp <= 0) loss();
    };

    return combat;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
