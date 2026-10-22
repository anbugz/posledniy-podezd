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

  /* v5.0: мутаторы волн — случайный оттенок рядовой волны (не босса).
     hp/dps — множители врага, atk — период его удара, sup — множитель
     припасов за волну (риск ↔ награда). */
  P.WAVE_MUTATORS = [
    { id: "swift", name: "⚡ БЫСТРЫЕ",     hp: 1.0, dps: 1.0,  atk: 0.65, sup: 1.3 },
    { id: "thick", name: "🛡 ТОЛСТОКОЖИЕ", hp: 1.6, dps: 1.0,  atk: 1.0,  sup: 1.4 },
    { id: "fury",  name: "🔥 ЯРОСТЬ",      hp: 1.0, dps: 1.35, atk: 1.0,  sup: 1.35 },
    { id: "frail", name: "💀 ХРУПКИЕ",     hp: 0.6, dps: 0.85, atk: 1.0,  sup: 0.8 },
  ];
  const MUTATOR_CHANCE = 0.25;

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
      // v4.2: круги 2+ (×1.15 за круг) — только при RL≥5
      combat.enemy = P.enemyStats(n, zdef.tier, zdef.wavesCap, zoneId, P.cyclesOn(state));
      combat.enemy.maxHp = combat.enemy.hp;
      combat.phase = "fight";
      combat.elapsed = 0;
      combat.heroT = HERO_ATK_SEC;   // первый удар героя — через 0.5 с
      // v5.0: мутатор волны — рядовые волны (не боссы), шанс 25%
      combat.mutator = null;
      combat.enemyPeriod = ENEMY_ATK_SEC;
      const isBossWave = P.waveCycle(n, zdef.wavesCap).nEff === zdef.wavesCap;
      if (!isBossWave && Math.random() < MUTATOR_CHANCE) {
        const m = P.WAVE_MUTATORS[Math.floor(Math.random() * P.WAVE_MUTATORS.length)];
        combat.mutator = m;
        combat.enemy.hp = Math.round(combat.enemy.hp * m.hp);
        combat.enemy.maxHp = combat.enemy.hp;
        combat.enemy.dps = combat.enemy.dps * m.dps;
        combat.enemyPeriod = ENEMY_ATK_SEC * m.atk;
      }
      combat.enemyT = combat.enemyPeriod;
      // v4.1: «особая находка» — волна золотится, дроп +2 ступени редкости
      // v4.2: RL≥12 — +1 п.п. к шансу
      combat.golden = Math.random() < P.goldenChance(state);
      cb && cb({ type: "waveStart", zoneId, wave: n, enemy: combat.enemy, golden: combat.golden, mutator: combat.mutator });
    }

    function win() {
      const n = zone.wave;
      // зачистка круга: босс 20-й волны. Повторные круги (cycle>0) — только
      // при включённых кругах (RL≥5); без престижа zoneClear — один раз.
      const c = P.waveCycle(n, zdef.wavesCap, P.cyclesOn(state));
      const clearedCycle = c.nEff === zdef.wavesCap && (n === zdef.wavesCap || c.cycle > 0);
      cb && cb({ type: "waveWin", zoneId, wave: n, enemy: combat.enemy, golden: combat.golden, mutator: combat.mutator });
      // награды начисляет engine_game (там же лут и технологии)
      if (clearedCycle) {
        cb && cb({ type: "zoneClear", zoneId, cycle: c.cycle });
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
        combat.enemyT += combat.enemyPeriod || ENEMY_ATK_SEC;
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
