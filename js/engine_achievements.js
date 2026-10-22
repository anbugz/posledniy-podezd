/* «Последний подъезд» — engine: достижения (v5.0).
   Список P.ACHIEVEMENTS: {id, icon, name, desc, test(state), reward}.
   P.checkAchievements(state) — идемпотентная проверка: открывает новые,
   начисляет награду, возвращает массив свежих дефов (для баннера/UI).
   Открытые лежат в state.achievements = {id: timestamp}. */
(function (P) {
  "use strict";

  const zoneCleared = (s, zid) => (s.zones[zid].maxWave || 1) > P.ZONES[zid].wavesCap;
  const uniqCount = (s) => Object.keys(s.uniques || {}).length;

  P.ACHIEVEMENTS = [
    { id: "first_blood", icon: "🩸", name: "Первая кровь", desc: "Зачистить первую волну",
      test: (s) => s.stats.kills >= 1, reward: { supplies: 20 } },
    { id: "killer100", icon: "🔪", name: "Сотня", desc: "Уничтожить 100 тварей",
      test: (s) => s.stats.kills >= 100, reward: { supplies: 100 } },
    { id: "killer1000", icon: "☠️", name: "Тысяча", desc: "Уничтожить 1000 тварей",
      test: (s) => s.stats.kills >= 1000, reward: { tech: 50 } },
    { id: "boss1", icon: "👑", name: "Повелитель повержен", desc: "Убить первого босса",
      test: (s) => (s.stats.bossKills || 0) >= 1, reward: { tech: 30 } },
    { id: "boss10", icon: "💀", name: "Истребитель боссов", desc: "Убить 10 боссов",
      test: (s) => (s.stats.bossKills || 0) >= 10, reward: { tech: 80 } },
    { id: "gold1", icon: "✨", name: "Золотая жила", desc: "Встретить золотую волну",
      test: (s) => (s.stats.goldenFound || 0) >= 1, reward: { supplies: 40 } },
    { id: "death1", icon: "🪦", name: "Встреча с тьмой", desc: "Пережить первый нокаут",
      test: (s) => s.stats.deaths >= 1, reward: { supplies: 15 } },
    { id: "clear_apartment", icon: "🏠", name: "Своя квартира", desc: "Зачистить Квартиру",
      test: (s) => zoneCleared(s, "apartment"), reward: { supplies: 50 } },
    { id: "clear_yard", icon: "🌳", name: "Дворовый сторож", desc: "Зачистить Двор",
      test: (s) => zoneCleared(s, "yard"), reward: { tech: 40 } },
    { id: "clear_district", icon: "🏙", name: "Хозяин района", desc: "Зачистить Район",
      test: (s) => zoneCleared(s, "district"), reward: { tech: 100 } },
    { id: "rich", icon: "💰", name: "Кладовщик", desc: "Накопить 10 000 припасов (всего)",
      test: (s) => s.totalSupplies >= 10000, reward: { tech: 60 } },
    { id: "uniq3", icon: "🏆", name: "Коллекционер", desc: "Найти 3 уникальных предмета",
      test: (s) => uniqCount(s) >= 3, reward: { supplies: 150 } },
    { id: "path5", icon: "🎖", name: "Выкованный путь", desc: "Довести путь цикла до 5 уровня",
      test: (s) => P.pathEffLevel(s) >= 5, reward: { exp: 20 } },
    { id: "time1", icon: "⏳", name: "Первый возврат", desc: "Вернуться в первый день",
      test: (s) => !!(s.prestige && s.prestige.rl >= 1), reward: { exp: 50 } },
  ];

  /* Проверить и открыть новые достижения. Возвращает [{def}], награды начислены. */
  P.checkAchievements = function (state) {
    state.achievements = state.achievements || {};
    const fresh = [];
    for (const def of P.ACHIEVEMENTS) {
      if (state.achievements[def.id]) continue;
      let ok = false;
      try { ok = !!def.test(state); } catch (e) { ok = false; }
      if (!ok) continue;
      state.achievements[def.id] = Date.now();
      const r = def.reward || {};
      if (r.supplies) { state.supplies += r.supplies; state.totalSupplies += r.supplies; }
      if (r.tech) state.tech += r.tech;
      if (r.exp) state.exp = (state.exp || 0) + r.exp;
      fresh.push(def);
    }
    return fresh;
  };

  P.achievementCount = function (state) {
    return Object.keys(state.achievements || {}).length;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
