/* «Последний подъезд» — engine: экономика (ТЗ §5, правки v2).
   Пассивный доход зон УБРАН — припасы только с волн, продажи лута
   и траты на прокачку. Уровень квартиры даёт +20 HP, потолок
   «Самоделок» и открывает прогрессию. */
(function (P) {
  "use strict";

  /* Стоимость следующего уровня квартиры: floor(baseCost * costGrow^L) */
  P.zoneCost = function (zoneId, level) {
    const z = P.ZONES[zoneId];
    return Math.floor(z.baseCost * Math.pow(z.costGrow, level));
  };

  P.buyZoneLevel = function (state, zoneId) {
    // v4.0: квартира — это база на старте, улучшается с 1-й минуты;
    // остальные зоны — только после открытия Хаба (зачистка Дома)
    if (zoneId !== "apartment" && !state.hubUnlocked) return false;
    const z = state.zones[zoneId];
    if (!z || !z.unlocked) return false;
    const cost = P.zoneCost(zoneId, z.level);
    if (state.supplies < cost) return false;
    state.supplies -= cost;
    z.level += 1;
    return true;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
