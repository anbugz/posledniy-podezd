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
  const HERO_ATK_SEC = 0.5; // герой бьёт размахами раз в 0.5 с
  const ENEMY_ATK_SEC = 1.0; // враг бьёт размахами раз в 1 с

  P.WAVE_GAP = WAVE_GAP;

  /* Создать сессию боя для зоны. cb(event) — события для UI/тестов:
     {type:'waveStart'|'waveWin'|'waveLoss'|'knockout'|'revive'|'zoneClear',
      zoneId, ...}
     zoneClear приходит при убийстве босса круга (волна wavesCap).
     Прогресс по волнам (wave+1) идёт ТОЛЬКО в авто-режиме
     (state.autoFarm): без авто герой фармит текущую волну. */
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
      combat.enemy = P.enemyStats(n, zdef.tier, zdef.wavesCap, zoneId);
      combat.enemy.maxHp = combat.enemy.hp;
      combat.phase = "fight";
      combat.elapsed = 0;
      combat.heroT = HERO_ATK_SEC;   // первый удар героя — через 0.5 с
      combat.enemyT = ENEMY_ATK_SEC; // первый удар врага — через 1 с
      cb && cb({ type: "waveStart", zoneId, wave: n, enemy: combat.enemy });
    }

    function win() {
      const n = zone.wave;
      const clearedCycle = n === zdef.wavesCap; // первое прохождение зоны — zoneClear один раз
      cb && cb({ type: "waveWin", zoneId, wave: n, enemy: combat.enemy });
      // награды начисляет engine_game (там же лут и технологии)
      if (clearedCycle) {
        cb && cb({ type: "zoneClear", zoneId, cycle: Math.floor(n / zdef.wavesCap) });
      }
      if (state.autoFarm) {
        zone.wave += 1;
        zone.maxWave = Math.max(zone.maxWave || 1, zone.wave); // потолок для ◀ ▶
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
        cb && cb({ type: "knockout", zoneId });
      } else {
        // отступление: короткая пауза + реген вне боя
        combat.phase = "gap";
        combat.timer = 5;
        combat.enemy = null;
        cb && cb({ type: "waveLoss", zoneId });
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
          cb && cb({ type: "revive", zoneId });
        }
        return;
      }
      if (combat.phase === "gap") {
        state.hero.hp = Math.min(hero.hpMax, state.hero.hp + hero.hpMax * REGEN_PCT * dt);
        combat.timer -= dt;
        if (combat.timer <= 0) startWave();
        return;
      }
      // fight: урон наносится РАЗМАХАМИ (видимые удары), а не непрерывно.
      // Герой — каждые 0.5 с (крит/двойной удар на размах), враг — каждые 1 с.
      // Средний DPS не меняется: урон размаха = dps × период.
      combat.elapsed += dt;
      combat.heroT -= dt;
      combat.enemyT -= dt;

      while (combat.heroT <= 0 && combat.enemy.hp > 0) {
        combat.heroT += HERO_ATK_SEC;
        const critRoll = Math.random() < hero.crit;
        const doubleRoll = Math.random() < hero.doubleHit;
        const mult = (critRoll ? hero.critDmg : 1) * (doubleRoll ? 2 : 1);
        const dmg = hero.dps * (skillsMult || 1) * mult * HERO_ATK_SEC;
        combat.enemy.hp -= dmg;
        cb && cb({ type: "heroHit", zoneId, dmg, crit: critRoll, dbl: doubleRoll });
      }

      if (combat.enemy.hp <= 0) { win(); return; }

      while (combat.enemyT <= 0 && state.hero.hp > 0) {
        combat.enemyT += ENEMY_ATK_SEC;
        const dmg = combat.enemy.dps * (1 - hero.dr) * ENEMY_ATK_SEC;
        state.hero.hp -= dmg;
        cb && cb({ type: "enemyHit", zoneId, dmg });
      }

      // аффикс-реген поднимает HP в бою (непрерывно, как задумано)
      state.hero.hp = Math.min(hero.hpMax, state.hero.hp + hero.hpMax * hero.regenCombat * dt);

      if (state.hero.hp <= 0) loss();
    };

    return combat;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
