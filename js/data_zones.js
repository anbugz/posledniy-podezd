/* «Последний подъезд» — data: зоны (масштабы).
   Контент = данные, логика не трогается при добавлении зон. */
(function (P) {
  "use strict";

  // tier — множитель сложности/лутa зоны; baseCost/costGrow — апгрейд зоны.
  // Пассивного дохода нет (правки v2): припасы только с волн и продажи лута.
  P.ZONES = {
    apartment: {
      id: "apartment",
      name: "Квартира",
      tier: 1,
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
