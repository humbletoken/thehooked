/* Hooked — shared game data & rules (used by browser and by bot.js) */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.HData = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_PLAYERS = 5;
  const START_COINS = 150;

  const RARITY = {
    common:    { name: 'Обычная',     color: '#8bc34a', glow: '#c5f08a', weight: 62,  xp: 10 },
    uncommon:  { name: 'Необычная',   color: '#29b6f6', glow: '#9be3ff', weight: 25,  xp: 18 },
    rare:      { name: 'Редкая',      color: '#ab47bc', glow: '#e2a6ff', weight: 9,   xp: 35 },
    epic:      { name: 'Эпическая',   color: '#ff7043', glow: '#ffc09e', weight: 3.4, xp: 70 },
    legendary: { name: 'Легендарная', color: '#ffca28', glow: '#fff1a8', weight: 0.6, xp: 150 },
  };
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  // depth is a fraction of the lake depth (0 = surface, 1 = bottom)
  // time: 'any' | 'day' | 'night'
  const FISH = [
    { id: 'crucian', name: 'Карась',        rarity: 'common',    minW: 0.2, maxW: 1.4,  price: 14,  depth: [0.00, 0.45], time: 'any',   power: 2, desc: 'Золотистый добряк тихих заводей. Любит тёплую воду и хлебные крошки.' },
    { id: 'roach',   name: 'Плотва',        rarity: 'common',    minW: 0.1, maxW: 0.9,  price: 12,  depth: [0.00, 0.40], time: 'day',   power: 1, desc: 'Серебристая непоседа с красными глазами. Ходит стайками у поверхности.' },
    { id: 'perch',   name: 'Окунь',         rarity: 'common',    minW: 0.15, maxW: 1.8, price: 16,  depth: [0.05, 0.60], time: 'day',   power: 3, desc: 'Полосатый разбойник. Жадно хватает всё, что блестит.' },
    { id: 'ruffe',   name: 'Ёрш',           rarity: 'common',    minW: 0.05, maxW: 0.4, price: 10,  depth: [0.10, 0.70], time: 'any',   power: 2, desc: 'Колючий и вредный. Мал, да удал — и в ухе хорош.' },
    { id: 'bream',   name: 'Лещ',           rarity: 'uncommon',  minW: 0.6, maxW: 4.5,  price: 30,  depth: [0.35, 0.90], time: 'any',   power: 4, desc: 'Широкий, как сковородка. Осторожный обитатель глубоких ям.' },
    { id: 'carp',    name: 'Карп',          rarity: 'uncommon',  minW: 1.0, maxW: 9.0,  price: 38,  depth: [0.15, 0.75], time: 'any',   power: 6, desc: 'Сильный и упрямый. Устроит настоящую битву на леске.' },
    { id: 'trout',   name: 'Форель',        rarity: 'uncommon',  minW: 0.4, maxW: 3.5,  price: 42,  depth: [0.20, 0.65], time: 'day',   power: 5, desc: 'Пятнистая красавица чистых вод. Обожает прыгать.' },
    { id: 'pike',    name: 'Щука',          rarity: 'rare',      minW: 1.0, maxW: 12.0, price: 70,  depth: [0.25, 0.85], time: 'day',   power: 7, desc: 'Зубастая королева озера. Бросается из засады в камышах.' },
    { id: 'zander',  name: 'Судак',         rarity: 'rare',      minW: 0.8, maxW: 8.0,  price: 75,  depth: [0.45, 1.00], time: 'night', power: 6, desc: 'Клыкастый ночной охотник с большими глазами.' },
    { id: 'salmon',  name: 'Лосось',        rarity: 'rare',      minW: 2.0, maxW: 14.0, price: 90,  depth: [0.30, 0.80], time: 'any',   power: 7, desc: 'Розовый силач, который плывёт против любого течения.' },
    { id: 'catfish', name: 'Сом',           rarity: 'rare',      minW: 3.0, maxW: 40.0, price: 85,  depth: [0.70, 1.00], time: 'night', power: 9, desc: 'Усатый хозяин омута. Говорят, ему больше ста лет.' },
    { id: 'koi',     name: 'Кои',           rarity: 'epic',      minW: 1.0, maxW: 7.0,  price: 160, depth: [0.00, 0.50], time: 'day',   power: 5, desc: 'Расписной карп удачи. Приносит счастье тому, кто его отпустит… но лучше продать.' },
    { id: 'eel',     name: 'Светящийся угорь', rarity: 'epic',   minW: 0.8, maxW: 5.0,  price: 180, depth: [0.55, 1.00], time: 'night', power: 8, desc: 'Мерцает в темноте, как гирлянда. Выплывает только ночью.' },
    { id: 'sturgeon',name: 'Осётр',         rarity: 'epic',      minW: 5.0, maxW: 60.0, price: 200, depth: [0.75, 1.00], time: 'any',   power: 10, desc: 'Древний гигант в костяной броне. Мечта любого рыбака.' },
    { id: 'goldfish',name: 'Золотая рыбка', rarity: 'legendary', minW: 0.3, maxW: 1.5,  price: 1200, depth: [0.60, 1.00], time: 'any',  power: 8, desc: 'Та самая. Исполняет желания — особенно желание разбогатеть.' },
  ];
  const FISH_BY_ID = Object.fromEntries(FISH.map(f => [f.id, f]));

  // power: line strength (tension tolerance), reel: reeling speed, luck: rare chance, depth: max cast depth
  const RODS = [
    { id: 'bamboo',     name: 'Бамбуковая',     price: 0,     power: 1.00, reel: 1.00, luck: 1.00, depth: 0.50, bite: 1.00, colors: ['#d9b26a', '#9c7434', '#6b8e23'], desc: 'Дедушкина удочка. Простая, но надёжная.' },
    { id: 'fiberglass', name: 'Речная',         price: 600,   power: 1.18, reel: 1.15, luck: 1.15, depth: 0.65, bite: 0.90, colors: ['#4fc3f7', '#1f6fa8', '#ffb300'], desc: 'Стеклопластик и яркий поплавок. Забрасывает глубже.' },
    { id: 'carbon',     name: 'Карбон Pro',     price: 2200,  power: 1.38, reel: 1.30, luck: 1.35, depth: 0.80, bite: 0.80, colors: ['#37474f', '#151b1f', '#ef5350'], desc: 'Лёгкий карбоновый спиннинг для серьёзной рыбы.' },
    { id: 'storm',      name: 'Штормовая',      price: 6500,  power: 1.62, reel: 1.48, luck: 1.65, depth: 0.92, bite: 0.70, colors: ['#7e57c2', '#311b92', '#00e5ff'], desc: 'Выкована в грозу. Не боится сомов и осетров.' },
    { id: 'poseidon',   name: 'Золотой Посейдон', price: 20000, power: 1.95, reel: 1.70, luck: 2.20, depth: 1.00, bite: 0.58, colors: ['#ffd54f', '#c68a00', '#26c6da'], desc: 'Легендарная удочка морского бога. Достаёт до самого дна.' },
  ];
  const ROD_BY_ID = Object.fromEntries(RODS.map(r => [r.id, r]));

  // Character customization. price 0 = available from the start.
  const SKINS = ['#ffe0c7', '#f9cfa5', '#e8b07f', '#c98a5a', '#9a6440', '#6b4229'];
  const HAIR_COLORS = ['#2d2018', '#6b3e1f', '#b8732e', '#f2c95b', '#e86a3a', '#9aa4b1', '#6f5bd8', '#ff7fb6'];
  const CLOTH_COLORS = ['#ef5350', '#ff9800', '#ffd54f', '#66bb6a', '#26a69a', '#42a5f5', '#5c6bc0', '#ab47bc', '#ec407a', '#8d6e63', '#eceff1', '#37474f'];

  const ITEMS = {
    hair: [
      { id: 'short',    name: 'Короткая', price: 0 },
      { id: 'messy',    name: 'Лохматая', price: 0 },
      { id: 'long',     name: 'Длинная',  price: 0 },
      { id: 'pony',     name: 'Хвостик',  price: 0 },
      { id: 'curly',    name: 'Кудри',    price: 0 },
      { id: 'buzz',     name: 'Ёжик',     price: 0 },
    ],
    top: [
      { id: 'tee',      name: 'Футболка',     price: 0 },
      { id: 'hoodie',   name: 'Худи',         price: 0 },
      { id: 'flannel',  name: 'Клетчатая рубашка', price: 0 },
      { id: 'vest',     name: 'Рыбацкий жилет', price: 0 },
      { id: 'sailor',   name: 'Тельняшка',    price: 250 },
      { id: 'raincoat', name: 'Дождевик',     price: 400 },
      { id: 'overalls', name: 'Комбинезон',   price: 600 },
    ],
    bottom: [
      { id: 'jeans',    name: 'Джинсы',  price: 0 },
      { id: 'shorts',   name: 'Шорты',   price: 0 },
      { id: 'waders',   name: 'Забродники', price: 350 },
    ],
    hat: [
      { id: 'none',     name: 'Без шапки',  price: 0 },
      { id: 'cap',      name: 'Кепка',      price: 0 },
      { id: 'bucket',   name: 'Панама',     price: 0 },
      { id: 'beanie',   name: 'Шапка',      price: 0 },
      { id: 'straw',    name: 'Соломенная шляпа', price: 300 },
      { id: 'captain',  name: 'Капитанка',  price: 700 },
      { id: 'cowboy',   name: 'Ковбойская', price: 900 },
      { id: 'fishhat',  name: 'Шапка-рыба', price: 1500 },
      { id: 'pirate',   name: 'Треуголка',  price: 2500 },
      { id: 'crown',    name: 'Корона',     price: 9000 },
    ],
    acc: [
      { id: 'none',       name: 'Ничего',        price: 0 },
      { id: 'glasses',    name: 'Очки',          price: 0 },
      { id: 'sunglasses', name: 'Тёмные очки',   price: 0 },
      { id: 'blush',      name: 'Румянец',       price: 0 },
      { id: 'mustache',   name: 'Усы',           price: 150 },
      { id: 'beard',      name: 'Борода',        price: 300 },
      { id: 'scarf',      name: 'Шарф',          price: 350 },
      { id: 'headphones', name: 'Наушники',      price: 600 },
      { id: 'flower',     name: 'Цветок',        price: 400 },
      { id: 'eyepatch',   name: 'Повязка',       price: 1200 },
    ],
  };
  const SLOT_NAMES = { hair: 'Причёска', top: 'Одежда', bottom: 'Низ', hat: 'Головной убор', acc: 'Аксессуар' };

  const DEFAULT_LOOK = {
    skin: 1, hair: 'messy', hairColor: 1, top: 'tee', topColor: 5, bottom: 'jeans', bottomColor: 11,
    hat: 'bucket', hatColor: 3, acc: 'none',
  };

  function itemKey(slot, id) { return slot + ':' + id; }
  function findItem(slot, id) { return (ITEMS[slot] || []).find(i => i.id === id); }

  function sanitizeLook(look, owned) {
    const out = Object.assign({}, DEFAULT_LOOK);
    if (!look || typeof look !== 'object') return out;
    const idx = (v, n, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
    out.skin = idx(look.skin, SKINS.length, out.skin);
    out.hairColor = idx(look.hairColor, HAIR_COLORS.length, out.hairColor);
    out.topColor = idx(look.topColor, CLOTH_COLORS.length, out.topColor);
    out.bottomColor = idx(look.bottomColor, CLOTH_COLORS.length, out.bottomColor);
    out.hatColor = idx(look.hatColor, CLOTH_COLORS.length, out.hatColor);
    for (const slot of ['hair', 'top', 'bottom', 'hat', 'acc']) {
      const it = findItem(slot, look[slot]);
      if (it && (it.price === 0 || !owned || owned.has(itemKey(slot, it.id)))) out[slot] = it.id;
    }
    return out;
  }

  // ---- progression ----
  function levelFromXp(xp) {
    let lvl = 1, need = 60, rest = xp;
    while (rest >= need) { rest -= need; lvl++; need = Math.round(need * 1.25 + 20); }
    return { level: lvl, cur: rest, need };
  }
  const levelReward = lvl => 50 + lvl * 25;

  // ---- fishing rules ----
  function isNight(hour) { return hour >= 21 || hour < 6; }

  function fishPool(depth, hour) {
    const night = isNight(hour);
    return FISH.filter(f => {
      if (depth < f.depth[0] - 0.03 || depth > f.depth[1] + 0.03) return false;
      if (f.time === 'day' && night) return false;
      if (f.time === 'night' && !night) return false;
      return true;
    });
  }

  function rollFish(depth, rod, hour, rnd) {
    rnd = rnd || Math.random;
    const pool = fishPool(depth, hour);
    const list = pool.length ? pool : [FISH_BY_ID.crucian];
    const weights = list.map(f => {
      const r = RARITY[f.rarity];
      const tier = RARITY_ORDER.indexOf(f.rarity);
      return r.weight * (tier >= 2 ? rod.luck : tier === 1 ? Math.sqrt(rod.luck) : 1);
    });
    let sum = weights.reduce((a, b) => a + b, 0), x = rnd() * sum;
    let fish = list[list.length - 1];
    for (let i = 0; i < list.length; i++) { x -= weights[i]; if (x <= 0) { fish = list[i]; break; } }
    // weight skewed to smaller fish; deeper casts & luck give bigger fish
    const t = Math.pow(rnd(), 2.2 - Math.min(0.9, depth * 0.5 + (rod.luck - 1) * 0.3));
    const weight = Math.round((fish.minW + (fish.maxW - fish.minW) * t) * 100) / 100;
    return { species: fish.id, weight };
  }

  function fishPrice(species, weight) {
    const f = FISH_BY_ID[species];
    if (!f) return 0;
    const t = (weight - f.minW) / Math.max(0.01, f.maxW - f.minW);
    return Math.max(1, Math.round(f.price * (0.75 + t * 1.25)));
  }

  function fishXp(species, weight) {
    const f = FISH_BY_ID[species];
    const t = (weight - f.minW) / Math.max(0.01, f.maxW - f.minW);
    return Math.round(RARITY[f.rarity].xp * (1 + t * 0.5));
  }

  // Timeline of a single cast. Times in ms from the moment the hook reaches depth.
  function planCast(depth, rod, hour, rnd) {
    rnd = rnd || Math.random;
    const catchInfo = rollFish(depth, rod, hour, rnd);
    const f = FISH_BY_ID[catchInfo.species];
    const wait = (2600 + rnd() * 6500 + depth * 2500) * rod.bite;
    const nibbles = [];
    const n = 1 + Math.floor(rnd() * 3);
    let t = wait;
    for (let i = 0; i < n; i++) { nibbles.push(Math.round(t)); t += 450 + rnd() * 700; }
    const biteAt = Math.round(t + 250);
    const tier = RARITY_ORDER.indexOf(f.rarity);
    const sizeT = (catchInfo.weight - f.minW) / Math.max(0.01, f.maxW - f.minW);
    return {
      species: catchInfo.species,
      weight: catchInfo.weight,
      approachAt: Math.max(400, nibbles[0] - 2200),
      nibbles,
      biteAt,
      biteWindow: Math.round(950 + (rod.reel - 1) * 600),
      fight: {
        strength: Math.min(1, (f.power / 10) * 0.75 + sizeT * 0.25), // 0..1
        stamina: 4 + f.power * 0.9 + tier * 1.5 + sizeT * 3,         // seconds of good reeling
        rushiness: 0.25 + f.power * 0.06,
      },
    };
  }

  return {
    MAX_PLAYERS, START_COINS, RARITY, RARITY_ORDER, FISH, FISH_BY_ID, RODS, ROD_BY_ID,
    SKINS, HAIR_COLORS, CLOTH_COLORS, ITEMS, SLOT_NAMES, DEFAULT_LOOK,
    itemKey, findItem, sanitizeLook, levelFromXp, levelReward, isNight, fishPool, rollFish,
    fishPrice, fishXp, planCast,
  };
});
