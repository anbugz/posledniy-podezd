/* «Последний подъезд» — пространство имён. Должен грузиться ПЕРВЫМ.
   Браузер: вешаем на window. Node (тесты): модули сами находят global.PODEZD. */
var PODEZD = (function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : global;
  root.PODEZD = root.PODEZD || {};
  return root.PODEZD;
})();

/* Глобальный конфиг баланса. Правки v2 (2026-09-17). */
PODEZD.CONFIG = {
  KNOCKOUT_SEC: 3,   // DEV: для теста нокаута; в релизе вернуть 60
  REVIVE_HP: 0.5,    // воскрешение с 50% HP
  BAG_START: 20,     // стартовый размер сумки
  BAG_MAX: 100,      // потолок (расширение за припасы — позже)
  ITEM_UPGRADE_MULT: 1.15,  // +15% к статам за уровень предмета
  ITEM_UPGRADE_BASE: 2,     // цена прокачки: floor(base * 1.4^L) + 10% от score
  ITEM_UPGRADE_GROW: 1.4,
  TRAIN_COST_BASE: 3,       // «Самоделки»: floor(base * 1.35^L) за уровень
  TRAIN_COST_GROW: 1.35,
  TRAIN_CAP_PER_APT: 2,     // потолок уровня параметра = 2 × уровень квартиры
  WAVE_LOOP_MULT: 1.15,     // круги 2+ при RL≥5 (престиж, v4.2): +15% HP/DPS врагов за круг
  LOOT_WAVE_GROW: 1.065,    // бюджет предметов растёт с волной (прогрессия без прокачек)
  GOLDEN_CHANCE: 0.02,      // v4.1: шанс «особой находки» — золотая волна (+2 ступени редкости)
  PITY_WEAPON_WAVES: 10,    // v4.5: pity-таймер — столько волн без оружия, дальше дроп принудительно оружие
};
