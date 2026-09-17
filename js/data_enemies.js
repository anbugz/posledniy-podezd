/* «Последний подъезд» — data: враги.
   Формулы откалиброваны balance_sim.py (2026-09-17). */
(function (P) {
  "use strict";

  P.ENEMY = {
    hpBase: 30, hpGrow: 1.20, hpTier: 2.0,
    dpsBase: 3, dpsGrow: 1.16, dpsTier: 1.8,
    eliteEvery: 5, eliteHp: 2.5, eliteDps: 1.5,
    bossEvery: 10, bossHp: 6.0, bossDps: 2.5,
    // тех с волны: шанс обычной 30%, элита x5 гарант, босс x20 гарант
    techChance: 0.30, techElite: 5, techBoss: 20,
  };

  // Волна n в зоне тира z -> {hp, dps, kind: 'norm'|'elite'|'boss', name}
  P.enemyStats = function (n, z) {
    const E = P.ENEMY;
    let hp = E.hpBase * Math.pow(E.hpGrow, n) * Math.pow(E.hpTier, z);
    let dps = E.dpsBase * Math.pow(E.dpsGrow, n) * Math.pow(E.dpsTier, z);
    let kind = "norm";
    if (n % E.bossEvery === 0) {
      hp *= E.bossHp; dps *= E.bossDps; kind = "boss";
    } else if (n % E.eliteEvery === 0) {
      hp *= E.eliteHp; dps *= E.eliteDps; kind = "elite";
    }
    return { hp: Math.floor(hp), dps, kind, name: P.enemyName(n, kind) };
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
