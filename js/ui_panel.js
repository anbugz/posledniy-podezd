/* «Последний подъезд» — UI: DOM-панель (HUD, зона, навыки, «Самоделки»,
   сумка, лут-попап, оффлайн-экран). Правки v2. */
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

  function affixText(item) {
    if (!item.affixes || !item.affixes.length) return "";
    return item.affixes
      .map((id) => {
        const a = P.AFFIXES.find((x) => x.id === id);
        return a ? "◆ " + a.name : "";
      })
      .filter(Boolean)
      .join("<br>");
  }
  P.affixText = affixText;

  P.initPanel = function (game, battleView) {
    const state = game.state;
    const $ = (id) => document.getElementById(id);
    const el = {
      supplies: $("supplies"), income: $("income"), tech: $("tech"),
      dps: $("dps"), hp: $("hp"), armor: $("armor"), crit: $("crit"),
      wave: $("wave"), maxWave: $("maxWave"), winChance: $("winChance"),
      wavePrev: $("wavePrev"), waveNext: $("waveNext"), autoFarm: $("autoFarm"),
      zoneLevel: $("zoneLevel"), zoneCost: $("zoneCost"), buyZone: $("buyZone"),
      skills: $("skills"),
      trainCap: $("trainCap"), trainingGrid: $("training-grid"),
      bagCount: $("bagCount"), bagGrid: $("bag-grid"), equipRow: $("equip-row"),
      equipBest: $("equipBest"), sellCommon: $("sellCommon"),
      lootPopup: $("loot-popup"), lootBody: $("loot-body"), lootOk: $("loot-ok"),
      offline: $("offline-screen"), offlineBody: $("offline-body"), offlineOk: $("offline-ok"),
      savedHint: $("saved-hint"),
    };

    // кнопка улучшения квартиры
    el.buyZone.addEventListener("click", () => {
      if (P.buyZoneLevel(state, "apartment")) {
        battleView.addFloater(240, 120, "Квартира улучшена!", "#5ee87d");
        forceHeavy = true;
        refresh();
      }
    });

    // переключение волн ◀ ▶ (вне боя, в пределах [1, maxWave])
    el.wavePrev.addEventListener("click", () => {
      if (game.setWave(state.zones.apartment.wave - 1)) refresh();
    });
    el.waveNext.addEventListener("click", () => {
      if (game.setWave(state.zones.apartment.wave + 1)) refresh();
    });
    // авто-фарм: сам отступает при поражении и ползёт выше, пока побеждает
    el.autoFarm.addEventListener("click", () => {
      state.autoFarm = !state.autoFarm;
      refresh();
    });

    // кнопки сумки
    el.equipBest.addEventListener("click", () => {
      const n = P.equipBest(state);
      if (n > 0) battleView.addFloater(240, 120, "Надето лучшее: " + n, "#5ee87d");
      forceHeavy = true;
      refresh();
    });
    el.sellCommon.addEventListener("click", () => {
      const g = P.sellAllCommon(state);
      if (g > 0) battleView.addFloater(240, 120, "+" + g + " припасов", "#e8b45e");
      forceHeavy = true;
      refresh();
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

    // «Самоделки»: карточки создаём один раз, обновляем в refresh
    const trainBtns = {};
    for (const key of Object.keys(P.TRAINING)) {
      const def = P.TRAINING[key];
      const card = document.createElement("div");
      card.className = "train-card";
      card.innerHTML =
        "<span class='t-name'>" + def.name + "</span>" +
        "<span class='t-desc'>" + def.desc + "</span>" +
        "<span class='t-flavor'>" + def.flavor + "</span>" +
        "<span class='t-lvl'></span>";
      const btn = document.createElement("button");
      btn.addEventListener("click", () => {
        if (P.buyTraining(state, key)) {
          forceHeavy = true;
          refresh();
        }
      });
      card.appendChild(btn);
      el.trainingGrid.appendChild(card);
      trainBtns[key] = { btn, lvl: card.querySelector(".t-lvl") };
    }

    /* Карточка предмета (сумка или экипировка). */
    function itemCard(item, where, key) {
      const card = document.createElement("div");
      card.className = "item-card " + rarityClass(item.rarity);
      let html = "<span class='i-name'>" + item.name + "</span>";
      if (item.lvl) html += "<span class='i-lvl'>усилен +" + item.lvl + "</span>";
      html += "<span class='i-stats'>" + itemStatsText(item) + "</span>";
      const af = affixText(item);
      if (af) html += "<span class='i-affix'>" + af + "</span>";
      card.innerHTML = html;
      const btns = document.createElement("div");
      btns.className = "i-btns";

      if (where === "bag") {
        const bWear = document.createElement("button");
        bWear.textContent = "Надеть";
        bWear.title = "Сравнение с надетым: " +
          (state.equipment[item.slot] ? itemStatsText(state.equipment[item.slot]) : "слот пуст");
        bWear.addEventListener("click", () => {
          if (P.equipItem(state, key)) { forceHeavy = true; refresh(); }
        });
        const bSell = document.createElement("button");
        bSell.className = "b-sell";
        bSell.textContent = "Продать";
        bSell.addEventListener("click", () => {
          const g = P.sellItem(state, key);
          if (g > 0) battleView.addFloater(240, 120, "+" + g + " припасов", "#e8b45e");
          forceHeavy = true;
          refresh();
        });
        btns.appendChild(bWear);
        btns.appendChild(bSell);
      } else {
        const bUpg = document.createElement("button");
        bUpg.className = "b-upg";
        bUpg.addEventListener("click", () => {
          if (P.upgradeItem(state, "equip", key)) { forceHeavy = true; refresh(); }
        });
        btns.appendChild(bUpg);
        card._upgBtn = bUpg;
      }
      card.appendChild(btns);
      return card;
    }

    /* Тяжёлый рендер: сумка + экипировка + «Самоделки». Не чаще 4 раз/сек. */
    let lastHeavy = 0;
    let forceHeavy = true;
    function renderHeavy() {
      // Самоделки
      const cap = P.trainCap(state);
      el.trainCap.textContent = "потолок параметра: " + cap + " (2× уровень квартиры)";
      for (const key of Object.keys(P.TRAINING)) {
        const t = state.training[key];
        const cost = P.trainCost(t);
        const full = t >= cap;
        trainBtns[key].lvl.textContent = "ур. " + t + (full ? " (макс)" : "");
        trainBtns[key].btn.textContent = full ? "потолок" : "Качать — " + fmt(cost);
        trainBtns[key].btn.disabled = full || state.supplies < cost;
      }
      // Экипировка
      el.equipRow.innerHTML = "";
      for (const slot of P.SLOTS) {
        const it = state.equipment[slot];
        if (!it) {
          const empty = document.createElement("div");
          empty.className = "item-card empty";
          empty.textContent = P.SLOT_INFO[slot].name + " — пусто";
          el.equipRow.appendChild(empty);
          continue;
        }
        const card = itemCard(it, "equip", slot);
        card._upgBtn.textContent = "Улучшить — " + fmt(P.itemUpgradeCost(it));
        card._upgBtn.disabled = state.supplies < P.itemUpgradeCost(it);
        el.equipRow.appendChild(card);
      }
      // Сумка
      el.bagCount.textContent = state.bag.length + " / " + P.bagSize(state);
      el.bagGrid.innerHTML = "";
      if (!state.bag.length) {
        const empty = document.createElement("div");
        empty.className = "item-card empty";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "Сумка пуста — лут падает с волн.";
        el.bagGrid.appendChild(empty);
      }
      state.bag.forEach((it, i) => {
        el.bagGrid.appendChild(itemCard(it, "bag", i));
      });
      el.sellCommon.disabled = !state.bag.some((x) => x.rarity === "common");
    }

    function refresh() {
      const hero = P.calcHero(state);
      const zone = state.zones.apartment;
      const zdef = P.ZONES.apartment;
      el.supplies.textContent = fmt(Math.floor(state.supplies));
      el.income.textContent = "за волну: " + fmt(Math.floor(P.waveSupplies(zone.wave) * hero.supMult));
      el.tech.textContent = fmt(state.tech);
      el.dps.textContent = fmt(Math.round(hero.dpsEff * 10) / 10);
      el.hp.textContent = fmt(Math.ceil(state.hero.hp)) + "/" + fmt(hero.hpMax);
      el.armor.textContent = Math.round(hero.armor) + " (" + Math.round(hero.dr * 100) + "%)";
      el.crit.textContent = Math.round(hero.crit * 100) + "% крит";

      const c = P.waveCycle(zone.wave, zdef.wavesCap);
      let waveText = c.nEff + " / " + zdef.wavesCap;
      if (c.cycle > 0) waveText += " · круг " + (c.cycle + 1);
      el.wave.textContent = waveText;
      el.maxWave.textContent = zone.maxWave || 1;
      const canSwitch = game.combat.phase !== "fight";
      el.wavePrev.disabled = !canSwitch || zone.wave <= 1;
      el.waveNext.disabled = !canSwitch || zone.wave >= (zone.maxWave || 1);
      el.autoFarm.classList.toggle("on", !!state.autoFarm);
      el.autoFarm.textContent = state.autoFarm ? "Авто: вкл" : "Авто: выкл";
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

      if (forceHeavy || state.now - lastHeavy > 0.25) {
        lastHeavy = state.now;
        forceHeavy = false;
        renderHeavy();
      }
    }

    // лут-попап (по одному из очереди; показываем редкий+ лут и авто-продажи)
    function showLoot() {
      if (el.lootPopup.classList.contains("visible") || game.lootQueue.length === 0) return;
      const loot = game.lootQueue.shift();
      const it = loot.item;
      const notable = it.rarity === "rare" || it.rarity === "epic" ||
        it.rarity === "legendary" || it.rarity === "mythic";
      if (!notable && loot.toBag) { showLoot(); return; }
      let html = "";
      if (loot.toBag) {
        html += "<p class='loot-title'>Новый предмет — в сумке!</p>";
        html += "<div class='loot-item " + rarityClass(it.rarity) + "'><b>" + it.name + "</b><br>" + itemStatsText(it);
        const af = affixText(it);
        if (af) html += "<br><span class='i-affix'>" + af + "</span>";
        html += "</div>";
        html += "<p class='loot-vs'>Наденьте из сумки, когда будет минутка.</p>";
      } else {
        html += "<p class='loot-title'>Сумка полна — предмет продан</p>";
        html += "<div class='loot-item " + rarityClass(it.rarity) + "'><b>" + it.name + "</b><br>" + itemStatsText(it) + "</div>";
        html += "<p class='loot-vs'>+" + loot.soldFor + " припасов</p>";
      }
      el.lootBody.innerHTML = html;
      el.lootPopup.classList.add("visible");
      forceHeavy = true;
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
        html += "<li>Предметов найдено: <b>" + report.items.length + "</b> (в сумке)</li>";
      }
      if (report.zoneUnlocked) {
        html += "<li>🔓 Открыто: <b>" + P.ZONES[report.zoneUnlocked].name + "</b></li>";
      }
      html += "</ul><p class='loot-vs'>Продайте лишнее, наденьте лучшее — и дальше.</p>";
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
