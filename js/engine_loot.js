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
     wave (абсолютный номер) — множит бюджет предмета: лут растёт с волной. */
  P.rollLoot = function (state, kind, tier, offline, rng, wave) {
    rng = rng || Math.random;
    let chance = LOOT_CHANCE;
    if (kind !== "norm") chance = 1.0;
    if (offline) chance *= 0.5;
    if (rng() >= chance) return null;

    const waveMult = Math.pow(P.CONFIG.LOOT_WAVE_GROW, Math.max((wave || 1) - 1, 0));
    const slot = P.SLOTS[Math.floor(rng() * P.SLOTS.length)];
    const rarity = P.rollRarity(kind, rng);
    const item = P.generateItem(slot, tier, rarity, rng, waveMult);
    return P.applyLoot(state, item, tier);
  };

  /* Гарантированный дроп оружия на 3-й волне круга — ранний лут-флейвор. */
  P.rollGuaranteedWeapon = function (state, tier, rng, wave) {
    rng = rng || Math.random;
    const waveMult = Math.pow(P.CONFIG.LOOT_WAVE_GROW, Math.max((wave || 1) - 1, 0));
    const rarity = P.rollRarity("norm", rng);
    const item = P.generateItem("weapon", tier, rarity, rng, waveMult);
    return P.applyLoot(state, item, tier);
  };

  /* Положить предмет в сумку; при переполнении — авто-продажа.
     state.autoSell > 0 — продавать всё не выше порога редкости сразу. */
  P.applyLoot = function (state, item, tier) {
    state.stats.itemsFound++;
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
     Доступно только после зачистки Района (Оружейник). */
  P.upgradeItem = function (state, where, key) {
    if (!state.upgradesUnlocked) return false;
    let item = null;
    if (where === "equip") {
      item = state.equipment[key];
    } else {
      item = state.bag[key];
    }
    if (!item) return false;
    const cost = P.itemUpgradeCost(item);
    if (state.supplies < cost) return false;
    state.supplies -= cost;
    P.upgradeItemStats(item);
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
