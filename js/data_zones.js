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
      wavesCap: 50,
      lootTable: "apartment",
      next: "entrance",
    },
    entrance: {
      id: "entrance",
      name: "Подъезд",
      tier: 2,
      baseCost: 40,
      costGrow: 1.6,
      wavesCap: 50,
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
      wavesCap: 50,
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
      wavesCap: 50,
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
      wavesCap: 50,
      lootTable: "district",
      next: null,
      locked: true,
    },
  };

  P.ZONE_ORDER = ["apartment", "entrance", "yard", "house", "district"];

  /* v5.1 (по мотивам FAPI): «волна открытия» ≠ «потолок фарма».
     Босс на 50-й волне открывает следующую зону, но зона фармится до 200
     (волны 51–200 растут по кругам ×1.15; круги 4+ — только с RL≥5).
     rarityCap — потолок редкости дропа зоны (индекс RARITY_ORDER):
     топ-шмот физически не выбить раньше времени — лестница зашита в контент. */
  P.ZONE_MAX_WAVE = 200;
  P.ZONES.apartment.rarityCap = 1; // до uncommon
  P.ZONES.entrance.rarityCap = 2;  // до rare
  P.ZONES.yard.rarityCap = 3;      // до epic
  P.ZONES.house.rarityCap = 4;     // до legendary
  P.ZONES.district.rarityCap = 5;  // до mythic
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
