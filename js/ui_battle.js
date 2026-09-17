/* «Последний подъезд» — UI: рендер боя на canvas 480×270 (пиксель-арт кодом). */
(function (P) {
  "use strict";

  const W = 480, H = 270;
  const FLOOR_Y = 218;
  const HERO_X = 120, ENEMY_X = 350;

  const PAL = {
    wall: "#1a2030", wallNight: "#0d1220", floor: "#242032", floorLine: "#2e2a40",
    windowDay: "#87b5d9", windowNight: "#101a3a", windowFrame: "#3a3450",
    sofa: "#4a3050", sofaShade: "#3a2440", door: "#2c2438",
    heroSkin: "#e8b890", heroShirt: "#3f6d4e", heroPants: "#33415c",
    heroHp: "#5ee87d", enemyHp: "#e85e5e",
    bug: "#7a9a4d", bugElite: "#9a5ad0", bossDrone: "#c0c8d8",
    text: "#e8e4f0",
  };

  P.initBattleView = function (game, canvas) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const state = game.state;

    const floaters = [];   // {x, y, text, color, life}
    const flashes = [];    // вспышки выстрелов {x, y, life}
    let enemyAnimHit = 0;
    let lastTickHadEnemy = false;

    function addFloater(x, y, text, color) {
      floaters.push({ x, y, text, color: color || "#fff", life: 55 });
    }

    // подписка на события боя
    const origCb = game.combat;
    // floaters за урон генерируем в render-проходе по тику

    function drawRoom(t) {
      const night = game.isNight();
      ctx.fillStyle = night ? PAL.wallNight : PAL.wall;
      ctx.fillRect(0, 0, W, FLOOR_Y);
      ctx.fillStyle = night ? PAL.floor : PAL.floor;
      ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
      ctx.strokeStyle = PAL.floorLine;
      for (let x = 0; x < W; x += 24) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, FLOOR_Y); ctx.lineTo(x + 0.5, H); ctx.stroke();
      }

      // окно с небом (день/ночь + мигание ивента)
      const wx = 320, wy = 30, ww = 120, wh = 90;
      ctx.fillStyle = PAL.windowFrame;
      ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      ctx.fillStyle = night ? PAL.windowNight : PAL.windowDay;
      ctx.fillRect(wx, wy, ww, wh);
      if (night) {
        ctx.fillStyle = "#e8e4f0";
        ctx.fillRect(wx + 18, wy + 16, 2, 2);
        ctx.fillRect(wx + 70, wy + 34, 2, 2);
        ctx.fillRect(wx + 95, wy + 12, 2, 2);
      }
      // рама-крест
      ctx.strokeStyle = PAL.windowFrame;
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();
      // в небе — корабль пришельцев, медленно дрейфует
      const shipX = wx + ((t * 0.15) % ww);
      ctx.fillStyle = "#555064";
      ctx.fillRect(shipX - 8, wy + 12, 16, 5);
      ctx.fillRect(shipX - 3, wy + 9, 6, 3);
      if (Math.floor(t / 30) % 2 === 0) {
        ctx.fillStyle = "#7dffd4";
        ctx.fillRect(shipX - 1, wy + 17, 2, 3);
      }

      // дверь (куда врываются)
      ctx.fillStyle = PAL.door;
      ctx.fillRect(30, FLOOR_Y - 110, 46, 110);
      ctx.fillStyle = "#1c1626";
      ctx.fillRect(36, FLOOR_Y - 104, 34, 104);
      ctx.fillStyle = "#e8d44d";
      ctx.fillRect(66, FLOOR_Y - 58, 4, 4);

      // диван-баррикада
      ctx.fillStyle = PAL.sofa;
      ctx.fillRect(430, FLOOR_Y - 34, 46, 34);
      ctx.fillRect(426, FLOOR_Y - 46, 10, 46);
      ctx.fillStyle = PAL.sofaShade;
      ctx.fillRect(430, FLOOR_Y - 20, 46, 6);
    }

    function drawHero(t) {
      const hero = P.calcHero(state);
      const bob = Math.sin(t / 10) * 1.5;
      const x = HERO_X, y = FLOOR_Y + bob * 0;
      const dead = game.combat.phase === "knockout";
      const alpha = dead ? 0.4 + 0.2 * Math.sin(t / 4) : 1;
      ctx.globalAlpha = alpha;

      // ноги
      ctx.fillStyle = PAL.heroPants;
      ctx.fillRect(x - 6, y - 26, 5, 26);
      ctx.fillRect(x + 1, y - 26, 5, 26);
      // корпус
      ctx.fillStyle = PAL.heroShirt;
      ctx.fillRect(x - 8, y - 48, 16, 24);
      // голова
      ctx.fillStyle = PAL.heroSkin;
      ctx.fillRect(x - 5, y - 60, 10, 10);
      // рука с оружием (вправо, к врагу)
      const weapon = state.equipment.weapon;
      const wRarity = weapon ? weapon.rarity : "common";
      const wx2 = x + 10, wy2 = y - 42;
      ctx.fillStyle = PAL.heroSkin;
      ctx.fillRect(x + 4, y - 44, 8, 4);
      // оружие по редкости: нож/бита — ближняя, дробовик — длинная
      ctx.fillStyle = "#c0c8d8";
      if (weapon && weapon.stats.dps >= 15) {
        ctx.fillRect(wx2, wy2 - 2, 22, 4); // ствол
        ctx.fillStyle = "#8a6a3a";
        ctx.fillRect(wx2 + 2, wy2 + 2, 6, 4);
      } else if (weapon && weapon.stats.dps >= 9) {
        ctx.fillRect(wx2, wy2 - 2, 14, 4); // бита
      } else {
        ctx.fillRect(wx2, wy2 - 1, 8, 2);  // нож
      }
      // аура редкости оружия
      if (wRarity !== "common") {
        const colors = { uncommon: "#5ee87d", rare: "#5ea8e8", epic: "#c05ee8", legendary: "#e8b45e", mythic: "#e85e5e" };
        ctx.globalAlpha = alpha * (0.5 + 0.3 * Math.sin(t / 8));
        ctx.fillStyle = colors[wRarity] || "#fff";
        ctx.fillRect(x - 10, y - 62, 20, 2);
        ctx.globalAlpha = alpha;
      }
      ctx.globalAlpha = 1;

      // полоска HP героя
      const hpPct = Math.max(0, state.hero.hp / hero.hpMax);
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 20, y - 72, 40, 5);
      ctx.fillStyle = PAL.heroHp;
      ctx.fillRect(x - 19, y - 71, Math.round(38 * hpPct), 3);

      if (dead) {
        ctx.fillStyle = PAL.text;
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText("БЕЗ СОЗНАНИЯ " + Math.ceil(game.combat.timer) + "с", x, y - 80);
      }
    }

    function drawEnemy(t) {
      const e = game.combat.enemy;
      if (!e) return;
      const x = ENEMY_X, y = FLOOR_Y;
      const shake = enemyAnimHit > 0 ? (Math.random() - 0.5) * 3 : 0;
      const bob = Math.sin(t / 7 + 2) * 2;

      if (e.kind === "boss") {
        // дрон-носильщик: корпус + ротор + мигалка
        ctx.fillStyle = PAL.bossDrone;
        ctx.fillRect(x - 22 + shake, y - 70 + bob * 0.3, 44, 26);
        ctx.fillStyle = "#8a94a8";
        ctx.fillRect(x - 26 + shake, y - 78 + bob * 0.3, 52, 6);
        const blade = Math.floor(t / 2) % 2 === 0;
        ctx.fillStyle = "#e8e4f0";
        ctx.fillRect(x - 30 + shake, y - 80 + bob * 0.3, blade ? 60 : 24, 2);
        // глаз-лазер
        ctx.fillStyle = Math.floor(t / 6) % 2 ? "#e85e5e" : "#7a1f1f";
        ctx.fillRect(x - 6 + shake, y - 62 + bob * 0.3, 12, 6);
        // лапки
        ctx.fillStyle = PAL.bossDrone;
        ctx.fillRect(x - 18 + shake, y - 44, 4, 20);
        ctx.fillRect(x + 14 + shake, y - 44, 4, 20);
      } else {
        // жук: овал + лапки + жвала
        const body = e.kind === "elite" ? PAL.bugElite : PAL.bug;
        const r = e.kind === "elite" ? 18 : 12;
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.ellipse(x + shake, y - r - 8 + bob * 0.3, r, Math.round(r * 0.7), 0, 0, Math.PI * 2);
        ctx.fill();
        // лапки
        ctx.strokeStyle = body;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(x + i * 6 + shake, y - 10 + bob * 0.3);
          ctx.lineTo(x + i * 9 + shake, y);
          ctx.stroke();
        }
        // глаза светятся
        ctx.fillStyle = "#ff5e5e";
        ctx.fillRect(x - 6 + shake, y - r - 12 + bob * 0.3, 3, 3);
        ctx.fillRect(x + 3 + shake, y - r - 12 + bob * 0.3, 3, 3);
      }

      // HP врага
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 24, y - 96, 48, 5);
      ctx.fillStyle = PAL.enemyHp;
      ctx.fillRect(x - 23, y - 95, Math.round(46 * pct), 3);

      // имя + волна (эффективная, с учётом кругов)
      const c = P.waveCycle(state.zones.apartment.wave, P.ZONES.apartment.wavesCap);
      const waveLabel = c.cycle > 0 ? c.nEff + " (круг " + (c.cycle + 1) + ")" : String(c.nEff);
      ctx.fillStyle = PAL.text;
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(e.name + " (волна " + waveLabel + ")", x, y - 102);
    }

    function drawFloatersAndFlashes() {
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];
        f.y -= 0.7; f.life--;
        if (f.life <= 0) { floaters.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, f.life / 25);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      for (let i = flashes.length - 1; i >= 0; i--) {
        const fl = flashes[i];
        fl.life--;
        if (fl.life <= 0) { flashes.splice(i, 1); continue; }
        ctx.globalAlpha = fl.life / 8;
        ctx.fillStyle = "#ffe87d";
        ctx.fillRect(fl.x - 3, fl.y - 3, 7, 7);
      }
      ctx.globalAlpha = 1;
    }

    function drawStatus(t) {
      // баннер (день/ночь/ивент/unlock)
      if (game.banner && state.now < game.banner.until) {
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(90, 8, 300, 18);
        ctx.fillStyle = "#ffe87d";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(game.banner.text, 240, 21);
      }
      // статус боя
      ctx.fillStyle = PAL.text;
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      const phaseText =
        game.combat.phase === "fight" ? "БОЙ" :
        game.combat.phase === "knockout" ? "ГЕРОЙ ОТКЛЮЧЁН" :
        game.combat.phase === "done" ? "КВАРТИРА ЗАЧИЩЕНА" :
        "Следующая волна через " + Math.ceil(game.combat.timer) + "с";
      ctx.fillText(phaseText, 10, 16);
      if (game.isEvent()) {
        ctx.fillStyle = "#ff9d5e";
        ctx.fillText("⚠ МАССИРОВАННАЯ ВОЛНА " + Math.ceil(state.event.activeUntil - state.now) + "с", 10, 30);
      }
    }

    const view = {
      /* вызывать из главного цикла */
      render(t) {
        drawRoom(t);
        drawHero(t);
        drawEnemy(t);
        drawFloatersAndFlashes();
        drawStatus(t);

        // всплывающий урон (throttled): в бою каждые ~0.5с
        const inFight = game.combat.phase === "fight" && game.combat.enemy;
        if (inFight) {
          const hero = P.calcHero(state);
          if (Math.floor(t / 30) !== Math.floor((t - 1) / 30)) {
            const crit = Math.random() < hero.crit;
            const dmg = Math.round(hero.dps * game.activeSkillMult() * (crit ? hero.critDmg : 1) * 0.5);
            addFloater(ENEMY_X + (Math.random() - 0.5) * 20, FLOOR_Y - 80, "-" + dmg, crit ? "#ffe87d" : "#e8e4f0");
            if (state.equipment.weapon && state.equipment.weapon.stats.dps >= 15) {
              flashes.push({ x: HERO_X + 34, y: FLOOR_Y - 44, life: 8 });
            }
            enemyAnimHit = 4;
          }
        }
        if (enemyAnimHit > 0) enemyAnimHit--;
        lastTickHadEnemy = !!inFight;
      },
      addFloater,
    };
    return view;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
