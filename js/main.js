/* «Последний подъезд» — main: инициализация и главный цикл (только браузер). */
(function (P) {
  "use strict";

  function init() {
    const loaded = P.load();
    const state = loaded.state;

    const game = P.createGame(state, {
      onWaveWin(ev) {
        if (panel) {
          const hero = P.calcHero(state);
          const sup = Math.floor(P.waveSupplies(ev.wave) * hero.supMult);
          battleView.addFloater(350, 150, "+" + sup + " 🥫", "#5ee87d");
          battleView.waveWin(ev);
          panel.refresh();
        }
      },
      onKnockout() {
        panel && panel.refresh();
      },
      onZoneClear() {
        panel && panel.refresh();
        panel && panel.renderBase();
      },
      onEvent(ev) {
        // реальные события боя -> анимации и всплывающие цифры
        if (!battleView) return;
        if (ev.type === "heroHit") battleView.heroHit(ev);
        else if (ev.type === "enemyHit") battleView.enemyHit(ev);
        else if (ev.type === "waveStart") battleView.waveStart(ev);
      },
    });

    const canvas = document.getElementById("battle");
    const battleView = P.initBattleView(game, canvas);
    const panel = P.initPanel(game, battleView);
    window.__game = game; // dev: доступ к состоянию из консоли

    panel.refresh();
    if (loaded.report) panel.showOffline(loaded.report);

    // экран «Прогресс сброшен» после перезагрузки по кнопке сброса
    try {
      if (sessionStorage.getItem("podezd_reset_flash")) {
        sessionStorage.removeItem("podezd_reset_flash");
        const rs = document.getElementById("reset-screen");
        if (rs) {
          rs.classList.add("visible");
          const hide = () => rs.classList.remove("visible");
          document.getElementById("reset-ok").addEventListener("click", hide);
          rs.addEventListener("click", (e) => { if (e.target === rs) hide(); });
          setTimeout(hide, 4000);
        }
      }
    } catch (e) {}

    // dev: ?ff=СЕКУНДЫ — синхронный fast-forward до первого кадра (снимки/проверки)
    // dev: ?screen=base — открыть экран Базы; ?modal=inv|char — открыть модалку
    if (typeof location !== "undefined") {
      const m = /[?&]ff=(\d+)/.exec(location.search);
      if (m) {
        const steps = Math.min(parseInt(m[1], 10), 3600) / 0.05;
        for (let i = 0; i < steps; i++) game.update(0.05);
        panel.refresh();
      }
      if (/[?&]screen=base/.test(location.search)) {
        panel.renderBase();
        panel.showScreen("base");
      }
      const mm = /[?&]modal=(inv|char)/.exec(location.search);
      if (mm) (mm[1] === "inv" ? document.getElementById("openInv") : document.getElementById("openChar")).click();
      const sm = /[?&]sel=(\d+)/.exec(location.search);
      if (sm) {
        const tiles = document.querySelectorAll(".item-tile");
        const t = tiles[Math.min(parseInt(sm[1], 10), tiles.length - 1)];
        if (t) t.click();
      }
    }

    // автосейв
    setInterval(() => {
      P.save(state);
      panel.flashSaved();
    }, 15000);
    window.addEventListener("beforeunload", () => {
      if (!window.__podezdReset) P.save(state);
    });

    // сброс прогресса: чистим сейв и перезагружаемся без beforeunload-сейва
    const resetBtn = document.getElementById("resetSave");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (!confirm("Сбросить весь прогресс и начать заново?")) return;
        if (!confirm("Точно? Восстановить сохранение будет нельзя.")) return;
        window.__podezdReset = true;
        P.storage.removeItem(P.SAVE_KEY);
        for (const k of P.OLD_SAVE_KEYS || []) P.storage.removeItem(k);
        try { sessionStorage.setItem("podezd_reset_flash", "1"); } catch (e) {}
        location.reload();
      });
    }

    // главный цикл: фиксированный шаг 50 мс
    let last = performance.now();
    let acc = 0;
    const STEP = 0.05;
    function loop(now) {
      acc += Math.min((now - last) / 1000, 0.5);
      last = now;
      while (acc >= STEP) {
        if (panel.isBaseOpen()) {
          // «Возврат» на базе: бой, день/ночь и кулдауны стоят,
          // HP регенится (как вне боя, 5%/сек)
          const hero = P.calcHero(state);
          state.hero.hp = Math.min(hero.hpMax, state.hero.hp + hero.hpMax * 0.05 * STEP);
        } else {
          game.update(STEP);
        }
        acc -= STEP;
      }
      battleView.render(now / 50);
      panel.tick();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("DOMContentLoaded", init);
  }
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
