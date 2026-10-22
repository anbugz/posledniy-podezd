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

  /* v3.3: сгенерированные арты (задники зон, спрайты). v4.11: пока арты
     грузятся, показываем экран загрузки — без «заготовок из прямоугольников». */
  const ART = {};
  let artTotal = 0, artLoaded = 0;
  function loadArt(key, src) {
    artTotal++;
    const im = new Image();
    im.onload = () => { artLoaded++; };
    im.onerror = () => { artLoaded++; }; // битый файл — не вечная загрузка
    im.src = src;
    if (im.complete && im.naturalWidth > 0) artLoaded++; // из кэша мгновенно
    ART[key] = im;
  }
  loadArt("bg_apartment", "img/bg/bg_apartment.png");
  loadArt("bg_entrance", "img/bg/bg_entrance.png");
  loadArt("bg_yard", "img/bg/bg_yard.png");
  loadArt("bg_house", "img/bg/bg_house.png");
  loadArt("bg_district", "img/bg/bg_district.png");
  loadArt("hero", "img/sprites/hero.png");
  loadArt("heroHands", "img/sprites/hero_hands.png"); // v4.6: герой без оружия (оружие рисуем отдельно)
  // v4.9: детализированные спрайты героя с реальным оружием в руках
  for (const fam of ["knife", "bat", "gun", "rifle"]) loadArt("heroW_" + fam, "img/sprites/hero_" + fam + ".png");
  // v4.10: атакующие кадры героя (настоящая кадровая анимация удара/выстрела)
  for (const fam of ["knife", "bat", "gun", "rifle"]) loadArt("heroWA_" + fam, "img/sprites/hero_" + fam + "_atk.png");
  loadArt("drone", "img/sprites/enemy_drone.png");
  loadArt("brute", "img/sprites/enemy_brute.png");
  // v4.6: иконки оружия — фолбэк, если спрайт героя с оружием ещё не загрузился
  for (const fam of ["knife", "bat", "gun", "rifle"]) loadArt("w_" + fam, "img/icons/icon_" + fam + ".png");
  // v4.10: детализированные hd-спрайты врагов (старые файлы оставлены как запас)
  // v4.12: атакующие кадры врагов (<zone>_<type>_atk.png)
  for (const z of ["apartment", "entrance", "yard", "house", "district"]) {
    loadArt(z + "_grunt", "img/sprites/" + z + "_grunt_hd.png");
    loadArt(z + "_boss", "img/sprites/" + z + "_boss_hd.png");
    loadArt(z + "_grunt_atk", "img/sprites/" + z + "_grunt_atk.png");
    loadArt(z + "_boss_atk", "img/sprites/" + z + "_boss_atk.png");
  }
  const artReady = (im) => im && im.complete && im.naturalWidth > 0;

  /* v4.6: линия земли по зонам, когда фон — сгенерированный арт (480×270).
     Подобрано визуально: где на арте «стоят» персонажи (передний план).
     Кодовые фоны рисуются от FLOOR_Y — там ничего не меняем. */
  const GROUND_Y_ART = { apartment: 226, entrance: 228, yard: 234, house: 234, district: 246 };
  function groundY(zoneId) {
    return artReady(ART["bg_" + zoneId]) ? (GROUND_Y_ART[zoneId] || FLOOR_Y) : FLOOR_Y;
  }
  /* Пустая полоса под контентом спрайта (доля высоты, замер по альфа-каналу):
     на неё опускаем спрайт, иначе фигура «стоит на воздухе». v4.10: значения
     перемерены под детализированные hd-спрайты. */
  const SPRITE_TRIM = {
    apartment_grunt: 0.12, apartment_boss: 0.0,
    entrance_grunt: 0.06, entrance_boss: 0.01,
    yard_grunt: 0.21, yard_boss: 0.02,
    house_grunt: 0.20, house_boss: 0.04,
    district_grunt: 0.11, district_boss: 0.07,
  };
  /* Летающие спрайты: низ контента держим НАД землёй + покачивание. */
  const SPRITE_FLY = { district_grunt: 16, district_boss: 22, drone: 18 };
  /* v4.10: нижняя кромка спрайтов героя (idle + атакующий кадр). */
  const HERO_TRIM = {
    knife: 0.062, bat: 0.04, gun: 0.055, rifle: 0.09,
    knife_atk: 0.107, bat_atk: 0.071, gun_atk: 0.075, rifle_atk: 0.089,
  };
  /* v4.12: нижняя кромка атакующих кадров врагов (альфа-замер). */
  const SPRITE_TRIM_ATK = {
    apartment_grunt: 0.122, apartment_boss: 0.001,
    entrance_grunt: 0.063, entrance_boss: 0.001,
    yard_grunt: 0.184, yard_boss: 0.085,
    house_grunt: 0.24, house_boss: 0.138,
    district_grunt: 0.256, district_boss: 0.1,
  };
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
    const ambient = [];    // амбиент-частицы зоны {x, y, vx, vy, color, size, alpha, life, wob}
    let shakeAt = -999, shakeMag = 0; // тряска экрана (крит, смерть босса)
    let enemyAnimHit = 0;
    let lastTickHadEnemy = false;
    let hitStopUntil = -999;          // v4.7: микрозамирание частиц на крите
    let screenFlash = null;           // v4.7: белая вспышка на весь экран (смерть босса)
    // v4.7: смерть/воскрешение героя и босс-интро — переходы фаз
    let prevPhase = "gap", knockoutAt = -999, reviveAt = -999;

    /* Амбиент зон (v4.7): пыль/листья/искры/пепел — атмосфера за копейки. */
    const AMBIENT = {
      apartment: { color: "#c8b46a", every: 9,  vx: [-0.25, 0.1], vy: [0.1, 0.3],  size: 1, alpha: 0.5, from: "top" },
      entrance:  { color: "#8a94a8", every: 12, vx: [-0.15, 0.1], vy: [0.08, 0.2], size: 1, alpha: 0.4, from: "top" },
      yard:      { color: "#7a9a4d", every: 14, vx: [-0.8, -0.3], vy: [0.15, 0.4], size: 2, alpha: 0.6, from: "right" },
      house:     { color: "#e87d4a", every: 8,  vx: [-0.1, 0.2],  vy: [-0.7, -0.3], size: 2, alpha: 0.7, from: "bottom" },
      district:  { color: "#aab4c8", every: 10, vx: [-0.45, -0.1], vy: [0.2, 0.45], size: 2, alpha: 0.55, from: "top" },
    };
    let lastAmbientTick = -1;
    function spawnAmbient(t, zoneId) {
      const cfg = AMBIENT[zoneId];
      if (!cfg) return;
      const tick = Math.floor(t);
      if (tick === lastAmbientTick || tick % cfg.every !== 0) return;
      lastAmbientTick = tick;
      if (ambient.length > 40) return;
      const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
      ambient.push({
        x: cfg.from === "right" ? W + 4 : Math.random() * W,
        y: cfg.from === "bottom" ? H + 4 : cfg.from === "right" ? 40 + Math.random() * 160 : -4 + Math.random() * 40,
        vx: rnd(cfg.vx), vy: rnd(cfg.vy),
        color: cfg.color, size: cfg.size, alpha: cfg.alpha,
        life: 150 + Math.random() * 90, wob: Math.random() * Math.PI * 2,
      });
    }
    function drawAmbient(t) {
      for (let i = ambient.length - 1; i >= 0; i--) {
        const p = ambient[i];
        p.x += p.vx + Math.sin(t / 14 + p.wob) * 0.15;
        p.y += p.vy;
        p.life--;
        if (p.life <= 0 || p.x < -8 || p.y > H + 8 || p.y < -8) { ambient.splice(i, 1); continue; }
        ctx.globalAlpha = p.alpha * Math.min(1, p.life / 40);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    /* Поза оружия (v4.9): у героя теперь детализированные спрайты с реальным
       оружием в руках (hero_<fam>.png), иконки — только фолбэк. muzX/muzY —
       смещение дула от (HERO_X, земля) на спрайте (замерено по кадру,
       hh=80): вспышка/трассер/дым вылетают из настоящего дула. */
    const WEAPON_POSE = {
      knife: { len: 26, gripX: 0.15, gripY: 0.78, mirror: false, rotOff: 0.6,  muzX: 0,  muzY: 0 },
      bat:   { len: 44, gripX: 0.18, gripY: 0.82, mirror: false, rotOff: 0.7,  muzX: 0,  muzY: 0 },
      gun:   { len: 30, gripX: 0.65, gripY: 0.75, mirror: true,  rotOff: 0.0,  muzX: 25, muzY: -65 },
      rifle: { len: 48, gripX: 0.38, gripY: 0.62, mirror: false, rotOff: 0.55, muzX: 27, muzY: -63 },
    };

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
      if (artReady(bgArt)) {
        ctx.drawImage(bgArt, 0, 0, W, H);
        // v4.6: ночь на арт-фоне — холодное затемнение (раньше день/ночь
        // работало только на кодовых фонах)
        if (night) {
          ctx.fillStyle = "rgba(8,12,38,0.38)";
          ctx.fillRect(0, 0, W, H);
        }
        return;
      }
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
      const zoneId = state.activeZone || "apartment";
      const gy = groundY(zoneId);
      const x = HERO_X + lunge + hurtShake, y = gy;
      const dead = game.combat.phase === "knockout";
      // v4.7: падение при нокауте (крен назад ~0.35 с), вставание после (~0.4 с)
      let fallTilt = 0;
      if (dead) fallTilt = -1.35 * easeOut(Math.min((lastT - knockoutAt) / 7, 1));
      else if (lastT - reviveAt < 8) fallTilt = -1.35 * (1 - easeOut((lastT - reviveAt) / 8));
      const alpha = dead ? 0.85 : 1;

      // спрайт героя; v4.9: детализированный спрайт под надетое оружие
      // (hero_<fam>.png). v4.10: во время атаки — настоящий атакующий кадр
      // (hero_<fam>_atk.png). Фолбэк: hero_hands + иконка оружия, затем hero.png.
      const wSprite = ART["heroW_" + fam];
      const hasWSprite = !!state.equipment.weapon && artReady(wSprite);
      const atkSprite = atkP <= 1 && hasWSprite && artReady(ART["heroWA_" + fam]) ? ART["heroWA_" + fam] : null;
      const heroArt = atkSprite || (hasWSprite ? wSprite : artReady(ART.heroHands) ? ART.heroHands : artReady(ART.hero) ? ART.hero : null);
      if (heroArt) {
        // дыхание: лёгкое масштабирование, якорь — ноги на земле
        const breath = 1 + 0.012 * Math.sin(t / 10);
        const hh = 80 * breath;
        const hw = hh * (heroArt.naturalWidth / heroArt.naturalHeight); // пропорции спрайта
        // v4.10: обрезка пустой полосы под спрайтом — ботинки точно на земле
        const hTrim = atkSprite ? (HERO_TRIM[fam + "_atk"] || 0) : hasWSprite ? (HERO_TRIM[fam] || 0) : 0;
        const dyTop = -hh * (1 - hTrim);
        // наклон корпуса — только когда нет атакующего кадра (фолбэк-анимация)
        const atkTilt = !atkSprite && hasWSprite && atkP <= 1 ? swing(atkP) * (isGun ? -0.06 : fam === "bat" ? 0.16 : 0.12) : 0;
        const tilt = fallTilt + atkTilt;
        ctx.globalAlpha = alpha;
        if (tilt !== 0) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(tilt);
          ctx.drawImage(heroArt, -hw / 2, dyTop, hw, hh);
          ctx.restore();
        } else {
          ctx.drawImage(heroArt, x - hw / 2, y + dyTop, hw, hh);
        }
        ctx.globalAlpha = 1;

        // фолбэк: на спрайте БЕЗ оружия рисуем иконку — якорь по рукояти (v4.8)
        const wpn = state.equipment.weapon;
        const pose = WEAPON_POSE[fam];
        const wArt = !hasWSprite && wpn && Math.abs(fallTilt) < 0.05 && artReady(ART["w_" + fam]) ? ART["w_" + fam] : null;
        if (wArt) {
          const hx = x + 10, hy = y - 38;
          let rot, recoil = 0;
          if (isGun) {
            rot = atkP <= 1 ? 0 : Math.sin(t / 16) * 0.02; // ствол ровно, лёгкое дыхание
            if (atkP <= 1) recoil = swing(atkP) * 6; // отдача назад
          } else if (atkP <= 1) {
            // взмах: из-за плеча вперёд-вниз, с ускорением
            rot = (fam === "bat" ? -1.6 : -1.2) + easeOut(atkP) * (fam === "bat" ? 2.1 : 1.7);
          } else {
            // idle: оружие наготове (бита на плече), покачивание
            rot = (fam === "bat" ? -0.9 : -0.5) + Math.sin(t / 16) * 0.06;
          }
          const len = pose.len;
          const hgt = len / (wArt.naturalWidth / wArt.naturalHeight);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(hx - recoil, hy);
          ctx.rotate(pose.rotOff + rot);
          if (pose.mirror) ctx.scale(-1, 1);
          ctx.drawImage(wArt, -pose.gripX * len, -pose.gripY * hgt, len, hgt);
          ctx.restore();
        }

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
      // появление: въезжает справа за 0.4 с (босс — 0.8 с и издалека); атака: наскок к герою 0.4 с
      const isBoss = e.kind === "boss";
      const spawnP = (lastT - enemySpawnAt) / (isBoss ? 16 : 8);
      const atkP = (lastT - enemyAtkAt) / 8;
      const slideIn = spawnP <= 1 ? (1 - easeOut(spawnP)) * (isBoss ? 110 : 70) : 0;
      const lunge = atkP <= 1 ? swing(atkP) * 20 : 0;
      const zoneIdE = state.activeZone || "apartment";
      const gy = groundY(zoneIdE);
      const x = ENEMY_X + slideIn - lunge, y = gy;
      const shake = enemyAnimHit > 0 ? (Math.random() - 0.5) * 3 : 0;
      const bob = Math.sin(t / 7 + 2) * 2;
      const spawnAlpha = spawnP <= 1 ? 0.3 + 0.7 * spawnP : 1;
      ctx.globalAlpha = spawnAlpha;

      // v4.1: золотая волна — пульсирующая аура «особой находки»
      if (game.combat.golden) {
        const pulse = 0.55 + 0.25 * Math.sin(t / 4);
        const gr = ctx.createRadialGradient(x + shake, gy - 40, 6, x + shake, gy - 40, 78);
        gr.addColorStop(0, "rgba(255, 214, 90, " + (0.50 * pulse).toFixed(3) + ")");
        gr.addColorStop(0.6, "rgba(255, 180, 60, " + (0.22 * pulse).toFixed(3) + ")");
        gr.addColorStop(1, "rgba(255, 180, 60, 0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(x + shake, gy - 40, 78, 0, Math.PI * 2);
        ctx.fill();
        // золотые искры вокруг
        ctx.fillStyle = "rgba(255, 220, 110, " + (0.8 * pulse).toFixed(3) + ")";
        for (let i = 0; i < 5; i++) {
          const a = t / 9 + i * 1.26;
          ctx.fillRect(x + shake + Math.cos(a) * 44, gy - 40 + Math.sin(a * 1.3) * 34, 3, 3);
        }
      }

      // спрайт врага зоны (v4.6: земля по зоне, обрезка пустоты спрайта,
      // idle-анимации по типу, антисипация атаки, вспышка при попадании)
      // v4.12: во время атаки — настоящий атакующий кадр вместо наскока
      const key = zoneIdE + "_" + (e.kind === "boss" ? "boss" : "grunt");
      const atkArt = atkP <= 1 ? ART[key + "_atk"] : null;
      const hasAtkArt = !!(atkArt && artReady(atkArt));
      const eArt = hasAtkArt ? atkArt : enemyArt(zoneIdE, e.kind);
      if (eArt) {
        const h = e.kind === "boss" ? 118 : e.kind === "elite" ? 92 : 70;
        const w = Math.round(h * (eArt.naturalWidth / eArt.naturalHeight));
        const trim = (hasAtkArt ? SPRITE_TRIM_ATK[key] : SPRITE_TRIM[key]) || 0;
        const fly = SPRITE_FLY[key] || 0;
        // антисипация/растяжка — только когда нет атакующего кадра
        const antic = !hasAtkArt && atkP <= 0.35 ? swing(atkP / 0.35) : 0;
        const stretch = !hasAtkArt && atkP > 0.35 && atkP <= 1 ? swing((atkP - 0.35) / 0.65) : 0;
        // idle: грунт переступает, элита пульсирует, босс дышит, летающие парят
        const idleBob = fly ? Math.sin(t / 9) * 3
          : e.kind === "grunt" ? -Math.abs(Math.sin(t / 6)) * 2 : 0;
        const pulse = e.kind === "elite" ? 1 + 0.035 * Math.sin(t / 4)
          : e.kind === "boss" ? 1 + 0.015 * Math.sin(t / 8) : 1;
        const sway = e.kind === "grunt" && !fly ? Math.sin(t / 6) * 0.04 : 0;
        const scaleY = pulse * (1 - antic * 0.12 + stretch * 0.06);
        const scaleX = pulse * (1 + antic * 0.08 - stretch * 0.04);
        // низ контента спрайта — на земле (летающие — над землёй)
        const bottomY = fly ? gy - fly + idleBob : gy + idleBob;
        ctx.save();
        if (enemyAnimHit > 0) ctx.filter = "brightness(2.2) saturate(1.6)";
        ctx.translate(x + shake, bottomY);
        ctx.rotate(sway);
        ctx.scale(scaleX, scaleY);
        ctx.drawImage(eArt, -w / 2, -h * (1 - trim), w, h);
        ctx.restore();
        ctx.filter = "none";
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
      const c = P.waveCycle(state.zones[zdef.id].wave, zdef.wavesCap, P.cyclesOn(state));
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
      const gy = groundY(dyingEnemy.zoneId || state.activeZone || "apartment");
      const alpha = 1 - p;
      const drop = p * p * 26;
      const tilt = p * 0.5; // радианы крена
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, gy - h / 2 + drop);
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
      // v4.7 hit-stop: на крите частицы/флоутеры замирают на пару кадров —
      // микропауза читается как вес удара
      const frozen = lastT < hitStopUntil;
      // трассеры выстрелов
      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        if (!frozen) tr.life--;
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
        if (!frozen) { p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; }
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
        if (!frozen) { f.y -= 0.7; f.life--; }
        if (f.life <= 0) { floaters.splice(i, 1); continue; }
        ctx.globalAlpha = Math.min(1, f.life / 25);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      for (let i = flashes.length - 1; i >= 0; i--) {
        const fl = flashes[i];
        if (!frozen) fl.life--;
        if (fl.life <= 0) { flashes.splice(i, 1); continue; }
        ctx.globalAlpha = fl.life / 8;
        ctx.fillStyle = "#ffe87d";
        ctx.fillRect(fl.x - 3, fl.y - 3, 7, 7);
      }
      ctx.globalAlpha = 1;
      // v4.7: белая вспышка на весь экран (смерть босса)
      if (screenFlash) {
        screenFlash.life--;
        if (screenFlash.life <= 0) screenFlash = null;
        else {
          ctx.globalAlpha = (screenFlash.life / screenFlash.max) * 0.5;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, W, H);
          ctx.globalAlpha = 1;
        }
      }
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
        // v4.11: экран загрузки, пока арты не приехали (хард-рефреш)
        if (artLoaded < artTotal) {
          ctx.fillStyle = "#0d1220";
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = PAL.text;
          ctx.font = "14px monospace";
          ctx.textAlign = "center";
          ctx.fillText("ПОСЛЕДНИЙ ПОДЪЕЗД", W / 2, H / 2 - 24);
          const bw = 240, bx = (W - bw) / 2, by = H / 2;
          const pct = artTotal ? artLoaded / artTotal : 1;
          ctx.strokeStyle = "#3a3450";
          ctx.strokeRect(bx - 0.5, by - 0.5, bw + 1, 9);
          ctx.fillStyle = "#5ee87d";
          ctx.fillRect(bx, by, Math.round(bw * pct), 8);
          ctx.fillStyle = "#8a94a8";
          ctx.font = "9px monospace";
          ctx.fillText("загрузка " + artLoaded + "/" + artTotal, W / 2, by + 24);
          return;
        }
        // v4.7: переходы фаз — падение/воскрешение героя
        const ph = game.combat.phase;
        if (ph === "knockout" && prevPhase !== "knockout") {
          knockoutAt = t;
          shake(5);
          spawnParticles(HERO_X, groundY(state.activeZone || "apartment") - 30, "#e85e5e", 8, 1.2);
        } else if (ph !== "knockout" && prevPhase === "knockout") {
          reviveAt = t;
        }
        prevPhase = ph;
        // тряска экрана (крит / смерть босса): сдвиг всей сцены, статус не трясём
        const shakeP = (t - shakeAt) / 5;
        const shaking = shakeP <= 1;
        if (shaking) {
          ctx.save();
          const m = shakeMag * (1 - shakeP);
          ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
        }
        drawRoom(t);
        spawnAmbient(t, state.activeZone);
        drawAmbient(t);
        drawHero(t);
        drawEnemy(t);
        drawFloatersAndFlashes();
        if (shaking) ctx.restore();
        drawStatus(t);
        // v4.6: виньетка низкого HP — красный пульс по краям
        const hpLow = state.hero.hp / P.calcHero(state).hpMax;
        if (hpLow < 0.3) {
          const vp = 0.22 + 0.14 * Math.sin(t / 6);
          const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
          vg.addColorStop(0, "rgba(232,94,94,0)");
          vg.addColorStop(1, "rgba(232,94,94," + vp.toFixed(3) + ")");
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, W, H);
        }
        if (enemyAnimHit > 0) enemyAnimHit--;
        lastTickHadEnemy = !!(game.combat.phase === "fight" && game.combat.enemy);
      },
      /* реальный удар героя: урон по врагу + анимация по семейству оружия */
      heroHit(ev) {
        const gy = groundY(state.activeZone || "apartment");
        const dmg = Math.max(1, Math.round(ev.dmg));
        addFloater(ENEMY_X + (Math.random() - 0.5) * 20, gy - 80, "-" + dmg, ev.crit ? "#ffe87d" : "#e8e4f0");
        const fam = P.weaponFamily(state.equipment.weapon) || "knife";
        if (fam === "gun" || fam === "rifle") {
          // выстрел: вспышка у дула + трассер до врага + гильза (v4.6) + дым (v4.7)
          // v4.8: дуло — из WEAPON_POSE (точка хвата + выравнивание иконки)
          const pose = WEAPON_POSE[fam];
          const mx = HERO_X + pose.muzX, my = gy + pose.muzY;
          flashes.push({ x: mx, y: my, life: fam === "rifle" ? 10 : 8 });
          tracers.push({ x1: mx + 2, y1: my, x2: ENEMY_X - 20, y2: gy - 52, life: 4 });
          particles.push({
            x: HERO_X + 18, y: gy - 40,
            vx: -(0.8 + Math.random() * 0.6), vy: -(1.6 + Math.random() * 0.8),
            color: "#d8a84e", life: 22,
          });
          for (let s = 0; s < 2; s++) {
            particles.push({
              x: mx, y: my - 4,
              vx: 0.2 + Math.random() * 0.2, vy: -(0.3 + Math.random() * 0.2),
              color: "#9aa2b0", life: 30,
            });
          }
        }
        // искры при попадании; крит — больше, с тряской экрана и хит-стопом (v4.7)
        spawnParticles(ENEMY_X - 10, gy - 60, ev.crit ? "#ffe87d" : "#c0c8d8", ev.crit ? 9 : 4, ev.crit ? 1.6 : 1);
        if (ev.crit) {
          shake(4);
          hitStopUntil = lastT + 2;
          addFloater(ENEMY_X, gy - 100, "КРИТ!", "#ffe87d");
        }
        heroAtkAt = lastT;
        enemyAnimHit = 4;
      },
      /* реальный удар врага: красный урон над героем + наскок врага + откат героя */
      enemyHit(ev) {
        const gy = groundY(state.activeZone || "apartment");
        const dmg = Math.max(1, Math.round(ev.dmg));
        addFloater(HERO_X + (Math.random() - 0.5) * 16, gy - 96, "-" + dmg, "#e85e5e");
        spawnParticles(HERO_X + 8, gy - 60, "#e85e5e", 3, 0.8);
        enemyAtkAt = lastT;
        heroHurtAt = lastT;
      },
      /* враг появился — анимация въезда справа; босс — интро с объявлением (v4.7) */
      waveStart(ev) {
        enemySpawnAt = lastT;
        if (ev && ev.enemy && ev.enemy.kind === "boss") {
          shake(4);
          addFloater(ENEMY_X, groundY(state.activeZone || "apartment") - 130, "☠ БОСС: " + ev.enemy.name, "#e85e5e");
        }
      },
      /* враг убит — взрыв частиц + падение; босс — тряска экрана и белая вспышка */
      waveWin(ev) {
        const gy = groundY(ev.zoneId || state.activeZone || "apartment");
        const kind = ev.enemy ? ev.enemy.kind : "grunt";
        dyingEnemy = { kind, zoneId: ev.zoneId || state.activeZone, h: kind === "boss" ? 118 : kind === "elite" ? 92 : 70, at: lastT };
        const col = kind === "boss" ? "#c0c8d8" : kind === "elite" ? "#9a5ad0" : "#7a9a4d";
        spawnParticles(ENEMY_X, gy - 50, col, kind === "boss" ? 20 : 12, 1.8);
        if (kind === "boss") { shake(6); screenFlash = { life: 6, max: 6 }; }
      },
      addFloater,
    };
    return view;
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
