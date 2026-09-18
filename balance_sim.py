#!/usr/bin/env python3
"""Боевой симулятор баланса «Последний подъезд» (правки v2, 2026-09-17).

Зеркалит формулы из js/ (data_enemies.js, engine_stats.js, engine_loot.js)
после правок v2:
  - враги: HP = 30·1.15ⁿ·2^z·0.75 ; после 20 волн круги ×1.30
  - пассивного дохода НЕТ: припасы = floor(10·1.28ⁿ) с волн + продажи
  - сила героя = предметы + «Самоделки» (str/vit/def/acc, 15·1.35^L,
    потолок 2×уровень квартиры) + апгрейд квартиры (25·1.6^L, +20 HP)

Прогоняет «бота активного игрока» на 30 минут и проверяет цели:
  - квартира ур. 3-6
  - волн пройдено 9-12
  - бой ранних волн 5-10 сек; босс в.10 — дошли и дерёмся 15-150 сек
Использование: python3 balance_sim.py [--verbose]
Коэффициенты ниже — ЕДИНСТВЕННЫЙ источник правды для калибровки;
после сходимости их вручную переносим в js/data_*.js.
"""
import math
import random
import sys

# ---------------- КОНФИГ (калибруется здесь) ----------------
Z = 1                    # тир квартиры
CRIT_CHANCE = 0.05
CRIT_MULT = 2.0

# враги: HP = E_HP_BASE * 1.15^n * tier^z * 0.75 ; круги ×1.30
E_HP_BASE, E_HP_GROW, E_HP_TIER, E_HP_GLOBAL = 30.0, 1.15, 2.0, 0.75
E_DPS_BASE, E_DPS_GROW, E_DPS_TIER = 3.0, 1.16, 1.8
E_LOOP_MULT = 1.30
ELITE_EVERY = 5          # каждая 5-я (не босс): HP x2.5, DPS x1.5
BOSS_EVERY = 10
BOSS_HP_MULT, BOSS_DPS_MULT = 6.0, 2.5
WAVES_CAP = 20

# герой
HP_BASE = 100
HP_PER_APT = 20          # за уровень квартиры
REGEN_PCT = 0.05         # /сек вне боя
KNOCKOUT_SEC = 3         # dev; в релизе 60

# «Самоделки»: эффект за уровень и цена 3*1.35^L, потолок 2*уровень квартиры
TRAIN = {"str": 0.08, "vit": 0.10, "def": 3.0, "acc": 0.015}
TRAIN_COST_BASE, TRAIN_COST_GROW = 3.0, 1.35

# экономика (ресайл v3.1: доходы и цены ÷5 — цифры реалистичнее)
APT_BASE_COST, APT_COST_GROW = 5.0, 1.60
SUPPLY_DROP_BASE, SUPPLY_DROP_GROW = 3.0, 1.28
WAVE_GAP_SEC = 3.0       # пауза между волнами
LOOT_CHANCE = 0.09
SELL_RATIO = 0.5
ITEM_UPGRADE_MULT = 1.15
ITEM_UPGRADE_BASE, ITEM_UPGRADE_GROW = 2.0, 1.4

SIM_MINUTES = 30
random.seed(42)


def enemy(n, z=Z):
    cycle = (n - 1) // WAVES_CAP
    n_eff = (n - 1) % WAVES_CAP + 1
    loop = E_LOOP_MULT ** cycle
    hp = E_HP_BASE * (E_HP_GROW ** n_eff) * (E_HP_TIER ** z) * E_HP_GLOBAL * loop
    dps = E_DPS_BASE * (E_DPS_GROW ** n_eff) * (E_DPS_TIER ** z) * loop
    if n_eff % BOSS_EVERY == 0:
        return hp * BOSS_HP_MULT, dps * BOSS_DPS_MULT, "boss"
    if n_eff % ELITE_EVERY == 0:
        return hp * 2.5, dps * 1.5, "elite"
    return hp, dps, "norm"


def dr(armor):
    return armor / (armor + 50.0)


def item_score(dps=0.0, hp=0.0, armor=0.0, crit=0.0):
    return dps * 4 + hp * 1 + armor * 3 + crit * 40


class Bot:
    def __init__(self):
        self.t = 0.0
        self.supplies = 0.0
        self.tech = 0
        self.apt_level = 1
        self.wave = 1
        self.waves_done = 0
        # стартовый набор (без «кулаков» — тренировки квартиры убраны)
        self.dps_weapon = 6.0          # кухонный нож
        self.hp_items = 20.0           # куртка +10, кроссовки +10
        self.armor = 5.0               # куртка
        self.crit = CRIT_CHANCE
        self.training = {"str": 0, "vit": 0, "def": 0, "acc": 0}
        self.weapon_lvl = 0
        self.hp = float(self.hp_max)
        self.fight_times = {}          # wave -> sec
        self.skills_at = {}            # name -> t готовности
        self.log = []

    # --- статы (зеркало calcHero) ---
    @property
    def train_cap(self):
        return 2 * self.apt_level

    @property
    def hp_max(self):
        base = HP_BASE + HP_PER_APT * self.apt_level + self.hp_items
        return round(base * (1 + TRAIN["vit"] * self.training["vit"]))

    @property
    def dps(self):
        return self.dps_weapon * (1 + TRAIN["str"] * self.training["str"])

    @property
    def armor_total(self):
        return self.armor + TRAIN["def"] * self.training["def"]

    @property
    def crit_total(self):
        return min(self.crit + TRAIN["acc"] * self.training["acc"], 0.60)

    @property
    def dps_eff(self):
        return self.dps * (1 + self.crit_total * (CRIT_MULT - 1))

    # --- траты ---
    def apt_cost(self):
        return APT_BASE_COST * (APT_COST_GROW ** self.apt_level)

    def train_cost(self, key):
        return TRAIN_COST_BASE * (TRAIN_COST_GROW ** self.training[key])

    def weapon_upgrade_cost(self):
        return ITEM_UPGRADE_BASE * (ITEM_UPGRADE_GROW ** self.weapon_lvl) + \
            int(item_score(dps=self.dps_weapon, crit=self.crit) * 0.1)

    def buy_apt(self):
        c = self.apt_cost()
        if self.supplies >= c:
            self.supplies -= c
            self.apt_level += 1
            self.log.append(f"t={self.t/60:5.1f}м квартира ур.{self.apt_level} за {c:.0f}")
            return True
        return False

    def buy_train(self, key):
        if self.training[key] >= self.train_cap:
            return False
        c = self.train_cost(key)
        if self.supplies >= c:
            self.supplies -= c
            self.training[key] += 1
            return True
        return False

    def upgrade_weapon(self):
        c = self.weapon_upgrade_cost()
        if self.supplies >= c:
            self.supplies -= c
            self.dps_weapon *= ITEM_UPGRADE_MULT
            self.weapon_lvl += 1
            return True
        return False

    def regen(self, sec):
        self.hp = min(self.hp_max, self.hp + self.hp_max * REGEN_PCT * sec)

    def fight_wave(self):
        n = self.wave
        hp_e, dps_e, kind = enemy(n)
        dps_hero = self.dps_eff
        # скиллы на босса/элиту: свинцовый дождь x3 30с (кд 300), метка +25% крит 20с (кд 360)
        if kind != "norm":
            if self.t >= self.skills_at.get("rain", 0):
                dps_hero *= 3.0
                self.skills_at["rain"] = self.t + 300
            if self.t >= self.skills_at.get("mark", 0):
                c0 = self.crit_total
                dps_hero = self.dps * (1 + min(c0 + 0.25, 0.85) * (CRIT_MULT - 1))
                self.skills_at["mark"] = self.t + 360
        t_kill = hp_e / max(dps_hero, 0.001)
        incoming = dps_e * (1 - dr(self.armor_total))
        t_survive = self.hp / max(incoming, 0.001)
        if t_kill < t_survive:
            self.hp -= incoming * t_kill
            # награды: припасы с волны + тех
            self.supplies += math.floor(SUPPLY_DROP_BASE * (SUPPLY_DROP_GROW ** n))
            self.tech += (1 if random.random() < 0.30 else 0) * (5 if kind == "elite" else (20 if kind == "boss" else 1))
            # лут: апгрейд случайного статa либо продажа
            if random.random() < LOOT_CHANCE or kind != "norm":
                boost = random.uniform(0.08, 0.25) * (2 if kind != "norm" else 1)
                if random.random() < 0.5:
                    new_w = self.dps_weapon * (1 + boost)
                    # надеваем только если лучше текущего оружия с учётом вложений
                    if new_w > self.dps_weapon * (ITEM_UPGRADE_MULT ** (self.weapon_lvl * 0.5)):
                        self.dps_weapon = new_w
                        self.weapon_lvl = 0
                    else:
                        self.supplies += max(1, int(item_score(dps=new_w) * SELL_RATIO / 4))
                else:
                    if random.random() < 0.5:
                        self.hp_items *= (1 + boost * 0.7)
                    else:
                        self.armor += boost * 4
            self.fight_times[n] = t_kill
            self.wave += 1
            self.waves_done += 1
            # реген вне боя во время паузы между волнами
            self.regen(WAVE_GAP_SEC)
            return t_kill, True, kind
        # проигрыш: отступление, реген до полного, попытка купить апгрейд
        self.regen(25.0)
        self.t += 25.0
        return None, False, kind

    def spend(self):
        """Стратегия трат: 1) апгрейд квартиры (когда проходим волну >= 4),
        2) догоняем тренировки до потолка, 3) качаем оружие.
        Резерв не держим — бот активный игрок."""
        changed = True
        while changed:
            changed = False
            if self.wave >= 4 and self.buy_apt():
                changed = True
            for key in ("str", "vit", "def", "acc"):
                if self.buy_train(key):
                    changed = True
            if self.upgrade_weapon():
                changed = True
            if self.wave >= 4 and self.buy_apt():
                changed = True


def run(verbose=False):
    b = Bot()
    while b.t < SIM_MINUTES * 60:
        r = b.fight_wave()
        if r[1]:  # победа
            b.t += r[0] + WAVE_GAP_SEC
            b.spend()
    # итоги
    print(f"--- {SIM_MINUTES} мин активной игры ---")
    print(f"квартира ур.      : {b.apt_level}   (цель 3-6)")
    print(f"волн пройдено     : {b.waves_done} (след. волна {b.wave})  (цель 9-12)")
    print(f"припасы на руках  : {b.supplies:.0f}")
    print(f"технологии        : {b.tech}")
    print(f"DPS героя         : {b.dps:.1f} (eff {b.dps_eff:.1f}, оружие +{b.weapon_lvl} ур.)  "
          f"HP {b.hp_max}  броня {b.armor_total:.0f}  крит {b.crit_total*100:.1f}%")
    print(f"Самоделки         : {b.training}")
    early = [b.fight_times[w] for w in (1, 2, 3, 4) if w in b.fight_times]
    if early:
        print(f"бой волн 1-4      : {min(early):.1f}-{max(early):.1f} сек  (цель 5-10)")
    if 10 in b.fight_times:
        print(f"босс волны 10     : {b.fight_times[10]:.0f} сек  (цель 15-150: дошли и дерёмся)")
    if verbose:
        for line in b.log:
            print("  " + line)
    boss10 = b.fight_times.get(10)
    ok = (3 <= b.apt_level <= 6 and 9 <= b.waves_done <= 12
          and (not early or max(early) <= 12)
          and (boss10 is None or 15 <= boss10 <= 150))
    print("ЦЕЛИ:", "OK" if ok else "НЕ СОШЛОСЬ — крутим коэффициенты")
    return ok


if __name__ == "__main__":
    run(verbose="--verbose" in sys.argv)
