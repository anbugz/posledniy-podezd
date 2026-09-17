/* «Последний подъезд» — engine: пересчёт характеристик героя (ТЗ §3.1). */
(function (P) {
  "use strict";

  P.ARMOR_K = 50; // DR = armor / (armor + K)

  /* Суммарные статы героя из экипировки + уровня квартиры */
  P.calcHero = function (state) {
    const eq = state.equipment;
    let dpsItems = 0, hpItems = 0, armor = 0, crit = 0.05;
    for (const slot of P.SLOTS) {
      const it = eq[slot];
      if (!it) continue;
      const s = it.stats;
      if (s.dps) dpsItems += s.dps;
      if (s.hp) hpItems += s.hp;
      if (s.armor) armor += s.armor;
      if (s.crit) crit += s.crit;
    }
    const apt = state.zones.apartment.level;
    const dpsFists = 2 + 2 * (apt - 1); // бытовые тренировки (калибровка симулятора)
    const dps = dpsItems + dpsFists;
    const hpMax = 100 + 20 * apt + hpItems;
    crit = Math.min(crit, 0.60);
    const dr = armor / (armor + P.ARMOR_K);
    const dpsEff = dps * (1 + crit * 1.0); // CritMult-1 = 1.0
    return { dps, dpsFists, dpsItems, hpMax, armor, crit, dr, dpsEff };
  };

  /* Проверка волны без скиллов: T_kill vs T_survive (ТЗ §3.3) */
  P.waveCheck = function (hero, enemy, curHp) {
    const tKill = enemy.hp / Math.max(hero.dpsEff, 0.001);
    const incoming = enemy.dps * (1 - hero.dr);
    const tSurvive = (curHp != null ? curHp : hero.hpMax) / Math.max(incoming, 0.001);
    return { tKill, tSurvive, win: tKill < tSurvive, incoming };
  };

  P.winChancePct = function (hero, enemy, curHp) {
    const c = P.waveCheck(hero, enemy, curHp);
    if (c.win) return Math.min(99, Math.round(100 * (1 - c.tKill / c.tSurvive) + 55));
    return Math.max(1, Math.round(45 * (c.tSurvive / c.tKill)));
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
