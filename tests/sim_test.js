/* «Последний подъезд» — node-тесты движка (без браузера).
   Запуск: node tests/sim_test.js */
"use strict";

global.PODEZD = {};
const P = global.PODEZD;

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

// ---------- stats ----------
{
  const state = P.defaultState();
  const hero = P.calcHero(state);
  // старт: нож dps6 + кулаки 2 = 8; HP = 100+20+10+10=140; броня 5
  approx(hero.dps, 8, 0.01, "стартовый DPS");
  approx(hero.hpMax, 140, 0.01, "стартовый HP");
  approx(hero.dr, 5 / 55, 0.001, "DR при 5 броне");
}

// ---------- waves ----------
{
  const e1 = P.enemyStats(1, 1);
  assert(e1.hp > 0 && e1.dps > 0, "враг волны 1 существует");
  const e10 = P.enemyStats(10, 1);
  assert(e10.kind === "boss", "волна 10 — босс");
  const e5 = P.enemyStats(5, 1);
  assert(e5.kind === "elite", "волна 5 — элита");
  assert(e10.hp > e5.hp, "босс крепче элиты");
}

// ---------- waveCheck: стартовый герой проходит волну 1 ----------
{
  const state = P.defaultState();
  const hero = P.calcHero(state);
  const e1 = P.enemyStats(1, 1);
  const check = P.waveCheck(hero, e1, hero.hpMax);
  assert(check.win, "стартовый герой проходит волну 1");
  const e20 = P.enemyStats(20, 1);
  const check20 = P.waveCheck(hero, e20, hero.hpMax);
  assert(!check20.win, "стартовый герой НЕ проходит волну 20 (босса)");
}

// ---------- combat: бой реально заканчивается победой ----------
{
  const state = P.defaultState();
  const events = [];
  const combat = P.createCombat(state, "apartment", (ev) => events.push(ev.type));
  // гоним тиками по 0.05с до первой победы (макс 120 сек игрового времени)
  for (let t = 0; t < 2400; t++) {
    combat.update(0.05, 1);
    if (events.includes("waveWin")) break;
  }
  assert(events.includes("waveStart"), "бой начался");
  assert(events.includes("waveWin"), "волна 1 выиграна в реальном времени");
  assert(state.zones.apartment.wave === 2, "счётчик волн увеличился");
  assert(state.supplies >= 0, "припасы не ушли в минус");
}

// ---------- loot ----------
{
  const state = P.defaultState();
  let sawEquip = false, sawSell = false;
  for (let i = 0; i < 300; i++) {
    const item = P.generateItem("weapon", 1, i % 2 ? "common" : "rare", Math.random);
    assert(item.stats.dps > 0, "оружие даёт DPS");
    const res = P.applyLoot(state, item, 1);
    if (res.equipped) sawEquip = true; else sawSell = true;
  }
  assert(sawEquip && sawSell, "лут надевается и продаётся");
  assert(state.stats.itemsFound === 300, "статистика предметов ведётся");
  const supBefore = state.supplies;
  for (let i = 0; i < 50; i++) P.rollLoot(state, "norm", 1, false, Math.random);
  assert(state.supplies >= supBefore, "припасы не уменьшаются от лута");
}

// ---------- econ ----------
{
  const state = P.defaultState();
  state.supplies = 1000;
  const inc1 = P.totalIncome(state);
  assert(P.buyZoneLevel(state, "apartment"), "покупка уровня квартиры");
  const inc2 = P.totalIncome(state);
  assert(inc2 > inc1, "доход вырос после покупки");
  const hero = P.calcHero(state);
  assert(hero.hpMax > 140, "HP вырос с уровнем квартиры");
  assert(!P.buyZoneLevel({ supplies: 0, zones: state.zones }, "apartment"), "нельзя купить без припасов");
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

// ---------- save/load + offline ----------
{
  const state = P.defaultState();
  state.supplies = 500;
  P.save(state);
  const loaded = P.load();
  assert(loaded.state.supplies >= 500, "сейв загружается (без оффлайн-дохода)");

  // оффлайн 1 час: волны должны пройти, пока build справляется
  const s2 = P.defaultState();
  s2.supplies = 0;
  const report = P.applyOffline(s2, 3600);
  assert(report.wavesTo > report.wavesFrom, "оффлайн проходит волны");
  assert(s2.supplies > 0, "оффлайн копит припасы");
  assert(s2.hero.hp > 0, "герой жив после оффлайна");

  // оффлайн с сильным билдом: проходим элиту/босса -> технологии гарантированы
  const s3 = P.defaultState();
  s3.zones.apartment.level = 12;
  s3.equipment.weapon = { slot: "weapon", rarity: "epic", tier: 1, name: "Тест", stats: { dps: 120 } };
  const report3 = P.applyOffline(s3, 3600);
  assert(report3.wavesTo >= 10, "сильный билд проходит волну до босса оффлайн");
  assert(s3.tech > 0, "оффлайн копит технологии (элита/босс)");
}

// ---------- game.update интеграционно ----------
{
  const state = P.defaultState();
  const game = P.createGame(state, {});
  let wins = 0;
  const combat2 = P.createCombat(state, "apartment", (ev) => {
    if (ev.type === "waveWin") wins++;
  });
  game.combat = combat2;
  for (let i = 0; i < 20 * 60 / 0.05; i++) game.update(0.05);
  assert(state.now > 100, "игровое время идёт");
  assert(state.supplies > 0, "доход капает");
  assert(wins >= 1, "за 20 минут выиграно несколько волн");
  assert(state.dayNight.phase === "day" || state.dayNight.phase === "night", "день/ночь работает");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
