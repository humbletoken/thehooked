/* Hooked — shared game data & rules (used by browser and by bot.js) */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.HData = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_PLAYERS = 5;
  const START_COINS = 150;
  const TZ = 3; // daily/weekly resets and event schedules use Moscow time

  const RARITY = {
    common:    { name: 'Обычная',     color: '#8bc34a', glow: '#c5f08a', weight: 62,  xp: 10 },
    uncommon:  { name: 'Необычная',   color: '#29b6f6', glow: '#9be3ff', weight: 25,  xp: 18 },
    rare:      { name: 'Редкая',      color: '#ab47bc', glow: '#e2a6ff', weight: 9,   xp: 35 },
    epic:      { name: 'Эпическая',   color: '#ff7043', glow: '#ffc09e', weight: 3.4, xp: 70 },
    legendary: { name: 'Легендарная', color: '#ffca28', glow: '#fff1a8', weight: 0.6, xp: 150 },
  };
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  /* ───────────── locations ───────────── */
  // level: player level needed to fish there
  const LOCATIONS = [
    { id: 'lake',  name: 'Тихое озеро',    short: 'Озеро',  emoji: '🏞️', level: 1,  desc: 'Уютное озеро у леса. Здесь начинают все рыбаки.' },
    { id: 'river', name: 'Быстрая река',   short: 'Река',   emoji: '🌊', level: 4,  desc: 'Холодные перекаты, хариус и легендарный таймень.' },
    { id: 'swamp', name: 'Туманное болото', short: 'Болото', emoji: '🌫️', level: 8,  desc: 'Тёмная вода, туман и змееголов, который дышит воздухом.' },
    { id: 'sea',   name: 'Солёное море',   short: 'Море',   emoji: '⚓', level: 12, desc: 'Пирс у маяка: тунец, рыба-меч и огромная рыба-луна.' },
  ];
  const LOC_BY_ID = Object.fromEntries(LOCATIONS.map(l => [l.id, l]));
  const LOC_FALLBACK = { lake: 'crucian', river: 'chub', swamp: 'rotan', sea: 'mackerel' };

  // depth is a fraction of the water depth (0 = surface, 1 = bottom); time: 'any' | 'day' | 'night'
  // loc: where the species lives; season: only during that season
  const FISH = [
    { id: 'crucian', name: 'Карась',        rarity: 'common',    minW: 0.2, maxW: 1.4,  price: 14,  depth: [0.00, 0.45], time: 'any',   power: 2, loc: ['lake', 'swamp'], desc: 'Золотистый добряк тихих заводей. Любит тёплую воду и хлебные крошки.' },
    { id: 'roach',   name: 'Плотва',        rarity: 'common',    minW: 0.1, maxW: 0.9,  price: 12,  depth: [0.00, 0.40], time: 'day',   power: 1, loc: ['lake', 'river'], desc: 'Серебристая непоседа с красными глазами. Ходит стайками у поверхности.' },
    { id: 'perch',   name: 'Окунь',         rarity: 'common',    minW: 0.15, maxW: 1.8, price: 16,  depth: [0.05, 0.60], time: 'day',   power: 3, loc: ['lake', 'river'], desc: 'Полосатый разбойник. Жадно хватает всё, что блестит.' },
    { id: 'ruffe',   name: 'Ёрш',           rarity: 'common',    minW: 0.05, maxW: 0.4, price: 10,  depth: [0.10, 0.70], time: 'any',   power: 2, loc: ['lake', 'river', 'swamp'], desc: 'Колючий и вредный. Мал, да удал — и в ухе хорош.' },
    { id: 'bream',   name: 'Лещ',           rarity: 'uncommon',  minW: 0.6, maxW: 4.5,  price: 30,  depth: [0.35, 0.90], time: 'any',   power: 4, loc: ['lake', 'river'], desc: 'Широкий, как сковородка. Осторожный обитатель глубоких ям.' },
    { id: 'carp',    name: 'Карп',          rarity: 'uncommon',  minW: 1.0, maxW: 9.0,  price: 38,  depth: [0.15, 0.75], time: 'any',   power: 6, loc: ['lake', 'swamp'], desc: 'Сильный и упрямый. Устроит настоящую битву на леске.' },
    { id: 'trout',   name: 'Форель',        rarity: 'uncommon',  minW: 0.4, maxW: 3.5,  price: 42,  depth: [0.20, 0.65], time: 'day',   power: 5, loc: ['lake', 'river'], desc: 'Пятнистая красавица чистых вод. Обожает прыгать.' },
    { id: 'pike',    name: 'Щука',          rarity: 'rare',      minW: 1.0, maxW: 12.0, price: 70,  depth: [0.25, 0.85], time: 'day',   power: 7, loc: ['lake', 'river', 'swamp'], desc: 'Зубастая королева озера. Бросается из засады в камышах.' },
    { id: 'zander',  name: 'Судак',         rarity: 'rare',      minW: 0.8, maxW: 8.0,  price: 75,  depth: [0.45, 1.00], time: 'night', power: 6, loc: ['lake', 'river'], desc: 'Клыкастый ночной охотник с большими глазами.' },
    { id: 'salmon',  name: 'Лосось',        rarity: 'rare',      minW: 2.0, maxW: 14.0, price: 90,  depth: [0.30, 0.80], time: 'any',   power: 7, loc: ['lake', 'river'], desc: 'Розовый силач, который плывёт против любого течения.' },
    { id: 'catfish', name: 'Сом',           rarity: 'rare',      minW: 3.0, maxW: 40.0, price: 85,  depth: [0.70, 1.00], time: 'night', power: 9, loc: ['lake', 'river', 'swamp'], desc: 'Усатый хозяин омута. Говорят, ему больше ста лет.' },
    { id: 'koi',     name: 'Кои',           rarity: 'epic',      minW: 1.0, maxW: 7.0,  price: 160, depth: [0.00, 0.50], time: 'day',   power: 5, loc: ['lake'], desc: 'Расписной карп удачи. Приносит счастье тому, кто его отпустит… но лучше продать.' },
    { id: 'eel',     name: 'Светящийся угорь', rarity: 'epic',   minW: 0.8, maxW: 5.0,  price: 180, depth: [0.55, 1.00], time: 'night', power: 8, loc: ['lake', 'swamp'], desc: 'Мерцает в темноте, как гирлянда. Выплывает только ночью.' },
    { id: 'sturgeon',name: 'Осётр',         rarity: 'epic',      minW: 5.0, maxW: 60.0, price: 200, depth: [0.75, 1.00], time: 'any',   power: 10, loc: ['lake', 'river'], desc: 'Древний гигант в костяной броне. Мечта любого рыбака.' },
    { id: 'goldfish',name: 'Золотая рыбка', rarity: 'legendary', minW: 0.3, maxW: 1.5,  price: 1200, depth: [0.60, 1.00], time: 'any',  power: 8, loc: ['lake'], desc: 'Та самая. Исполняет желания — особенно желание разбогатеть.' },
    // river
    { id: 'chub',     name: 'Голавль',      rarity: 'common',    minW: 0.3, maxW: 3.5,  price: 18,  depth: [0.00, 0.55], time: 'day',   power: 4, loc: ['river'], desc: 'Лобастый шустрик быстрых перекатов. Хватает жуков прямо с поверхности.' },
    { id: 'grayling', name: 'Хариус',       rarity: 'uncommon',  minW: 0.2, maxW: 2.0,  price: 40,  depth: [0.05, 0.55], time: 'any',   power: 4, loc: ['river'], desc: 'Носит на спине радужный парус. Живёт только в самой чистой воде.' },
    { id: 'asp',      name: 'Жерех',        rarity: 'rare',      minW: 1.0, maxW: 9.0,  price: 80,  depth: [0.15, 0.70], time: 'day',   power: 7, loc: ['river'], desc: 'Беззубый хищник, глушащий малька хвостом. Бьёт так, что брызги летят!' },
    { id: 'taimen',   name: 'Таймень',      rarity: 'epic',      minW: 4.0, maxW: 50.0, price: 210, depth: [0.50, 1.00], time: 'any',   power: 10, loc: ['river'], desc: 'Красный речной исполин. Встреча с ним — событие на всю жизнь.' },
    // swamp
    { id: 'rotan',    name: 'Ротан',        rarity: 'common',    minW: 0.05, maxW: 0.6, price: 9,   depth: [0.20, 1.00], time: 'any',   power: 2, loc: ['swamp'], desc: 'Головастый обжора, который выживет даже во льду.' },
    { id: 'loach',    name: 'Вьюн',         rarity: 'common',    minW: 0.05, maxW: 0.4, price: 11,  depth: [0.55, 1.00], time: 'any',   power: 2, loc: ['swamp'], desc: 'Скользкий «пищун», зарывающийся в ил. Говорят, предсказывает грозу.' },
    { id: 'tench',    name: 'Линь',         rarity: 'uncommon',  minW: 0.4, maxW: 5.0,  price: 36,  depth: [0.35, 1.00], time: 'any',   power: 5, loc: ['swamp'], desc: 'Зелёный тихоня с красными глазами. Его слизь будто бы лечит других рыб.' },
    { id: 'snakehead',name: 'Змееголов',    rarity: 'epic',      minW: 2.0, maxW: 12.0, price: 190, depth: [0.20, 0.80], time: 'night', power: 9, loc: ['swamp'], desc: 'Дышит воздухом и ползает по суше. Король болотной тьмы.' },
    // sea
    { id: 'mackerel', name: 'Скумбрия',     rarity: 'common',    minW: 0.2, maxW: 1.6,  price: 20,  depth: [0.00, 0.50], time: 'any',   power: 3, loc: ['sea'], desc: 'Полосатая стремительная стайница. Блестит, как фольга.' },
    { id: 'flounder', name: 'Камбала',      rarity: 'common',    minW: 0.3, maxW: 4.0,  price: 24,  depth: [0.55, 1.00], time: 'any',   power: 3, loc: ['sea'], desc: 'Плоская маскировщица: прячется на дне и смотрит вверх обоими глазами.' },
    { id: 'seabass',  name: 'Морской окунь', rarity: 'uncommon', minW: 0.5, maxW: 6.0,  price: 48,  depth: [0.30, 0.90], time: 'any',   power: 5, loc: ['sea'], desc: 'Алый глазастый житель скал. Колется не хуже речного родственника.' },
    { id: 'tuna',     name: 'Тунец',        rarity: 'rare',      minW: 8.0, maxW: 120,  price: 120, depth: [0.30, 0.90], time: 'day',   power: 9, loc: ['sea'], desc: 'Морская торпеда. Разгоняется до 70 км/ч и не сдаётся до последнего.' },
    { id: 'swordfish',name: 'Рыба-меч',     rarity: 'epic',      minW: 20,  maxW: 300,  price: 260, depth: [0.50, 1.00], time: 'any',   power: 10, loc: ['sea'], desc: 'Фехтовальщик океана. Держи леску крепче!' },
    { id: 'sunfish',  name: 'Рыба-луна',    rarity: 'legendary', minW: 100, maxW: 1000, price: 1600, depth: [0.40, 1.00], time: 'night', power: 9, loc: ['sea'], desc: 'Огромная и добродушная. Поднимается из глубины лунными ночами.' },
    // Goth season
    { id: 'bonefish', name: 'Костяной окунь',  rarity: 'uncommon', minW: 0.3, maxW: 2.5, price: 60,  depth: [0.20, 0.90], time: 'any',   power: 4, loc: ['lake', 'river', 'swamp', 'sea'], season: 'goth', desc: 'Скелет, который всё ещё плавает. Сезонный гость Goth-сезона.' },
    { id: 'vampfish', name: 'Рыба-вампир',     rarity: 'rare',     minW: 0.5, maxW: 4.0, price: 130, depth: [0.30, 1.00], time: 'night', power: 7, loc: ['river', 'swamp', 'sea'], season: 'goth', desc: 'Клыкастая пиранья цвета вина. Клюёт только после заката.' },
    { id: 'ghostpike',name: 'Призрачная щука', rarity: 'epic',     minW: 2.0, maxW: 15,  price: 240, depth: [0.40, 1.00], time: 'night', power: 8, loc: ['lake', 'river', 'swamp'], season: 'goth', desc: 'Полупрозрачная тень былых рыбаков. Видна только при свете луны.' },
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

  /* ───────────── baits & tackle ───────────── */
  // bite < 1 → faster bites; luck → rare chance; likes → those species bite x3 more often; big → heavier fish
  const BAITS = [
    { id: 'worm',      name: 'Червяк',     price: 0,   pack: 0,  bite: 1.00, luck: 1.0, likes: [], desc: 'Классика. Бесконечный запас.' },
    { id: 'bloodworm', name: 'Мотыль',     price: 60,  pack: 10, bite: 0.75, luck: 1.0, likes: ['crucian', 'roach', 'bream', 'ruffe', 'rotan', 'loach', 'tench', 'grayling'], desc: 'Клёв заметно быстрее, мирная рыба в восторге.' },
    { id: 'corn',      name: 'Кукуруза',   price: 80,  pack: 10, bite: 0.90, luck: 1.1, likes: ['carp', 'crucian', 'bream', 'koi', 'tench', 'goldfish', 'chub'], desc: 'Сладкая приманка для карпов, карасей и линей.' },
    { id: 'spoon',     name: 'Блесна',     price: 150, pack: 10, bite: 1.00, luck: 1.3, likes: ['pike', 'perch', 'zander', 'asp', 'chub', 'taimen', 'snakehead', 'seabass', 'ghostpike', 'trout'], desc: 'Хищники не могут устоять перед блеском.' },
    { id: 'livebait',  name: 'Живец',      price: 220, pack: 8,  bite: 1.15, luck: 1.6, big: 1.6, likes: ['catfish', 'pike', 'zander', 'taimen', 'sturgeon', 'snakehead', 'tuna', 'swordfish', 'salmon'], desc: 'Клюёт реже, но вес улова — впечатляющий.' },
    { id: 'shrimp',    name: 'Креветка',   price: 120, pack: 10, bite: 0.85, luck: 1.2, likes: ['mackerel', 'flounder', 'seabass', 'tuna', 'sunfish', 'vampfish'], desc: 'Морской деликатес для обитателей моря.' },
    { id: 'glowbait',  name: 'Светлячок',  price: 260, pack: 6,  bite: 0.90, luck: 1.8, night: true, likes: ['eel', 'zander', 'catfish', 'snakehead', 'sunfish', 'ghostpike', 'vampfish', 'bonefish'], desc: 'Светится в темноте. Ночью шанс редкой рыбы сильно растёт.' },
  ];
  const BAIT_BY_ID = Object.fromEntries(BAITS.map(b => [b.id, b]));

  const TACKLE = {
    line: [
      { id: 'mono',   name: 'Леска «Моно»',  price: 0,    power: 1.00, desc: 'Обычная леска, с которой начинают все.' },
      { id: 'braid',  name: 'Плетёнка',      price: 900,  power: 1.12, desc: '+12% к прочности лески.' },
      { id: 'fluoro', name: 'Флюорокарбон',  price: 3200, power: 1.25, bite: 0.92, desc: '+25% к прочности, рыба меньше пугается.' },
    ],
    hook: [
      { id: 'basic',  name: 'Обычный крючок', price: 0,    window: 0,   luck: 1.00, desc: 'Простой стальной крючок.' },
      { id: 'sharp',  name: 'Острый крючок',  price: 700,  window: 250, luck: 1.00, desc: '+0,25 с на подсечку.' },
      { id: 'treble', name: 'Тройник',        price: 2600, window: 400, luck: 1.15, desc: '+0,4 с на подсечку и выше шанс редкой рыбы.' },
    ],
  };
  const findTackle = (kind, id) => (TACKLE[kind] || []).find(t => t.id === id);

  /* ───────────── character customization ───────────── */
  const SKINS = ['#ffe0c7', '#f9cfa5', '#e8b07f', '#c98a5a', '#9a6440', '#6b4229'];
  const HAIR_COLORS = ['#2d2018', '#6b3e1f', '#b8732e', '#f2c95b', '#e86a3a', '#9aa4b1', '#6f5bd8', '#ff7fb6', '#141218'];
  const CLOTH_COLORS = ['#ef5350', '#ff9800', '#ffd54f', '#66bb6a', '#26a69a', '#42a5f5', '#5c6bc0', '#ab47bc', '#ec407a', '#8d6e63', '#eceff1', '#37474f', '#1b1a20'];
  const GENDERS = [{ id: 'm', name: 'Парень' }, { id: 'f', name: 'Девушка' }];
  const FACES = {
    m: [{ id: 'kind', name: 'Добряк' }, { id: 'sly', name: 'Хитрый' }, { id: 'brave', name: 'Смелый' }, { id: 'calm', name: 'Спокойный' }],
    f: [{ id: 'cute', name: 'Милая' }, { id: 'bold', name: 'Дерзкая' }, { id: 'dreamy', name: 'Мечтательная' }, { id: 'happy', name: 'Весёлая' }],
  };

  // price > 0 — coin shop; pass — season pass reward only; season — sold only during that season; g — gender only
  const ITEMS = {
    hair: [
      { id: 'short',    name: 'Короткая', price: 0 },
      { id: 'messy',    name: 'Лохматая', price: 0 },
      { id: 'long',     name: 'Длинная',  price: 0 },
      { id: 'pony',     name: 'Хвостик',  price: 0 },
      { id: 'curly',    name: 'Кудри',    price: 0 },
      { id: 'buzz',     name: 'Ёжик',     price: 0 },
      { id: 'bob',      name: 'Каре',     price: 0 },
      { id: 'emo',      name: 'Эмо-чёлка', price: 0, pass: true, season: 'goth' },
      { id: 'gothlong', name: 'Готик-локоны', price: 0, pass: true, season: 'goth' },
      { id: 'kai',      name: 'Kai Angel', price: 0, pass: true, season: 'goth', set: 'kai' },
      { id: 'mice9',    name: '9mice',    price: 0, pass: true, season: 'goth', set: 'mice9' },
    ],
    top: [
      { id: 'tee',      name: 'Футболка',     price: 0 },
      { id: 'hoodie',   name: 'Худи',         price: 0 },
      { id: 'flannel',  name: 'Клетчатая рубашка', price: 0 },
      { id: 'vest',     name: 'Рыбацкий жилет', price: 0 },
      { id: 'sailor',   name: 'Тельняшка',    price: 250 },
      { id: 'raincoat', name: 'Дождевик',     price: 400 },
      { id: 'overalls', name: 'Комбинезон',   price: 600 },
      { id: 'skulltee', name: 'Майка с черепом', price: 900, season: 'goth' },
      { id: 'mesh',     name: 'Сетчатая кофта', price: 0, pass: true, season: 'goth' },
      { id: 'spiked',   name: 'Кожанка с шипами', price: 0, pass: true, season: 'goth' },
      { id: 'gothcoat', name: 'Готический плащ', price: 0, pass: true, season: 'goth' },
      { id: 'kai',      name: 'Топ Kai Angel', price: 0, pass: true, season: 'goth', set: 'kai' },
      { id: 'mice9',    name: 'Бомбер 9mice', price: 0, pass: true, season: 'goth', set: 'mice9' },
    ],
    bottom: [
      { id: 'jeans',    name: 'Джинсы',  price: 0 },
      { id: 'shorts',   name: 'Шорты',   price: 0 },
      { id: 'skirt',    name: 'Юбка',    price: 0 },
      { id: 'waders',   name: 'Забродники', price: 350 },
      { id: 'leather',  name: 'Кожаные штаны', price: 1100, season: 'goth' },
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
      { id: 'witch',    name: 'Шляпа ведьмы', price: 1400, season: 'goth' },
      { id: 'tophat',   name: 'Цилиндр с вуалью', price: 0, pass: true, season: 'goth' },
    ],
    acc: [
      { id: 'none',       name: 'Ничего',        price: 0 },
      { id: 'glasses',    name: 'Очки',          price: 0 },
      { id: 'sunglasses', name: 'Тёмные очки',   price: 0 },
      { id: 'blush',      name: 'Румянец',       price: 0 },
      { id: 'mustache',   name: 'Усы',           price: 150, g: 'm' },
      { id: 'beard',      name: 'Борода',        price: 300, g: 'm' },
      { id: 'bow',        name: 'Бантик',        price: 150, g: 'f' },
      { id: 'scarf',      name: 'Шарф',          price: 350 },
      { id: 'headphones', name: 'Наушники',      price: 600 },
      { id: 'flower',     name: 'Цветок',        price: 400 },
      { id: 'eyepatch',   name: 'Повязка',       price: 1200 },
      { id: 'choker',     name: 'Чокер с шипами', price: 0, pass: true, season: 'goth' },
      { id: 'cross',      name: 'Крест-подвеска', price: 0, pass: true, season: 'goth' },
      { id: 'piercing',   name: 'Пирсинг',       price: 0, pass: true, season: 'goth' },
      { id: 'mice9',      name: 'Маска 9mice',   price: 0, pass: true, season: 'goth', set: 'mice9' },
    ],
    tattoo: [
      { id: 'none',    name: 'Без тату',   price: 0 },
      { id: 'tear',    name: 'Слеза',      price: 700, season: 'goth' },
      { id: 'web',     name: 'Паутина',    price: 0, pass: true, season: 'goth' },
      { id: 'roses',   name: 'Розы',       price: 0, pass: true, season: 'goth' },
      { id: 'crosses', name: 'Кресты',     price: 0, pass: true, season: 'goth' },
      { id: 'bat',     name: 'Летучая мышь', price: 0, pass: true, season: 'goth' },
      { id: 'kai',     name: 'Рукава Kai Angel', price: 0, pass: true, season: 'goth', set: 'kai' },
      { id: 'mice9',   name: 'Angel на шее', price: 0, pass: true, season: 'goth', set: 'mice9' },
    ],
    makeup: [
      { id: 'none',     name: 'Без макияжа', price: 0 },
      { id: 'eyeliner', name: 'Стрелки',     price: 500, season: 'goth' },
      { id: 'darklips', name: 'Тёмная помада', price: 0, pass: true, season: 'goth' },
      { id: 'smoky',    name: 'Смоки-айс',   price: 0, pass: true, season: 'goth' },
      { id: 'pale',     name: 'Бледный грим', price: 0, pass: true, season: 'goth' },
      { id: 'kai',      name: 'Грим Kai Angel', price: 0, pass: true, season: 'goth', set: 'kai' },
    ],
  };
  const LOOK_SLOTS = ['hair', 'top', 'bottom', 'hat', 'acc', 'tattoo', 'makeup'];
  const SLOT_NAMES = { hair: 'Причёска', top: 'Одежда', bottom: 'Низ', hat: 'Головной убор', acc: 'Аксессуар', tattoo: 'Тату', makeup: 'Макияж' };

  const SETS = {
    kai:   { name: 'Kai Angel', items: ['hair:kai', 'top:kai', 'makeup:kai', 'tattoo:kai'], look: { hair: 'kai', hairColor: 8, top: 'kai', topColor: 12, bottom: 'jeans', bottomColor: 12, hat: 'none', makeup: 'kai', tattoo: 'kai', skin: 0 } },
    mice9: { name: '9mice', items: ['hair:mice9', 'top:mice9', 'acc:mice9', 'tattoo:mice9'], look: { hair: 'mice9', hairColor: 8, top: 'mice9', topColor: 12, bottom: 'jeans', bottomColor: 12, hat: 'none', acc: 'mice9', tattoo: 'mice9' } },
  };

  const DEFAULT_LOOK = {
    gender: 'm', face: 0, skin: 1, hair: 'messy', hairColor: 1, top: 'tee', topColor: 5, bottom: 'jeans', bottomColor: 11,
    hat: 'bucket', hatColor: 3, acc: 'none', tattoo: 'none', makeup: 'none',
  };

  /* ───────────── other cosmetics ───────────── */
  const EMOTES = [
    { id: 'wave', e: '👋', name: 'Привет' }, { id: 'laugh', e: '😂', name: 'Смех' }, { id: 'wow', e: '😮', name: 'Вау' },
    { id: 'party', e: '🎉', name: 'Праздник' }, { id: 'like', e: '👍', name: 'Класс' }, { id: 'love', e: '😍', name: 'Любовь' },
    { id: 'bat', e: '🦇', name: 'Летучая мышь', pass: true }, { id: 'blackheart', e: '🖤', name: 'Чёрное сердце', pass: true },
    { id: 'skull', e: '💀', name: 'Череп', pass: true }, { id: 'candle', e: '🕯️', name: 'Свеча', pass: true },
    { id: 'moon', e: '🌙', name: 'Луна', pass: true }, { id: 'crystal', e: '🔮', name: 'Шар судьбы', pass: true },
    { id: 'spider', e: '🕷️', name: 'Паук', pass: true },
  ];
  const EMOTE_BY_ID = Object.fromEntries(EMOTES.map(e => [e.id, e]));
  const EFFECTS = [
    { id: 'none', name: 'Без эффекта', e: '💧' },
    { id: 'bats', name: 'Стая летучих мышей', e: '🦇', pass: true },
    { id: 'feathers', name: 'Чёрные перья', e: '🪶', pass: true },
    { id: 'mist', name: 'Пурпурный туман', e: '🌫️', pass: true },
    { id: 'wisps', name: 'Призрачные огни', e: '👻', pass: true },
  ];
  const POSES = [
    { id: 'none', name: 'Обычная' },
    { id: 'gloom', name: 'Мрачный взгляд', pass: true },
    { id: 'horns', name: 'Рок-коза', pass: true },
    { id: 'vampire', name: 'Вампир', pass: true },
  ];
  const ROD_SKINS = [
    { id: 'none', name: 'Родной цвет', colors: null },
    { id: 'night', name: 'Ночная', colors: ['#3949ab', '#1a1f4f', '#b388ff'], pass: true },
    { id: 'obsidian', name: 'Обсидиан', colors: ['#2d2a3a', '#120f1a', '#9b5cff'], pass: true },
    { id: 'bone', name: 'Костяная', colors: ['#e9e2cf', '#9c917a', '#5a5246'], pass: true },
    { id: 'bloodmoon', name: 'Кровавая луна', colors: ['#b3122e', '#4a0612', '#ffcc66'], pass: true },
    { id: 'raven', name: 'Воронья', colors: ['#1c1c22', '#000000', '#c0c0c8'], price: 2000, season: 'goth' },
  ];
  const HOUSE_SLOTS = [
    { id: 'window', name: 'Окно' }, { id: 'wall', name: 'Стена' }, { id: 'shelf', name: 'Полка' }, { id: 'hearth', name: 'Очаг' },
    { id: 'tank', name: 'Аквариум' }, { id: 'light', name: 'Свет' }, { id: 'seat', name: 'Сиденье' }, { id: 'floor', name: 'Пол' },
  ];
  const FURNITURE = [
    { id: 'window', name: 'Окно', slot: 'window', price: 0 },
    { id: 'stainedglass', name: 'Витраж', slot: 'window', pass: true, season: 'goth' },
    { id: 'painting', name: 'Картина «Закат»', slot: 'wall', price: 400 },
    { id: 'map', name: 'Карта водоёмов', slot: 'wall', price: 600 },
    { id: 'clock', name: 'Часы с кукушкой', slot: 'wall', price: 900 },
    { id: 'bookshelf', name: 'Книжная полка', slot: 'shelf', price: 700 },
    { id: 'skullshelf', name: 'Полка с черепом', slot: 'shelf', pass: true, season: 'goth' },
    { id: 'stove', name: 'Печка-буржуйка', slot: 'hearth', price: 1200 },
    { id: 'fireplace', name: 'Камин', slot: 'hearth', price: 2500 },
    { id: 'tank', name: 'Аквариум', slot: 'tank', price: 1500 },
    { id: 'darktank', name: 'Аквариум «Тьма»', slot: 'tank', pass: true, season: 'goth' },
    { id: 'plant', name: 'Фикус', slot: 'light', price: 350 },
    { id: 'lamp', name: 'Торшер', slot: 'light', price: 500 },
    { id: 'candelabra', name: 'Канделябр', slot: 'light', pass: true, season: 'goth' },
    { id: 'stool', name: 'Табурет', slot: 'seat', price: 0 },
    { id: 'armchair', name: 'Кресло', slot: 'seat', price: 800 },
    { id: 'gothchair', name: 'Готическое кресло', slot: 'seat', pass: true, season: 'goth' },
    { id: 'coffin', name: 'Диван-гроб', slot: 'seat', price: 2400, season: 'goth' },
    { id: 'rug', name: 'Коврик', slot: 'floor', price: 300 },
    { id: 'fishrug', name: 'Ковёр-рыба', slot: 'floor', price: 1200 },
  ];
  const FURN_BY_ID = Object.fromEntries(FURNITURE.map(f => [f.id, f]));

  /* ───────────── achievements & titles ───────────── */
  const ACHIEVEMENTS = [
    { id: 'license',   name: 'Лицензия получена', desc: 'Сдай экзамен на лицензию рыбака', title: 'Лицензированный рыбак', coins: 0 },
    { id: 'first',     name: 'Первый улов',      desc: 'Поймай свою первую рыбу', coins: 50 },
    { id: 'c100',      name: 'Сотня',            desc: 'Поймай 100 рыб', title: 'Опытный рыбак', coins: 500 },
    { id: 'c1000',     name: 'Тысячник',         desc: 'Поймай 1000 рыб', title: 'Мастер удочки', coins: 3000 },
    { id: 'rare',      name: 'Редкая удача',     desc: 'Поймай редкую рыбу', coins: 100 },
    { id: 'epic',      name: 'Эпический момент', desc: 'Поймай эпическую рыбу', title: 'Охотник за трофеями', coins: 300 },
    { id: 'legend',    name: 'Легенда',          desc: 'Поймай легендарную рыбу', title: 'Легенда водоёмов', coins: 1000 },
    { id: 'goldfish',  name: 'Три желания',      desc: 'Поймай Золотую рыбку', title: 'Исполнитель желаний', coins: 500 },
    { id: 'record',    name: 'Рекордсмен',       desc: 'Поймай рыбу тяжелее 90% от максимума её вида', title: 'Рекордсмен', coins: 400 },
    { id: 'heavy',     name: 'Тяжеловес',        desc: 'Вытащи рыбу тяжелее 50 кг', coins: 600 },
    { id: 'locations', name: 'Путешественник',   desc: 'Поймай рыбу во всех четырёх локациях', title: 'Путешественник', coins: 500 },
    { id: 'lakeall',   name: 'Знаток озера',     desc: 'Собери в дневнике всех рыб Тихого озера', title: 'Знаток озера', coins: 800 },
    { id: 'diary25',   name: 'Ихтиолог',         desc: 'Собери 25 видов в дневнике', title: 'Ихтиолог', coins: 1500 },
    { id: 'tourney',   name: 'Участник турнира', desc: 'Прими участие в турнире', coins: 150 },
    { id: 'podium',    name: 'Пьедестал',        desc: 'Попади в тройку лучших турнира', title: 'Призёр турнира', coins: 0 },
    { id: 'champion',  name: 'Чемпион',          desc: 'Займи первое место в турнире', title: 'Чемпион турнира', coins: 0 },
    { id: 'boss',      name: 'Охотник на Левиафана', desc: 'Победи босса вместе с друзьями', title: 'Гроза Левиафана', coins: 300 },
    { id: 'boss5',     name: 'Укротитель чудищ', desc: 'Победи 5 боссов', title: 'Укротитель чудищ', coins: 1000 },
    { id: 'seasonfish',name: 'Дитя сезона',      desc: 'Поймай всех рыб текущего сезона', title: 'Дитя сезона', coins: 700 },
    { id: 'pass30',    name: 'Сезон пройден',    desc: 'Достигни 30 уровня рыболовного пропуска', coins: 1000 },
    { id: 'host',      name: 'Гостеприимный',    desc: 'Прими гостя в домике рыбака', coins: 200 },
    { id: 'gift',      name: 'Щедрая душа',      desc: 'Подари предмет другому рыбаку', coins: 100 },
    { id: 'rich',      name: 'Магнат',           desc: 'Заработай 100 000 монет на продаже улова', title: 'Магнат', coins: 2000 },
  ];
  const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
  const TITLES = Object.assign(
    Object.fromEntries(ACHIEVEMENTS.filter(a => a.title).map(a => [a.id, a.title])),
    { nightchild: 'Дитя ночи', darklord: 'Повелитель тьмы', gothsurvivor: 'Пережил Goth-сезон' },
  );

  // snapshot: { caught, earned, collection:{id:{count,best}}, locs:[], bossWins, tourney:{played,wins,podium}, passLevel, license, gifts, hosted, season }
  function evalAchievements(s) {
    const col = s.collection || {}, got = id => !!col[id];
    const species = Object.keys(col).filter(id => FISH_BY_ID[id]);
    const tiers = species.map(id => RARITY_ORDER.indexOf(FISH_BY_ID[id].rarity));
    const out = [];
    const add = (c, id) => { if (c) out.push(id); };
    add(s.license, 'license');
    add(s.caught >= 1, 'first');
    add(s.caught >= 100, 'c100');
    add(s.caught >= 1000, 'c1000');
    add(tiers.some(t => t >= 2), 'rare');
    add(tiers.some(t => t >= 3), 'epic');
    add(tiers.some(t => t >= 4), 'legend');
    add(got('goldfish'), 'goldfish');
    add(species.some(id => col[id].best >= FISH_BY_ID[id].maxW * 0.9), 'record');
    add(species.some(id => col[id].best >= 50), 'heavy');
    add(LOCATIONS.every(l => (s.locs || []).includes(l.id)), 'locations');
    add(FISH.filter(f => f.loc.includes('lake') && !f.season).every(f => got(f.id)), 'lakeall');
    add(species.length >= 25, 'diary25');
    const t = s.tourney || {};
    add(t.played >= 1, 'tourney');
    add(t.podium >= 1, 'podium');
    add(t.wins >= 1, 'champion');
    add(s.bossWins >= 1, 'boss');
    add(s.bossWins >= 5, 'boss5');
    const sf = FISH.filter(f => f.season && f.season === s.season);
    add(sf.length > 0 && sf.every(f => got(f.id)), 'seasonfish');
    add(s.passLevel >= PASS_LEVELS, 'pass30');
    add(s.hosted >= 1, 'host');
    add(s.gifts >= 1, 'gift');
    add(s.earned >= 100000, 'rich');
    return out;
  }

  /* ───────────── seasons & fishing pass ───────────── */
  const PASS_LEVELS = 30;
  const PASS_XP = 100;              // XP per pass level
  const PASS_PRICE_STARS = 100;     // premium track price in Telegram Stars
  const PASS_XP_RARITY = [3, 5, 9, 16, 40];

  // reward: { coins } | { bait, n } | { item: 'slot:id' } | { set }
  const SEASONS = [
    {
      id: 'goth', name: 'Goth', title: 'Сезон 1 · Goth', start: Date.UTC(2026, 9, 20), end: Date.UTC(2027, 0, 1),
      desc: 'Над водоёмами сгустилась тьма: летучие мыши, призрачные огни и рыбы, которых не видели при свете дня.',
      theme: { accent: '#9b5cff', accent2: '#ff3d7f', dark: '#1d1230' },
      boss: { name: 'Костяной Левиафан', fish: 'bonefish' },
      free: {
        1: { coins: 100 }, 2: { bait: 'glowbait', n: 3 }, 3: { item: 'emote:blackheart' }, 4: { coins: 150 }, 5: { item: 'hair:emo' },
        6: { bait: 'spoon', n: 5 }, 7: { coins: 200 }, 8: { item: 'tattoo:roses' }, 9: { item: 'emote:skull' }, 10: { item: 'makeup:smoky' },
        11: { coins: 250 }, 12: { item: 'furn:skullshelf' }, 13: { bait: 'livebait', n: 4 }, 14: { coins: 300 }, 15: { item: 'acc:cross' },
        16: { item: 'top:spiked' }, 17: { coins: 350 }, 18: { item: 'emote:moon' }, 19: { bait: 'glowbait', n: 5 }, 20: { item: 'hat:tophat' },
        21: { coins: 400 }, 22: { item: 'makeup:pale' }, 23: { bait: 'shrimp', n: 6 }, 24: { coins: 450 }, 25: { item: 'skin:night' },
        26: { coins: 500 }, 27: { bait: 'livebait', n: 6 }, 28: { item: 'emote:spider' }, 29: { coins: 600 }, 30: { item: 'title:gothsurvivor' },
      },
      premium: {
        1: { item: 'emote:bat' }, 2: { item: 'tattoo:web' }, 3: { item: 'makeup:darklips' }, 4: { item: 'skin:obsidian' }, 5: { item: 'effect:bats' },
        6: { item: 'acc:choker' }, 7: { item: 'pose:gloom' }, 8: { item: 'top:mesh' }, 9: { item: 'furn:candelabra' }, 10: { item: 'skin:bone' },
        11: { item: 'hair:gothlong' }, 12: { item: 'emote:candle' }, 13: { item: 'tattoo:crosses' }, 14: { item: 'effect:feathers' }, 15: { set: 'kai' },
        16: { item: 'pose:horns' }, 17: { item: 'furn:darktank' }, 18: { item: 'skin:bloodmoon' }, 19: { item: 'title:nightchild' }, 20: { item: 'effect:mist' },
        21: { item: 'tattoo:bat' }, 22: { item: 'furn:gothchair' }, 23: { item: 'emote:crystal' }, 24: { item: 'acc:piercing' }, 25: { item: 'pose:vampire' },
        26: { item: 'top:gothcoat' }, 27: { item: 'furn:stainedglass' }, 28: { item: 'effect:wisps' }, 29: { item: 'title:darklord' }, 30: { set: 'mice9' },
      },
      special: [
        { id: 's_ghost',   name: 'Поймай Призрачную щуку', ev: 'catch', species: 'ghostpike', n: 1, xp: 800 },
        { id: 's_season',  name: 'Поймай всех рыб сезона', ev: 'catch', distinct: 'season', n: 3, xp: 1000 },
        { id: 's_locs',    name: 'Поймай рыбу во всех 4 локациях', ev: 'catch', distinct: 'loc', n: 4, xp: 600 },
        { id: 's_boss3',   name: 'Победи 3 боссов в кооп-комнатах', ev: 'boss', n: 3, xp: 900 },
        { id: 's_visit',   name: 'Загляни в гости в домик друга', ev: 'visit', n: 1, xp: 300 },
        { id: 's_gift',    name: 'Подари предмет другому рыбаку', ev: 'gift', n: 1, xp: 300 },
      ],
    },
  ];
  const SEASON_BY_ID = Object.fromEntries(SEASONS.map(s => [s.id, s]));
  function seasonAt(now) { return SEASONS.find(s => now >= s.start && now < s.end) || null; }
  function passLevel(xp) {
    const level = Math.min(PASS_LEVELS, Math.floor((xp || 0) / PASS_XP));
    return { level, cur: level >= PASS_LEVELS ? PASS_XP : (xp || 0) % PASS_XP, need: PASS_XP, max: PASS_LEVELS };
  }

  /* ───────────── item catalogue (every ownable thing) ───────────── */
  // key 'slot:id' → { key, kind, id, name, price, pass, season, tradable }
  function itemInfo(key) {
    const i = String(key || '').indexOf(':');
    if (i < 0) return null;
    const kind = key.slice(0, i), id = key.slice(i + 1);
    let it = null, name = '';
    if (ITEMS[kind]) { it = findItem(kind, id); }
    else if (kind === 'rod') it = ROD_BY_ID[id];
    else if (kind === 'line' || kind === 'hook') it = findTackle(kind, id);
    else if (kind === 'emote') it = EMOTE_BY_ID[id];
    else if (kind === 'effect') it = EFFECTS.find(e => e.id === id);
    else if (kind === 'pose') it = POSES.find(p => p.id === id);
    else if (kind === 'skin') it = ROD_SKINS.find(s => s.id === id);
    else if (kind === 'furn') it = FURN_BY_ID[id];
    else if (kind === 'title') { if (TITLES[id]) it = { id, name: TITLES[id], pass: true }; }
    if (!it) return null;
    name = it.name;
    const price = it.price || 0;
    return {
      key, kind, id, name, price, pass: !!it.pass, season: it.season || null, g: it.g || null,
      tradable: price > 0 && !it.pass && kind !== 'rod' && kind !== 'line' && kind !== 'hook' && kind !== 'title',
      free: !it.pass && price === 0,
    };
  }
  function rewardItems(r) { return r ? (r.set ? SETS[r.set].items.slice() : r.item ? [r.item] : []) : []; }
  function rewardName(r) {
    if (!r) return '';
    if (r.coins) return r.coins + ' монет';
    if (r.bait) return BAIT_BY_ID[r.bait].name + ' ×' + r.n;
    if (r.set) return 'Сет «' + SETS[r.set].name + '»';
    const info = itemInfo(r.item);
    return info ? info.name : r.item;
  }

  function itemKey(slot, id) { return slot + ':' + id; }
  function findItem(slot, id) { return (ITEMS[slot] || []).find(i => i.id === id); }
  function isFreeItem(it) { return it && !it.pass && !(it.price > 0); }

  function sanitizeLook(look, owned) {
    const out = Object.assign({}, DEFAULT_LOOK);
    if (!look || typeof look !== 'object') return out;
    const idx = (v, n, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
    out.gender = look.gender === 'f' ? 'f' : 'm';
    out.face = idx(look.face, FACES[out.gender].length, 0);
    out.skin = idx(look.skin, SKINS.length, out.skin);
    out.hairColor = idx(look.hairColor, HAIR_COLORS.length, out.hairColor);
    out.topColor = idx(look.topColor, CLOTH_COLORS.length, out.topColor);
    out.bottomColor = idx(look.bottomColor, CLOTH_COLORS.length, out.bottomColor);
    out.hatColor = idx(look.hatColor, CLOTH_COLORS.length, out.hatColor);
    for (const slot of LOOK_SLOTS) {
      const it = findItem(slot, look[slot]);
      if (!it) continue;
      if (it.g && it.g !== out.gender) continue;
      if (isFreeItem(it) || !owned || owned.has(itemKey(slot, it.id))) out[slot] = it.id;
    }
    return out;
  }

  /* ───────────── progression ───────────── */
  function levelFromXp(xp) {
    let lvl = 1, need = 60, rest = xp;
    while (rest >= need) { rest -= need; lvl++; need = Math.round(need * 1.25 + 20); }
    return { level: lvl, cur: rest, need };
  }
  const levelReward = lvl => 50 + lvl * 25;
  function locUnlocked(loc, level) { const l = LOC_BY_ID[loc]; return !!l && level >= l.level; }

  /* ───────────── license quest ───────────── */
  const LICENSE = {
    steps: [
      { id: 'look',  name: 'Создай своего рыбака', goal: 1 },
      { id: 'cast',  name: 'Сделай 3 заброса', goal: 3 },
      { id: 'catch', name: 'Поймай 3 рыбы', goal: 3 },
      { id: 'sell',  name: 'Продай рыбу из садка', goal: 1 },
      { id: 'exam',  name: 'Сдай теорию: 4 вопроса', goal: 1 },
    ],
    exam: [
      { q: 'Когда нужно подсекать рыбу?', a: ['Как только поплавок дёрнулся', 'Когда поплавок ушёл под воду и появился «!»', 'Сразу после заброса'], ok: 1 },
      { q: 'Стрелка натяжения в красной зоне. Что делать?', a: ['Тянуть ещё сильнее', 'Отпустить кнопку «Тяни»', 'Смотать удочку'], ok: 1 },
      { q: 'Как забросить крючок глубже?', a: ['Держать кнопку заброса до нужной силы', 'Купить побольше наживки', 'Быстро нажать кнопку дважды'], ok: 0 },
      { q: 'Где обычно живут самые редкие и крупные рыбы?', a: ['У самой поверхности', 'На глубине', 'Только в садке'], ok: 1 },
    ],
    reward: { coins: 300, bait: 'bloodworm', n: 5 },
  };
  function licenseView(lic) {
    lic = lic || {};
    return LICENSE.steps.map(s => ({ id: s.id, name: s.name, goal: s.goal, prog: Math.min(s.goal, lic[s.id] || 0), done: (lic[s.id] || 0) >= s.goal }));
  }
  function licenseReadyForExam(lic) { return LICENSE.steps.filter(s => s.id !== 'exam').every(s => ((lic || {})[s.id] || 0) >= s.goal); }
  function checkExam(answers) {
    return Array.isArray(answers) && answers.length === LICENSE.exam.length && LICENSE.exam.every((q, i) => Number(answers[i]) === q.ok);
  }
  // ev: 'look' | 'cast' | 'catch' | 'sell'; returns true if something changed
  function licenseProgress(lic, ev) {
    const step = LICENSE.steps.find(s => s.id === ev);
    if (!step || (lic[ev] || 0) >= step.goal) return false;
    lic[ev] = (lic[ev] || 0) + 1;
    return true;
  }

  /* ───────────── time helpers (Moscow) ───────────── */
  const DAY = 86400e3;
  const msk = now => new Date(now + TZ * 3600e3);
  function dayStart(now) { const d = msk(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - TZ * 3600e3; }
  function dayKey(now) { return msk(now).toISOString().slice(0, 10); }
  function weekStart(now) { const s = dayStart(now); const wd = msk(s).getUTCDay() || 7; return s - (wd - 1) * DAY; }
  function weekKey(now) {
    const d = msk(now);
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const wd = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - wd);
    const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
    return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y0) / DAY + 1) / 7)).padStart(2, '0');
  }
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(seed) { let s = hash(String(seed)); return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ───────────── quests ───────────── */
  // ev 'catch' filters: rarity (min tier), night, coop, bait (non-worm), notLoc, seasonal, species; sum: 'weight'
  const QUEST_POOL = {
    daily: [
      { id: 'd_catch',  name: 'Поймай {n} рыб', ev: 'catch', n: [6, 8, 10], xp: 80 },
      { id: 'd_rare',   name: 'Поймай редкую рыбу или лучше', ev: 'catch', rarity: 2, n: [1], xp: 140 },
      { id: 'd_cast',   name: 'Сделай {n} забросов', ev: 'cast', n: [15, 20], xp: 60 },
      { id: 'd_sell',   name: 'Продай улов на {n} монет', ev: 'sell', n: [300, 500, 800], xp: 90 },
      { id: 'd_weight', name: 'Налови {n} кг рыбы', ev: 'catch', sum: 'weight', n: [10, 20, 30], xp: 100 },
      { id: 'd_bait',   name: 'Поймай {n} рыб на наживку (не червяк)', ev: 'catch', bait: true, n: [3, 5], xp: 90 },
      { id: 'd_coop',   name: 'Поймай {n} рыб в кооп-комнате', ev: 'catch', coop: true, n: [3, 5], xp: 110 },
      { id: 'd_night',  name: 'Поймай {n} рыб ночью (21:00–6:00)', ev: 'catch', night: true, n: [3], xp: 100 },
      { id: 'd_away',   name: 'Поймай {n} рыб вдали от озера', ev: 'catch', notLoc: 'lake', n: [4], xp: 100 },
    ],
    weekly: [
      { id: 'w_catch',  name: 'Поймай {n} рыб', ev: 'catch', n: [60, 80], xp: 400 },
      { id: 'w_rare',   name: 'Поймай {n} редких рыб или лучше', ev: 'catch', rarity: 2, n: [5, 8], xp: 450 },
      { id: 'w_epic',   name: 'Поймай эпическую рыбу', ev: 'catch', rarity: 3, n: [1], xp: 500 },
      { id: 'w_earn',   name: 'Заработай {n} монет на продаже', ev: 'sell', n: [3000, 5000], xp: 400 },
      { id: 'w_season', name: 'Поймай {n} сезонных рыб', ev: 'catch', seasonal: true, n: [3, 5], xp: 500, needSeason: true },
      { id: 'w_boss',   name: 'Победи босса в кооп-комнате', ev: 'boss', n: [1], xp: 500 },
      { id: 'w_tourney',name: 'Прими участие в турнире', ev: 'tourney', n: [1], xp: 300 },
    ],
  };
  function pickQuests(pool, count, seed, seasonId) {
    const r = seeded(seed);
    const list = pool.filter(q => !q.needSeason || seasonId);
    const out = [];
    while (out.length < count && list.length) {
      const q = list.splice(Math.floor(r() * list.length), 1)[0];
      out.push({ id: q.id, n: q.n[Math.floor(r() * q.n.length)], prog: 0, done: false });
    }
    return out;
  }
  // bring quest state up to date for "now"; returns true if it changed
  function syncQuests(qs, now) {
    const season = seasonAt(now);
    let changed = false;
    const dk = dayKey(now), wk = weekKey(now), sid = season ? season.id : null;
    if (qs.day !== dk) { qs.day = dk; qs.daily = pickQuests(QUEST_POOL.daily, 3, 'd' + dk, sid); changed = true; }
    if (qs.week !== wk) { qs.week = wk; qs.weekly = pickQuests(QUEST_POOL.weekly, 3, 'w' + wk, sid); changed = true; }
    if (qs.season !== sid) {
      qs.season = sid;
      qs.special = season ? season.special.map(q => ({ id: q.id, prog: 0, done: false, seen: [] })) : [];
      changed = true;
    }
    return changed;
  }
  function questDef(id, seasonId) {
    const all = QUEST_POOL.daily.concat(QUEST_POOL.weekly, (SEASON_BY_ID[seasonId] || { special: [] }).special);
    return all.find(q => q.id === id);
  }
  function questName(def, n) { return def.name.replace('{n}', String(n)); }
  // ev: { type:'catch', species, weight, tier, loc, night, coop, bait, seasonal } | { type:'sell', coins } | { type:'cast' } | { type:'boss' } | { type:'tourney' } | { type:'visit' } | { type:'gift' }
  function questProgress(qs, ev) {
    const done = [];
    const test = (def, q, n) => {
      if (q.done || def.ev !== ev.type) return;
      if (ev.type === 'catch') {
        if (def.rarity != null && ev.tier < def.rarity) return;
        if (def.night && !ev.night) return;
        if (def.coop && !ev.coop) return;
        if (def.bait && (!ev.bait || ev.bait === 'worm')) return;
        if (def.notLoc && ev.loc === def.notLoc) return;
        if (def.seasonal && !ev.seasonal) return;
        if (def.species && ev.species !== def.species) return;
        if (def.distinct) {
          const key = def.distinct === 'loc' ? ev.loc : ev.seasonal ? ev.species : null;
          if (!key) return;
          q.seen = q.seen || [];
          if (q.seen.includes(key)) return;
          q.seen.push(key);
          q.prog = q.seen.length;
        } else q.prog += def.sum === 'weight' ? ev.weight : 1;
      } else if (ev.type === 'sell') q.prog += ev.coins || 0;
      else q.prog += 1;
      if (q.prog >= n) { q.prog = n; q.done = true; done.push({ id: def.id, name: questName(def, n), xp: def.xp }); }
    };
    for (const q of qs.daily || []) { const d = questDef(q.id); if (d) test(d, q, q.n); }
    for (const q of qs.weekly || []) { const d = questDef(q.id); if (d) test(d, q, q.n); }
    for (const q of qs.special || []) { const d = questDef(q.id, qs.season); if (d) test(d, q, d.n); }
    return done;
  }
  function questView(qs, now) {
    const map = (list, seasonId) => (list || []).map(q => {
      const d = questDef(q.id, seasonId);
      if (!d) return null;
      const n = q.n || d.n;
      return { id: q.id, name: questName(d, n), n, prog: Math.round(q.prog * 10) / 10, done: q.done, xp: d.xp };
    }).filter(Boolean);
    return {
      daily: map(qs.daily), weekly: map(qs.weekly), special: map(qs.special, qs.season),
      dayEnds: dayStart(now) + DAY, weekEnds: weekStart(now) + 7 * DAY,
    };
  }

  /* ───────────── events, tournaments, boss ───────────── */
  // days: Moscow weekdays (0 = Sunday); from/to: Moscow hours (to may exceed 24)
  const EVENTS = [
    { id: 'happy',    name: 'Час клёва',          emoji: '⏰', days: null,   from: 19, to: 20, mods: { bite: 0.67, passXp: 2 }, desc: 'Рыба клюёт в полтора раза быстрее, опыт пропуска за улов ×2.' },
    { id: 'batnight', name: 'Ночь летучих мышей', emoji: '🦇', days: [5, 6], from: 21, to: 25, season: 'goth', mods: { seasonFish: 3 }, desc: 'Сезонные рыбы попадаются втрое чаще.' },
    { id: 'bossrush', name: 'Охота на Левиафана', emoji: '🐙', days: [0],    from: 12, to: 22, mods: { boss: 2 }, desc: 'В кооп-комнатах боссы появляются вдвое чаще.' },
  ];
  const TOURNEY = { days: [6], from: 0, to: 48, prizes: [{ coins: 3000, xp: 300 }, { coins: 1500, xp: 200 }, { coins: 800, xp: 100 }], joinXp: 50 };
  const TOURNEY_SPECIES = ['pike', 'carp', 'perch', 'bream', 'catfish', 'trout', 'zander', 'salmon', 'chub', 'tench'];

  function occurrence(ev, now, back) {
    const today = dayStart(now);
    for (let i = back ? 0 : -2; back ? i <= 9 : i <= 8; i++) {
      const ds = back ? today - i * DAY : today + i * DAY;
      const wd = msk(ds).getUTCDay();
      if (ev.days && !ev.days.includes(wd)) continue;
      const s = ds + ev.from * 3600e3, e = ds + ev.to * 3600e3;
      if (back) { if (e <= now) return { start: s, end: e }; }
      else if (e > now) return { start: s, end: e, active: s <= now };
    }
    return null;
  }
  function eventSchedule(now) {
    const season = seasonAt(now);
    return EVENTS.filter(e => !e.season || (season && season.id === e.season))
      .map(e => Object.assign({ id: e.id, name: e.name, emoji: e.emoji, desc: e.desc, mods: e.mods }, occurrence(e, now)))
      .filter(e => e.start != null)
      .sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || a.start - b.start);
  }
  function eventMods(now) {
    const m = { bite: 1, passXp: 1, seasonFish: 1, boss: 1 };
    for (const e of eventSchedule(now)) if (e.active) for (const k in e.mods) m[k] *= e.mods[k];
    return m;
  }
  function tourneyInfo(occ) {
    if (!occ) return null;
    const species = TOURNEY_SPECIES[Math.floor(occ.start / (7 * DAY)) % TOURNEY_SPECIES.length];
    return { id: 't' + dayKey(occ.start + 3600e3), species, start: occ.start, end: occ.end, active: !!occ.active };
  }
  function tournamentAt(now) { return tourneyInfo(occurrence(TOURNEY, now)); }
  function lastTournament(now) { return tourneyInfo(occurrence(TOURNEY, now, true)); }

  const BOSS = { hpPerPlayer: 120, duration: 240e3, every: [300e3, 480e3], reward: { coins: 400, xp: 200 } };
  function bossFor(seasonId) { const s = SEASON_BY_ID[seasonId]; return s && s.boss ? s.boss : { name: 'Древний сом', fish: 'catfish' }; }
  function bossDamage(species, weight) {
    const f = FISH_BY_ID[species];
    if (!f) return 10;
    const t = (weight - f.minW) / Math.max(0.01, f.maxW - f.minW);
    return Math.round(12 + RARITY_ORDER.indexOf(f.rarity) * 10 + t * 12);
  }

  /* ───────────── fishing rules ───────────── */
  function isNight(hour) { return hour >= 21 || hour < 6; }

  // effective stats of rod + line + hook + bait
  function gear(rodId, m, hour) {
    m = m || {};
    const rod = ROD_BY_ID[rodId] || RODS[0];
    const line = findTackle('line', m.line) || TACKLE.line[0];
    const hook = findTackle('hook', m.hook) || TACKLE.hook[0];
    const bait = BAIT_BY_ID[m.bait] || BAITS[0];
    const baitLuck = bait.night && !isNight(hour) ? 1 : bait.luck;
    return {
      rod: rod.id, power: rod.power * line.power, reel: rod.reel, luck: rod.luck * hook.luck * baitLuck, depth: rod.depth,
      bite: rod.bite * (line.bite || 1) * bait.bite, window: hook.window || 0, likes: bait.likes || [], big: bait.big || 1, bait: bait.id,
    };
  }

  function fishPool(depth, hour, loc, seasonId) {
    const night = isNight(hour);
    loc = LOC_BY_ID[loc] ? loc : 'lake';
    return FISH.filter(f => {
      if (!f.loc.includes(loc)) return false;
      if (f.season && f.season !== seasonId) return false;
      if (depth < f.depth[0] - 0.03 || depth > f.depth[1] + 0.03) return false;
      if (f.time === 'day' && night) return false;
      if (f.time === 'night' && !night) return false;
      return true;
    });
  }

  // opts: { loc, season, seasonFish (multiplier), rnd }
  function rollFish(depth, g, hour, opts) {
    opts = opts || {};
    const rnd = opts.rnd || Math.random;
    const pool = fishPool(depth, hour, opts.loc, opts.season);
    const list = pool.length ? pool : [FISH_BY_ID[LOC_FALLBACK[opts.loc] || 'crucian']];
    const likes = g.likes || [];
    const weights = list.map(f => {
      const tier = RARITY_ORDER.indexOf(f.rarity);
      let w = RARITY[f.rarity].weight * (tier >= 2 ? g.luck : tier === 1 ? Math.sqrt(g.luck) : 1);
      if (likes.includes(f.id)) w *= 3;
      if (f.season) w *= opts.seasonFish || 1;
      return w;
    });
    let sum = weights.reduce((a, b) => a + b, 0), x = rnd() * sum;
    let fish = list[list.length - 1];
    for (let i = 0; i < list.length; i++) { x -= weights[i]; if (x <= 0) { fish = list[i]; break; } }
    // weight skewed to smaller fish; deeper casts, luck and big baits give bigger fish
    let t = Math.pow(rnd(), 2.2 - Math.min(0.9, depth * 0.5 + (g.luck - 1) * 0.3));
    if (g.big > 1) t = 1 - Math.pow(1 - t, g.big);
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
  // g: gear() result (a plain rod also works); opts: { loc, season, bite (event multiplier), seasonFish, rnd }
  function planCast(depth, g, hour, opts) {
    opts = opts || {};
    const rnd = opts.rnd || Math.random;
    g = Object.assign({ window: 0, likes: [], big: 1 }, g);
    const catchInfo = rollFish(depth, g, hour, Object.assign({}, opts, { rnd }));
    const f = FISH_BY_ID[catchInfo.species];
    const wait = (2600 + rnd() * 6500 + depth * 2500) * g.bite * (opts.bite || 1);
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
      biteWindow: Math.round(950 + (g.reel - 1) * 600 + g.window),
      fight: {
        strength: Math.min(1, (f.power / 10) * 0.75 + sizeT * 0.25), // 0..1
        stamina: 4 + f.power * 0.9 + tier * 1.5 + sizeT * 3,         // seconds of good reeling
        rushiness: 0.25 + f.power * 0.06,
        power: g.power, reel: g.reel,
      },
    };
  }

  return {
    MAX_PLAYERS, START_COINS, TZ, RARITY, RARITY_ORDER, LOCATIONS, LOC_BY_ID, FISH, FISH_BY_ID, RODS, ROD_BY_ID,
    BAITS, BAIT_BY_ID, TACKLE, findTackle,
    SKINS, HAIR_COLORS, CLOTH_COLORS, GENDERS, FACES, ITEMS, LOOK_SLOTS, SLOT_NAMES, SETS, DEFAULT_LOOK,
    EMOTES, EMOTE_BY_ID, EFFECTS, POSES, ROD_SKINS, HOUSE_SLOTS, FURNITURE, FURN_BY_ID,
    ACHIEVEMENTS, ACH_BY_ID, TITLES, evalAchievements,
    PASS_LEVELS, PASS_XP, PASS_PRICE_STARS, PASS_XP_RARITY, SEASONS, SEASON_BY_ID, seasonAt, passLevel,
    itemInfo, rewardItems, rewardName, itemKey, findItem, isFreeItem, sanitizeLook,
    levelFromXp, levelReward, locUnlocked,
    LICENSE, licenseView, licenseReadyForExam, checkExam, licenseProgress,
    DAY, dayStart, dayKey, weekStart, weekKey,
    QUEST_POOL, syncQuests, questProgress, questView, questDef,
    EVENTS, TOURNEY, TOURNEY_SPECIES, eventSchedule, eventMods, tournamentAt, lastTournament, BOSS, bossFor, bossDamage,
    isNight, gear, fishPool, rollFish, fishPrice, fishXp, planCast,
  };
});
