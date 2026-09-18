/* «Последний подъезд» — UI v3.1: экран боя (ресурсы, слоты по бокам,
   волны, навыки), экран Базы/Хаба, модалки инвентаря и персонажа,
   тултипы предметов со сравнением в %. Правки v3.1. */
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

  const RARITY_NAME = {
    common: "Обычный", uncommon: "Необычный", rare: "Редкий",
    epic: "Эпический", legendary: "Легендарный", mythic: "Мифический",
  };
  const STAT_NAME = { dps: "DPS", hp: "HP", armor: "Броня", crit: "Крит" };

  function rarityClass(r) { return "r-" + r; }

  function itemStatsText(item) {
    const s = item.stats, parts = [];
    for (const k of ["dps", "hp", "armor", "crit"]) {
      if (!s[k]) continue;
      parts.push(k === "crit" ? "+" + Math.round(s[k] * 100) + "% " + STAT_NAME[k] : "+" + fmt(s[k]) + " " + STAT_NAME[k]);
    }
    return parts.join(", ");
  }
  P.itemStatsText = itemStatsText;

  function itemStatsLines(item) {
    const s = item.stats, lines = [];
    for (const k of ["dps", "hp", "armor", "crit"]) {
      if (!s[k]) continue;
      lines.push({ k, text: "+" + (k === "crit" ? Math.round(s[k] * 100) + "%" : fmt(s[k])) + " " + STAT_NAME[k] });
    }
    return lines;
  }

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

  function sellPrice(item) {
    return Math.max(1, Math.floor(P.itemScore(item) * 0.5 / 4));
  }

  /* Сравнение с надетым предметом того же слота: % к «мощности» (score). */
  function cmpHtml(item, equipped) {
    if (!equipped) {
      return "<span class='d-cmp-better'>слот пуст — надевание в плюс</span>";
    }
    const a = P.itemScore(item), b = P.itemScore(equipped);
    const pct = Math.round((a / b - 1) * 100);
    if (pct === 0) return "<span>ровно как надетый (±0%)</span>";
    return pct > 0
      ? "<span class='d-cmp-better'>▲ +" + pct + "% к надетому</span>"
      : "<span class='d-cmp-worse'>▼ " + pct + "% к надетому</span>";
  }

  /* Сравнение постатно: «HP: 10 → 25 (+150%)» по каждому стату пары. */
  function statVal(k, v) { return k === "crit" ? Math.round(v * 100) + "%" : fmt(v); }
  function compareLines(item, equipped) {
    const keys = ["dps", "hp", "armor", "crit"];
    const lines = [];
    for (const k of keys) {
      const val = item.stats[k] || 0;
      const cur = (equipped && equipped.stats[k]) || 0;
      if (!val && !cur) continue;
      let cmp;
      if (cur > 0) {
        const pct = Math.round((val / cur - 1) * 100);
        cmp = pct === 0 ? "±0%" : (pct > 0 ? "+" : "") + pct + "%";
      } else {
        cmp = val > 0 ? "новый стат" : "—";
      }
      const arrow = val > cur ? "▲" : val < cur ? "▼" : "•";
      const cls = val > cur ? "d-cmp-better" : val < cur ? "d-cmp-worse" : "";
      lines.push({ text: arrow + " " + STAT_NAME[k] + ": " + statVal(k, cur) + " → " + statVal(k, val) + " (" + cmp + ")", cls });
    }
    return lines;
  }

  P.initPanel = function (game, battleView) {
    const state = game.state;
    const $ = (id) => document.getElementById(id);
    const el = {
      supplies: $("supplies"), income: $("income"), tech: $("tech"),
      dps: $("dps"), hp: $("hp"), armor: $("armor"), crit: $("crit"),
      wave: $("wave"), maxWave: $("maxWave"), winChance: $("winChance"),
      wavePrev: $("wavePrev"), waveNext: $("waveNext"), autoFarm: $("autoFarm"),
      zoneChips: $("zone-chips"), skills: $("skills"),
      equipLeft: $("equip-left"), equipRight: $("equip-right"),
      openInv: $("openInv"), bagCountBadge: $("bagCountBadge"), openChar: $("openChar"),
      tabBattle: $("tab-battle"), tabBase: $("tab-base"),
      screenBattle: $("screen-battle"), screenBase: $("screen-base"),
      hubHead: $("hub-head"), zoneCards: $("zone-cards"),
      trainCap: $("trainCap"), trainingGrid: $("training-grid"),
      invModal: $("inv-modal"), bagGrid: $("bag-grid"), bagCount: $("bagCount"),
      invDetail: $("inv-detail"), equipBest: $("equipBest"),
      autoSellSel: $("autoSellSel"), autoSellOn: $("autoSellOn"), sellBelow: $("sellBelow"),
      charModal: $("char-modal"), charBody: $("char-body"),
      trainingSection: $("training-section"), veteranNote: $("veteran-note"),
      offline: $("offline-screen"), offlineBody: $("offline-body"), offlineOk: $("offline-ok"),
      savedHint: $("saved-hint"), tooltip: $("tooltip"),
    };

    const SLOTS_LEFT = ["weapon", "gloves", "accessory"];
    const SLOTS_RIGHT = ["helmet", "armor", "boots"];

    /* ---------- тултип ---------- */
    function showTooltip(html, x, y) {
      el.tooltip.innerHTML = html;
      el.tooltip.classList.remove("hidden");
      const r = el.tooltip.getBoundingClientRect();
      let tx = x + 14, ty = y + 14;
      if (tx + r.width > window.innerWidth - 8) tx = x - r.width - 14;
      if (ty + r.height > window.innerHeight - 8) ty = y - r.height - 14;
      el.tooltip.style.left = tx + "px";
      el.tooltip.style.top = ty + "px";
    }
    function hideTooltip() { el.tooltip.classList.add("hidden"); }

    function itemTooltipHtml(item, equipped) {
      let html = "<h4 class='" + rarityClass(item.rarity) + "'>" + P.slotIcon(item) + " " + item.name + "</h4>";
      html += "<div class='tt-rar tt-" + item.rarity + "'>" + (RARITY_NAME[item.rarity] || item.rarity) +
        (item.lvl ? " · усилен +" + item.lvl : "") + "</div>";
      for (const l of itemStatsLines(item)) html += "<div class='tt-line'>" + l.text + "</div>";
      const af = affixText(item);
      if (af) html += "<div class='tt-line d-affix'>" + af + "</div>";
      html += "<div class='tt-cmp'>";
      for (const l of compareLines(item, equipped)) {
        html += "<div class='" + l.cls + "'>" + l.text + "</div>";
      }
      html += "</div>";
      html += "<div class='tt-price'>цена продажи: " + sellPrice(item) + " 🥫</div>";
      return html;
    }

    function bindTooltip(node, getItem, getEquipped) {
      node.addEventListener("mouseenter", (e) => {
        const item = getItem();
        if (!item) return;
        showTooltip(itemTooltipHtml(item, getEquipped()), e.clientX, e.clientY);
      });
      node.addEventListener("mousemove", (e) => {
        if (el.tooltip.classList.contains("hidden")) return;
        const r = el.tooltip.getBoundingClientRect();
        let tx = e.clientX + 14, ty = e.clientY + 14;
        if (tx + r.width > window.innerWidth - 8) tx = e.clientX - r.width - 14;
        if (ty + r.height > window.innerHeight - 8) ty = e.clientY - r.height - 14;
        el.tooltip.style.left = tx + "px";
        el.tooltip.style.top = ty + "px";
      });
      node.addEventListener("mouseleave", hideTooltip);
    }

    /* ---------- экраны ---------- */
    function showScreen(which) {
      if (which === "base" && !state.hubUnlocked) return; // база — после зачистки Дома
      el.screenBattle.classList.toggle("hidden", which !== "battle");
      el.screenBase.classList.toggle("hidden", which !== "base");
      el.tabBattle.classList.toggle("active", which === "battle");
      el.tabBase.classList.toggle("active", which === "base");
    }
    el.tabBattle.addEventListener("click", () => showScreen("battle"));
    el.tabBase.addEventListener("click", () => { renderBase(); showScreen("base"); });

    /* ---------- слоты экипировки по бокам боя ---------- */
    const slotBtns = {};
    function buildSlots(container, slots) {
      for (const slot of slots) {
        const btn = document.createElement("button");
        btn.className = "slot empty";
        btn.addEventListener("click", () => openInventory());
        container.appendChild(btn);
        slotBtns[slot] = btn;
        bindTooltip(btn, () => state.equipment[slot], () => null);
      }
    }
    buildSlots(el.equipLeft, SLOTS_LEFT);
    buildSlots(el.equipRight, SLOTS_RIGHT);

    function refreshSlots() {
      for (const slot of P.SLOTS) {
        const btn = slotBtns[slot];
        const it = state.equipment[slot];
        btn.className = "slot " + (it ? rarityClass(it.rarity) : "empty");
        btn.textContent = it ? P.slotIcon(it) : "▫️";
        btn.title = "";
        const tag = document.createElement("span");
        tag.className = "slot-tag";
        tag.textContent = P.SLOT_INFO[slot].name + (it && it.lvl ? " +" + it.lvl : "");
        btn.appendChild(tag);
      }
    }

    /* ---------- зоны ---------- */
    const zoneChips = {};
    for (const zid of P.ZONE_ORDER) {
      const zdef = P.ZONES[zid];
      const btn = document.createElement("button");
      btn.className = "zone-chip";
      btn.textContent = zdef.name;
      btn.addEventListener("click", () => {
        if (game.setZone(zid)) { refresh(); renderBase(); }
      });
      el.zoneChips.appendChild(btn);
      zoneChips[zid] = btn;
    }

    function refreshZoneChips() {
      for (const zid of P.ZONE_ORDER) {
        const z = state.zones[zid];
        const btn = zoneChips[zid];
        btn.disabled = !z.unlocked;
        btn.classList.toggle("active", state.activeZone === zid);
        btn.textContent = z.unlocked ? P.ZONES[zid].name : P.ZONES[zid].name + " 🔒";
        if (!z.unlocked) {
          // как открыть: найти зону, которая ведёт в эту
          const prevId = P.ZONE_ORDER.find((p) => P.ZONES[p].next === zid);
          const prev = prevId ? P.ZONES[prevId] : null;
          btn.title = prev
            ? "Откроется зачисткой: " + prev.name +
              " (волна " + prev.wavesCap + "/" + prev.wavesCap +
              ", сейчас рекорд " + (state.zones[prevId].maxWave || 1) + ")"
            : "Зона пока недоступна";
        } else {
          btn.title = P.ZONES[zid].name;
        }
      }
    }

    /* ---------- волны и авто ---------- */
    el.wavePrev.addEventListener("click", () => {
      const zone = state.zones[state.activeZone];
      if (game.setWave(zone.wave - 1)) refresh();
    });
    el.waveNext.addEventListener("click", () => {
      const zone = state.zones[state.activeZone];
      if (game.setWave(zone.wave + 1)) refresh();
    });
    el.autoFarm.addEventListener("click", () => {
      state.autoFarm = !state.autoFarm;
      refresh();
    });

    /* ---------- навыки ---------- */
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

    /* ---------- инвентарь (модал) ---------- */
    let selectedBagIdx = -1;

    function openInventory() {
      renderInventory();
      el.invModal.classList.add("visible");
    }
    function closeInventory() {
      el.invModal.classList.remove("visible");
      hideTooltip();
    }
    el.openInv.addEventListener("click", openInventory);
    $("inv-close").addEventListener("click", closeInventory);

    el.autoSellSel.value = String(state.autoSell || 0);
    el.autoSellSel.addEventListener("change", () => {
      state.autoSell = parseInt(el.autoSellSel.value, 10) || 0;
      refreshSellTools();
      refresh();
    });
    el.autoSellOn.checked = !!state.autoSellOn;
    el.autoSellOn.addEventListener("change", () => {
      state.autoSellOn = el.autoSellOn.checked;
      refresh();
    });
    // одноразовая продажа всего не выше порога
    el.sellBelow.addEventListener("click", () => {
      const n = (parseInt(el.autoSellSel.value, 10) || 0) - 1;
      if (n < 0) return;
      const g = P.sellBelowRarity(state, n);
      if (g > 0) {
        battleView.addFloater(240, 120, "+" + g + " припасов", "#e8b45e");
        forceHeavy = true;
        refresh();
        renderInventory();
      }
    });
    function refreshSellTools() {
      const n = (parseInt(el.autoSellSel.value, 10) || 0) - 1;
      el.sellBelow.disabled = n < 0;
      el.autoSellOn.disabled = n < 0;
      if (n < 0) el.autoSellOn.checked = false;
    }
    refreshSellTools();

    el.equipBest.addEventListener("click", () => {
      const n = P.equipBest(state);
      if (n > 0) battleView.addFloater(240, 120, "Надето лучшее: " + n, "#5ee87d");
      selectedBagIdx = -1;
      forceHeavy = true;
      refresh();
      renderInventory();
    });

    function renderDetail() {
      const item = state.bag[selectedBagIdx];
      if (!item) {
        el.invDetail.innerHTML = "<p class='inv-hint'>Наведите курсор на предмет — увидите статы и сравнение с надетым. Клик — выбрать.</p>";
        return;
      }
      const equipped = state.equipment[item.slot];
      let html = "<h3 class='" + rarityClass(item.rarity) + "'>" + P.slotIcon(item) + " " + item.name + "</h3>";
      html += "<div class='d-line tt-" + item.rarity + "'>" + (RARITY_NAME[item.rarity] || item.rarity) +
        (item.lvl ? " · усилен +" + item.lvl : "") + "</div>";
      for (const l of itemStatsLines(item)) html += "<div class='d-line'>" + l.text + "</div>";
      const af = affixText(item);
      if (af) html += "<div class='d-line d-affix'>" + af + "</div>";
      if (equipped) {
        html += "<div class='d-line' style='margin-top:4px'>надето: <b>" + equipped.name + "</b></div>";
        for (const l of compareLines(item, equipped)) {
          html += "<div class='d-line " + l.cls + "'>" + l.text + "</div>";
        }
      } else {
        html += "<div class='d-line d-cmp-better'>слот пуст — надевание в плюс</div>";
      }
      html += "<div class='d-line'>цена продажи: <b>" + sellPrice(item) + "</b> 🥫</div>";
      el.invDetail.innerHTML = html;

      const btns = document.createElement("div");
      btns.className = "d-btns";
      const bWear = document.createElement("button");
      bWear.textContent = "Надеть";
      bWear.addEventListener("click", () => {
        if (P.equipItem(state, selectedBagIdx)) {
          battleView.addFloater(240, 120, "Надето!", "#5ee87d");
          selectedBagIdx = -1;
          forceHeavy = true;
          refresh();
          renderInventory();
        }
      });
      const bSell = document.createElement("button");
      bSell.className = "b-sell";
      bSell.textContent = "Продать +" + sellPrice(item);
      bSell.addEventListener("click", () => {
        const g = P.sellItem(state, selectedBagIdx);
        if (g > 0) battleView.addFloater(240, 120, "+" + g + " припасов", "#e8b45e");
        selectedBagIdx = -1;
        forceHeavy = true;
        refresh();
        renderInventory();
      });
      btns.appendChild(bWear);
      btns.appendChild(bSell);
      // улучшение предметов — только после зачистки Района (Оружейник)
      if (state.upgradesUnlocked) {
        const bUpg = document.createElement("button");
        bUpg.className = "b-upg";
        const cost = P.itemUpgradeCost(item);
        bUpg.textContent = "Улучшить — " + fmt(cost);
        bUpg.disabled = state.supplies < cost;
        bUpg.addEventListener("click", () => {
          if (P.upgradeItem(state, "bag", selectedBagIdx)) {
            forceHeavy = true;
            refresh();
            renderInventory();
          }
        });
        btns.appendChild(bUpg);
      }
      el.invDetail.appendChild(btns);
    }

    function renderInventory() {
      el.bagCount.textContent = state.bag.length + " / " + P.bagSize(state);
      el.bagCountBadge.textContent = state.bag.length;
      el.bagGrid.innerHTML = "";
      if (!state.bag.length) {
        const empty = document.createElement("div");
        empty.className = "inv-hint";
        empty.style.gridColumn = "1 / -1";
        empty.textContent = "Сумка пуста — лут падает с волн (теперь реже и ценнее).";
        el.bagGrid.appendChild(empty);
      }
      state.bag.forEach((item, i) => {
        const tile = document.createElement("button");
        tile.className = "item-tile " + rarityClass(item.rarity) + (i === selectedBagIdx ? " selected" : "");
        tile.textContent = P.slotIcon(item);
        if (item.lvl) {
          const tag = document.createElement("span");
          tag.className = "lvl-tag";
          tag.textContent = "+" + item.lvl;
          tile.appendChild(tag);
        }
        tile.addEventListener("click", () => {
          selectedBagIdx = i === selectedBagIdx ? -1 : i;
          renderInventory();
        });
        bindTooltip(tile, () => state.bag[i], () => state.equipment[item.slot]);
        el.bagGrid.appendChild(tile);
      });
      renderDetail();
    }

    /* ---------- персонаж (модал) ---------- */
    function openChar() {
      renderChar();
      el.charModal.classList.add("visible");
    }
    function closeChar() { el.charModal.classList.remove("visible"); }
    el.openChar.addEventListener("click", openChar);
    $("char-close").addEventListener("click", closeChar);

    function renderChar() {
      const hero = P.calcHero(state);
      const t = hero.training;
      const z = state.zones[state.activeZone];
      const zdef = P.ZONES[state.activeZone];
      const c = P.waveCycle(z.wave, zdef.wavesCap);
      let html = "";
      html += "<div class='ch-sect'>Бой</div>";
      html += "<div class='ch-row'><span>DPS (предметы)</span><b>" + fmt(Math.round(hero.dps * 10) / 10) + "</b></div>";
      html += "<div class='ch-row'><span>DPS эффективный (крит/двойной)</span><b>" + fmt(Math.round(hero.dpsEff * 10) / 10) + "</b></div>";
      html += "<div class='ch-row'><span>HP</span><b>" + fmt(Math.ceil(state.hero.hp)) + " / " + fmt(hero.hpMax) + "</b></div>";
      html += "<div class='ch-row'><span>Броня / снижение урона</span><b>" + Math.round(hero.armor) + " / " + Math.round(hero.dr * 100) + "%</b></div>";
      html += "<div class='ch-row'><span>Крит / крит-урон</span><b>" + Math.round(hero.crit * 100) + "% / ×" + hero.critDmg.toFixed(1) + "</b></div>";
      html += "<div class='ch-row'><span>Двойной удар</span><b>" + Math.round(hero.doubleHit * 100) + "%</b></div>";
      html += "<div class='ch-row'><span>Реген в бою</span><b>" + Math.round(hero.regenCombat * 100) + "% HP/с</b></div>";
      html += "<div class='ch-row'><span>Припасы с волн</span><b>×" + hero.supMult.toFixed(2) + "</b></div>";
      html += "<div class='ch-sect'>Самоделки</div>";
      for (const key of Object.keys(P.TRAINING)) {
        html += "<div class='ch-row'><span>" + P.TRAINING[key].name + "</span><b>ур. " + t[key] + "</b></div>";
      }
      html += "<div class='ch-sect'>Текущий фронт</div>";
      html += "<div class='ch-row'><span>Зона</span><b>" + zdef.name + "</b></div>";
      html += "<div class='ch-row'><span>Волна</span><b>" + c.nEff + " / " + zdef.wavesCap + (c.cycle > 0 ? " · круг " + (c.cycle + 1) : "") + "</b></div>";
      el.charBody.innerHTML = html;
    }

    /* ---------- база / хаб ---------- */
    function renderBase() {
      // шапка хаба + вкладка доступны только после зачистки Дома
      el.tabBase.disabled = !state.hubUnlocked;
      el.tabBase.textContent = state.hubUnlocked ? "🏠 База" : "🏠 База 🔒";
      if (state.hubUnlocked) {
        el.hubHead.innerHTML =
          "<div class='hub-banner'><h2>🏠 БАЗА</h2>" +
          "<p>Штаб обороны. Отсюда вы отправляетесь в бой: выбирайте фронт, улучшайте квартиру. " +
          "Всего волн пройдено: <b>" + state.stats.wavesCleared + "</b>, тварей уничтожено: <b>" + state.stats.kills + "</b>.</p></div>";
      } else {
        el.hubHead.innerHTML = "";
      }
      // «Самоделки» — только после Ветерана (зачистка Двора)
      el.trainingSection.classList.toggle("hidden", !state.veteranUnlocked);
      if (!state.veteranUnlocked) {
        el.veteranNote.innerHTML =
          "<div class='hub-banner' style='border-color:#5ea8e8'><h2 style='color:#5ea8e8'>🎖 Ветеран появится позже</h2>" +
          "<p>Обучение «Самоделкам» откроется, когда зачистите <b>Двор</b> (волна " +
          P.ZONES.yard.wavesCap + "). До этого прокачек нет — только бой, лут и навыки.</p></div>";
      } else {
        el.veteranNote.innerHTML = "";
      }
      // карточки зон
      el.zoneCards.innerHTML = "";
      for (const zid of P.ZONE_ORDER) {
        const zdef = P.ZONES[zid];
        const z = state.zones[zid];
        const card = document.createElement("div");
        card.className = "zone-card" + (z.unlocked ? "" : " locked");
        const c = P.waveCycle(z.wave, zdef.wavesCap);
        let html = "<h3>" + zdef.name + (z.unlocked ? "" : " 🔒") + "</h3>";
        if (z.unlocked) {
          html += "<div class='z-row'>Волна: <b>" + c.nEff + " / " + zdef.wavesCap + "</b>" + (c.cycle > 0 ? " · круг " + (c.cycle + 1) : "") + "</div>";
          html += "<div class='z-row'>Макс. волна: <b>" + (z.maxWave || 1) + "</b></div>";
        } else {
          const prev = P.ZONE_ORDER[P.ZONE_ORDER.indexOf(zid) - 1];
          html += "<div class='z-row'>Откроется зачисткой: <b>" + P.ZONES[prev].name + "</b></div>";
        }
        card.innerHTML = html;
        if (z.unlocked) {
          if (zid === "apartment") {
            const cost = P.zoneCost(zid, z.level);
            const btn = document.createElement("button");
            btn.className = "buy";
            btn.innerHTML = "🏠 Улучшить (ур. <b>" + z.level + "</b>) — <b>" + fmt(cost) + "</b> 🥫";
            btn.disabled = state.supplies < cost;
            btn.addEventListener("click", () => {
              if (P.buyZoneLevel(state, zid)) {
                battleView.addFloater(240, 120, "Квартира улучшена!", "#5ee87d");
                forceHeavy = true;
                refresh();
                renderBase();
              }
            });
            card.appendChild(btn);
          }
          const toBattle = document.createElement("button");
          toBattle.className = "to-battle";
          toBattle.textContent = "⚔ В бой";
          toBattle.addEventListener("click", () => {
            if (game.setZone(zid)) { refresh(); showScreen("battle"); }
          });
          card.appendChild(toBattle);
        }
        el.zoneCards.appendChild(card);
      }
      // самоделки
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
    }

    // «Самоделки»: карточки создаём один раз
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
          renderBase();
        }
      });
      card.appendChild(btn);
      el.trainingGrid.appendChild(card);
      trainBtns[key] = { btn, lvl: card.querySelector(".t-lvl") };
    }

    /* ---------- тяжёлый рендер ---------- */
    let lastHeavy = 0;
    let forceHeavy = true;
    function renderHeavy() {
      refreshSlots();
      renderInventory();
      if (el.charModal.classList.contains("visible")) renderChar();
      if (!el.screenBase.classList.contains("hidden")) renderBase();
    }

    /* ---------- основной refresh ---------- */
    function refresh() {
      const hero = P.calcHero(state);
      const zone = state.zones[state.activeZone];
      const zdef = P.ZONES[state.activeZone];
      el.supplies.textContent = fmt(Math.floor(state.supplies));
      el.income.textContent = "за волну: " + fmt(Math.floor(P.waveSupplies(zone.wave) * hero.supMult));
      el.tech.textContent = fmt(state.tech);
      el.dps.textContent = fmt(Math.round(hero.dpsEff * 10) / 10);
      el.hp.textContent = fmt(Math.ceil(state.hero.hp)) + "/" + fmt(hero.hpMax);
      el.armor.textContent = Math.round(hero.armor) + " брони";
      el.crit.textContent = Math.round(hero.crit * 100) + "% крит";

      const c = P.waveCycle(zone.wave, zdef.wavesCap);
      let waveText = c.nEff + " / " + zdef.wavesCap;
      if (c.cycle > 0) waveText += " · круг " + (c.cycle + 1);
      el.wave.textContent = waveText;
      // «макс» понятнее в кругах: рекорд 411 = 21 круг, показываем круг
      const mc = P.waveCycle(zone.maxWave || 1, zdef.wavesCap);
      el.maxWave.textContent = mc.cycle > 0
        ? "круг " + (mc.cycle + 1) + " (волна " + mc.nEff + ")"
        : String(zone.maxWave || 1);
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

      refreshZoneChips();

      // навыки
      for (const id of Object.keys(P.SKILLS)) {
        const def = P.SKILLS[id];
        const btn = skillBtns[id];
        const cdLeft = Math.max(0, state.skills[id].readyAt - state.now);
        const locked = def.unlockWave && zone.wave < def.unlockWave;
        btn.classList.toggle("locked", !!locked);
        btn.classList.toggle("active", game.activeSkills.some((s) => s.id === id));
        btn.classList.toggle("ready", !locked && cdLeft <= 0);
        const cdEl = btn.querySelector(".s-cd");
        if (locked) cdEl.textContent = "волна " + def.unlockWave;
        else if (cdLeft > 0) cdEl.textContent = Math.ceil(cdLeft) + "с";
        else cdEl.textContent = "готов";
        btn.disabled = locked || cdLeft > 0;
      }

      el.bagCountBadge.textContent = state.bag.length;
      el.openInv.classList.toggle("pulse", state.bag.length >= P.bagSize(state));

      if (forceHeavy || state.now - lastHeavy > 0.25) {
        lastHeavy = state.now;
        forceHeavy = false;
        renderHeavy();
      }
    }

    // лут-попапа НЕТ (по решению игрока): очередь лута просто очищается,
    // предметы молча падают в сумку или продаются по настройке.

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

    // Esc закрывает модалки
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      closeInventory();
      closeChar();
    });

    return {
      refresh,
      showOffline,
      showScreen,
      renderBase,
      /* бой стоит, пока открыт экран Базы (возврат — безопасность) */
      isBaseOpen() {
        return !el.screenBase.classList.contains("hidden");
      },
      flashSaved() {
        el.savedHint.classList.add("visible");
        setTimeout(() => el.savedHint.classList.remove("visible"), 1200);
      },
      tick() {
        refresh();
        game.lootQueue.length = 0; // лут уходит молча, без попапов
      },
    };
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
