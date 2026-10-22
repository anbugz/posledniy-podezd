/* Калибровка гейтинга v3.2: подбор LOOT_WAVE_GROW / рост DPS врагов.
   Цель: Квартира (волна 20) зачистится за ~1–3 часа активного фарма БЕЗ прокачек.
   Запуск: LOOT_G=1.05 DPS_G=1.13 DPS_B=2.4 node tests/no_upgrades_sim.js
   v4.4: seeded RNG (mulberry32) — прогон детерминирован; SEED=N для другого сида,
   например серия: for s in 1 2 3 4 5; do SEED=$s node tests/no_upgrades_sim.js; done */
"use strict";
global.PODEZD = {};
const P = global.PODEZD;

// --- seeded RNG: подменяем Math.random ДО загрузки движка ---
const SEED = (parseInt(process.env.SEED, 10) || 42) >>> 0;
let _s = SEED;
Math.random = function () {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
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
require("../js/engine_achievements.js");
require("../js/engine_prestige.js");
require("../js/engine_save.js");
require("../js/engine_game.js");

if (process.env.LOOT_G) P.CONFIG.LOOT_WAVE_GROW = parseFloat(process.env.LOOT_G);
if (process.env.DPS_G) P.ENEMY.dpsGrow = parseFloat(process.env.DPS_G);
if (process.env.DPS_B) P.ENEMY.dpsBase = parseFloat(process.env.DPS_B);
if (process.env.ELITE_DPS) P.ENEMY.eliteDps = parseFloat(process.env.ELITE_DPS);
if (process.env.BOSS_DPS) P.ENEMY.bossDps = parseFloat(process.env.BOSS_DPS);
if (process.env.HP_G) P.ENEMY.hpGrow = parseFloat(process.env.HP_G);
if (process.env.BOSS_HP) P.ENEMY.bossHp = parseFloat(process.env.BOSS_HP);
if (process.env.ELITE_HP) P.ENEMY.eliteHp = parseFloat(process.env.ELITE_HP);

/* Один прогон: 4 игровых часа авто-фарма без прокачек. seed — перезапуск RNG. */
function runSim(seed) {
  _s = seed >>> 0;
  const state = P.defaultState();
  state.autoFarm = true;
  const game = P.createGame(state, {});
  const steps = Math.floor(4 * 3600 / 0.05);
  let clearMin = null;
  let wallWave = 0, wallMin = 0;
  for (let i = 0; i < steps; i++) {
    game.update(0.05);
    game.lootQueue.length = 0;
    if (i % 20 === 0) P.equipBest(state);
    if (game.combat.phase === "fight" && game.combat.enemy &&
        (game.combat.enemy.kind === "boss" || game.combat.enemy.kind === "elite")) {
      game.useSkill("rain"); game.useSkill("mark"); game.useSkill("ult");
    }
    const w = state.zones.apartment.wave;
    if (clearMin === null && w > 20) clearMin = state.now / 60;
    if (w !== wallWave) { wallWave = w; wallMin = state.now / 60; }
  }
  const h = P.calcHero(state);
  return {
    clearMin, wave: state.zones.apartment.wave, wallMin,
    dps: h.dpsEff, hp: h.hpMax,
  };
}

const paramsStr =
  `loot=${P.CONFIG.LOOT_WAVE_GROW} dpsB=${P.ENEMY.dpsBase} dpsG=${P.ENEMY.dpsGrow} ` +
  `elite=${P.ENEMY.eliteDps} boss=${P.ENEMY.bossDps}`;

if (process.env.SEEDS) {
  // серия сидов 1..N: распределение clear20 для стабильной калибровки
  const n = Math.max(2, parseInt(process.env.SEEDS, 10) || 10);
  const res = [];
  for (let s = 1; s <= n; s++) res.push(runSim(s));
  const clears = res.map((r) => (r.clearMin === null ? Infinity : r.clearMin)).sort((a, b) => a - b);
  const waves = res.map((r) => r.wave).sort((a, b) => a - b);
  const pct = (arr, p, f) => {
    const v = arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
    return v === Infinity ? "НЕТ" : f(v);
  };
  console.log(`seeds=1..${n} ${paramsStr}`);
  console.log(
    `clear20: min ${pct(clears, 0, (v) => v.toFixed(0) + "мин")} / ` +
    `p50 ${pct(clears, 0.5, (v) => v.toFixed(0) + "мин")} / ` +
    `p90 ${pct(clears, 0.9, (v) => v.toFixed(0) + "мин")} / ` +
    `max ${pct(clears, 1, (v) => v.toFixed(0) + "мин")}`
  );
  console.log(
    `волна за 4ч: min ${pct(waves, 0, (v) => v)} / p50 ${pct(waves, 0.5, (v) => v)} / max ${pct(waves, 1, (v) => v)}`
  );
} else {
  const r = runSim(SEED);
  console.log(
    `seed=${SEED} ${paramsStr} | ` +
    `clear20=${r.clearMin === null ? "НЕТ" : r.clearMin.toFixed(0) + "мин"} ` +
    `финал волна=${r.wave}@${r.wallMin.toFixed(0)}мин ` +
    `dps=${r.dps.toFixed(0)} hp=${r.hp}`
  );
}
