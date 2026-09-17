/* «Последний подъезд» — engine: лут и автонадевание (ТЗ §4). */
(function (P) {
  "use strict";

  const LOOT_CHANCE = 0.45;    // шанс предмета с обычной волны (калибровка симулятора)
  const SELL_RATIO = 0.5;      // доля бюджета припасами при продаже

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
     offline=true — шанс ×0.5 (ТЗ §6). */
  P.rollLoot = function (state, kind, tier, offline, rng) {
    rng = rng || Math.random;
    let chance = LOOT_CHANCE;
    if (kind !== "norm") chance = 1.0;
    if (offline) chance *= 0.5;
    if (rng() >= chance) return null;

    const slot = P.SLOTS[Math.floor(rng() * P.SLOTS.length)];
    const rarity = P.rollRarity(kind, rng);
    const item = P.generateItem(slot, tier, rarity, rng);
    return P.applyLoot(state, item, tier);
  };

  /* Автонадевание: лучше — надели, иначе — продали в припасы. */
  P.applyLoot = function (state, item, tier) {
    const cur = state.equipment[item.slot];
    const scoreNew = P.itemScore(item);
    const scoreCur = P.itemScore(cur);
    if (scoreNew > scoreCur) {
      state.equipment[item.slot] = item;
      state.stats.itemsFound++;
      return { equipped: true, item, replaced: cur };
    }
    const sellValue = Math.max(1, Math.floor(P.itemScore(item) * SELL_RATIO / 4));
    state.supplies += sellValue;
    state.stats.itemsFound++;
    return { equipped: false, item, soldFor: sellValue };
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

  /* Припасы с волны: floor(5 * 1.25^n) */
  P.waveSupplies = function (n) {
    return Math.floor(5 * Math.pow(1.25, n));
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
