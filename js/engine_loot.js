/* «Последний подъезд» — engine: лут, сумка, экипировка (ТЗ §4, правки v2).
   Дроп падает в сумку (state.bag); надевание/продажа — вручную или
   через «Надеть лучшее» / «продать всё серое». Переполнение сумки —
   авто-продажа дропа. */
(function (P) {
  "use strict";

  const LOOT_CHANCE = 0.09;    // шанс предмета с обычной волны (ресайл v3.1: вещей ~в 5 раз меньше)
  const SELL_RATIO = 0.5;      // доля бюджета припасами при продаже

  /* Порог редкости для продажи: авто (autoSellOn) или кнопкой «продать всё ниже». */
  P.RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
  P.autoSellThreshold = function (state) {
    if (!(state.autoSellOn && state.autoSell > 0)) return null;
    return P.RARITY_ORDER[state.autoSell - 1];
  };

  /* Одноразовая продажа всего не выше порога (индекс редкости <= n).
     Возвращает выручку. */
  P.sellBelowRarity = function (state, n) {
    let gained = 0;
    for (let i = state.bag.length - 1; i >= 0; i--) {
      if (P.RARITY_ORDER.indexOf(state.bag[i].rarity) <= n) {
        gained += Math.max(1, Math.floor(P.itemScore(state.bag[i]) * SELL_RATIO / 4));
        state.bag.splice(i, 1);
      }
    }
    state.supplies += gained;
    return gained;
  };

  /* Бросок редкости. kind: 'norm'|'elite'|'boss' */
  P.rollRarity = function (kind, rng) {
    rng = rng || Math.random;
    const table = kind === "norm" ? P.RARITIES : P.RARITIES_BOSS;
    let r = rng(), acc = 0;
    for (const row of table) {
      acc += row.chance;
      if (r < acc) return row.id;
    }
    return table[0].id;
  };

  /* Дроп с волны. Возвращает результат для UI или null.
     offline=true — шанс ×0.5 (ТЗ §6). Предмет уходит в сумку либо
     авто-продаётся при переполнении.
     wave (абсолютный номер) — множит бюджет предмета: лут растёт с волной.
     Внимание: pity-таймер оружия (v4.5) живёт уровнем выше — в rollWaveLoot. */
  P.rollLoot = function (state, kind, tier, offline, rng, wave) {
    rng = rng || Math.random;
    let chance = LOOT_CHANCE;
    if (kind !== "norm") chance = 1.0;
    if (offline) chance *= 0.5;
    chance *= P.perkLootMult(state); // v4.3: перк «Собиратель» — +20% находок
    if (rng() >= chance) return null;

    const waveMult = Math.pow(P.CONFIG.LOOT_WAVE_GROW, Math.max((wave || 1) - 1, 0));
    const slot = P.SLOTS[Math.floor(rng() * P.SLOTS.length)];
    const rarity = P.capRarity(state, P.rollRarity(kind, rng), false); // v5.1: потолок зоны
    const item = P.generateItem(slot, tier, rarity, rng, waveMult);
    return P.applyLoot(state, item, tier);
  };

  /* Гарантированные находки по расписанию (v4.1, расширено в v5.1 под 50 волн):
     «страховка от RNG» — герой одет к каждому боссу. */
  P.GUARANTEED_DROPS = {
    3: "weapon", 5: "armor", 8: "boots", 11: "helmet", 14: "gloves", 17: "accessory",
    22: "weapon", 26: "armor", 30: "boots", 34: "helmet", 38: "gloves", 42: "accessory", 47: "weapon",
  };

  /* v5.1: потолок редкости по зоне (FAPI max item rating): находки не выше
     rarityCap зоны; золотая волна может пробить потолок на +1 ступень. */
  P.capRarity = function (state, rarity, golden) {
    const zdef = P.ZONES[state.activeZone];
    if (!zdef || zdef.rarityCap == null) return rarity;
    const cap = Math.min(zdef.rarityCap + (golden ? 1 : 0), P.RARITY_ORDER.length - 1);
    const i = P.RARITY_ORDER.indexOf(rarity);
    return P.RARITY_ORDER[Math.min(i, cap)];
  };

  /* Гарантированный дроп слота на волне-расписании (редкость по norm-таблице). */
  P.rollGuaranteedDrop = function (state, slot, tier, rng, wave) {
    rng = rng || Math.random;
    const waveMult = Math.pow(P.CONFIG.LOOT_WAVE_GROW, Math.max((wave || 1) - 1, 0));
    const rarity = P.capRarity(state, P.rollRarity("norm", rng), false);
    const item = P.generateItem(slot, tier, rarity, rng, waveMult);
    return P.applyLoot(state, item, tier);
  };

  /* Совместимость: гарант-оружие волны 3. */
  P.rollGuaranteedWeapon = function (state, tier, rng, wave) {
    return P.rollGuaranteedDrop(state, "weapon", tier, rng, wave);
  };

  /* Поднять редкость на n ступеней (потолок — mythic). */
  P.bumpRarity = function (rarity, n) {
    const i = P.RARITY_ORDER.indexOf(rarity);
    return P.RARITY_ORDER[Math.min(i + (n || 1), P.RARITY_ORDER.length - 1)];
  };

  /* «Особая находка» (v4.1): дроп с золотой волны — редкость +2 ступени. */
  P.rollGoldenLoot = function (state, kind, tier, rng, wave) {
    rng = rng || Math.random;
    const waveMult = Math.pow(P.CONFIG.LOOT_WAVE_GROW, Math.max((wave || 1) - 1, 0));
    const slot = P.SLOTS[Math.floor(rng() * P.SLOTS.length)];
    const rarity = P.capRarity(state, P.bumpRarity(P.rollRarity(kind, rng), 2), true);
    const item = P.generateItem(slot, tier, rarity, rng, waveMult);
    const res = P.applyLoot(state, item, tier);
    res.golden = true;
    return res;
  };

  /* Уник с первого зачистки зоны — один раз (v4.1). */
  P.rollUnique = function (state, zoneId, tier, rng, wave) {
    const u = P.UNIQUES[zoneId];
    if (!u) return null;
    state.uniques = state.uniques || {};
    if (state.uniques[zoneId]) return null;
    state.uniques[zoneId] = true;
    rng = rng || Math.random;
    const waveMult = Math.pow(P.CONFIG.LOOT_WAVE_GROW, Math.max((wave || 1) - 1, 0));
    const item = P.generateItem(u.slot, tier, u.rarity, rng, waveMult);
    item.name = u.name;
    item.icon = u.icon;
    item.affixes = u.affixes.slice();
    if (u.family) item.family = u.family;
    item.unique = true;
    const res = P.applyLoot(state, item, tier);
    res.unique = true;
    return res;
  };

  /* Лут за победу на волне (v4.5): единая точка для онлайна и оффлайна.
     Приоритет: pity-таймер (оружие) > расписание гарант-дропов > золото > обычный
     бросок. Раньше pity проверялся только в rollLoot — но волны расписания
     (3/5/8/11/14/17) его обходили, и герой, застрявший на такой волне,
     оружие не получал никогда. */
  P.rollWaveLoot = function (state, kind, tier, golden, offline, rng, wave, nEff) {
    rng = rng || Math.random;
    if ((state.pityWeapon || 0) >= P.CONFIG.PITY_WEAPON_WAVES) {
      const pw = P.rollGuaranteedDrop(state, "weapon", tier, rng, wave);
      if (pw) pw.pity = true;
      return pw;
    }
    if (P.GUARANTEED_DROPS[nEff]) return P.rollGuaranteedDrop(state, P.GUARANTEED_DROPS[nEff], tier, rng, wave);
    if (golden) return P.rollGoldenLoot(state, kind, tier, rng, wave);
    return P.rollLoot(state, kind, tier, offline, rng, wave);
  };

  /* Положить предмет в сумку; при переполнении — авто-продажа.
     state.autoSell > 0 — продавать всё не выше порога редкости сразу.
     v4.5: если сумка полна, но находка ЛУЧШЕ худшей вещи в сумке —
     продаём худшую, а находку кладём (иначе полная сумка мусора
     навсегда замораживала прогресс: всё новое уходило в продажу). */
  P.applyLoot = function (state, item, tier) {
    state.stats.itemsFound++;
    // v4.5: любое выпавшее оружие сбрасывает pity-таймер (даже авто-проданное:
    // RNG оружие дал — засуха прервана)
    if (item.slot === "weapon") state.pityWeapon = 0;
    // v4.2: запоминаем лучшую редкость находки цикла (очки времени при престиже)
    if (state.prestige) {
      const ri = P.RARITY_ORDER.indexOf(item.rarity);
      if (ri > (state.prestige.bestRarity || 0)) state.prestige.bestRarity = ri;
    }
    const sellValue = Math.max(1, Math.floor(P.itemScore(item) * SELL_RATIO / 4));
    const threshold = P.autoSellThreshold(state);
    if (threshold && P.RARITY_ORDER.indexOf(item.rarity) <= P.RARITY_ORDER.indexOf(threshold)) {
      state.supplies += sellValue;
      return { toBag: false, item, soldFor: sellValue, autoSold: true };
    }
    if (state.bag.length < P.bagSize(state)) {
      state.bag.push(item);
      return { toBag: true, item };
    }
    // сумка полна: если находка лучше худшей — вытесняем худшую в продажу
    let worstIdx = 0, worstScore = Infinity;
    for (let i = 0; i < state.bag.length; i++) {
      const sc = P.itemScore(state.bag[i]);
      if (sc < worstScore) { worstScore = sc; worstIdx = i; }
    }
    if (P.itemScore(item) > worstScore) {
      const worst = state.bag[worstIdx];
      const worstValue = Math.max(1, Math.floor(worstScore * SELL_RATIO / 4));
      state.supplies += worstValue;
      state.bag[worstIdx] = item;
      return { toBag: true, item, replaced: worst, soldFor: worstValue };
    }
    state.supplies += sellValue;
    return { toBag: false, item, soldFor: sellValue };
  };

  /* Размер сумки (расширение за припасы — позже; пока стартовый). */
  P.bagSize = function (state) {
    return state.bagSize || P.CONFIG.BAG_START;
  };

  /* Надеть предмет из сумки. Снятая вещь возвращается в ту же ячейку. */
  P.equipItem = function (state, bagIndex) {
    const item = state.bag[bagIndex];
    if (!item) return null;
    const cur = state.equipment[item.slot];
    state.equipment[item.slot] = item;
    if (cur) state.bag[bagIndex] = cur;
    else state.bag.splice(bagIndex, 1);
    return { equipped: item, unequipped: cur || null };
  };

  /* Снять надетый предмет в сумку (если есть место). */
  P.unequipItem = function (state, slot) {
    const item = state.equipment[slot];
    if (!item) return false;
    if (state.bag.length >= P.bagSize(state)) return false;
    state.equipment[slot] = null;
    state.bag.push(item);
    return true;
  };

  /* Продать предмет из сумки. Возвращает выручку. */
  P.sellItem = function (state, bagIndex) {
    const item = state.bag[bagIndex];
    if (!item) return 0;
    state.bag.splice(bagIndex, 1);
    const sellValue = Math.max(1, Math.floor(P.itemScore(item) * SELL_RATIO / 4));
    state.supplies += sellValue;
    return sellValue;
  };

  /* Продать все обычные (серые) предметы сумки. */
  P.sellAllCommon = function (state) {
    let gained = 0;
    for (let i = state.bag.length - 1; i >= 0; i--) {
      if (state.bag[i].rarity === "common") {
        gained += Math.max(1, Math.floor(P.itemScore(state.bag[i]) * SELL_RATIO / 4));
        state.bag.splice(i, 1);
      }
    }
    state.supplies += gained;
    return gained;
  };

  /* «Надеть лучшее»: для каждого слота — лучший по score предмет из сумки. */
  P.equipBest = function (state) {
    const bySlot = {};
    for (let i = 0; i < state.bag.length; i++) {
      const it = state.bag[i];
      (bySlot[it.slot] = bySlot[it.slot] || []).push({ item: it, idx: i });
    }
    let equipped = 0;
    for (const slot of P.SLOTS) {
      const cands = bySlot[slot];
      if (!cands || !cands.length) continue;
      cands.sort((a, b) => P.itemScore(b.item) - P.itemScore(a.item));
      const best = cands[0].item;
      if (P.itemScore(best) <= P.itemScore(state.equipment[slot])) continue;
      const idx = state.bag.indexOf(best);
      const cur = state.equipment[slot];
      state.equipment[slot] = best;
      if (cur) state.bag[idx] = cur;
      else state.bag.splice(idx, 1);
      equipped++;
    }
    return equipped;
  };

  /* Прокачать предмет: где = 'equip' (слот) или 'bag' (индекс сумки).
     v4.0: доступно с 1-й минуты, платим ТЕХНОЛОГИЯМИ (первый sink для tech);
     выше +5 — только после зачистки Района (Оружейник). */
  P.UPGRADE_SOFT_CAP = 5;
  P.upgradeItem = function (state, where, key) {
    let item = null;
    if (where === "equip") {
      item = state.equipment[key];
    } else {
      item = state.bag[key];
    }
    if (!item) return false;
    if ((item.lvl || 0) >= P.UPGRADE_SOFT_CAP && !state.upgradesUnlocked) return false;
    const cost = P.itemUpgradeCost(item);
    if (state.tech < cost) return false;
    state.tech -= cost;
    P.upgradeItemStats(item);
    return true;
  };

  /* Перековка аффиксов у Оружейника (v4.4): реролл ВСЕХ аффиксов предмета
     за технологии. Гейт — зачистка Района (upgradesUnlocked), как и +5+.
     Цена растёт с каждой перековкой этого предмета (item.forges) —
     тормоз против спама до «идеального» набора. Уники не куются:
     их аффиксы — часть истории предмета. */
  P.REROLL_GROW = 1.6;
  P.rerollCost = function (item) {
    if (!item) return 0;
    return Math.floor(P.itemScore(item) * 0.15 * Math.pow(P.REROLL_GROW, item.forges || 0)) + 3;
  };
  P.rerollAffixes = function (state, where, key, rng) {
    if (!state.upgradesUnlocked) return false;
    const item = where === "equip" ? state.equipment[key] : state.bag[key];
    if (!item || item.unique) return false;
    const want = P.AFFIX_COUNT[item.rarity] || 0;
    if (!want) return false; // обычным нечего ковать
    const cost = P.rerollCost(item);
    if (state.tech < cost) return false;
    rng = rng || Math.random;
    state.tech -= cost;
    item.forges = (item.forges || 0) + 1;
    const affixes = [];
    const pool = P.AFFIXES.slice();
    for (let i = 0; i < want && pool.length; i++) {
      const idx = Math.floor(rng() * pool.length);
      affixes.push(pool.splice(idx, 1)[0].id);
    }
    item.affixes = affixes;
    return true;
  };

  /* Технологии с волны (ТЗ §3.2): обычная 30% x1, элита x5, босс x20.
     nightMult/eventMult — множители шанса из день/ночь и ивента. */
  P.rollTech = function (kind, chanceMult, rng) {
    rng = rng || Math.random;
    const E = P.ENEMY;
    let base = kind === "boss" ? 1 : kind === "elite" ? 1 : E.techChance;
    let amount = kind === "boss" ? E.techBoss : kind === "elite" ? E.techElite : 1;
    if (kind === "norm" && rng() >= base * (chanceMult || 1)) return 0;
    return amount;
  };

  /* Припасы с волны: floor(3 * 1.28^n) — ресайл v3.1 (цифры ÷5, рост тот же;
     база 3 вместо 2 — компенсация округлений, калибровка balance_sim.py).
     Пассивного дохода нет, волны — основной источник.
     Абсолютный номер волны: повторные круги дают больше. */
  P.waveSupplies = function (n) {
    return Math.floor(3 * Math.pow(1.28, n));
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
