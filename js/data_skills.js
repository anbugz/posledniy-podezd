/* «Последний подъезд» — data: навыки, день/ночь, события. */
(function (P) {
  "use strict";

  P.SKILLS = {
    rain: {
      id: "rain", name: "Свинцовый дождь",
      desc: "×3 к DPS на 30 секунд",
      duration: 30, cooldown: 300, kind: "dpsMult", value: 3,
    },
    aid: {
      id: "aid", name: "Аптечка Палыча",
      desc: "+40% HP мгновенно",
      duration: 0, cooldown: 240, kind: "heal", value: 0.4,
    },
    mark: {
      id: "mark", name: "Метка цели",
      desc: "+25 п.п. к криту на 20 секунд",
      duration: 20, cooldown: 360, kind: "critAdd", value: 0.25,
    },
    ult: {
      id: "ult", name: "Поддержка района",
      desc: "×5 ко всему DPS на 15 секунд",
      duration: 15, cooldown: 1200, kind: "dpsMult", value: 5,
      unlockWave: 10,
    },
  };

  P.DAY_NIGHT = {
    daySec: 180, nightSec: 120,
    night: { waveRate: 1.5, techChance: 2.0 },
  };

  P.EVENT = {
    id: "swarm", name: "МАССИРОВАННАЯ ВОЛНА",
    everySec: 600, durationSec: 30,
    waveDensity: 3, techChance: 3, rareLoot: 2, maxWaves: 3,
  };
})(typeof PODEZD !== "undefined" ? PODEZD : (global.PODEZD = {}));
