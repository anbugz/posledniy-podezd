/* «Последний подъезд» — пространство имён. Должен грузиться ПЕРВЫМ.
   Браузер: вешаем на window. Node (тесты): модули сами находят global.PODEZD. */
var PODEZD = (function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : global;
  root.PODEZD = root.PODEZD || {};
  return root.PODEZD;
})();
