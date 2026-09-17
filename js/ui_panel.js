/* «Последний подъезд» — UI: DOM-панель (HUD, зона, навыки, лут-попап, оффлайн-экран). */
(function (P) {
  "use strict";

  function fmt(n) {
    if (!isFinite(n)) return "∞";
    if (n < 0) return "-" + fmt(-n);
    if (n < 1000) return n % 1 === 0 ? String(n) : n.toFixed(1);
    const units = ["K", "M", "B", "T"];
    let u = -1;
    while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
    return n.toFixed(1).replace(/\.0$/, "") + units[u];
  }
  P.fmt = fmt;

  function rarityClass(r) { return "r-" + r; }
  function itemStatsText(item) {
    const s = item.stats, parts = [];
    if (s.dps) parts.push("+" + fmt(s.dps) + " DPS");
    if (s.hp) parts.push("+" + fmt(s.hp) + " HP");
    if (s.armor) parts.push("+" + fmt(s.armor) + " брони");
    if (s.crit) parts.push("+" + Math.round(s.crit * 100) + "% крит");
    return parts.join(", ");
  }
  P.itemStatsText = itemStatsText;

  P.initPanel = function (game, battleView) {
    const state = game.state;
    const $ = (id) => document.getElementById(id);
    const el = {
      supplies: $("supplies"), income: $("income"), tech: $("tech"),
      dps: $("dps"), hp: $("hp"), armor: $("armor"), crit: $("crit"),
      wave: $("wave"), winChance: $("winChance"),
      zoneLevel: $("zoneLevel"), zoneCost: $("zoneCost"), buyZone: $("buyZone"),
      skills: $("skills"),
      lootPopup: $("loot-popup"), lootBody: $("loot-body"), lootOk: $("loot-ok"),
      offline: $("offline-screen"), offlineBody: $("offline-body"), offlineOk: $("offline-ok"),
      savedHint: $("saved-hint"),
    };

    // кнопка улучшения квартиры
    el.buyZone.addEventListener("click", () => {
      if (P.buyZoneLevel(state, "apartment")) {
        battleView.addFloater(240, 120, "Квартира улучшена!", "#5ee87d");
        refresh();
      }
    });

    // кнопки навыков
    const skillBtns = {};
    for (const id of Object.keys(P.SKILLS)) {
      const btn = document.createElement("button");
      btn.className = "skill";
      const def = P.SKILLS[id];
      btn.title = def.name + " — " + def.desc;
      btn.innerHTML = "<span class='s-name'>" + def.name + "</span><span class='s-cd'></span>";
      btn.addEventListener("click", () => {
        if (game.useSkill(id)) refresh();
      });
      el.skills.appendChild(btn);
      skillBtns[id] = btn;
    }

    function refresh() {
      const hero = P.calcHero(state);
      const zone = state.zones.apartment;
      el.supplies.textContent = fmt(Math.floor(state.supplies));
      el.income.textContent = fmt(P.totalIncome(state)) + "/сек";
      el.tech.textContent = fmt(state.tech);
      el.dps.textContent = fmt(Math.round(hero.dps * 10) / 10);
      el.hp.textContent = fmt(Math.ceil(state.hero.hp)) + "/" + fmt(hero.hpMax);
      el.armor.textContent = Math.round(hero.armor) + " (" + Math.round(hero.dr * 100) + "%)";
      el.crit.textContent = Math.round(hero.crit * 100) + "% крит";

      const waveNum = Math.min(zone.wave, P.ZONES.apartment.wavesCap);
      el.wave.textContent = waveNum + " / " + P.ZONES.apartment.wavesCap;
      if (game.combat.phase === "fight" && game.combat.enemy) {
        const chance = P.winChancePct(hero, game.combat.enemy, state.hero.hp);
        el.winChance.textContent = chance + "%";
        el.winChance.style.color = chance >= 80 ? "#5ee87d" : chance >= 40 ? "#ffe87d" : "#e85e5e";
      } else {
        el.winChance.textContent = "—";
        el.winChance.style.color = "#888";
      }

      el.zoneLevel.textContent = zone.level;
      const cost = P.zoneCost("apartment", zone.level);
      el.zoneCost.textContent = fmt(cost);
      el.buyZone.disabled = state.supplies < cost;

      // навыки: кулдауны и блокировка ульты
      for (const id of Object.keys(P.SKILLS)) {
        const def = P.SKILLS[id];
        const btn = skillBtns[id];
        const cdLeft = Math.max(0, state.skills[id].readyAt - state.now);
        const locked = def.unlockWave && zone.wave < def.unlockWave;
        btn.classList.toggle("locked", !!locked);
        btn.classList.toggle("active", game.activeSkills.some((s) => s.id === id));
        const cdEl = btn.querySelector(".s-cd");
        if (locked) cdEl.textContent = "волна " + def.unlockWave;
        else if (cdLeft > 0) cdEl.textContent = Math.ceil(cdLeft) + "с";
        else cdEl.textContent = "готов";
        btn.disabled = locked || cdLeft > 0;
      }
    }

    // лут-попап (по одному из очереди)
    function showLoot() {
      if (el.lootPopup.classList.contains("visible") || game.lootQueue.length === 0) return;
      const loot = game.lootQueue.shift();
      const it = loot.item;
      let html = "";
      if (loot.equipped) {
        html += "<p class='loot-title'>Новый предмет надет!</p>";
        html += "<div class='loot-item " + rarityClass(it.rarity) + "'><b>" + it.name + "</b><br>" + itemStatsText(it) + "</div>";
        if (loot.replaced) {
          html += "<p class='loot-vs'>заменил: " + loot.replaced.name + " (" + itemStatsText(loot.replaced) + ")</p>";
        }
      } else {
        html += "<p class='loot-title'>Предмет продан</p>";
        html += "<div class='loot-item " + rarityClass(it.rarity) + "'><b>" + it.name + "</b><br>" + itemStatsText(it) + "</div>";
        html += "<p class='loot-vs'>хуже текущего → +" + loot.soldFor + " припасов</p>";
      }
      el.lootBody.innerHTML = html;
      el.lootPopup.classList.add("visible");
    }
    el.lootOk.addEventListener("click", () => {
      el.lootPopup.classList.remove("visible");
      showLoot();
    });

    // оффлайн-экран
    function showOffline(report) {
      if (!report || report.elapsedSec <= 5 || report.wavesTo === report.wavesFrom && report.supplies < 1) return;
      const hours = Math.floor(report.elapsedSec / 3600);
      const mins = Math.round((report.elapsedSec % 3600) / 60);
      const dur = hours > 0 ? hours + " ч " + mins + " мин" : mins + " мин";
      let html = "<p class='loot-title'>Вы отсутствовали " + dur + (report.capped ? " (лимит 12 ч)" : "") + "</p><ul>";
      html += "<li>Припасов добыто: <b>+" + fmt(Math.floor(report.supplies)) + "</b></li>";
      html += "<li>Технологий: <b>+" + fmt(report.tech) + "</b></li>";
      html += "<li>Волн пройдено: <b>" + (report.wavesFrom) + " → " + report.wavesTo + "</b></li>";
      if (report.items.length) {
        html += "<li>Предметов найдено: <b>" + report.items.length + "</b></li>";
      }
      html += "</ul><p class='loot-vs'>Следующее действие: улучшите квартиру и жмите дальше.</p>";
      el.offlineBody.innerHTML = html;
      el.offline.classList.add("visible");
    }
    el.offlineOk.addEventListener("click", () => el.offline.classList.remove("visible"));

    return {
      refresh,
      showLoot,
      showOffline,
      flashSaved() {
        el.savedHint.classList.add("visible");
        setTimeout(() => el.savedHint.classList.remove("visible"), 1200);
      },
      tick() {
        refresh();
        showLoot();
      },
    };
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
