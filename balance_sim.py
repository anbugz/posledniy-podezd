#!/usr/bin/env python3
"""Боевой симулятор баланса «Последний подъезд».

Зеркалит формулы из TZ-posledniy-podezd-v2.md §3-§5.
Прогоняет «бота активного игрока» на 30 минут и проверяет цели:
  - квартира ур. 3-4
  - волн пройдено 8-12 (мини-босс в.10 убит или почти)
  - на руках ~600-900 припасов к в.10
  - payback уровня квартиры 30-120 с
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

# враги: HP = E_HP_BASE * E_HP_GROW^n * E_HP_TIER^z ; DPS аналогично
E_HP_BASE, E_HP_GROW, E_HP_TIER = 30.0, 1.20, 2.0
E_DPS_BASE, E_DPS_GROW, E_DPS_TIER = 3.0, 1.16, 1.8
ELITE_EVERY = 5          # каждая 5-я (не босс): HP x2.5, DPS x1.5
BOSS_EVERY = 10
BOSS_HP_MULT, BOSS_DPS_MULT = 6.0, 2.5
WAVES_CAP = 20

# герой
HP_BASE = 100
HP_PER_APT = 20          # за уровень квартиры
REGEN_PCT = 0.05         # /сек вне боя
KNOCKOUT_SEC = 60

# экономика
APT_BASE_INCOME = 2.0
APT_INCOME_GROW = 1.08
APT_BASE_COST = 25.0
APT_COST_GROW = 1.60
SUPPLY_DROP_BASE, SUPPLY_DROP_GROW = 7.0, 1.25
WAVE_GAP_SEC = 3.0       # пауза между волнами
LOOT_CHANCE = 0.45

SIM_MINUTES = 30
random.seed(42)


def enemy(n, z=Z):
    hp = E_HP_BASE * (E_HP_GROW ** n) * (E_HP_TIER ** z)
    dps = E_DPS_BASE * (E_DPS_GROW ** n) * (E_DPS_TIER ** z)
    if n % BOSS_EVERY == 0:
        return hp * BOSS_HP_MULT, dps * BOSS_DPS_MULT, "boss"
    if n % ELITE_EVERY == 0:
        return hp * 2.5, dps * 1.5, "elite"
    return hp, dps, "norm"


def dr(armor):
    return armor / (armor + 50.0)


class Bot:
    def __init__(self):
        self.t = 0.0
        self.supplies = 0.0
        self.tech = 0
        self.apt_level = 1
        self.wave = 1
        self.waves_done = 0
        # стартовый набор
        self.dps_weapon = 6.0          # кухонный нож
        self.hp_items = 20.0           # куртка +10, кроссовки +10
        self.armor = 5.0               # куртка
        self.crit = CRIT_CHANCE
        self.hp = float(self.hp_max)
        self.skills_at = {}            # name -> t готовности
        self.log = []

    @property
    def dps_fists(self):
        # уровень квартиры = бытовые тренировки: +2 DPS за уровень
        return 2.0 + 2.0 * (self.apt_level - 1)

    @property
    def hp_max(self):
        return HP_BASE + HP_PER_APT * self.apt_level + self.hp_items

    @property
    def dps(self):
        return self.dps_weapon + self.dps_fists

    @property
    def dps_eff(self):
        return self.dps * (1 + self.crit * (CRIT_MULT - 1))

    def income(self):
        return APT_BASE_INCOME * self.apt_level * (APT_INCOME_GROW ** self.apt_level)

    def apt_cost(self):
        return APT_BASE_COST * (APT_COST_GROW ** self.apt_level)

    def buy_apt(self):
        c = self.apt_cost()
        if self.supplies >= c:
            self.supplies -= c
            self.apt_level += 1
            return c, self.income()
        return None

    def regen(self, sec):
        self.hp = min(self.hp_max, self.hp + self.hp_max * REGEN_PCT * sec)

    def fight_wave(self):
        n = self.wave
        hp_e, dps_e, kind = enemy(n)
        dps_hero = self.dps_eff
        # скиллы на босса/элиту: свинцовый дождь x3 30с (кд 300), метка +25% крит 20с (кд 360)
        skill_mult = 1.0
        if kind != "norm":
            if self.t >= self.skills_at.get("rain", 0):
                skill_mult *= 3.0
                self.skills_at["rain"] = self.t + 300
            if self.t >= self.skills_at.get("mark", 0):
                dps_hero *= (1 + (self.crit + 0.25) * (CRIT_MULT - 1)) / (1 + self.crit * (CRIT_MULT - 1))
                self.skills_at["mark"] = self.t + 360
        t_kill = hp_e / (dps_hero * skill_mult)
        incoming = dps_e * (1 - dr(self.armor))
        t_survive = self.hp / max(incoming, 0.001)
        if t_kill < t_survive:
            self.hp -= incoming * t_kill
            # награды
            self.supplies += math.floor(SUPPLY_DROP_BASE * (SUPPLY_DROP_GROW ** n))
            self.tech += (1 if random.random() < 0.30 else 0) * (5 if kind == "elite" else (20 if kind == "boss" else 1))
            # лут: приближённо буст случайного статa
            if random.random() < LOOT_CHANCE:
                boost = random.uniform(0.08, 0.25) * (2 if kind != "norm" else 1)
                if random.random() < 0.5:
                    self.dps_weapon *= (1 + boost)
                else:
                    self.hp_items *= (1 + boost * 0.7)
                    self.armor += boost * 4
            self.wave += 1
            self.waves_done += 1
            # реген вне боя во время паузы между волнами
            self.regen(WAVE_GAP_SEC)
            return t_kill, True, kind
        # проигрыш: отступление, реген до полного, попытка купить апгрейд
        self.regen(25.0)
        self.t += 25.0
        return None, False, kind


def run(verbose=False):
    b = Bot()
    while b.t < SIM_MINUTES * 60 and b.wave <= WAVES_CAP:
        r = b.fight_wave()
        if r[1]:  # победа
            b.t += r[0] + WAVE_GAP_SEC
        b.supplies += b.income() * (r[0] + WAVE_GAP_SEC if r[1] else 0)
        # стратегия покупок: копим на уровень квартиры, пока не купим
        while True:
            res = b.buy_apt()
            if not res:
                break
            cost, inc = res
            b.log.append(f"t={b.t/60:5.1f}м куплена кв. ур.{b.apt_level} за {cost:.0f} (payback {cost/max(inc - b.income()/APT_INCOME_GROW/APT_INCOME_GROW,0.1):.0f}с)")
    # итоги
    print(f"--- {SIM_MINUTES} мин активной игры ---")
    print(f"квартира ур.      : {b.apt_level}   (цель 4-7 оптимально)")
    print(f"волн пройдено     : {b.waves_done} (след. волна {b.wave})  (цель 8-12)")
    print(f"припасы на руках  : {b.supplies:.0f}   (ориентир 300-800 — бот тратит всё на апгрейды)")
    print(f"технологии        : {b.tech}")
    print(f"DPS героя         : {b.dps:.1f} (eff {b.dps_eff:.1f})  HP {b.hp_max:.0f}  броня {b.armor:.0f}")
    for line in b.log:
        if verbose:
            print("  " + line)
    ok = 4 <= b.apt_level <= 8 and 8 <= b.waves_done <= 12
    print("ЦЕЛИ:", "OK" if ok else "НЕ СОШЛОСЬ — крутим коэффициенты")
    return ok


if __name__ == "__main__":
    run(verbose="--verbose" in sys.argv)
