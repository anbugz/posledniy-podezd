/* «Последний подъезд» — data: предметы, редкости, генерация лута.
   Предметы НЕ создаются вручную — генерируются из слота/тира/редкости. */
(function (P) {
  "use strict";

  P.SLOTS = ["weapon", "helmet", "armor", "gloves", "boots", "accessory"];

  P.SLOT_INFO = {
    weapon:    { name: "Оружие",     main: "dps" },
    helmet:    { name: "Шлем",       main: "hp" },
    armor:     { name: "Броня",      main: "hp" },
    gloves:    { name: "Перчатки",   main: "dps" },
    boots:     { name: "Ботинки",    main: "hp" },
    accessory: { name: "Аксессуар",  main: "mixed" },
  };

  // редкость: множитель бюджета и шанс дропа с обычной волны
  P.RARITIES = [
    { id: "common",    name: "Обычный",    mult: 1.0,  chance: 0.25 },
    { id: "uncommon",  name: "Необычный",  mult: 1.6,  chance: 0.10 },
    { id: "rare",      name: "Редкий",     mult: 2.6,  chance: 0.04 },
    { id: "epic",      name: "Эпический",  mult: 4.2,  chance: 0.01 },
  ];
  // легендарный+ — только с боссов/элиты (шанс отдельно в engine_loot)
  P.RARITIES_BOSS = [
    { id: "rare",      name: "Редкий",      mult: 2.6, chance: 0.55 },
    { id: "epic",      name: "Эпический",   mult: 4.2, chance: 0.30 },
    { id: "legendary", name: "Легендарный", mult: 6.8, chance: 0.13 },
    { id: "mythic",    name: "Мифический",  mult: 11.0, chance: 0.02 },
  ];

  P.RARITY_MULT = { common: 1.0, uncommon: 1.6, rare: 2.6, epic: 4.2, legendary: 6.8, mythic: 11.0 };

  const SLOT_BASE = { weapon: 6, helmet: 12, armor: 18, gloves: 3, boots: 10, accessory: 6 };
  const TIER_MULT = 1.8;

  // пулы названий по слотам для тира 1 (квартира) — бытовуха
  const NAMES = {
    weapon: ["Кухонный нож", "Бита с гвоздями", "Самодельный дробовик", "Охотничье ружьё"],
    helmet: ["Зимняя шапка", "Каска соседа", "Шапка-ушанка с фольгой"],
    armor:  ["Куртка «аляска»", "Надетый рубчак", "Спасательный жилет"],
    gloves: ["Рабочие перчатки", "Хозяйственные резиновые", "Мотоперчатки"],
    boots:  ["Кроссовки «марафон»", "Валенки", "Ботинки с металлическим носком"],
    accessory: ["Часы «Слава»", "Кухонный таймер", "Рация из подвала", "Сковорода на верёвочке"],
  };

  P.itemName = function (slot, tier) {
    const pool = NAMES[slot] || ["Предмет"];
    return pool[Math.floor(Math.random() * pool.length)];
  };

  /* Генерация предмета.
     budget = slotBase * tierMult^tier * rarityMult
     главный стат слота + 0..2 вторичных (шанс по редкости), вариация ±15%. */
  P.generateItem = function (slot, tier, rarity, rng) {
    rng = rng || Math.random;
    const mult = P.RARITY_MULT[rarity] || 1;
    const budget = SLOT_BASE[slot] * Math.pow(TIER_MULT, tier - 1) * mult;
    const vary = () => 0.85 + rng() * 0.3;

    const stats = {};
    const main = P.SLOT_INFO[slot].main;
    const addStat = (key, val) => { stats[key] = Math.round((stats[key] || 0) + val); };

    if (main === "dps") {
      addStat("dps", budget * 0.9 * vary());
      addStat("crit", budget * 0.03 * vary());
    } else if (main === "hp") {
      addStat("hp", budget * 0.9 * vary());
      addStat("armor", budget * 0.35 * vary());
    } else { // mixed
      if (rng() < 0.5) addStat("dps", budget * 0.55 * vary());
      else addStat("hp", budget * 0.55 * vary());
      addStat("armor", budget * 0.15 * vary());
    }

    // вторичные статы: 0/40%/70% по «уровню» редкости
    const rarityLevel = ["common", "uncommon", "rare", "epic", "legendary", "mythic"].indexOf(rarity);
    const secondaries = rarityLevel >= 2 ? 2 : rarityLevel === 1 ? (rng() < 0.4 ? 1 : 0) : 0;
    const poolKeys = ["dps", "hp", "armor", "crit"];
    for (let i = 0; i < secondaries; i++) {
      const k = poolKeys[Math.floor(rng() * poolKeys.length)];
      addStat(k, budget * 0.12 * vary());
    }

    // округление
    for (const k of Object.keys(stats)) stats[k] = Math.max(1, Math.round(stats[k] * 10) / 10);

    return { slot, rarity, tier, name: P.itemName(slot, tier), stats };
  };

  /* Оценочный «score» предмета для автонадевания */
  P.itemScore = function (item) {
    if (!item) return 0;
    const s = item.stats;
    return (s.dps || 0) * 4 + (s.hp || 0) * 1 + (s.armor || 0) * 3 + (s.crit || 0) * 40;
  };

  /* Стартовый набор героя (квартира, тир 1) */
  P.startingEquipment = function () {
    return {
      weapon: { slot: "weapon", rarity: "common", tier: 1, name: "Кухонный нож", stats: { dps: 6 } },
      helmet: null,
      armor:  { slot: "armor", rarity: "common", tier: 1, name: "Куртка «аляска»", stats: { hp: 10, armor: 5 } },
      gloves: null,
      boots:  { slot: "boots", rarity: "common", tier: 1, name: "Кроссовки «марафон»", stats: { hp: 10 } },
      accessory: null,
    };
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
