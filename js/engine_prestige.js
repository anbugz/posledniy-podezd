/* «Последний подъезд» — engine: престиж «Возврат во времени» (v4.2).
   Фантазия: зачистив Район, герой находит «часы Слава» и отматывает время
   в первый день, сохраняя мышечную память (Уровень времени — RL).
   Сбрасывается: волны/зоны, экипировка и сумка, припасы, технологии, опыт,
   самоделки, уровень квартиры, уники. Остаётся: RL и Очки времени. */
(function (P) {
  "use strict";

  P.RL_STAT_PER_LEVEL = 0.05; // +5% DPS и +5% HP за каждый RL (навсегда)

  /* Таблица бонусов за RL (как reincarnation-разблокировки в FAPI). */
  P.RL_BONUSES = [
    { rl: 1,  text: "+5% DPS и +5% HP за каждый уровень времени" },
    { rl: 3,  text: "+10% опыта выживания за волны" },
    { rl: 5,  text: "Круги 2+ возвращаются (×1.15 за круг) — эндгейм-фарм" },
    { rl: 8,  text: "+15% припасов с волн" },
    { rl: 12, text: "+1 п.п. к шансу «особой находки»" },
    { rl: 16, text: "Авто-«Надеть лучшее» после каждой находки" },
  ];

  P.defaultPrestige = function () {
    return { rl: 0, points: 0, cycles: 0, bestRarity: 0, circles: 0 };
  };

  P.rl = function (state) {
    return (state.prestige && state.prestige.rl) || 0;
  };

  /* Множитель DPS/HP от уровня времени. */
  P.rlMult = function (state) {
    return 1 + P.RL_STAT_PER_LEVEL * P.rl(state);
  };

  /* RL≥5: круги выше первого возвращаются (×1.15 за круг). */
  P.cyclesOn = function (state) {
    return P.rl(state) >= 5;
  };

  /* RL≥3: +10% опыта за волны. */
  P.expMult = function (state) {
    return P.rl(state) >= 3 ? 1.10 : 1;
  };

  /* RL≥8: +15% припасов с волн (учитывается в calcHero.supMult). */
  P.rlSuppliesMult = function (state) {
    return P.rl(state) >= 8 ? 1.15 : 1;
  };

  /* RL≥12: +1 п.п. к шансу золотой волны. */
  P.goldenChance = function (state) {
    return (P.CONFIG.GOLDEN_CHANCE || 0.02) + (P.rl(state) >= 12 ? 0.01 : 0);
  };

  /* RL≥16: авто-«Надеть лучшее» после каждой находки. */
  P.autoEquipBestOn = function (state) {
    return P.rl(state) >= 16;
  };

  /* Сколько зон зачищено в этом цикле (босс 20-й волны убит). */
  P.prestigeZonesCleared = function (state) {
    let n = 0;
    for (const id of P.ZONE_ORDER) {
      const z = state.zones[id];
      if (z && (z.maxWave || 1) > P.ZONES[id].wavesCap) n++;
    }
    return n;
  };

  /* Превью очков времени за текущий цикл:
     зоны ×2 + лучшая редкость находки (обыч 0 … миф 5) + круги эндгейма ×1. */
  P.prestigePointsPreview = function (state) {
    const pr = state.prestige || P.defaultPrestige();
    const zones = P.prestigeZonesCleared(state);
    const rarity = pr.bestRarity || 0;
    const circles = pr.circles || 0;
    return { zones, zonePts: zones * 2, rarity, circles, total: zones * 2 + rarity + circles };
  };

  /* Престиж доступен после зачистки Района (волна 20, гейт Оружейника). */
  P.prestigeAvailable = function (state) {
    return !!state.upgradesUnlocked;
  };

  /* Потратить очко времени: +1 RL. false — нет очков. */
  P.buyRl = function (state) {
    const pr = state.prestige;
    if (!pr || (pr.points || 0) < 1) return false;
    pr.points -= 1;
    pr.rl = (pr.rl || 0) + 1;
    return true;
  };

  /* «Вернуться в первый день»: начисляет очки времени и сбрасывает цикл.
     Мутирует state на месте (ссылки у тестов/UI остаются валидны).
     Возвращает число заработанных очков или null, если престиж недоступен. */
  P.doPrestige = function (state) {
    if (!P.prestigeAvailable(state)) return null;
    const pr = state.prestige || P.defaultPrestige();
    const earned = P.prestigePointsPreview(state).total;

    const fresh = P.defaultState();
    fresh.prestige = {
      rl: pr.rl || 0,
      points: (pr.points || 0) + earned,
      cycles: (pr.cycles || 0) + 1,
      bestRarity: 0,
      circles: 0,
    };
    // QoL-настройки и суммарная статистика переживают возврат
    fresh.autoSell = state.autoSell;
    fresh.autoSellOn = state.autoSellOn;
    fresh.autoFarm = !!state.autoFarm;
    fresh.stats = state.stats || fresh.stats;
    fresh.now = state.now || 0; // игровое время непрерывно (баффы/кулдауны)
    fresh.hero.hp = P.calcHero(fresh).hpMax;

    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, fresh);
    return earned;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
