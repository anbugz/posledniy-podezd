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
    });

    const canvas = document.getElementById("battle");
    const battleView = P.initBattleView(game, canvas);
    const panel = P.initPanel(game, battleView);

    panel.refresh();
    if (loaded.report) panel.showOffline(loaded.report);

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
    window.addEventListener("beforeunload", () => P.save(state));

    // главный цикл: фиксированный шаг 50 мс
    let last = performance.now();
    let acc = 0;
    const STEP = 0.05;
    function loop(now) {
      acc += Math.min((now - last) / 1000, 0.5);
      last = now;
      while (acc >= STEP) {
        game.update(STEP);
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
