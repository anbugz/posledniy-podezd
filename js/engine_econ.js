/* «Последний подъезд» — engine: экономика зон (ТЗ §5). */
(function (P) {
  "use strict";

  /* Доход зоны: floor(baseIncome * L * incomeGrow^L) */
  P.zoneIncome = function (zoneId, level) {
    const z = P.ZONES[zoneId];
    return Math.floor(z.baseIncome * level * Math.pow(z.incomeGrow, level));
  };

  /* Суммарный доход всех открытых зон */
  P.totalIncome = function (state) {
    let sum = 0;
    for (const id of P.ZONE_ORDER) {
      const z = state.zones[id];
      if (z && z.unlocked) sum += P.zoneIncome(id, z.level);
    }
    return sum;
  };

  /* Стоимость следующего уровня зоны: floor(baseCost * costGrow^L) */
  P.zoneCost = function (zoneId, level) {
    const z = P.ZONES[zoneId];
    return Math.floor(z.baseCost * Math.pow(z.costGrow, level));
  };

  P.buyZoneLevel = function (state, zoneId) {
    const z = state.zones[zoneId];
    if (!z || !z.unlocked) return false;
    const cost = P.zoneCost(zoneId, z.level);
    if (state.supplies < cost) return false;
    state.supplies -= cost;
    z.level += 1;
    return true;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
