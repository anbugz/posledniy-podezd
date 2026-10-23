/* «Последний подъезд» — data: враги.
   Формулы откалиброваны balance_sim.py (2026-09-17, правки v2).
   Правки v2: рост HP 1.125 (калибровка v3.3 — без прокачек не должно быть стены), общий штраф −25% к HP, после wavesCap
   волны идут по кругу с ростом WAVE_LOOP_MULT за круг. */
(function (P) {
  "use strict";

  P.ENEMY = {
    hpBase: 30, hpGrow: 1.125, hpTier: 2.0, hpGlobal: 0.75,
    dpsBase: 2.4, dpsGrow: 1.14, dpsTier: 1.8,
    eliteEvery: 5, eliteHp: 2.5, eliteDps: 1.3,
    bossEvery: 10, bossHp: 3.0, bossDps: 1.4,
    // тех с волны: шанс обычной 30%, элита x5 гарант, босс x20 гарант
    techChance: 0.30, techElite: 5, techBoss: 20,
  };

  /* Абсолютный номер волны -> эффективная волна внутри круга и номер круга.
     v5.1: фарм-круги (1–3, волны 51–200) растут ВСЕГДА — стена фарма как в FAPI;
     бесконечные круги 4+ (за потолком 200) — престиж-механика при RL≥5. */
  P.waveCycle = function (n, cap, cyclesOn) {
    cap = cap || 50;
    const nEff = ((n - 1) % cap) + 1;
    const raw = Math.floor((n - 1) / cap);
    const cycle = cyclesOn ? raw : Math.min(raw, 3);
    return { nEff, cycle };
  };

  // Волна n (абсолютная) в зоне тира z -> {hp, dps, kind, name, cycle}
  P.enemyStats = function (n, z, cap, zoneId, cyclesOn) {
    const E = P.ENEMY;
    const c = P.waveCycle(n, cap, cyclesOn);
    const loopMult = Math.pow(P.CONFIG.WAVE_LOOP_MULT, c.cycle);
    let hp = E.hpBase * Math.pow(E.hpGrow, c.nEff) * Math.pow(E.hpTier, z) * E.hpGlobal * loopMult;
    let dps = E.dpsBase * Math.pow(E.dpsGrow, c.nEff) * Math.pow(E.dpsTier, z) * loopMult;
    let kind = "norm";
    if (c.nEff % E.bossEvery === 0) {
      hp *= E.bossHp; dps *= E.bossDps; kind = "boss";
    } else if (c.nEff % E.eliteEvery === 0) {
      hp *= E.eliteHp; dps *= E.eliteDps; kind = "elite";
    }
    return { hp: Math.floor(hp), dps, kind, name: P.enemyName(c.nEff, kind, zoneId), cycle: c.cycle };
  };

  // v3.4: у каждой зоны свой бестиарий
  const ZONE_NAMES = {
    apartment: { grunt: ["Жук-разведчик", "Дрон-сверчок", "Паучок-дезориентатор", "Жук-тихоход"], elite: "Элитный жук-поглотитель", boss: ["Штурмовой дрон", "Дрон-носильщик"] },
    entrance:  { grunt: ["Сверчок подъезда", "Жук-лазутчик", "Паук-навесник", "Дрон-шпион"], elite: "Элитный страж лестницы", boss: ["Лифтовой страж", "Дрон-домофон"] },
    yard:      { grunt: ["Паук-скакун", "Жук-копатель", "Овод-разведчик", "Гусеница-пепельник"], elite: "Элитный паук-караульный", boss: ["Матка пауков", "Дворовый владыка"] },
    house:     { grunt: ["Подвальный слизень", "Жук-трубогрыз", "Плесень-ползун", "Таракан-огрызок"], elite: "Элитный котельный жук", boss: ["Котельный голем", "Страж подвала"] },
    district:  { grunt: ["Дрон-коршун", "Жук-штурмовик", "Паук-дальнобой", "Осадный сверчок"], elite: "Элитный дрон-охотник", boss: ["Дрон-носильщик", "Небесный каратель"] },
    // v5.2: вторая лестница зон — за пределы района
    mall:      { grunt: ["Жук-витринник", "Сверчок эскалатора", "Моль-манекен", "Дрон-грузчик"], elite: "Элитный жук-контролёр", boss: ["Голем распродажи", "Страж атриума"] },
    metro:     { grunt: ["Ручейник туннеля", "Слепой паук-веерник", "Жук-рельсогрыз", "Дрон-осветитель"], elite: "Элитный страж туннеля", boss: ["Король ручейников", "Призрак последнего поезда"] },
    hospital:  { grunt: ["Жук-сепаратор", "Муха-хирург", "Паук-капельник", "Личинка-мутант"], elite: "Элитный мутант палаты", boss: ["Главврач-голем", "Мутант операционной"] },
    powerplant:{ grunt: ["Жук-турбинник", "Сверчок-паровик", "Паук-изолятор", "Дрон-искровик"], elite: "Элитный бронежук котла", boss: ["Турбинный голем", "Хранитель топки"] },
    tower:     { grunt: ["Дрон-антенник", "Паук-вышкарь", "Жук-сигнальщик", "Оса-ветрогон"], elite: "Элитный дрон-ретранслятор", boss: ["Страж шпиля", "Владыка эфира"] },
    center:    { grunt: ["Жук-парадный", "Дрон-гвардеец", "Паук-монументал", "Сверчок проспекта"], elite: "Элитный гвардеец площади", boss: ["Колосс проспекта", "Часовой монумента"] },
    nest:      { grunt: ["Личинка-страж", "Жук-копилка", "Паук-ятровик", "Дрон-инкубатор"], elite: "Элитный страж кокона", boss: ["Хор-матка", "Королева Гнезда"] },
  };

  P.enemyName = function (n, kind, zoneId) {
    const z = ZONE_NAMES[zoneId] || ZONE_NAMES.apartment;
    if (kind === "boss") return z.boss[n % 2];
    if (kind === "elite") return z.elite;
    return z.grunt[n % z.grunt.length];
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
