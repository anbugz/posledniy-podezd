#!/usr/bin/env python3
"""Боевой симулятор баланса «Последний подъезд» (правки v2, 2026-09-17).

Зеркалит формулы из js/ (data_enemies.js, engine_stats.js, engine_loot.js)
после правок v2:
  - враги: HP = 30·1.125ⁿ·2^z·0.75 ; после 20 волн круги ×1.30
  - пассивного дохода НЕТ: припасы = floor(10·1.28ⁿ) с волн + продажи
  - сила героя = предметы + «Самоделки» (str/vit/def/acc, 15·1.35^L,
    потолок 2×уровень квартиры) + апгрейд квартиры (25·1.6^L, +20 HP)

Прогоняет «бота активного игрока» на 30 минут и проверяет цели:
  - квартира ур. 3-6
  - волн пройдено 9-12
  - бой ранних волн 5-10 сек; босс в.10 — дошли и дерёмся 15-150 сек

v4.2: добавлен прогон ДВУХ ПОЛНЫХ ЦИКЛОВ (run_cycles) — все 5 зон до зачистки
Района, «Возврат во времени» (очки = зоны×2 + лучшая редкость + круги),
второй цикл с RL-бонусами (+5% DPS/HP за RL, +10% опыта с RL3, +15% припасов
с RL8). Цель: цикл 2 ≈ 60% времени цикла 1 (проход ≤ 70%).

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
E_HP_BASE, E_HP_GROW, E_HP_TIER, E_HP_GLOBAL = 30.0, 1.125, 2.0, 0.75
E_DPS_BASE, E_DPS_GROW, E_DPS_TIER = 2.4, 1.14, 1.8
E_LOOP_MULT = 1.30
ELITE_EVERY = 5          # каждая 5-я (не босс): HP x2.5, DPS x1.3
BOSS_EVERY = 10
BOSS_HP_MULT, BOSS_DPS_MULT = 3.5, 1.4
WAVES_CAP = 20

# герой
HP_BASE = 100
HP_PER_APT = 20          # за уровень квартиры
REGEN_PCT = 0.05         # /сек вне боя
KNOCKOUT_SEC = 3         # dev; в релизе 60

# «Самоделки» (v4.0): эффект за уровень, цена = 1 очко опыта, потолок 2×квартира
TRAIN = {"str": 0.12, "vit": 0.12, "def": 3.0, "acc": 0.015}
WAVE_EXP = {"norm": 1, "elite": 2, "boss": 5}
UPGRADE_SOFT_CAP = 5     # без Оружейника (Район) предметы качаются до +5

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


def enemy(n, z=None):
    # v4.0: кругов нет — после 20-й волны бот идёт в Подъезд (тир 2)
    if z is None:
        z = Z if n <= WAVES_CAP else 2
    n_eff = (n - 1) % WAVES_CAP + 1
    loop = 1.0
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
        self.exp = 0               # очки опыта (v4.0)
        self.exp_spent = 0
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
        return 1  # v4.0: 1 очко опыта за уровень

    def weapon_upgrade_cost(self):
        # v4.0: цена в ТЕХНОЛОГИЯХ
        return ITEM_UPGRADE_BASE * (ITEM_UPGRADE_GROW ** self.weapon_lvl) + \
            int(item_score(dps=self.dps_weapon, crit=self.crit) * 0.1)

    @property
    def exp_avail(self):
        return self.exp - self.exp_spent

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
        if self.exp_avail >= self.train_cost(key):
            self.exp_spent += 1
            self.training[key] += 1
            return True
        return False

    def upgrade_weapon(self):
        if self.weapon_lvl >= UPGRADE_SOFT_CAP and self.waves_done < 100:
            return False  # без Оружейника потолок +5
        c = self.weapon_upgrade_cost()
        if self.tech >= c:
            self.tech -= c
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
            self.exp += WAVE_EXP[kind]
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
    # v4.0: всё открыто с 1-й минуты — квартира за припасы, самоделки за опыт,
    # оружие за технологии (до +5 без Оружейника).
    def spend():
        changed = True
        while changed:
            changed = False
            if b.wave >= 4 and b.buy_apt():
                changed = True
            for key in ("str", "vit", "def", "acc"):
                if b.buy_train(key):
                    changed = True
            if b.upgrade_weapon():
                changed = True
    while b.t < SIM_MINUTES * 60:
        r = b.fight_wave()
        if r[1]:  # победа
            b.t += r[0] + WAVE_GAP_SEC
            spend()
    # итоги
    print(f"--- {SIM_MINUTES} мин активной игры ---")
    print(f"квартира ур.      : {b.apt_level}   (цель 2-12)")
    print(f"волн пройдено     : {b.waves_done} (след. волна {b.wave})  (цель 20-40: квартира зачищена)")
    print(f"припасы на руках  : {b.supplies:.0f}")
    print(f"технологии        : {b.tech}")
    print(f"опыт (потрачено)  : {b.exp} ({b.exp_spent})")
    print(f"DPS героя         : {b.dps:.1f} (eff {b.dps_eff:.1f}, оружие +{b.weapon_lvl} ур.)  "
          f"HP {b.hp_max}  броня {b.armor_total:.0f}  крит {b.crit_total*100:.1f}%")
    print(f"Самоделки         : {b.training}")
    early = [b.fight_times[w] for w in (1, 2, 3, 4) if w in b.fight_times]
    if early:
        print(f"бой волн 1-4      : {min(early):.1f}-{max(early):.1f} сек  (цель 5-10)")
    if 10 in b.fight_times:
        print(f"босс волны 10     : {b.fight_times[10]:.0f} сек  (цель 5-150: дошли и дерёмся)")
    if verbose:
        for line in b.log:
            print("  " + line)
    boss10 = b.fight_times.get(10)
    ok = (2 <= b.apt_level <= 12 and 18 <= b.waves_done <= 40
          and (not early or max(early) <= 12)
          and (boss10 is not None and 5 <= boss10 <= 150))
    print("ЦЕЛИ:", "OK" if ok else "НЕ СОШЛОСЬ — крутим коэффициенты")
    return ok


# ---------------- v4.2: престиж — прогон двух полных циклов ----------------
# Цель калибровки: 2-й цикл (с RL-бонусами) ≈ 60% времени 1-го.
# Бот проходит все 5 зон (20 волн каждая), зачищает Район, делает «Возврат»
# и проходит заново с заработанным уровнем времени.

ZONES_SEQ = [("Квартира", 1), ("Подъезд", 2), ("Двор", 2), ("Дом", 3), ("Район", 4)]
RL_STAT = 0.05            # +5% DPS/HP за RL
RL_CYCLE_MULT = 1.15      # рост врагов за круг (RL≥5; в циклах 1-2 не используется)
SLOT_BASE = {"weapon": 6, "helmet": 12, "armor": 18, "gloves": 3, "boots": 10, "accessory": 6}
TIER_MULT = 1.8
RARITY_MULT = {"common": 1.0, "uncommon": 1.6, "rare": 2.6, "epic": 4.2,
               "legendary": 6.8, "mythic": 11.0}
RARITY_IDX = {"common": 0, "uncommon": 1, "rare": 2, "epic": 3, "legendary": 4, "mythic": 5}
RARITIES_NORM = [("common", 0.25), ("uncommon", 0.10), ("rare", 0.04), ("epic", 0.01)]
RARITIES_BOSS = [("rare", 0.55), ("epic", 0.30), ("legendary", 0.13), ("mythic", 0.02)]
GUARANTEED = {3: "weapon", 5: "armor", 8: "boots", 11: "helmet", 14: "gloves", 17: "accessory"}
GOLDEN_CHANCE = 0.02
LOOT_WAVE_GROW = 1.065


def roll_rarity(kind):
    table = RARITIES_NORM if kind == "norm" else RARITIES_BOSS
    r, acc = random.random(), 0.0
    for rid, ch in table:
        acc += ch
        if r < acc:
            return rid
    return table[0][0]


def bump_rarity(rid, n=2):
    order = list(RARITY_IDX.keys())
    return order[min(RARITY_IDX[rid] + n, len(order) - 1)]


class CycleHero:
    """Герой полного цикла: предметы по слотам (бюджетная модель generateItem),
    самоделки за опыт, квартира за припасы, улучшение оружия за tech."""

    def __init__(self, rl=0, path_max=None):
        self.rl = rl
        self.path_max = dict(path_max or {})  # v4.3: память класса (переживает цикл)
        self.perk = None           # полевой приём: power/tough/scavenge
        self.path = None           # путь цикла: storm/iron/junker
        self.path_exp = 0
        self.t = 0.0
        self.supplies = 0.0
        self.tech = 0.0
        self.exp = 0.0
        self.exp_spent = 0
        self.apt_level = 1
        self.training = {"str": 0, "vit": 0, "def": 0, "acc": 0}
        # слоты: {slot: {"dps":..,"hp":..,"armor":..,"crit":..,"lvl":0}}
        self.items = {
            "weapon": {"dps": 6.0, "lvl": 0},                    # кухонный нож
            "armor": {"hp": 10.0, "armor": 5.0, "lvl": 0},       # куртка
            "boots": {"hp": 10.0, "lvl": 0},                     # кроссовки
        }
        self.crit_base = CRIT_CHANCE
        self.best_rarity = 0
        self.zone_idx = 0
        self.wave = 1
        self.waves_done = 0
        self.hp = 140.0          # стартовое HP (100 + 20 квартира + 20 вещи)
        self._cd = {}            # кулдауны навыков (name -> t готовности)
        self.log = []

    # --- статы ---
    @property
    def rl_mult(self):
        return 1 + RL_STAT * self.rl

    @property
    def train_cap(self):
        return 2 * self.apt_level

    @property
    def exp_mult(self):
        return 1.10 if self.rl >= 3 else 1.0

    @property
    def sup_mult(self):
        m = 1.15 if self.rl >= 8 else 1.0
        if self.perk == "scavenge":
            m *= 1.2
        if self.path == "junker":
            m *= 1 + 0.05 * self.path_eff_level
        return m

    # --- путь (v4.3): уровень от опыта волн, память между циклами ---
    @property
    def path_level(self):
        return min(10, self.path_exp // 10) if self.path else 0

    @property
    def path_eff_level(self):
        return max(self.path_level, self.path_max.get(self.path, 0)) if self.path else 0

    def _sum(self, key):
        return sum(it.get(key, 0.0) * (ITEM_UPGRADE_MULT ** it.get("lvl", 0)) for it in self.items.values())

    @property
    def hp_max(self):
        base = HP_BASE + HP_PER_APT * self.apt_level + self._sum("hp")
        m = (1 + TRAIN["vit"] * self.training["vit"]) * self.rl_mult
        if self.perk == "tough":
            m *= 1.25
        if self.path == "iron":
            m *= 1 + 0.04 * self.path_eff_level
        return round(base * m)

    @property
    def dps(self):
        m = (1 + TRAIN["str"] * self.training["str"]) * self.rl_mult
        if self.perk == "power":
            m *= 1.25
        if self.path == "storm":
            m *= 1 + 0.04 * self.path_eff_level
        return self._sum("dps") * m

    @property
    def armor_total(self):
        return self._sum("armor") + TRAIN["def"] * self.training["def"]

    @property
    def crit_total(self):
        return min(self.crit_base + self._sum("crit") + TRAIN["acc"] * self.training["acc"], 0.60)

    @property
    def dps_eff(self):
        return self.dps * (1 + self.crit_total * (CRIT_MULT - 1))

    # --- лут ---
    def item_budget(self, slot, tier, rarity, wave):
        return SLOT_BASE[slot] * (TIER_MULT ** (tier - 1)) * RARITY_MULT[rarity] * \
            (LOOT_WAVE_GROW ** max(wave - 1, 0))

    def gen_item(self, slot, tier, rarity, wave):
        b = self.item_budget(slot, tier, rarity, wave)
        vary = lambda: 0.85 + random.random() * 0.3
        it = {"lvl": 0}
        if slot in ("weapon", "gloves"):
            it["dps"] = b * 0.9 * vary()
            it["crit"] = b * 0.03 * vary()
        elif slot in ("helmet", "armor", "boots"):
            it["hp"] = b * 0.9 * vary()
            it["armor"] = b * 0.35 * vary()
        else:  # accessory
            if random.random() < 0.5:
                it["dps"] = b * 0.55 * vary()
            else:
                it["hp"] = b * 0.55 * vary()
            it["armor"] = b * 0.15 * vary()
        return it

    def score(self, it):
        return it.get("dps", 0) * 4 + it.get("hp", 0) + it.get("armor", 0) * 3 + it.get("crit", 0) * 40

    def loot_drop(self, slot, tier, kind, wave, guaranteed=False):
        rarity = roll_rarity("norm" if guaranteed else kind)
        if not guaranteed and random.random() < GOLDEN_CHANCE:
            rarity = bump_rarity(rarity, 2)
        self.best_rarity = max(self.best_rarity, RARITY_IDX[rarity])
        it = self.gen_item(slot, tier, rarity, wave)
        cur = self.items.get(slot)
        if cur is None or self.score(it) > self.score({k: (v * ITEM_UPGRADE_MULT ** cur.get("lvl", 0) if isinstance(v, float) else v) for k, v in cur.items()}):
            self.items[slot] = it   # замена: вложенные уровни прокачки горят
        else:
            self.supplies += max(1, int(self.score(it) * SELL_RATIO / 4))

    # --- траты ---
    def spend(self):
        changed = True
        while changed:
            changed = False
            if self.waves_done >= 4 and self.supplies >= APT_BASE_COST * APT_COST_GROW ** self.apt_level:
                self.supplies -= APT_BASE_COST * APT_COST_GROW ** self.apt_level
                self.apt_level += 1
                changed = True
            for key in ("str", "vit", "def", "acc"):
                if self.training[key] < self.train_cap and self.exp - self.exp_spent >= 1:
                    self.exp_spent += 1
                    self.training[key] += 1
                    changed = True
            # улучшение оружия за tech (софт-кэп +5 до Оружейника = до конца цикла)
            w = self.items["weapon"]
            if w.get("lvl", 0) < UPGRADE_SOFT_CAP:
                cost = ITEM_UPGRADE_BASE * ITEM_UPGRADE_GROW ** w.get("lvl", 0) + int(self.score(w) * 0.1)
                if self.tech >= cost:
                    self.tech -= cost
                    w["lvl"] = w.get("lvl", 0) + 1
                    changed = True

    # --- бой ---
    def fight_wave(self):
        zone_name, tier = ZONES_SEQ[self.zone_idx]
        n = self.wave
        self.hp = min(self.hp, self.hp_max)   # hp_max мог вырасти после трат
        hp_e, dps_e, kind = enemy(n, tier)
        dps_hero = self.dps_eff
        if kind != "norm":
            if self.t >= self._cd.get("rain", 0):
                dps_hero *= 3.0
                self._cd["rain"] = self.t + 300
        t_kill = hp_e / max(dps_hero, 0.001)
        incoming = dps_e * (1 - dr(self.armor_total))
        if t_kill < self.hp / max(incoming, 0.001):
            self.hp -= incoming * t_kill
            self.supplies += math.floor(SUPPLY_DROP_BASE * SUPPLY_DROP_GROW ** n * self.sup_mult)
            self.tech += (1 if random.random() < 0.30 else 0) * (5 if kind == "elite" else (20 if kind == "boss" else 1))
            self.exp += WAVE_EXP[kind] * self.exp_mult
            if self.path:
                self.path_exp += WAVE_EXP[kind]   # v4.3: путь качается опытом волн
            # лут
            if n in GUARANTEED:
                self.loot_drop(GUARANTEED[n], tier, kind, n, guaranteed=True)
            elif kind != "norm" or random.random() < LOOT_CHANCE:
                slot = random.choice(list(SLOT_BASE.keys()))
                self.loot_drop(slot, tier, kind, n)
            self.waves_done += 1
            self.t += t_kill + WAVE_GAP_SEC
            # реген вне боя: 5%/сек за паузу между волнами (как в js)
            self.hp = min(self.hp_max, self.hp + self.hp_max * REGEN_PCT * WAVE_GAP_SEC)
            self.spend()
            # переход по волнам/зонам
            if n >= WAVES_CAP:
                if self.zone_idx < len(ZONES_SEQ) - 1:
                    self.zone_idx += 1
                    self.wave = 1
                    self.log.append(f"t={self.t/60:6.1f}м ЗАЧИЩЕНА {zone_name} -> {ZONES_SEQ[self.zone_idx][0]}")
                    # v4.3: зачистка Двора (Ветеран) — бот берёт приём и путь силы
                    if self.zone_idx >= 2 and self.perk is None:
                        self.perk = "power"
                        self.path = "storm"
                        self.log.append(f"t={self.t/60:6.1f}м Ветеран: приём «Силовой», путь «Штурмовик»")
                    return True, False
                return True, True   # Район зачищен — цикл завершён
            self.wave += 1
            return True, False
        # стена: ждём полного регена (5%/сек вне боя), тратимся, повторяем
        wait = max((self.hp_max - self.hp) / (self.hp_max * REGEN_PCT), 5.0)
        self.t += wait
        self.hp = self.hp_max
        self.spend()
        return False, False

    def reset_cycle(self, rl):
        """Возврат во времени: сгорает всё, кроме RL и памяти класса."""
        t = self.t
        rl_total = self.rl + rl
        pm = dict(self.path_max)
        if self.path:
            pm[self.path] = max(pm.get(self.path, 0), self.path_level)
        self.__init__(rl_total, pm)
        self.t = t


def run_cycles(verbose=False, cap_hours=12):
    """Прогон двух циклов подряд. Цель: цикл 2 ≈ 60% времени цикла 1."""
    hero = CycleHero()
    results = []
    for cycle in (1, 2):
        t0 = hero.t
        done = False
        while not done and hero.t - t0 < cap_hours * 3600:
            _, done = hero.fight_wave()
        dt = hero.t - t0
        zones_cleared = hero.zone_idx + (1 if done else 0)
        points = zones_cleared * 2 + hero.best_rarity  # круги: 0 в первых циклах (RL<5)
        results.append({"cycle": cycle, "sec": dt, "done": done, "points": points,
                        "best_rarity": hero.best_rarity, "waves": hero.waves_done,
                        "dps": hero.dps, "hp": hero.hp_max, "apt": hero.apt_level})
        print(f"--- цикл {cycle} ---")
        print(f"  время цикла     : {dt/3600:.2f} ч ({dt/60:.0f} мин)" + ("" if done else "  [НЕ ЗАВЕРШЁН за лимит]"))
        print(f"  волн пройдено   : {hero.waves_done}")
        print(f"  финал           : DPS {hero.dps:.0f}, HP {hero.hp_max}, квартира {hero.apt_level}, best rarity idx {hero.best_rarity}")
        print(f"  очки времени    : {points} (зоны {zones_cleared}×2 + редкость {hero.best_rarity})")
        if verbose:
            for line in hero.log:
                print("   " + line)
        hero.reset_cycle(points)
    t1, t2 = results[0]["sec"], results[1]["sec"]
    ratio = t2 / t1 if t1 else 1
    print(f"цикл 2 / цикл 1   : {ratio:.0%}  (цель ≈ 60%)")
    ok = results[0]["done"] and results[1]["done"] and ratio <= 0.70
    print("ЦЕЛИ ПРЕСТИЖА:", "OK" if ok else "НЕ СОШЛОСЬ — крутим RL-бонусы/очки")
    return ok


if __name__ == "__main__":
    verbose = "--verbose" in sys.argv
    ok1 = run(verbose=verbose)
    ok2 = run_cycles(verbose=verbose)
    sys.exit(0 if (ok1 and ok2) else 1)
