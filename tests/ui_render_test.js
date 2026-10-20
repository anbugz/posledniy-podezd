/* «Последний подъезд» — рендер-тесты боевого UI без браузера (v4.6).
   Мокаем canvas/Image и проверяем ГЕОМЕТРИЮ отрисовки: земля по зонам,
   обрезка пустоты спрайтов, оружие в руках, ночной тинт, виньетка HP.
   Запуск: node tests/ui_render_test.js */
"use strict";

global.PODEZD = {};
const P = global.PODEZD;

// --- мок Image: все «арты» мгновенно готовы, 256×256 ---
const IMG_REGISTRY = [];
global.Image = class {
  constructor() {
    this.complete = true;
    this.naturalWidth = 256;
    this.naturalHeight = 256;
    IMG_REGISTRY.push(this);
  }
  set src(v) { this._src = v; }
  get src() { return this._src; }
};

// --- мок ctx: записываем вызовы ---
function makeCtx() {
  const calls = { drawImage: [], fillRect: [], fillText: [], gradients: [], rotate: [] };
  const ctx = {
    calls,
    drawImage(...a) { calls.drawImage.push(a); },
    fillRect(...a) { calls.fillRect.push({ args: a, style: ctx.fillStyle, alpha: ctx.globalAlpha }); },
    strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    arc() {}, ellipse() {}, fill() {}, save() {}, restore() {},
    translate() {}, rotate(...a) { calls.rotate.push(a[0]); }, scale() {},
    createRadialGradient(...a) {
      const g = { stops: [], addColorStop(o, c) { g.stops.push([o, c]); } };
      calls.gradients.push(g);
      return g;
    },
    fillText(...a) { calls.fillText.push(a); },
    measureText() { return { width: 20 }; },
    filter: "none", globalAlpha: 1, fillStyle: "", strokeStyle: "",
    font: "", textAlign: "", lineWidth: 1, imageSmoothingEnabled: true,
  };
  return ctx;
}

require("../js/ns.js");
require("../js/data_zones.js");
require("../js/data_enemies.js");
require("../js/data_items.js");
require("../js/data_skills.js");
require("../js/engine_stats.js");
require("../js/engine_combat.js");
require("../js/engine_loot.js");
require("../js/engine_econ.js");
require("../js/engine_paths.js");
require("../js/engine_prestige.js");
require("../js/engine_save.js");
require("../js/engine_game.js");
require("../js/ui_battle.js");

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else { failed++; console.error("FAIL:", msg); }
}

const state = P.defaultState();
for (const z of Object.keys(state.zones)) {
  state.zones[z].unlocked = true;
  state.zones[z].wave = 15;
  state.zones[z].maxWave = 15;
}
const game = P.createGame(state, {});
const ctx = makeCtx();
const view = P.initBattleView(game, { getContext: () => ctx });

// бой в Районе: враг должен быть на сцене
game.setZone("district");
let n = 0;
while (game.combat.phase !== "fight" && n++ < 400) game.update(0.05);
assert(game.combat.phase === "fight", "бой в Районе идёт");

const GROUND = { apartment: 226, entrance: 228, yard: 234, house: 234, district: 246 };

function heroDraw() {
  return ctx.calls.drawImage.find((a) => String(a[0]._src).includes("sprites/hero"));
}
function enemyDraw() {
  return ctx.calls.drawImage.find((a) => /grunt|boss|drone|brute/.test(String(a[0]._src)));
}
function weaponDraw() {
  return ctx.calls.drawImage.find((a) => /icons\/icon_(knife|bat|gun|rifle)/.test(String(a[0]._src)));
}

// --- земля по зонам: низ спрайта героя на линии земли зоны ---
// (свежая игра на каждую зону: setZone не работает посреди боя)
for (const zid of Object.keys(GROUND)) {
  const st2 = P.defaultState();
  for (const z of Object.keys(st2.zones)) st2.zones[z].unlocked = true;
  const g2 = P.createGame(st2, {});
  const ctx2 = makeCtx();
  const v2 = P.initBattleView(g2, { getContext: () => ctx2 });
  g2.setZone(zid);
  let m = 0;
  while (g2.combat.phase !== "fight" && m++ < 400) g2.update(0.05);
  ctx2.calls.drawImage.length = 0;
  v2.render(100);
  const hd = ctx2.calls.drawImage.find((a) => String(a[0]._src).includes("sprites/hero"));
  assert(!!hd, "герой рисуется спрайтом (" + zid + ")");
  const bottom = hd[2] + hd[4]; // dy + dh
  assert(Math.abs(bottom - GROUND[zid]) <= 2,
    "земля " + zid + ": низ героя ≈ " + GROUND[zid] + " (got " + bottom.toFixed(1) + ")");
}

// --- оружие в руках: надетая винтовка рисуется у героя ---
game.setZone("district");
state.equipment.weapon = P.generateItem("weapon", 4, "epic", Math.random, 3);
state.equipment.weapon.family = "rifle";
ctx.calls.drawImage.length = 0;
view.render(100);
const wd = weaponDraw();
assert(!!wd, "надетое оружие (винтовка) рисуется в руках");
assert(wd && String(wd[0]._src).includes("icon_rifle"), "иконка соответствует семейству rifle");
// меняем на нож — иконка меняется
state.equipment.weapon = P.generateItem("weapon", 1, "common", () => 0.01, 1);
state.equipment.weapon.family = "knife";
ctx.calls.drawImage.length = 0;
view.render(100);
const wd2 = weaponDraw();
assert(wd2 && String(wd2[0]._src).includes("icon_knife"), "смена оружия меняет иконку в руках");

// --- летающий враг Района: низ спрайта НАД землёй ---
state.equipment.weapon.family = "rifle";
game.setZone("district");
let q = 0;
while (game.combat.phase !== "fight" && q++ < 400) game.update(0.05);
if (game.combat.enemy) {
  ctx.calls.drawImage.length = 0;
  view.render(100);
  const ed = enemyDraw();
  assert(!!ed, "враг Района рисуется");
  if (ed && String(ed[0]._src).includes("district_grunt")) {
    const eBottom = ed[2] + ed[4];
    assert(eBottom < GROUND.district - 8,
      "летающий грунт Района парит над землёй (низ " + eBottom.toFixed(1) + " < " + (GROUND.district - 8) + ")");
  }
}

// --- ночной тинт поверх арт-фона ---
state.dayNight.phase = "night";
ctx.calls.fillRect.length = 0;
view.render(100);
const tint = ctx.calls.fillRect.find((r) => String(r.style).includes("8,12,38"));
assert(!!tint, "ночью арт-фон затемняется");
state.dayNight.phase = "day";
ctx.calls.fillRect.length = 0;
view.render(100);
const tintDay = ctx.calls.fillRect.find((r) => String(r.style).includes("8,12,38"));
assert(!tintDay, "днём тинта нет");

// --- виньетка низкого HP ---
const heroMax = P.calcHero(state).hpMax;
state.hero.hp = heroMax * 0.2;
ctx.calls.gradients.length = 0;
view.render(100);
const vig = ctx.calls.gradients.find((g) => g.stops.some((s) => String(s[1]).includes("232,94,94")));
assert(!!vig, "при HP < 30% — красная виньетка");
state.hero.hp = heroMax;
ctx.calls.gradients.length = 0;
view.render(100);
const vig2 = ctx.calls.gradients.find((g) => g.stops.some((s) => String(s[1]).includes("232,94,94")));
assert(!vig2, "при полном HP виньетки нет");

// --- выстрел: вспышка/трассер/гильза от heroHit ---
const before = ctx.calls.fillRect.length;
view.heroHit({ dmg: 10, crit: false });
assert(true, "heroHit от винтовки не падает");

// ===================== v4.7 «Кинематограф» =====================

// --- падение героя: фаза knockout → герой заваливается (rotate < 0) ---
game.combat.phase = "knockout";
ctx.calls.rotate.length = 0;
view.render(200);
view.render(201);
assert(ctx.calls.rotate.some((a) => a < -0.1), "knockout: герой падает (rotate отрицательный)");
// воскрешение: выходим из knockout — герой ещё поднимается
game.combat.phase = "gap";
ctx.calls.rotate.length = 0;
view.render(202);
view.render(203);
assert(ctx.calls.rotate.some((a) => a < -0.1), "воскрешение: герой поднимается с земли");

// --- крит: флоутер «КРИТ!» + дым из ствола ---
state.equipment.weapon = P.generateItem("weapon", 4, "epic", Math.random, 3);
state.equipment.weapon.family = "rifle";
ctx.calls.fillText.length = 0;
ctx.calls.fillRect.length = 0;
view.heroHit({ dmg: 10, crit: true });
view.render(210);
assert(ctx.calls.fillText.some((a) => a[0] === "КРИТ!"), "крит: флоутер «КРИТ!»");
assert(ctx.calls.fillRect.some((r) => r.style === "#9aa2b0"), "выстрел: дым из ствола");

// --- босс-интро: объявление + (при смерти) белая вспышка ---
ctx.calls.fillText.length = 0;
view.waveStart({ enemy: { kind: "boss", name: "Тестобосс" } });
view.render(220);
assert(ctx.calls.fillText.some((a) => String(a[0]).includes("☠ БОСС: Тестобосс")), "босс-интро: объявление имени");
ctx.calls.fillRect.length = 0;
view.waveWin({ enemy: { kind: "boss" }, zoneId: "district" });
view.render(221);
assert(ctx.calls.fillRect.some((r) => r.style === "#ffffff" && r.args[2] > 300), "смерть босса: белая вспышка на экран");

// --- амбиент Района: пепел в воздухе ---
ctx.calls.fillRect.length = 0;
for (let t = 300; t < 330; t++) view.render(t);
assert(ctx.calls.fillRect.some((r) => r.style === "#aab4c8"), "амбиент Района: частицы пепла рисуются");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
