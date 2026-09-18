/* «Последний подъезд» — data: зоны (масштабы).
   Контент = данные, логика не трогается при добавлении зон.
   v3.2: цепочка фронтов Квартира → Подъезд → Двор → Дом → Район.
   Зачистка зон открывает прокачки (см. engine_game):
     Двор  -> Ветеран на базе («Самоделки»)
     Дом   -> Хаб (база: улучшение квартиры)
     Район -> Оружейник (улучшение предметов) */
(function (P) {
  "use strict";

  // tier — множитель сложности/лута зоны; baseCost/costGrow — апгрейд зоны.
  // Пассивного дохода нет: припасы только с волн и продажи лута.
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
      next: "yard",
      locked: true,
    },
    yard: {
      id: "yard",
      name: "Двор",
      tier: 2,
      baseCost: 120,
      costGrow: 1.6,
      wavesCap: 20,
      lootTable: "yard",
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
      next: "district",
      locked: true,
    },
    district: {
      id: "district",
      name: "Район",
      tier: 4,
      baseCost: 1500,
      costGrow: 1.6,
      wavesCap: 20,
      lootTable: "district",
      next: null,
      locked: true,
    },
  };

  P.ZONE_ORDER = ["apartment", "entrance", "yard", "house", "district"];
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
