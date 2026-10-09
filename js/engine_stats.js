/* «Последний подъезд» — engine: пересчёт характеристик героя (ТЗ §3.1, правки v2).
   Сила героя = экипировка + «Самоделки» (training). «Тренировки квартиры»
   (+2 DPS за уровень) УБРАНЫ — квартира даёт +20 HP за уровень и потолок
   «Самоделок». */
(function (P) {
  "use strict";

  P.ARMOR_K = 50; // DR = armor / (armor + K)

  /* «Самоделки» (правки v2): четыре параметра, эффект за уровень.
     Фантазия: груша из одеял / закаливание / настил из коврика / метание ножей. */
  P.TRAINING = {
    str: { name: "Сила",         desc: "+12% DPS за уровень",        flavor: "груша из одеял, гантели из банок" },
    vit: { name: "Выносливость", desc: "+12% HP за уровень",        flavor: "закаливание, бег на месте" },
    def: { name: "Защита",       desc: "+3 брони за уровень",       flavor: "настил из коврика, фольга на куртке" },
    acc: { name: "Меткость",     desc: "+1.5 п.п. крита за уровень", flavor: "метание ножей по коридору" },
  };
  P.TRAIN_EFFECT = { str: 0.12, vit: 0.12, def: 3, acc: 0.015 };

  /* Потолок «Самоделок»: 2 × уровень квартиры. */
  P.trainCap = function (state) {
    return P.CONFIG.TRAIN_CAP_PER_APT * state.zones.apartment.level;
  };

  /* v4.0: «Самоделки» доступны с 1-й минуты и качаются за ОПЫТ ВЫЖИВАНИЯ
     (+1 за волну, элита +2, босс +5 — начисляется в engine_game), а не за
     припасы. 1 очко = 1 уровень параметра. Ветеран (Двор) теперь открывает
     вторую ветку («Полевые приёмы», v4.3), а не базовую прокачку. */
  P.waveExp = function (kind) {
    return kind === "boss" ? 5 : kind === "elite" ? 2 : 1;
  };
  P.expAvail = function (state) {
    return Math.max(0, (state.exp || 0) - (state.expSpent || 0));
  };

  /* Вложить очко опыта в параметр. false — нет очков/потолок. */
  P.buyTraining = function (state, key) {
    const t = state.training;
    if (!(key in t)) return false;
    if (t[key] >= P.trainCap(state)) return false;
    if (P.expAvail(state) < 1) return false;
    state.expSpent = (state.expSpent || 0) + 1;
    t[key] += 1;
    return true;
  };

  /* v4.0: «Перекус» — sink припасов с первых минут: +15% HP и +10% DPS
     на 5 минут. Цена растёт с волной активной зоны. */
  P.SNACK_SEC = 300;
  P.snackCost = function (state) {
    const z = state.zones[state.activeZone] || { wave: 1 };
    return Math.floor(8 * Math.pow(1.2, z.wave || 1));
  };
  P.snackActive = function (state) {
    return (state.snackUntil || 0) > (state.now || 0);
  };
  P.buySnack = function (state) {
    if (P.snackActive(state)) return false;
    const cost = P.snackCost(state);
    if (state.supplies < cost) return false;
    state.supplies -= cost;
    state.snackUntil = (state.now || 0) + P.SNACK_SEC;
    return true;
  };

  /* Суммировать аффиксы экипировки. */
  function countAffixes(eq) {
    const c = { stockpile: 0, regen: 0, critdmg: 0, double: 0 };
    for (const slot of P.SLOTS) {
      const it = eq[slot];
      if (!it || !it.affixes) continue;
      for (const a of it.affixes) if (a in c) c[a]++;
    }
    return c;
  }

  /* Суммарные статы героя: экипировка + «Самоделки» + уровень квартиры.
     Возвращает также аффикс-эффекты для боя и экономики. */
  P.calcHero = function (state) {
    const eq = state.equipment;
    let dpsItems = 0, hpItems = 0, armor = 0, crit = 0.05;
    for (const slot of P.SLOTS) {
      const it = eq[slot];
      if (!it) continue;
      const s = it.stats;
      if (s.dps) dpsItems += s.dps;
      if (s.hp) hpItems += s.hp;
      if (s.armor) armor += s.armor;
      if (s.crit) crit += s.crit;
    }
    const apt = state.zones.apartment.level;
    const t = state.training || { str: 0, vit: 0, def: 0, acc: 0 };

    const dps = dpsItems * (1 + P.TRAIN_EFFECT.str * t.str);
    let hpMax = Math.round((100 + 20 * apt + hpItems) * (1 + P.TRAIN_EFFECT.vit * t.vit));
    armor += P.TRAIN_EFFECT.def * t.def;
    crit += P.TRAIN_EFFECT.acc * t.acc;
    crit = Math.min(crit, 0.60);
    // v4.0: бафф «Перекус» (+10% DPS, +15% HP на 5 минут)
    const snack = P.snackActive(state);
    const dpsSnack = snack ? dps * 1.10 : dps;
    if (snack) hpMax = Math.round(hpMax * 1.15);
    const dr = armor / (armor + P.ARMOR_K);

    // аффиксы: припасы с волн, реген в бою, крит-урон, двойной удар
    const af = countAffixes(eq);
    const supMult = 1 + 0.15 * af.stockpile;
    const regenCombat = 0.01 * af.regen;           // доля hpMax/сек в бою
    const critDmg = 2.0 + 0.1 * af.critdmg;        // базовый крит ×2
    const doubleHit = 0.1 * af.double;             // шанс второго удара

    const dpsEff = dpsSnack * (1 + doubleHit) * (1 + crit * (critDmg - 1));
    return {
      dps: dpsSnack, dpsItems, hpMax, armor, crit, dr, dpsEff,
      supMult, regenCombat, critDmg, doubleHit, snack,
      training: Object.assign({}, t),
    };
  };

  /* Проверка волны без скиллов: T_kill vs T_survive (ТЗ §3.3).
     Аффикс-реген в бою учитывается: HP героя меняется как
     hp(t) = hp0 + (regenCombat*hpMax − incoming)·t. */
  P.waveCheck = function (hero, enemy, curHp) {
    const tKill = enemy.hp / Math.max(hero.dpsEff, 0.001);
    const incoming = enemy.dps * (1 - hero.dr);
    const hp0 = curHp != null ? curHp : hero.hpMax;
    // реген в бою: выжил, если HP к моменту убийства врага > 0
    const win = hp0 + tKill * (hero.regenCombat * hero.hpMax - incoming) > 0;
    const tSurvive = incoming > hero.regenCombat * hero.hpMax
      ? hp0 / (incoming - hero.regenCombat * hero.hpMax)
      : Infinity;
    return { tKill, tSurvive, win, incoming };
  };

  P.winChancePct = function (hero, enemy, curHp) {
    const c = P.waveCheck(hero, enemy, curHp);
    if (c.win) {
      const dom = c.tSurvive === Infinity ? 1 : Math.max(0, 1 - c.tKill / c.tSurvive);
      return Math.min(99, Math.round(55 + 45 * Math.min(1, dom)));
    }
    return Math.max(1, Math.round(45 * (c.tSurvive / c.tKill)));
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
