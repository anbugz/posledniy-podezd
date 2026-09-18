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
      const zoneId = state.activeZone || "apartment";
      // пол и стены — общий каркас, детали — по зоне
      ctx.fillStyle = night ? PAL.wallNight : PAL.wall;
      ctx.fillRect(0, 0, W, FLOOR_Y);
      ctx.fillStyle = PAL.floor;
      ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
      ctx.strokeStyle = PAL.floorLine;
      for (let x = 0; x < W; x += 24) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, FLOOR_Y); ctx.lineTo(x + 0.5, H); ctx.stroke();
      }
      if (zoneId === "entrance") drawEntrance(night, t);
      else if (zoneId === "yard") drawYard(night, t);
      else if (zoneId === "house") drawHouse(night, t);
      else if (zoneId === "district") drawDistrict(night, t);
      else drawApartment(night, t);
    }

    /* Квартира: комната с окном, дверью и диваном-баррикадой. */
    function drawApartment(night, t) {
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

    /* Подъезд: лестничная клетка с лифтом и лампой. */
    function drawEntrance(night, t) {
      // бетонные панели
      ctx.strokeStyle = "#262233";
      for (let x = 60; x < W; x += 90) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, FLOOR_Y); ctx.stroke();
      }
      // лифт (справа)
      ctx.fillStyle = "#3a3f52";
      ctx.fillRect(400, FLOOR_Y - 130, 62, 130);
      ctx.fillStyle = "#2a2e3e";
      ctx.fillRect(406, FLOOR_Y - 124, 50, 124);
      ctx.strokeStyle = "#4a5068";
      ctx.beginPath(); ctx.moveTo(431, FLOOR_Y - 124); ctx.lineTo(431, FLOOR_Y); ctx.stroke();
      // лампа над лифтом
      const flick = Math.floor(t / 40) % 7 !== 0;
      if (flick) {
        ctx.fillStyle = "#ffe87d";
        ctx.fillRect(425, 40, 12, 6);
        ctx.fillStyle = "rgba(255,232,125,0.12)";
        ctx.fillRect(400, 46, 62, FLOOR_Y - 46);
      }
      // марш лестницы (слева)
      ctx.fillStyle = "#2e3040";
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(0, FLOOR_Y - 22 * (i + 1), 90 - i * 14, 22);
      }
      // поручень
      ctx.strokeStyle = "#4a5068";
      ctx.beginPath(); ctx.moveTo(0, FLOOR_Y - 118); ctx.lineTo(84, FLOOR_Y - 30); ctx.stroke();
      // окошко в клетке
      ctx.fillStyle = night ? PAL.windowNight : PAL.windowDay;
      ctx.fillRect(180, 36, 70, 56);
      ctx.strokeStyle = PAL.windowFrame;
      ctx.strokeRect(180, 36, 70, 56);
      ctx.beginPath(); ctx.moveTo(215, 36); ctx.lineTo(215, 92); ctx.stroke();
    }

    /* Двор: забор, будка, дерево, небо. */
    function drawYard(night, t) {
      // небо на всю стену
      ctx.fillStyle = night ? "#0a1024" : "#87b5d9";
      ctx.fillRect(0, 0, W, FLOOR_Y);
      if (night) {
        ctx.fillStyle = "#e8e4f0";
        for (const [sx, sy] of [[40, 30], [120, 60], [260, 24], [330, 70], [450, 40]]) {
          ctx.fillRect(sx, sy, 2, 2);
        }
      } else {
        // солнце
        ctx.fillStyle = "#ffe87d";
        ctx.fillRect(60, 26, 18, 18);
      }
      // многоквартирный силуэт
      ctx.fillStyle = night ? "#141a2c" : "#5a6a86";
      ctx.fillRect(280, 60, 180, FLOOR_Y - 60);
      ctx.fillStyle = night ? "#2a3350" : "#c8d4e8";
      for (let wy = 74; wy < FLOOR_Y - 20; wy += 26) {
        for (let wx = 292; wx < 440; wx += 30) ctx.fillRect(wx, wy, 14, 12);
      }
      // забор (профлист)
      ctx.fillStyle = night ? "#232a3a" : "#7a8699";
      ctx.fillRect(0, FLOOR_Y - 74, W, 74);
      ctx.strokeStyle = night ? "#313a4e" : "#96a2b5";
      for (let x = 8; x < W; x += 22) {
        ctx.beginPath(); ctx.moveTo(x, FLOOR_Y - 74); ctx.lineTo(x, FLOOR_Y); ctx.stroke();
      }
      // дерево за забором
      ctx.fillStyle = "#3a2c22";
      ctx.fillRect(150, FLOOR_Y - 120, 10, 50);
      ctx.fillStyle = night ? "#1d3020" : "#3f6d4e";
      ctx.beginPath(); ctx.arc(155, FLOOR_Y - 132, 30, 0, Math.PI * 2); ctx.fill();
      // будка
      ctx.fillStyle = night ? "#2a2434" : "#6a4a3a";
      ctx.fillRect(60, FLOOR_Y - 46, 52, 46);
      ctx.fillStyle = "#1c1626";
      ctx.fillRect(74, FLOOR_Y - 34, 20, 34);
    }

    /* Дом: подвал — кирпич, трубы, полки, котёл. */
    function drawHouse(night, t) {
      // кирпичная кладка
      ctx.strokeStyle = "#2c2333";
      for (let y = 0; y < FLOOR_Y; y += 14) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        for (let x = (y / 14) % 2 ? 0 : 18; x < W; x += 36) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14); ctx.stroke();
        }
      }
      // трубы под потолком
      ctx.fillStyle = "#4a5068";
      ctx.fillRect(0, 18, W, 8);
      ctx.fillRect(120, 18, 8, 60);
      ctx.fillRect(340, 18, 8, 44);
      // котёл (справа)
      ctx.fillStyle = "#3f4658";
      ctx.fillRect(400, FLOOR_Y - 80, 56, 80);
      ctx.fillStyle = "#2c3140";
      ctx.fillRect(408, FLOOR_Y - 72, 40, 64);
      // горелка мерцает
      ctx.fillStyle = Math.floor(t / 12) % 2 ? "#e87d4a" : "#a84a2a";
      ctx.fillRect(416, FLOOR_Y - 20, 24, 8);
      // полки с консервами (слева)
      ctx.fillStyle = "#4a3a2c";
      ctx.fillRect(20, FLOOR_Y - 130, 90, 6);
      ctx.fillRect(20, FLOOR_Y - 92, 90, 6);
      ctx.fillStyle = "#7a8a5a";
      ctx.fillRect(30, FLOOR_Y - 142, 12, 12);
      ctx.fillRect(50, FLOOR_Y - 142, 12, 12);
      ctx.fillStyle = "#8a5a4a";
      ctx.fillRect(70, FLOOR_Y - 104, 12, 12);
      // голая лампочка
      ctx.fillStyle = "#5a5148";
      ctx.beginPath(); ctx.moveTo(240, 0); ctx.lineTo(240, 34); ctx.stroke();
      ctx.fillStyle = night ? "#ffe87d" : "#c8b46a";
      ctx.fillRect(234, 34, 12, 14);
    }

    /* Район: улица — разрушенные дома, фонарь, баррикада, луна. */
    function drawDistrict(night, t) {
      ctx.fillStyle = night ? "#0a1024" : "#6a7a99";
      ctx.fillRect(0, 0, W, FLOOR_Y);
      if (night) {
        ctx.fillStyle = "#e8e4f0";
        ctx.fillRect(70, 30, 3, 3); ctx.fillRect(200, 60, 2, 2); ctx.fillRect(390, 24, 2, 2);
        // луна
        ctx.fillStyle = "#d8dce8";
        ctx.fillRect(430, 30, 26, 26);
        ctx.fillStyle = "#0a1024";
        ctx.fillRect(424, 26, 14, 26);
      }
      // силуэты разрушенных зданий
      ctx.fillStyle = night ? "#121828" : "#4a5670";
      ctx.fillRect(0, 90, 110, FLOOR_Y - 90);
      ctx.fillRect(70, 60, 60, 40);        // второй этаж угловой
      ctx.fillRect(360, 76, 120, FLOOR_Y - 76);
      // проломы (как окна без стекол)
      ctx.fillStyle = night ? "#0a1024" : "#2a3245";
      for (const [bx, by] of [[16, 110], [48, 140], [86, 110], [380, 96], [420, 130], [452, 100]]) {
        ctx.fillRect(bx, by, 16, 18);
      }
      // фонарь (мигает)
      ctx.fillStyle = "#3a4052";
      ctx.fillRect(230, FLOOR_Y - 150, 6, 150);
      ctx.fillRect(230, FLOOR_Y - 150, 30, 5);
      const on = Math.floor(t / 50) % 5 !== 0;
      ctx.fillStyle = on ? "#ffe87d" : "#5a5148";
      ctx.fillRect(252, FLOOR_Y - 145, 8, 8);
      if (on) {
        ctx.fillStyle = "rgba(255,232,125,0.10)";
        ctx.fillRect(222, FLOOR_Y - 137, 70, 137);
      }
      // баррикада из шин и досок
      ctx.fillStyle = "#2c2636";
      ctx.beginPath(); ctx.arc(90, FLOOR_Y - 12, 14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(118, FLOOR_Y - 10, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#4a3a2c";
      ctx.fillRect(70, FLOOR_Y - 34, 90, 8);
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

      // имя + волна (эффективная, с учётом кругов) — активная зона
      const zdef = P.ZONES[state.activeZone || "apartment"];
      const c = P.waveCycle(state.zones[zdef.id].wave, zdef.wavesCap);
      const waveLabel = c.cycle > 0 ? c.nEff + " (круг " + (c.cycle + 1) + ")" : String(c.nEff);
      const label = e.name + " (волна " + waveLabel + ")";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(10,8,18,0.75)";
      ctx.fillRect(x - lw / 2 - 4, y - 110, lw + 8, 12);
      ctx.fillStyle = PAL.text;
      ctx.fillText(label, x, y - 101);
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
      // баннер (день/ночь/ивент/unlock) — правый верхний угол, чтобы не перекрывать статус боя
      if (game.banner && state.now < game.banner.until) {
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(W - 308, 8, 300, 18);
        ctx.fillStyle = "#ffe87d";
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.fillText(game.banner.text, W - 158, 21);
      }
      // статус боя
      ctx.fillStyle = PAL.text;
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      const phaseText =
        game.combat.phase === "fight" ? "БОЙ" :
        game.combat.phase === "knockout" ? "ГЕРОЙ ОТКЛЮЧЁН" :
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
