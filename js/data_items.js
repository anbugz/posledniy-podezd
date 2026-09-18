/* «Последний подъезд» — data: предметы, редкости, аффиксы, генерация лута.
   Предметы НЕ создаются вручную — генерируются из слота/тира/редкости.
   Правки v2: аффиксы (≥ Необычный), уровень прокачки предмета (+15%/уровень). */
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

  /* Иконки слотов (UI v3.1) — оружие зависит от силы: нож / бита / ствол. */
  P.slotIcon = function (item) {
    if (!item) return "▫️";
    switch (item.slot) {
      case "weapon":
        return item.stats.dps >= 15 ? "🔫" : item.stats.dps >= 9 ? "🏏" : "🔪";
      case "helmet": return "🪖";
      case "armor": return "🧥";
      case "gloves": return "🧤";
      case "boots": return "🥾";
      case "accessory": return "⌚";
      default: return "▫️";
    }
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

  /* Аффиксы (правки v2). Каждый — отдельная механика; счётчик на предмете
     суммируется в calcHero. */
  P.AFFIXES = [
    { id: "stockpile", name: "+15% припасов с волн" },
    { id: "regen",     name: "реген 1% HP в бою" },
    { id: "critdmg",   name: "+10% крит-урон" },
    { id: "double",    name: "10% ударить дважды" },
  ];
  // сколько аффиксов падает на редкость
  P.AFFIX_COUNT = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3, mythic: 3 };

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
     budget = slotBase * tierMult^tier * rarityMult * waveMult
     (waveMult = LOOT_WAVE_GROW^(волна-1) — лут растёт с волной, v3.2)
     главный стат слота + 0..2 вторичных (шанс по редкости), вариация ±15%.
     Аффиксы: AFFIX_COUNT[rarity] штук, без повторов. */
  P.generateItem = function (slot, tier, rarity, rng, waveMult) {
    rng = rng || Math.random;
    const mult = P.RARITY_MULT[rarity] || 1;
    const wm = waveMult || 1;
    const budget = SLOT_BASE[slot] * Math.pow(TIER_MULT, tier - 1) * mult * wm;
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

    // аффиксы без повторов
    const affixes = [];
    const want = P.AFFIX_COUNT[rarity] || 0;
    const pool = P.AFFIXES.slice();
    for (let i = 0; i < want && pool.length; i++) {
      const idx = Math.floor(rng() * pool.length);
      affixes.push(pool.splice(idx, 1)[0].id);
    }

    return { slot, rarity, tier, name: P.itemName(slot, tier), stats, affixes, lvl: 0 };
  };

  /* Прокачка предмета: +15% к статам за уровень (правки v2). */
  P.upgradeItemStats = function (item) {
    const C = P.CONFIG;
    item.lvl = (item.lvl || 0) + 1;
    for (const k of Object.keys(item.stats)) {
      item.stats[k] = Math.max(1, Math.round(item.stats[k] * C.ITEM_UPGRADE_MULT * 10) / 10);
    }
    return item;
  };

  /* Цена прокачки: floor(base * grow^L) + 10% от score (L = текущий уровень). */
  P.itemUpgradeCost = function (item) {
    const C = P.CONFIG;
    const lvl = item.lvl || 0;
    return Math.floor(C.ITEM_UPGRADE_BASE * Math.pow(C.ITEM_UPGRADE_GROW, lvl)) +
      Math.floor(P.itemScore(item) * 0.1);
  };

  /* Оценочный «score» предмета (надевание, продажа, прокачка). */
  P.itemScore = function (item) {
    if (!item) return 0;
    const s = item.stats;
    const base = (s.dps || 0) * 4 + (s.hp || 0) * 1 + (s.armor || 0) * 3 + (s.crit || 0) * 40;
    return base * (1 + 0.08 * (item.affixes ? item.affixes.length : 0));
  };

  /* Стартовый набор героя (квартира, тир 1) */
  P.startingEquipment = function () {
    return {
      weapon: { slot: "weapon", rarity: "common", tier: 1, name: "Кухонный нож", stats: { dps: 6 }, affixes: [], lvl: 0 },
      helmet: null,
      armor:  { slot: "armor", rarity: "common", tier: 1, name: "Куртка «аляска»", stats: { hp: 10, armor: 5 }, affixes: [], lvl: 0 },
      gloves: null,
      boots:  { slot: "boots", rarity: "common", tier: 1, name: "Кроссовки «марафон»", stats: { hp: 10 }, affixes: [], lvl: 0 },
      accessory: null,
    };
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
