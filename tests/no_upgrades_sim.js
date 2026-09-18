/* Калибровка гейтинга v3.2: подбор LOOT_WAVE_GROW / рост DPS врагов.
   Цель: Квартира (волна 20) зачистится за ~1–3 часа активного фарма БЕЗ прокачек.
   Запуск: LOOT_G=1.05 DPS_G=1.13 DPS_B=2.4 node tests/no_upgrades_sim.js */
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

if (process.env.LOOT_G) P.CONFIG.LOOT_WAVE_GROW = parseFloat(process.env.LOOT_G);
if (process.env.DPS_G) P.ENEMY.dpsGrow = parseFloat(process.env.DPS_G);
if (process.env.DPS_B) P.ENEMY.dpsBase = parseFloat(process.env.DPS_B);
if (process.env.ELITE_DPS) P.ENEMY.eliteDps = parseFloat(process.env.ELITE_DPS);
if (process.env.BOSS_DPS) P.ENEMY.bossDps = parseFloat(process.env.BOSS_DPS);

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
console.log(
  `loot=${P.CONFIG.LOOT_WAVE_GROW} dpsB=${P.ENEMY.dpsBase} dpsG=${P.ENEMY.dpsGrow} ` +
  `elite=${P.ENEMY.eliteDps} boss=${P.ENEMY.bossDps} | ` +
  `clear20=${clearMin === null ? "НЕТ" : clearMin.toFixed(0) + "мин"} ` +
  `финал волна=${state.zones.apartment.wave}@${wallMin.toFixed(0)}мин ` +
  `dps=${h.dpsEff.toFixed(0)} hp=${h.hpMax}`
);
