/* «Последний подъезд» — node-тесты движка (без браузера). Правки v2.
   Запуск: node tests/sim_test.js */
"use strict";

global.PODEZD = {};
const P = global.PODEZD;

require("../js/ns.js");
require("../js/data_zones.js");
require("../js/data_enemies.js");
require("../js/data_items.js");
require("../js/data_skills.js");
require("../js/engine_stats.js");
require("../js/engine_combat.js");
require("../js/engine_loot.js");
require("../js/engine_econ.js");
require("../js/engine_save.js");
require("../js/engine_game.js");

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error("FAIL:", msg); }
}
function approx(a, b, eps, msg) {
  assert(Math.abs(a - b) <= eps, `${msg} (got ${a}, want ${b}±${eps})`);
}

// ---------- stats: старт без «кулаков», сила = предметы ----------
{
  const state = P.defaultState();
  const hero = P.calcHero(state);
  // старт: нож dps6 (кулаки убраны); HP = 100+20+10+10=140; броня 5
  approx(hero.dps, 6, 0.01, "стартовый DPS = только нож");
  approx(hero.hpMax, 140, 0.01, "стартовый HP");
  approx(hero.dr, 5 / 55, 0.001, "DR при 5 броне");
  assert(hero.supMult === 1 && hero.regenCombat === 0, "нет аффиксов на старте");
}

// ---------- «Самоделки» (v4.0: за опыт, с 1-й минуты) ----------
{
  const state = P.defaultState();
  state.exp = 100;
  assert(P.trainCap(state) === 2, "потолок = 2× уровень квартиры");
  const st0 = P.defaultState();
  assert(!P.buyTraining(st0, "str"), "без очков опыта качать нельзя");
  assert(P.buyTraining(state, "str"), "покупка Силы за очко опыта");
  assert(P.buyTraining(state, "str"), "вторая покупка Силы");
  assert(!P.buyTraining(state, "str"), "потолок не пробивается");
  assert(P.expAvail(state) === 98, "потрачено 2 очка опыта");
  const hero = P.calcHero(state);
  approx(hero.dps, 6 * 1.24, 0.01, "Сила: +12% DPS за уровень");
  assert(P.buyTraining(state, "vit"), "покупка Выносливости");
  approx(P.calcHero(state).hpMax, Math.round(140 * 1.12), 0.01, "Выносливость: +12% HP");
  assert(P.buyTraining(state, "def"), "покупка Защиты");
  assert(P.calcHero(state).armor > 5, "Защита: +3 брони");
  assert(P.buyTraining(state, "acc"), "покупка Меткости");
  assert(P.calcHero(state).crit > 0.05, "Меткость: +1.5 п.п. крита");
  // апгрейд квартиры поднимает потолок (v4.0: хаб не нужен)
  state.supplies = 10000;
  P.buyZoneLevel(state, "apartment");
  assert(P.trainCap(state) === 4, "потолок вырос с квартирой");
  assert(P.buyTraining(state, "str"), "Силу можно качать дальше");
}

// ---------- аффиксы ----------
{
  const state = P.defaultState();
  state.equipment.accessory = {
    slot: "accessory", rarity: "epic", tier: 1, name: "Тест",
    stats: { dps: 5 }, affixes: ["stockpile", "regen", "critdmg"], lvl: 0,
  };
  const hero = P.calcHero(state);
  approx(hero.supMult, 1.15, 0.001, "аффикс: +15% припасов");
  approx(hero.regenCombat, 0.01, 0.001, "аффикс: реген 1% в бою");
  approx(hero.critDmg, 2.1, 0.001, "аффикс: +10% крит-урон");
  state.equipment.gloves = {
    slot: "gloves", rarity: "uncommon", tier: 1, name: "Тест2",
    stats: { dps: 2 }, affixes: ["double"], lvl: 0,
  };
  const hero2 = P.calcHero(state);
  assert(hero2.dpsEff > hero2.dps * (1 + hero2.crit), "двойной удар поднимает eff DPS");
  // генерация: количество аффиксов по редкости
  for (let i = 0; i < 50; i++) {
    const un = P.generateItem("boots", 1, "uncommon", Math.random);
    const ra = P.generateItem("boots", 1, "rare", Math.random);
    const ep = P.generateItem("boots", 1, "epic", Math.random);
    assert(un.affixes.length === 1, "необычный = 1 аффикс");
    assert(ra.affixes.length === 2, "редкий = 2 аффикса");
    assert(ep.affixes.length === 3, "эпик = 3 аффикса");
  }
}

// ---------- прокачка предмета (v4.0: за технологии, с 1-й минуты) ----------
{
  const state = P.defaultState();
  state.tech = 10000;
  // без Оружейника — улучшать можно, но не выше +5
  assert(P.upgradeItem(state, "equip", "weapon"), "улучшение доступно сразу (теперь за tech)");
  // эпик: чтобы цена чувствительно росла после ресайла (base 2 мала)
  state.equipment.weapon = P.generateItem("weapon", 1, "epic", Math.random);
  const knife = state.equipment.weapon;
  const dps0 = knife.stats.dps;
  const cost0 = P.itemUpgradeCost(knife);
  assert(cost0 > 0, "цена прокачки положительная");
  assert(P.upgradeItem(state, "equip", "weapon"), "прокачка надетого оружия за tech");
  approx(knife.stats.dps, Math.round(dps0 * 1.15 * 10) / 10, 0.2, "+15% к статам за уровень");
  assert(knife.lvl === 1, "уровень предмета вырос");
  assert(P.itemUpgradeCost(knife) > cost0, "цена растёт с уровнем");
  const poor = P.defaultState();
  poor.tech = 0;
  assert(!P.upgradeItem(poor, "equip", "weapon"), "без технологий не прокачать");
  // софт-кэп +5 без Оружейника
  knife.lvl = 5;
  assert(!P.upgradeItem(state, "equip", "weapon"), "выше +5 — только с Оружейником");
  state.upgradesUnlocked = true;
  assert(P.upgradeItem(state, "equip", "weapon"), "Оружейник снимает предел +5");
}

// ---------- waves: ослабленные враги, круги ----------
{
  const e1 = P.enemyStats(1, 1, 20);
  assert(e1.hp > 0 && e1.dps > 0, "враг волны 1 существует");
  const e10 = P.enemyStats(10, 1, 20);
  assert(e10.kind === "boss", "волна 10 — босс");
  const e5 = P.enemyStats(5, 1, 20);
  assert(e5.kind === "elite", "волна 5 — элита");
  assert(e10.hp > e5.hp, "босс крепче элиты");
  // штраф −25% к HP: база 30*1.15^1*2*0.75 = 51.75
  approx(e1.hp, Math.floor(30 * 1.15 * 2 * 0.75), 1, "−25% к HP врагов");
  // v3.6: кругов выше первого нет — волна 21 = волна 1 с базовой сложностью
  const e21 = P.enemyStats(21, 1, 20);
  approx(e21.hp, e1.hp, 1, "повтор круга без роста сложности");
  assert(e21.cycle === 0, "круг всегда первый (престиж-круги — позже)");
}

// ---------- waveCheck: стартовый герой проходит волну 1 ----------
{
  const state = P.defaultState();
  const hero = P.calcHero(state);
  const e1 = P.enemyStats(1, 1, 20);
  const check = P.waveCheck(hero, e1, hero.hpMax);
  assert(check.win, "стартовый герой проходит волну 1");
  const e20 = P.enemyStats(20, 1, 20);
  const check20 = P.waveCheck(hero, e20, hero.hpMax);
  assert(!check20.win, "стартовый герой НЕ проходит волну 20 (босса)");
  // реген в бою спасает в близком бою
  const regenHero = Object.assign({}, hero, { regenCombat: 0.05 });
  const close = { hp: 100, dps: 5 };
  const c1 = P.waveCheck(hero, close, 100);
  const c2 = P.waveCheck(regenHero, close, 100);
  if (!c1.win) assert(c2.win || c2.tSurvive > c1.tSurvive, "реген в бою продлевает жизнь");
}

// ---------- combat: бой заканчивается победой, после капа — круги ----------
{
  const state = P.defaultState();
  state.autoFarm = true; // прогресс по волнам — только в авто-режиме
  const events = [];
  const combat = P.createCombat(state, "apartment", (ev) => events.push(ev.type));
  for (let t = 0; t < 2400; t++) {
    combat.update(0.05, 1);
    if (events.includes("waveWin")) break;
  }
  assert(events.includes("waveStart"), "бой начался");
  assert(events.includes("waveWin"), "волна 1 выиграна в реальном времени");
  assert(state.zones.apartment.wave === 2, "счётчик волн увеличился");
  assert(state.supplies >= 0, "припасы не ушли в минус");
}

// ---------- combat: зачистка круга -> zoneClear, бой продолжается ----------
{
  const state = P.defaultState();
  state.autoFarm = true;
  // сильный билд: пройдём волну 20 (и выживем под боссом)
  state.equipment.weapon = { slot: "weapon", rarity: "legendary", tier: 1, name: "Тест", stats: { dps: 3000 }, affixes: [], lvl: 0 };
  state.equipment.armor = { slot: "armor", rarity: "legendary", tier: 1, name: "Тест", stats: { hp: 5000, armor: 500 }, affixes: [], lvl: 0 };
  state.equipment.helmet = { slot: "helmet", rarity: "legendary", tier: 1, name: "Тест", stats: { hp: 3000 }, affixes: [], lvl: 0 };
  const events = [];
  const combat = P.createCombat(state, "apartment", (ev) => events.push(ev));
  let clears = 0;
  for (let t = 0; t < 20000 && clears === 0; t++) {
    combat.update(0.05, 1);
    for (const ev of events) if (ev.type === "zoneClear") clears++;
  }
  assert(clears === 1, "zoneClear пришёл ровно один раз (зачистка круга)");
  assert(state.zones.apartment.wave > 20, "после 20-й волны идут круги");
  assert(combat.phase !== "done", "бой не останавливается после зачистки");
}

// ---------- loot: сумка, экипировка, продажа ----------
{
  const state = P.defaultState();
  // наполняем сумку
  for (let i = 0; i < 10; i++) {
    const item = P.generateItem("helmet", 1, "common", Math.random);
    const res = P.applyLoot(state, item, 1);
    assert(res.toBag, "предмет ушёл в сумку");
  }
  assert(state.bag.length === 10, "в сумке 10 предметов");
  // надеваем: слот пуст -> предмет из сумки, ячейка удаляется
  const helm = state.bag[0];
  const r = P.equipItem(state, 0);
  assert(r && r.equipped === helm && state.equipment.helmet === helm, "надевание из сумки");
  assert(state.bag.length === 9, "ячейка сумки освободилась");
  // меняем местами: надеваем другой шлем -> старый возвращается в сумку
  const helm2 = state.bag[0];
  P.equipItem(state, 0);
  assert(state.equipment.helmet === helm2 && state.bag[0] === helm, "замена: старый предмет вернулся в сумку");
  // продажа
  const supBefore = state.supplies;
  const g = P.sellItem(state, 0);
  assert(g > 0 && state.supplies === supBefore + g, "продажа даёт припасы");
  // «Надеть лучшее» и «продать всё серое»
  for (let i = 0; i < 5; i++) P.applyLoot(state, P.generateItem("gloves", 1, "common", Math.random), 1);
  P.applyLoot(state, P.generateItem("gloves", 1, "rare", Math.random), 1);
  const gained = P.sellAllCommon(state);
  assert(gained > 0, "продажа серого даёт припасы");
  assert(state.bag.every((x) => x.rarity !== "common"), "серого в сумке не осталось");
  // переполнение: сумка полная -> авто-продажа
  const full = P.defaultState();
  full.bagSize = 3;
  for (let i = 0; i < 3; i++) P.applyLoot(full, P.generateItem("boots", 1, "common", Math.random), 1);
  const s0 = full.supplies;
  const overflow = P.applyLoot(full, P.generateItem("boots", 1, "common", Math.random), 1);
  assert(!overflow.toBag && full.supplies > s0, "переполнение сумки -> авто-продажа");
  assert(full.bag.length === 3, "сумка не растёт за пределы");
}

// ---------- econ: квартира без дохода (v4.0: улучшается с 1-й минуты) ----------
{
  const state = P.defaultState();
  state.supplies = 1000;
  const hpBefore = P.calcHero(state).hpMax;
  assert(P.buyZoneLevel(state, "apartment"), "квартира улучшается без хаба (v4.0)");
  assert(P.calcHero(state).hpMax === hpBefore + 20, "квартира: +20 HP за уровень");
  // остальные зоны — по-прежнему за хабом
  state.zones.entrance.unlocked = true;
  assert(!P.buyZoneLevel(state, "entrance"), "прочие зоны — только после хаба");
  state.hubUnlocked = true;
  assert(P.buyZoneLevel(state, "entrance"), "с хабом — можно");
  assert(!P.buyZoneLevel({ supplies: 0, zones: state.zones }, "apartment"), "нельзя купить без припасов");
  assert(typeof P.totalIncome !== "function", "пассивного дохода больше нет");
}

// ---------- skills ----------
{
  const state = P.defaultState();
  const game = P.createGame(state, {});
  assert(game.useSkill("rain"), "навык 'дождь' активируется");
  assert(!game.useSkill("rain"), "навык на кулдауне");
  state.zones.apartment.wave = 1;
  assert(!game.useSkill("ult"), "ультимейт залочен до волны 10");
  state.zones.apartment.wave = 10;
  assert(game.useSkill("ult"), "ультимейт работает с волны 10");
  assert(game.activeSkillMult() >= 5, "ультимейт даёт множитель");
}

// ---------- save/load: версия 3, миграция v2 ----------
{
  const state = P.defaultState();
  assert(state.version === 4, "сейв версии 4");
  state.supplies = 500;
  P.save(state);
  const loaded = P.load();
  assert(loaded.state.supplies >= 500, "сейв загружается");
  assert(loaded.state.bag.length === 0 && loaded.state.training.str === 0, "поля v4 на месте");
  assert(loaded.state.exp === 0 && loaded.state.snackUntil === 0, "поля v4.0 на месте");

  // миграция: старый сейв v2 -> v4
  const old = {
    version: 2, supplies: 321, tech: 5, totalSupplies: 400,
    hero: { hp: 150 },
    equipment: P.startingEquipment(),
    zones: { apartment: { unlocked: true, level: 3, wave: 7 }, entrance: { unlocked: false, level: 1, wave: 1 } },
    skills: {}, dayNight: null, event: null,
    stats: { wavesCleared: 6, kills: 6, itemsFound: 2, deaths: 1, startedAt: 1 },
    lastTick: Date.now(),
  };
  P.storage.setItem("podezd_save_v2", JSON.stringify(old));
  P.storage.removeItem(P.SAVE_KEY);
  const migrated = P.load();
  assert(migrated.state.version === 4, "миграция v2 -> v4");
  assert(migrated.state.supplies >= 321, "припасы перенесены");
  assert(migrated.state.zones.apartment.level === 3, "уровень квартиры перенесён");
  assert(migrated.state.equipment.weapon.name === "Кухонный нож", "экипировка перенесена");
  assert(migrated.state.training && migrated.state.training.str === 0, "training добавлен");
  assert(Array.isArray(migrated.state.bag), "bag добавлен");
  assert(migrated.state.exp >= 7, "опыт начислен ретроактивно за волны");
  P.storage.removeItem("podezd_save_v2");

  // миграция v3 -> v4
  const old3 = P.defaultState();
  old3.version = 3;
  delete old3.exp; delete old3.expSpent; delete old3.snackUntil;
  old3.stats.wavesCleared = 100;
  P.storage.setItem(P.SAVE_KEY, JSON.stringify(old3));
  const m3 = P.load();
  assert(m3.state.version === 4, "миграция v3 -> v4");
  assert(m3.state.exp === 120, "v3: опыт = волны × 1.2");
}

// ---------- offline: без пассивного дохода, волны идут, оружие на в.3 ----------
{
  const s2 = P.defaultState();
  s2.supplies = 0;
  const report = P.applyOffline(s2, 3600);
  assert(report.wavesTo > report.wavesFrom, "оффлайн проходит волны");
  assert(s2.supplies > 0, "оффлайн копит припасы с волн");
  assert(s2.hero.hp > 0, "герой жив после оффлайна");
  assert(report.items.some((l) => l.item.slot === "weapon"), "на волне 3 гарантированно оружие");

  // сильный билд: проходит босса, набирает технологии
  const s3 = P.defaultState();
  s3.zones.apartment.level = 12;
  s3.equipment.weapon = { slot: "weapon", rarity: "epic", tier: 1, name: "Тест", stats: { dps: 120 }, affixes: [], lvl: 0 };
  const report3 = P.applyOffline(s3, 3600);
  assert(report3.wavesTo >= 10, "сильный билд проходит волну до босса оффлайн");
  assert(s3.tech > 0, "оффлайн копит технологии (элита/босс)");

  // очень сильный билд: зачистка круга оффлайн открывает подъезд и идёт дальше
  const s4 = P.defaultState();
  s4.equipment.weapon = { slot: "weapon", rarity: "mythic", tier: 1, name: "Тест", stats: { dps: 5000 }, affixes: [], lvl: 0 };
  s4.equipment.armor = { slot: "armor", rarity: "legendary", tier: 1, name: "Тест", stats: { hp: 5000, armor: 500 }, affixes: [], lvl: 0 };
  const report4 = P.applyOffline(s4, 3600);
  assert(report4.wavesTo > 20, "оффлайн проходит за 20 волн (круги)");
  assert(s4.zones.entrance.unlocked, "оффлайн-зачистка открывает подъезд");
}

// ---------- game.update интеграционно: дохода нет, припасы с волн ----------
{
  const state = P.defaultState();
  state.autoFarm = true;
  let wins = 0;
  const game = P.createGame(state, {
    onWaveWin() { wins++; },
  });
  for (let i = 0; i < 20 * 60 / 0.05; i++) game.update(0.05);
  assert(state.now > 100, "игровое время идёт");
  assert(wins >= 1, "за 20 минут выиграно несколько волн");
  assert(state.supplies > 0, "припасы капают с волн");
  assert(state.dayNight.phase === "day" || state.dayNight.phase === "night", "день/ночь работает");
}

// ---------- combat: БЕЗ авто прогресса нет — герой фармит волну ----------
{
  const state = P.defaultState();
  state.autoFarm = false;
  const game = P.createGame(state, {});
  for (let t = 0; t < 3000; t++) game.update(0.05);
  assert(state.zones.apartment.wave === 1, "без авто волна не растёт (фарм)");
  assert(state.supplies > 0, "фарм волны капает припасы");
  assert(state.stats.wavesCleared > 0, "победы в фарме считаются");
}

// ---------- переключение волн: maxWave, setWave, границы ----------
{
  const state = P.defaultState();
  state.autoFarm = true; // иначе победа не поднимает волну
  const game = P.createGame(state, {});
  const zone = state.zones.apartment;
  assert(zone.maxWave === 1, "maxWave стартует с 1");
  assert(!game.setWave(5), "setWave выше maxWave отклонён");
  assert(zone.wave === 1, "волна не изменилась");
  // ждём первой победы: wave и maxWave вырастут (дальше авто осциллирует у стены)
  const wins0 = state.stats.wavesCleared;
  for (let i = 0; i < 2400 && state.stats.wavesCleared === wins0; i++) game.update(0.05);
  assert(state.stats.wavesCleared > wins0, "первая победа");
  assert(zone.wave >= 2 && zone.maxWave >= 2, "победа: wave и maxWave выросли");
  assert(game.setWave(1), "возврат на предыдущую волну");
  assert(zone.wave === 1, "волна переключена на 1");
  assert(!game.setWave(0), "ниже 1 нельзя");
  assert(game.setWave(2), "снова вперёд на достигнутую волну");
  // во время боя переключать нельзя
  for (let i = 0; i < 1200 && game.combat.phase !== "fight"; i++) game.update(0.05);
  assert(game.combat.phase === "fight", "идёт бой");
  assert(!game.setWave(1), "setWave запрещён в фазе fight");
}

// ---------- авто-фарм: нокаут откатывает волну ----------
{
  const state = P.defaultState();
  state.zones.apartment.wave = 10;
  state.zones.apartment.maxWave = 10;
  state.autoFarm = true;
  const game = P.createGame(state, {});
  let knocked = false;
  for (let i = 0; i < 6000 && !knocked; i++) {
    game.update(0.05);
    knocked = game.combat.phase === "knockout";
  }
  assert(knocked, "герой получил нокаут на волне 10");
  assert(state.zones.apartment.wave === 9, "авто-фарм: нокаут откатил волну на 1");
  assert(state.zones.apartment.maxWave === 10, "maxWave не уменьшается");
}

// ---------- авто-фарм: победа эскалирует на проходимую волну ----------
{
  const state = P.defaultState();
  state.autoFarm = true;
  state.equipment.weapon = { slot: "weapon", rarity: "mythic", tier: 1, name: "Тест", stats: { dps: 2000 }, affixes: [], lvl: 0 };
  const game = P.createGame(state, {});
  for (let i = 0; i < 2400; i++) game.update(0.05);
  const zone = state.zones.apartment;
  // v3.6: каждая победа поднимает волну ровно на 1 — волна-босс (20-я)
  // не перепрыгивается, zoneClear срабатывает
  assert(zone.wave - 1 === state.stats.wavesCleared, "авто-фарм: волна растёт ровно +1 за победу");
  assert(zone.maxWave === zone.wave, "maxWave следует за эскалацией");
}

// ---------- миграция: maxWave не ниже достигнутой волны ----------
{
  const old = {
    version: 2, supplies: 100, tech: 0, totalSupplies: 100,
    hero: { hp: 150 }, equipment: P.startingEquipment(),
    zones: { apartment: { unlocked: true, level: 2, wave: 7 }, entrance: { unlocked: false, level: 1, wave: 1 } },
    skills: {}, dayNight: null, event: null,
    stats: {}, lastTick: Date.now(),
  };
  const s = P.migrate(old);
  assert(s.zones.apartment.maxWave === 7, "maxWave мигрирует не ниже wave");
  assert(s.autoFarm === false, "autoFarm выключен по умолчанию");
}

// ---------- ретроактивное открытие зон для старых сейвов ----------
{
  // старый сейв: подъезд пройден далеко за пределы круга, но двор не открыт
  const old = {
    version: 2, supplies: 100, tech: 0, totalSupplies: 100,
    hero: { hp: 150 }, equipment: P.startingEquipment(),
    zones: {
      apartment: { unlocked: true, level: 1, wave: 411 },
      entrance: { unlocked: true, level: 1, wave: 411 },
    },
    skills: {}, dayNight: null, event: null,
    stats: {}, lastTick: Date.now(),
  };
  const s = P.migrate(old);
  assert(s.zones.yard.unlocked === true, "двор открылся ретроактивно из старого сейва");
  assert(s.veteranUnlocked !== true, "ветеран не открыт — двор ещё не зачищен");
  // двор зачищен в старом сейве -> дом и ветеран
  old.zones.yard = { unlocked: true, level: 1, wave: 45 };
  const s2 = P.migrate(old);
  assert(s2.zones.house.unlocked === true, "дом открылся ретроактивно");
  assert(s2.veteranUnlocked === true, "ветеран открыт зачисткой двора в старом сейве");
  // свежий сейв не открывает ничего лишнего
  const s3 = P.migrate(JSON.parse(JSON.stringify(P.defaultState())));
  assert(s3.zones.entrance.unlocked === false, "свежий сейв: подъезд закрыт");
}

// ---------- мультизоны: переключение, цепочка открытий, хаб ----------
{
  const state = P.defaultState();
  const game = P.createGame(state, {});
  // старт: только квартира
  assert(!game.setZone("entrance"), "подъезд закрыт на старте");
  // открываем подъезд и дом (как делает zoneClear при зачистке круга)
  state.zones.entrance.unlocked = true;
  state.zones.house.unlocked = true;
  assert(game.setZone("entrance"), "переключение в подъезд");
  assert(state.activeZone === "entrance" && game.combat.zoneId === "entrance", "активная зона сменилась");
  // у зон свои волны
  state.zones.entrance.wave = 5;
  state.zones.entrance.maxWave = 5;
  game.setWave(3);
  assert(state.zones.entrance.wave === 3, "setWave работает в активной зоне");
  assert(state.zones.apartment.wave === 1, "волны квартиры не тронуты");
  assert(game.setZone("apartment"), "возврат в квартиру");
  assert(!state.hubUnlocked, "хаб закрыт до зачистки дома");
}

// ---------- авто-продажа по качеству + продать-всё-ниже ----------
{
  const state = P.defaultState();
  state.autoSell = 2; // порог: Необычный и ниже
  state.autoSellOn = true;
  const s0 = state.supplies;
  const grey = P.applyLoot(state, P.generateItem("boots", 1, "common", Math.random), 1);
  assert(grey.autoSold && state.bag.length === 0, "серое авто-продалось");
  assert(state.supplies > s0, "за серое упали припасы");
  const green = P.applyLoot(state, P.generateItem("boots", 1, "rare", Math.random), 1);
  assert(green.toBag && state.bag.length === 1, "редкое осталось в сумке");
  // одноразовая продажа по порогу (независимо от авто-переключателя)
  state.autoSellOn = false;
  P.applyLoot(state, P.generateItem("boots", 1, "common", Math.random), 1);
  assert(state.bag.length === 2, "с выкл. авто серое копится в сумке");
  const g = P.sellBelowRarity(state, 0); // всё Обычное и ниже
  assert(g > 0 && state.bag.length === 1, "«продать всё ниже» сработало разово");
  assert(state.bag[0].rarity === "rare", "редкое не тронуто");
}

// ---------- цепочка гейтов: Двор->Ветеран, Дом->Хаб, Район->Оружейник ----------
{
  const state = P.defaultState();
  state.autoFarm = true;
  state.equipment.weapon = { slot: "weapon", rarity: "mythic", tier: 1, name: "Тест", stats: { dps: 9000 }, affixes: [], lvl: 0 };
  state.equipment.armor = { slot: "armor", rarity: "legendary", tier: 1, name: "Тест", stats: { hp: 8000, armor: 800 }, affixes: [], lvl: 0 };
  for (const zid of ["entrance", "yard", "house", "district"]) state.zones[zid].unlocked = true;
  const game = P.createGame(state, {});
  const clearBoss = (zid) => {
    state.zones[zid].wave = P.ZONES[zid].wavesCap; // босс круга
    state.zones[zid].maxWave = state.zones[zid].wave;
    assert(game.setZone(zid), "переход в " + zid);
    let guard = 0;
    while (state.zones[zid].wave <= P.ZONES[zid].wavesCap && guard++ < 20000) game.update(0.05);
    assert(state.zones[zid].wave > P.ZONES[zid].wavesCap, zid + ": босс круга убит");
  };
  assert(!state.veteranUnlocked && !state.hubUnlocked && !state.upgradesUnlocked, "все гейты закрыты");
  clearBoss("yard");
  assert(state.veteranUnlocked, "зачистка Двора открыла Ветерана");
  clearBoss("house");
  assert(state.hubUnlocked, "зачистка Дома открыла Хаб");
  assert(P.buyZoneLevel(state, "apartment"), "квартиру можно улучшать");
  clearBoss("district");
  assert(state.upgradesUnlocked, "зачистка Района открыла Оружейника");
  state.tech = 100000; // мифическое тестовое оружие дорогое в прокачке
  assert(P.upgradeItem(state, "equip", "weapon"), "Оружейник: предметы улучшаются выше +5");
}

// ---------- v4.0: опыт за волны и «перекус» ----------
{
  const state = P.defaultState();
  const game = P.createGame(state, {});
  assert(state.exp === 0, "опыт стартует с нуля");
  // герой сильно перекачан — волны падают мгновенно
  state.equipment.weapon = { slot: "weapon", rarity: "mythic", tier: 1, name: "Тест", stats: { dps: 9000 }, affixes: [], lvl: 0 };
  state.equipment.armor = { slot: "armor", rarity: "legendary", tier: 1, name: "Тест", stats: { hp: 8000, armor: 800 }, affixes: [], lvl: 0 };
  let guard = 0;
  while (state.zones.apartment.wave < 6 && guard++ < 20000) game.update(0.05);
  assert(state.exp >= 5, "опыт начисляется за волны (волна 5 — элита +2)");
  // перекус
  state.supplies = 1000;
  const cost = P.snackCost(state);
  const dps0 = P.calcHero(state).dps;
  const hp0 = P.calcHero(state).hpMax;
  assert(P.buySnack(state), "перекус куплен");
  assert(state.supplies === 1000 - cost, "перекус списал припасы");
  assert(P.snackActive(state), "бафф активен");
  approx(P.calcHero(state).dps, dps0 * 1.10, 0.01, "перекус: +10% DPS");
  approx(P.calcHero(state).hpMax, Math.round(hp0 * 1.15), 1, "перекус: +15% HP");
  assert(!P.buySnack(state), "повторный перекус во время баффа нельзя");
  state.now = state.snackUntil + 1;
  assert(!P.snackActive(state), "бафф истёк");
}

// ---------- миграция: старый autoSell>0 = авто-продажа включена ----------
{
  const old = P.migrate({ version: 3, autoSell: 2, zones: { apartment: { unlocked: true, level: 1, wave: 1 } } });
  assert(old.autoSellOn === true, "старый autoSell>0 -> авто-продажа включена");
  const off = P.migrate({ version: 3, autoSell: 0, zones: { apartment: { unlocked: true, level: 1, wave: 1 } } });
  assert(off.autoSellOn === false, "autoSell=0 -> авто-продажа выключена");
}

// ---------- ресайл v3.1: цифры ÷5 ----------
{
  assert(P.waveSupplies(1) === Math.floor(3 * 1.28), "припасы с волны 1 — единицы");
  assert(P.waveSupplies(10) < 40, "на волне 10 припасы компактные");
  assert(P.zoneCost("apartment", 1) === Math.floor(5 * 1.6), "квартира: первый апгрейд ~8");
  assert(typeof P.trainCost !== "function", "v4.0: самоделки качаются за опыт, цены в припасах нет");
  // лут стал реже: за 100 бросков с обычной волны предметов заметно меньше половины
  let drops = 0;
  const st = P.defaultState();
  for (let i = 0; i < 200; i++) if (P.rollLoot(st, "norm", 1, false, Math.random)) drops++;
  assert(drops < 60, "шанс дропа с обычной волны сильно ниже (ресайл)");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
