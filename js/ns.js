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
  WAVE_LOOP_MULT: 1.3,      // повтор волн после капа: +30% HP/DPS за круг
};
