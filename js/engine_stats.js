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
    str: { name: "Сила",         desc: "+8% DPS за уровень",        flavor: "груша из одеял, гантели из банок" },
    vit: { name: "Выносливость", desc: "+10% HP за уровень",        flavor: "закаливание, бег на месте" },
    def: { name: "Защита",       desc: "+3 брони за уровень",       flavor: "настил из коврика, фольга на куртке" },
    acc: { name: "Меткость",     desc: "+1.5 п.п. крита за уровень", flavor: "метание ножей по коридору" },
  };
  P.TRAIN_EFFECT = { str: 0.08, vit: 0.10, def: 3, acc: 0.015 };

  /* Потолок «Самоделок» и покупка доступны только после Ветерана (зачистка Двора). */
  P.trainCap = function (state) {
    return P.CONFIG.TRAIN_CAP_PER_APT * state.zones.apartment.level;
  };
  P.trainCost = function (level) {
    const C = P.CONFIG;
    return Math.floor(C.TRAIN_COST_BASE * Math.pow(C.TRAIN_COST_GROW, level));
  };

  /* Купить уровень параметра. Возвращает false если нет припасов/потолка. */
  P.buyTraining = function (state, key) {
    if (!state.veteranUnlocked) return false;
    const t = state.training;
    if (!(key in t)) return false;
    const cap = P.trainCap(state);
    if (t[key] >= cap) return false;
    const cost = P.trainCost(t[key]);
    if (state.supplies < cost) return false;
    state.supplies -= cost;
    t[key] += 1;
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
    const hpMax = Math.round((100 + 20 * apt + hpItems) * (1 + P.TRAIN_EFFECT.vit * t.vit));
    armor += P.TRAIN_EFFECT.def * t.def;
    crit += P.TRAIN_EFFECT.acc * t.acc;
    crit = Math.min(crit, 0.60);
    const dr = armor / (armor + P.ARMOR_K);

    // аффиксы: припасы с волн, реген в бою, крит-урон, двойной удар
    const af = countAffixes(eq);
    const supMult = 1 + 0.15 * af.stockpile;
    const regenCombat = 0.01 * af.regen;           // доля hpMax/сек в бою
    const critDmg = 2.0 + 0.1 * af.critdmg;        // базовый крит ×2
    const doubleHit = 0.1 * af.double;             // шанс второго удара

    const dpsEff = dps * (1 + doubleHit) * (1 + crit * (critDmg - 1));
    return {
      dps, dpsItems, hpMax, armor, crit, dr, dpsEff,
      supMult, regenCombat, critDmg, doubleHit,
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
