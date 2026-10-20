/* «Последний подъезд» — engine: «Пути» (v4.3, классы-lite по мотивам FAPI).
   Две механики, обе открывает Ветеран (зачистка Двора):
   1) «Полевые приёмы» — 3 взаимоисключающих перка, бесплатный респек:
      Силовой приём +25% DPS / Стойкость +25% HP / Собиратель +20% лута.
   2) «Память класса» — путь на цикл (Штурмовик / Живучий / Старьёвщик).
      Путь качается опытом волн (уровень = floor(exp/10), потолок 10);
      макс-уровень запоминается в prestige.pathMax — на следующих циклах
      путь действует сразу с запомненного уровня (постоянная сила). */
(function (P) {
  "use strict";

  /* Полевые приёмы (перки): взаимоисключающие, смена бесплатна. */
  P.PERKS = {
    power:    { name: "Силовой приём", desc: "+25% DPS",                flavor: "бить первым и в полный рост" },
    tough:    { name: "Стойкость",     desc: "+25% HP",                 flavor: "дышать глубже, держать удар" },
    scavenge: { name: "Собиратель",    desc: "+20% припасов и находок", flavor: "осматривать каждый закоулок" },
  };
  P.PERK_EFFECT = { power: { dps: 0.25 }, tough: { hp: 0.25 }, scavenge: { loot: 0.20 } };

  /* Пути (классы): уровень растёт от опыта волн внутри цикла. */
  P.PATHS = {
    storm:  { name: "Штурмовик",  perLevel: "+4% DPS",              flavor: "путь силы: каждая волна — штурм" },
    iron:   { name: "Живучий",    perLevel: "+4% HP",               flavor: "путь выживания: устоять любой ценой" },
    junker: { name: "Старьёвщик", perLevel: "+5% припасов с волн",  flavor: "путь хабара: война войной, а обед по расписанию" },
  };
  P.PATH_PER_LEVEL = { storm: { dps: 0.04 }, iron: { hp: 0.04 }, junker: { sup: 0.05 } };
  P.PATH_EXP_PER_LEVEL = 10;
  P.PATH_LEVEL_CAP = 10;

  /* Перк и путь доступны после зачистки Двора (Ветеран). */
  P.pathsUnlocked = function (state) {
    return !!state.veteranUnlocked;
  };

  /* Выбрать/сменить полевой приём (взаимоисключающие, респек бесплатный). */
  P.choosePerk = function (state, id) {
    if (!P.pathsUnlocked(state)) return false;
    if (!(id in P.PERKS)) return false;
    state.perk = id;
    return true;
  };

  /* Выбрать путь на этот цикл. Выбор один раз за цикл — до «Возврата». */
  P.choosePath = function (state, id) {
    if (!P.pathsUnlocked(state)) return false;
    if (!(id in P.PATHS)) return false;
    if (state.path && state.path.id) return false; // уже выбран в этом цикле
    state.path = { id, exp: 0 };
    return true;
  };

  /* Опыт пути от волны (те же 1/2/5, что у опыта выживания, без RL-бонуса). */
  P.pathExpGain = function (state, kind) {
    if (!state.path || !state.path.id) return 0;
    const g = P.waveExp(kind);
    state.path.exp = (state.path.exp || 0) + g;
    return g;
  };

  /* Уровень пути, заработанный в этом цикле. */
  P.pathLevel = function (state) {
    if (!state.path || !state.path.id) return 0;
    return Math.min(P.PATH_LEVEL_CAP, Math.floor((state.path.exp || 0) / P.PATH_EXP_PER_LEVEL));
  };

  /* Запомненный максимум пути (переживает «Возврат во времени»). */
  P.pathMax = function (state, id) {
    const pm = state.prestige && state.prestige.pathMax;
    return (pm && pm[id]) || 0;
  };

  /* Эффективный уровень пути: память класса действует сразу,
     прокачка цикла может её перекрыть. */
  P.pathEffLevel = function (state) {
    if (!state.path || !state.path.id) return 0;
    return Math.max(P.pathLevel(state), P.pathMax(state, state.path.id));
  };

  /* Множители от перка и пути для calcHero/экономики. */
  P.perkDpsMult = function (state) {
    return state.perk === "power" ? 1 + P.PERK_EFFECT.power.dps : 1;
  };
  P.perkHpMult = function (state) {
    return state.perk === "tough" ? 1 + P.PERK_EFFECT.tough.hp : 1;
  };
  /* «+20% лута»: припасы с волн ×1.2 и шанс находки ×1.2. */
  P.perkLootMult = function (state) {
    return state.perk === "scavenge" ? 1 + P.PERK_EFFECT.scavenge.loot : 1;
  };
  P.pathDpsMult = function (state) {
    if (!state.path || state.path.id !== "storm") return 1;
    return 1 + P.PATH_PER_LEVEL.storm.dps * P.pathEffLevel(state);
  };
  P.pathHpMult = function (state) {
    if (!state.path || state.path.id !== "iron") return 1;
    return 1 + P.PATH_PER_LEVEL.iron.hp * P.pathEffLevel(state);
  };
  P.pathSupMult = function (state) {
    if (!state.path || state.path.id !== "junker") return 1;
    return 1 + P.PATH_PER_LEVEL.junker.sup * P.pathEffLevel(state);
  };

  /* При «Возврате во времени»: записать максимум пути в память класса.
     Вызывается из doPrestige ДО сброса state.path. */
  P.rememberPath = function (state) {
    if (!state.path || !state.path.id) return;
    const pr = state.prestige;
    pr.pathMax = pr.pathMax || {};
    const lvl = P.pathLevel(state);
    if (lvl > (pr.pathMax[state.path.id] || 0)) pr.pathMax[state.path.id] = lvl;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
