/* «Последний подъезд» — data: зоны (масштабы).
   Контент = данные, логика не трогается при добавлении зон. */
(function (P) {
  "use strict";

  // tier — множитель сложности/лутa зоны; baseIncome/baseCost — экономика зоны
  P.ZONES = {
    apartment: {
      id: "apartment",
      name: "Квартира",
      tier: 1,
      baseIncome: 2,
      incomeGrow: 1.08,
      baseCost: 25,
      costGrow: 1.6,
      wavesCap: 20,
      lootTable: "apartment",
      next: "entrance",
    },
    // заготовка следующей зоны (подъезд) — открывается зачисткой квартиры
    entrance: {
      id: "entrance",
      name: "Подъезд",
      tier: 2,
      baseIncome: 8,
      incomeGrow: 1.08,
      baseCost: 200,
      costGrow: 1.6,
      wavesCap: 25,
      lootTable: "entrance",
      next: null,
      locked: true,
    },
  };

  P.ZONE_ORDER = ["apartment", "entrance"];
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
