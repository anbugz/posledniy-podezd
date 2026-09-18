/* «Последний подъезд» — data: зоны (масштабы).
   Контент = данные, логика не трогается при добавлении зон. */
(function (P) {
  "use strict";

  // tier — множитель сложности/лутa зоны; baseCost/costGrow — апгрейд зоны.
  // Пассивного дохода нет (правки v2): припасы только с волн и продажи лута.
  // Ресайл (v3.1): все цены и доходы ÷5 — цифры реалистичнее.
  P.ZONES = {
    apartment: {
      id: "apartment",
      name: "Квартира",
      tier: 1,
      baseCost: 5,
      costGrow: 1.6,
      wavesCap: 20,
      lootTable: "apartment",
      next: "entrance",
    },
    entrance: {
      id: "entrance",
      name: "Подъезд",
      tier: 2,
      baseCost: 40,
      costGrow: 1.6,
      wavesCap: 20,
      lootTable: "entrance",
      next: "house",
      locked: true,
    },
    house: {
      id: "house",
      name: "Дом",
      tier: 3,
      baseCost: 300,
      costGrow: 1.6,
      wavesCap: 20,
      lootTable: "house",
      next: null,
      locked: true,
    },
  };

  P.ZONE_ORDER = ["apartment", "entrance", "house"];
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
