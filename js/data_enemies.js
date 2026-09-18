/* «Последний подъезд» — data: враги.
   Формулы откалиброваны balance_sim.py (2026-09-17, правки v2).
   Правки v2: рост HP 1.20 → 1.15, общий штраф −25% к HP, после wavesCap
   волны идут по кругу с ростом WAVE_LOOP_MULT за круг. */
(function (P) {
  "use strict";

  P.ENEMY = {
    hpBase: 30, hpGrow: 1.15, hpTier: 2.0, hpGlobal: 0.75,
    dpsBase: 2.4, dpsGrow: 1.14, dpsTier: 1.8,
    eliteEvery: 5, eliteHp: 2.5, eliteDps: 1.3,
    bossEvery: 10, bossHp: 6.0, bossDps: 1.8,
    // тех с волны: шанс обычной 30%, элита x5 гарант, босс x20 гарант
    techChance: 0.30, techElite: 5, techBoss: 20,
  };

  /* Абсолютный номер волны -> эффективная волна внутри круга и номер круга.
     После wavesCap волн квартира «защищена», но волны повторяются бесконечно,
     каждый круг сильнее (источник фарма до открытия следующей зоны). */
  P.waveCycle = function (n, cap) {
    cap = cap || 20;
    const cycle = Math.floor((n - 1) / cap);
    const nEff = ((n - 1) % cap) + 1;
    return { nEff, cycle };
  };

  // Волна n (абсолютная) в зоне тира z -> {hp, dps, kind, name, cycle}
  P.enemyStats = function (n, z, cap) {
    const E = P.ENEMY;
    const c = P.waveCycle(n, cap);
    const loopMult = Math.pow(P.CONFIG.WAVE_LOOP_MULT, c.cycle);
    let hp = E.hpBase * Math.pow(E.hpGrow, c.nEff) * Math.pow(E.hpTier, z) * E.hpGlobal * loopMult;
    let dps = E.dpsBase * Math.pow(E.dpsGrow, c.nEff) * Math.pow(E.dpsTier, z) * loopMult;
    let kind = "norm";
    if (c.nEff % E.bossEvery === 0) {
      hp *= E.bossHp; dps *= E.bossDps; kind = "boss";
    } else if (c.nEff % E.eliteEvery === 0) {
      hp *= E.eliteHp; dps *= E.eliteDps; kind = "elite";
    }
    return { hp: Math.floor(hp), dps, kind, name: P.enemyName(c.nEff, kind), cycle: c.cycle };
  };

  P.enemyName = function (n, kind) {
    if (kind === "boss") {
      return n % 20 === 0 ? "Дрон-носильщик" : "Штурмовой дрон";
    }
    if (kind === "elite") return "Элитный жук-поглотитель";
    const names = ["Жук-разведчик", "Дрон-сверчок", "Паучок-дезориентатор", "Жук-тихоход"];
    return names[n % names.length];
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
