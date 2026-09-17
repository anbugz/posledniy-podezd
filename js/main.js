/* «Последний подъезд» — main: инициализация и главный цикл (только браузер). */
(function (P) {
  "use strict";

  function init() {
    const loaded = P.load();
    const state = loaded.state;

    const game = P.createGame(state, {
      onKnockout() {
        panel && panel.refresh();
      },
      onZoneClear() {
        panel && panel.refresh();
      },
    });

    const canvas = document.getElementById("battle");
    const battleView = P.initBattleView(game, canvas);
    const panel = P.initPanel(game, battleView);

    panel.refresh();
    if (loaded.report) panel.showOffline(loaded.report);

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
