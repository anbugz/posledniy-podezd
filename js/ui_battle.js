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

  /* v3.3: сгенерированные арты (задники зон, спрайты). Пока картинка не
     загрузилась — рисуем кодом, как раньше. */
  const ART = {};
  function loadArt(key, src) { const im = new Image(); im.src = src; ART[key] = im; }
  loadArt("bg_apartment", "img/bg/bg_apartment.png");
  loadArt("bg_entrance", "img/bg/bg_entrance.png");
  loadArt("bg_yard", "img/bg/bg_yard.png");
  loadArt("bg_house", "img/bg/bg_house.png");
  loadArt("bg_district", "img/bg/bg_district.png");
  loadArt("hero", "img/sprites/hero.png");
  loadArt("drone", "img/sprites/enemy_drone.png");
  loadArt("brute", "img/sprites/enemy_brute.png");
  // v3.4: у каждой зоны свой враг и свой босс
  for (const z of ["apartment", "entrance", "yard", "house", "district"]) {
    loadArt(z + "_grunt", "img/sprites/" + z + "_grunt.png");
    loadArt(z + "_boss", "img/sprites/" + z + "_boss.png");
  }
  const artReady = (im) => im && im.complete && im.naturalWidth > 0;
  /* Спрайт врага: зона + тип (босс/грунт), с откатом на старые спрайты. */
  function enemyArt(zoneId, kind) {
    const boss = kind === "boss";
    const z = ART[zoneId + "_" + (boss ? "boss" : "grunt")];
    if (artReady(z)) return z;
    const legacy = ART[boss ? "brute" : "drone"];
    return artReady(legacy) ? legacy : null;
  }

  P.initBattleView = function (game, canvas) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const state = game.state;

    const floaters = [];   // {x, y, text, color, life}
    const flashes = [];    // вспышки выстрелов {x, y, life}
    const particles = [];  // искры/осколки {x, y, vx, vy, color, life}
    const tracers = [];    // трассеры выстрелов {x1, y1, x2, y2, life}
    let shakeAt = -999, shakeMag = 0; // тряска экрана (крит, смерть босса)
    let enemyAnimHit = 0;
    let lastTickHadEnemy = false;

    function spawnParticles(x, y, color, n, spread) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (0.4 + Math.random() * 1.2) * (spread || 1);
        particles.push({
          x, y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.6,
          color, life: 18 + Math.random() * 10,
        });
      }
    }
    function shake(mag) { shakeAt = lastT; shakeMag = mag; }

    /* Анимация, привязанная к реальным событиям боя (t — кадры из render).
       Длительности в единицах t (20 ед. ≈ 1 с): замах 5, урон-вспышка 6,
       наскок врага 8, появление 8, падение 10. */
    let lastT = 0;
    let heroAtkAt = -999, heroHurtAt = -999;
    let enemyAtkAt = -999, enemySpawnAt = -999, enemyDeadAt = -999;
    const easeOut = (p) => 1 - (1 - p) * (1 - p);
    const swing = (p) => Math.sin(Math.min(Math.max(p, 0), 1) * Math.PI); // 0→1→0

    function addFloater(x, y, text, color) {
      floaters.push({ x, y, text, color: color || "#fff", life: 55 });
    }

    // подписка на события боя
    const origCb = game.combat;
    // floaters за урон генерируем в render-проходе по тику

    function drawRoom(t) {
      const night = game.isNight();
      const zoneId = state.activeZone || "apartment";
      // сгенерированный задник зоны; пока не загружен — рисуем кодом ниже
      const bgArt = ART["bg_" + zoneId];
      if (artReady(bgArt)) { ctx.drawImage(bgArt, 0, 0, W, H); return; }
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
      // замах: рывок к врагу 0.25 с; получение урона: откат+тряска 0.3 с
      const atkP = (lastT - heroAtkAt) / 5;
      const hurtP = (lastT - heroHurtAt) / 6;
      const fam = P.weaponFamily(state.equipment.weapon) || "knife";
      const isGun = fam === "gun" || fam === "rifle";
      // замах: холодное — рывок к врагу; стрелковое — отдача назад
      const lunge = atkP <= 1 ? swing(atkP) * (isGun ? -7 : fam === "bat" ? 24 : 18) : 0;
      const hurtShake = hurtP <= 1 ? (Math.random() - 0.5) * 5 - swing(hurtP) * 8 : 0;
      const x = HERO_X + lunge + hurtShake, y = FLOOR_Y + bob * 0;
      const dead = game.combat.phase === "knockout";
      const alpha = dead ? 0.4 + 0.2 * Math.sin(t / 4) : 1;

      // спрайт героя (сгенерированный); пока не загружен — кодом ниже
      if (artReady(ART.hero)) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(ART.hero, x - 34, y - 80, 68, 80);
        ctx.globalAlpha = 1;
        // дуга замаха в момент удара (только холодное; стрелковое — трассер)
        if (atkP <= 1 && !isGun) {
          ctx.globalAlpha = (1 - atkP) * 0.9;
          ctx.strokeStyle = "#e8e4f0";
          ctx.lineWidth = fam === "bat" ? 3 : 2;
          const r = fam === "bat" ? 26 : 20;
          ctx.beginPath();
          ctx.arc(x + 30, y - 44, r, -1.2 + atkP * 2.2, 0.4 + atkP * 2.2);
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.globalAlpha = 1;
        }
        const hpPct = Math.max(0, state.hero.hp / hero.hpMax);
        ctx.fillStyle = "#000";
        ctx.fillRect(x - 20, y - 92, 40, 5);
        ctx.fillStyle = PAL.heroHp;
        ctx.fillRect(x - 19, y - 91, Math.round(38 * hpPct), 3);
        if (dead) {
          ctx.fillStyle = PAL.text;
          ctx.font = "8px monospace";
          ctx.textAlign = "center";
          ctx.fillText("БЕЗ СОЗНАНИЯ " + Math.ceil(game.combat.timer) + "с", x, y - 98);
        }
        return;
      }
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

      // дуга замаха в момент удара (только холодное; стрелковое — трассер)
      if (atkP <= 1 && !isGun) {
        ctx.globalAlpha = (1 - atkP) * 0.9;
        ctx.strokeStyle = "#e8e4f0";
        ctx.lineWidth = fam === "bat" ? 3 : 2;
        const r = fam === "bat" ? 22 : 16;
        ctx.beginPath();
        ctx.arc(x + 26, y - 46, r, -1.2 + atkP * 2.2, 0.4 + atkP * 2.2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;
      }

      if (dead) {
        ctx.fillStyle = PAL.text;
        ctx.font = "8px monospace";
        ctx.textAlign = "center";
        ctx.fillText("БЕЗ СОЗНАНИЯ " + Math.ceil(game.combat.timer) + "с", x, y - 80);
      }
    }

    function drawEnemy(t) {
      const e = game.combat.enemy;
      if (!e) { drawDying(t); return; }
      // появление: въезжает справа за 0.4 с; атака: наскок к герою 0.4 с
      const spawnP = (lastT - enemySpawnAt) / 8;
      const atkP = (lastT - enemyAtkAt) / 8;
      const slideIn = spawnP <= 1 ? (1 - easeOut(spawnP)) * 70 : 0;
      const lunge = atkP <= 1 ? swing(atkP) * 20 : 0;
      const x = ENEMY_X + slideIn - lunge, y = FLOOR_Y;
      const shake = enemyAnimHit > 0 ? (Math.random() - 0.5) * 3 : 0;
      const bob = Math.sin(t / 7 + 2) * 2;
      const spawnAlpha = spawnP <= 1 ? 0.3 + 0.7 * spawnP : 1;
      ctx.globalAlpha = spawnAlpha;

      // спрайт врага зоны (пропорции сохраняем, якорь — низ по центру)
      const eArt = enemyArt(state.activeZone || "apartment", e.kind);
      if (eArt) {
        const h = e.kind === "boss" ? 118 : e.kind === "elite" ? 92 : 70;
        const w = Math.round(h * (eArt.naturalWidth / eArt.naturalHeight));
        ctx.drawImage(eArt, x - w / 2 + shake, FLOOR_Y - h + bob * 0.3, w, h);
      } else if (e.kind === "boss") {
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
      ctx.globalAlpha = 1;
    }

    /* Падение убитого врага: снапшот из waveWin, 0.5 с — крен + уход вниз + затухание. */
    let dyingEnemy = null; // {kind, h, at}
    function drawDying(t) {
      if (!dyingEnemy) return;
      const p = (lastT - dyingEnemy.at) / 10;
      if (p > 1) { dyingEnemy = null; return; }
      const x = ENEMY_X, h = dyingEnemy.h;
      const alpha = 1 - p;
      const drop = p * p * 26;
      const tilt = p * 0.5; // радианы крена
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, FLOOR_Y - h / 2 + drop);
      ctx.rotate(tilt);
      const eArt = enemyArt(dyingEnemy.zoneId, dyingEnemy.kind);
      if (eArt) {
        const w = Math.round(h * (eArt.naturalWidth / eArt.naturalHeight));
        ctx.drawImage(eArt, -w / 2, -h / 2, w, h);
      } else {
        ctx.fillStyle = dyingEnemy.kind === "boss" ? PAL.bossDrone : dyingEnemy.kind === "elite" ? PAL.bugElite : PAL.bug;
        ctx.fillRect(-h / 3, -h / 3, h * 0.66, h * 0.5);
      }
      ctx.restore();
    }

    function drawFloatersAndFlashes() {
      // трассеры выстрелов
      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        tr.life--;
        if (tr.life <= 0) { tracers.splice(i, 1); continue; }
        ctx.globalAlpha = tr.life / 4;
        ctx.strokeStyle = "#ffe87d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tr.x1, tr.y1);
        ctx.lineTo(tr.x2, tr.y2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.globalAlpha = 1;
      // искры/осколки с гравитацией
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, p.life / 14);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.globalAlpha = 1;
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
        lastT = t;
        // тряска экрана (крит / смерть босса): сдвиг всей сцены, статус не трясём
        const shakeP = (t - shakeAt) / 5;
        const shaking = shakeP <= 1;
        if (shaking) {
          ctx.save();
          const m = shakeMag * (1 - shakeP);
          ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
        }
        drawRoom(t);
        drawHero(t);
        drawEnemy(t);
        drawFloatersAndFlashes();
        if (shaking) ctx.restore();
        drawStatus(t);
        if (enemyAnimHit > 0) enemyAnimHit--;
        lastTickHadEnemy = !!(game.combat.phase === "fight" && game.combat.enemy);
      },
      /* реальный удар героя: урон по врагу + анимация по семейству оружия */
      heroHit(ev) {
        const dmg = Math.max(1, Math.round(ev.dmg));
        addFloater(ENEMY_X + (Math.random() - 0.5) * 20, FLOOR_Y - 80, "-" + dmg, ev.crit ? "#ffe87d" : "#e8e4f0");
        const fam = P.weaponFamily(state.equipment.weapon) || "knife";
        if (fam === "gun" || fam === "rifle") {
          // выстрел: вспышка у ствола + трассер до врага
          flashes.push({ x: HERO_X + 34, y: FLOOR_Y - 44, life: fam === "rifle" ? 10 : 8 });
          tracers.push({ x1: HERO_X + 36, y1: FLOOR_Y - 42, x2: ENEMY_X - 20, y2: FLOOR_Y - 52, life: 4 });
        }
        // искры при попадании; крит — больше и с тряской экрана
        spawnParticles(ENEMY_X - 10, FLOOR_Y - 60, ev.crit ? "#ffe87d" : "#c0c8d8", ev.crit ? 9 : 4, ev.crit ? 1.6 : 1);
        if (ev.crit) shake(4);
        heroAtkAt = lastT;
        enemyAnimHit = 4;
      },
      /* реальный удар врага: красный урон над героем + наскок врага + откат героя */
      enemyHit(ev) {
        const dmg = Math.max(1, Math.round(ev.dmg));
        addFloater(HERO_X + (Math.random() - 0.5) * 16, FLOOR_Y - 96, "-" + dmg, "#e85e5e");
        spawnParticles(HERO_X + 8, FLOOR_Y - 60, "#e85e5e", 3, 0.8);
        enemyAtkAt = lastT;
        heroHurtAt = lastT;
      },
      /* враг появился — анимация въезда справа */
      waveStart() { enemySpawnAt = lastT; },
      /* враг убит — взрыв частиц + падение; босс — тряска экрана */
      waveWin(ev) {
        const kind = ev.enemy ? ev.enemy.kind : "grunt";
        dyingEnemy = { kind, zoneId: ev.zoneId || state.activeZone, h: kind === "boss" ? 118 : kind === "elite" ? 92 : 70, at: lastT };
        const col = kind === "boss" ? "#c0c8d8" : kind === "elite" ? "#9a5ad0" : "#7a9a4d";
        spawnParticles(ENEMY_X, FLOOR_Y - 50, col, kind === "boss" ? 20 : 12, 1.8);
        if (kind === "boss") shake(6);
      },
      addFloater,
    };
    return view;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
