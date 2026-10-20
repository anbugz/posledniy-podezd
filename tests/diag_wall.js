/* Диагностика стены в no_upgrades_sim: прогон одного сида с дампом
   состояния героя/врага на «застрявшей» волне. Запуск: SEED=5 node tests/diag_wall.js */
"use strict";
global.PODEZD = {};
const P = global.PODEZD;
let _s = (parseInt(process.env.SEED, 10) || 5) >>> 0;
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
require("../js/engine_prestige.js");
require("../js/engine_save.js");
require("../js/engine_game.js");

const state = P.defaultState();
state.autoFarm = true;
const game = P.createGame(state, {});
const steps = Math.floor(4 * 3600 / 0.05);
let lastWave = 1, stuckSince = null;
for (let i = 0; i < steps; i++) {
  game.update(0.05);
  game.lootQueue.length = 0;
  if (i % 20 === 0) P.equipBest(state);
  if (game.combat.phase === "fight" && game.combat.enemy &&
      (game.combat.enemy.kind === "boss" || game.combat.enemy.kind === "elite")) {
    game.useSkill("rain"); game.useSkill("mark"); game.useSkill("ult");
  }
  const w = state.zones.apartment.wave;
  if (w !== lastWave) { lastWave = w; stuckSince = null; }
  else if (stuckSince === null && state.now > 60) stuckSince = state.now;
}
const h = P.calcHero(state);
const w = state.zones.apartment.wave;
const enemy = P.enemyStats(w, 1, 20);
console.log(`seed=${process.env.SEED || 5} финал: волна ${w}, время ${(state.now / 60).toFixed(0)}мин`);
console.log(`герой: dpsEff=${h.dpsEff.toFixed(1)} dps=${h.dps.toFixed(1)} hp=${h.hpMax} armor=${h.armor.toFixed(1)} dr=${(h.dr * 100).toFixed(0)}% crit=${(h.crit * 100).toFixed(0)}% regen=${(h.regenCombat * 100).toFixed(1)}%/с double=${(h.doubleHit * 100).toFixed(0)}%`);
console.log(`враг волны ${w}: kind=${enemy.kind} hp=${enemy.hp} dps=${enemy.dps.toFixed(1)}`);
console.log("экипировка:");
for (const slot of P.SLOTS) {
  const it = state.equipment[slot];
  console.log(`  ${slot}: ${it ? `${it.name} (${it.rarity}) dps=${it.stats.dps || 0} hp=${it.stats.hp || 0} armor=${it.stats.armor || 0} crit=${it.stats.crit || 0} lvl=${it.lvl}` : "—"}`);
}
console.log(`припасы=${Math.floor(state.supplies)} tech=${state.tech} exp=${state.exp} pity=${state.pityWeapon} сумка=${state.bag.length} смертей=${state.stats.deaths}`);
