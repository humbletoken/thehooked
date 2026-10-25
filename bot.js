/*
 * Hooked — cozy co-op fishing (Telegram Mini App)
 * One file runs everything: web server + API + WebSocket rooms + SQLite + Telegram bot.
 */
'use strict';

try { process.loadEnvFile(); } catch { /* no .env — use real environment */ }

// node:sqlite still prints an ExperimentalWarning on some Node versions — keep logs clean
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...args) {
  if (String(warning && warning.message || warning).includes('SQLite')) return;
  return emitWarning.call(process, warning, ...args);
};

const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');
const { DatabaseSync } = require('node:sqlite');
const G = require('./public/js/data.js');

/* ───────────────────────── config ───────────────────────── */

const env = process.env;
const normalizeDomain = d => {
  if (!d) return '';
  d = d.trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(d) ? d : 'https://' + d;
};
const CFG = {
  token: (env.BOT_TOKEN || '').trim(),
  webUrl: normalizeDomain(env.DOMAIN),
  port: Number(env.PORT) || 3000,
  botUsername: (env.BOT_USERNAME || 'HookedGame').replace(/^@/, ''),
  appShortName: (env.APP_SHORT_NAME || '').trim(),
  dbPath: env.DB_PATH || path.join(__dirname, 'data', 'hooked.db'),
  botMode: (env.BOT_MODE || 'polling').toLowerCase(),
  admins: (env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  emojiPack: env.EMOJI_PACK || 'tgiosicons',
  emojiOverrides: parseJson(env.EMOJI_IDS, {}),
  startCoins: Number(env.START_COINS) || G.START_COINS,
};
CFG.allowGuest = env.ALLOW_GUEST ? env.ALLOW_GUEST === 'true' : !CFG.token;
CFG.webhookSecret = env.WEBHOOK_SECRET || crypto.createHash('sha256').update('hooked:' + CFG.token).digest('hex').slice(0, 32);

function parseJson(s, def) { try { return s ? JSON.parse(s) : def; } catch { return def; } }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function appLink(startParam) {
  const base = `https://t.me/${CFG.botUsername}` + (CFG.appShortName ? '/' + CFG.appShortName : '');
  return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : (CFG.appShortName ? base : base + '?startapp');
}

/* ───────────────────────── database ───────────────────────── */

fs.mkdirSync(path.dirname(CFG.dbPath), { recursive: true });
const db = new DatabaseSync(CFG.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT '',
    coins INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    look TEXT,
    customized INTEGER NOT NULL DEFAULT 0,
    rod TEXT NOT NULL DEFAULT 'bamboo',
    total_caught INTEGER NOT NULL DEFAULT 0,
    total_earned INTEGER NOT NULL DEFAULT 0,
    best_species TEXT,
    best_weight REAL NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS owned (
    user_id TEXT NOT NULL, item TEXT NOT NULL,
    PRIMARY KEY (user_id, item)
  );
  CREATE TABLE IF NOT EXISTS keepnet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, species TEXT NOT NULL, weight REAL NOT NULL,
    price INTEGER NOT NULL, caught_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS keepnet_user ON keepnet(user_id);
  CREATE TABLE IF NOT EXISTS collection (
    user_id TEXT NOT NULL, species TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0, best_weight REAL NOT NULL DEFAULT 0, first_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, species)
  );
`);

const Q = {
  user: db.prepare('SELECT * FROM users WHERE id = ?'),
  insertUser: db.prepare(`INSERT INTO users (id, name, username, coins, look, created_at, last_seen)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`),
  touchUser: db.prepare('UPDATE users SET name = ?, username = ?, last_seen = ? WHERE id = ?'),
  setLook: db.prepare('UPDATE users SET look = ?, customized = 1 WHERE id = ?'),
  setRod: db.prepare('UPDATE users SET rod = ? WHERE id = ?'),
  addCoins: db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?'),
  owned: db.prepare('SELECT item FROM owned WHERE user_id = ?'),
  own: db.prepare('INSERT OR IGNORE INTO owned (user_id, item) VALUES (?, ?)'),
  keepnet: db.prepare('SELECT id, species, weight, price, caught_at FROM keepnet WHERE user_id = ? ORDER BY id DESC'),
  keepAdd: db.prepare('INSERT INTO keepnet (user_id, species, weight, price, caught_at) VALUES (?, ?, ?, ?, ?)'),
  keepGet: db.prepare('SELECT id, price FROM keepnet WHERE user_id = ? AND id = ?'),
  keepDel: db.prepare('DELETE FROM keepnet WHERE user_id = ? AND id = ?'),
  keepAll: db.prepare('SELECT id, price FROM keepnet WHERE user_id = ?'),
  keepClear: db.prepare('DELETE FROM keepnet WHERE user_id = ?'),
  collection: db.prepare('SELECT species, count, best_weight, first_at FROM collection WHERE user_id = ?'),
  collGet: db.prepare('SELECT count, best_weight FROM collection WHERE user_id = ? AND species = ?'),
  collAdd: db.prepare(`INSERT INTO collection (user_id, species, count, best_weight, first_at) VALUES (?, ?, 1, ?, ?)
                       ON CONFLICT(user_id, species) DO UPDATE SET count = count + 1, best_weight = MAX(best_weight, excluded.best_weight)`),
  catchStats: db.prepare(`UPDATE users SET xp = xp + ?, total_caught = total_caught + 1,
                          best_species = CASE WHEN ? > best_weight THEN ? ELSE best_species END,
                          best_weight = MAX(best_weight, ?) WHERE id = ?`),
  earned: db.prepare('UPDATE users SET coins = coins + ?, total_earned = total_earned + ? WHERE id = ?'),
  top: db.prepare(`SELECT u.id, u.name, u.username, u.xp, u.total_caught, u.total_earned, u.best_species, u.best_weight, u.look,
                   (SELECT COUNT(*) FROM collection c WHERE c.user_id = u.id) AS species
                   FROM users u WHERE u.total_caught > 0 ORDER BY u.total_earned DESC, u.xp DESC LIMIT ?`),
  usersCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
};

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

function ensureUser(id, name, username) {
  const now = Date.now();
  let u = Q.user.get(id);
  if (!u) {
    tx(() => {
      Q.insertUser.run(id, name || 'Рыбак', username || '', CFG.startCoins, JSON.stringify(G.DEFAULT_LOOK), now, now);
      Q.own.run(id, 'rod:bamboo');
    });
    u = Q.user.get(id);
    log('new player', id, name);
  } else if (name && (u.name !== name || u.username !== (username || '') || now - u.last_seen > 60000)) {
    Q.touchUser.run(name, username || '', now, id);
  }
  return u;
}

function ownedSet(id) { return new Set(Q.owned.all(id).map(r => r.item)); }

function profile(id) {
  const u = Q.user.get(id);
  if (!u) return null;
  const owned = ownedSet(id);
  const collection = {};
  for (const c of Q.collection.all(id)) collection[c.species] = { count: c.count, best: c.best_weight, first: c.first_at };
  return {
    id: u.id, name: u.name, username: u.username, coins: u.coins, xp: u.xp, level: G.levelFromXp(u.xp),
    look: G.sanitizeLook(parseJson(u.look, null), owned), customized: !!u.customized, rod: u.rod,
    owned: [...owned],
    stats: { caught: u.total_caught, earned: u.total_earned, bestSpecies: u.best_species, bestWeight: u.best_weight },
    keepnet: Q.keepnet.all(id).map(k => ({ id: k.id, species: k.species, weight: k.weight, price: k.price, at: k.caught_at })),
    collection,
  };
}

function recordCatch(userId, species, weight) {
  const price = G.fishPrice(species, weight);
  const xp = G.fishXp(species, weight);
  return tx(() => {
    const before = Q.user.get(userId);
    const isNew = !Q.collGet.get(userId, species);
    const res = Q.keepAdd.run(userId, species, weight, price, Date.now());
    Q.collAdd.run(userId, species, weight, Date.now());
    Q.catchStats.run(xp, weight, species, weight, userId);
    const lvlBefore = G.levelFromXp(before.xp).level;
    const lvlAfter = G.levelFromXp(before.xp + xp).level;
    let reward = 0;
    for (let l = lvlBefore + 1; l <= lvlAfter; l++) reward += G.levelReward(l);
    if (reward) Q.addCoins.run(reward, userId);
    return { keepId: Number(res.lastInsertRowid), species, weight, price, xp, isNew, levelUp: lvlAfter > lvlBefore ? lvlAfter : 0, reward };
  });
}

/* ───────────────────────── auth ───────────────────────── */

function verifyInitData(initData) {
  if (!CFG.token || !initData) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(CFG.token).digest();
    const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
    if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
    const authDate = Number(params.get('auth_date')) * 1000;
    if (!authDate || Date.now() - authDate > 3 * 86400e3) return null;
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return {
      id: String(user.id),
      name: [user.first_name, user.last_name].filter(Boolean).join(' ').slice(0, 40) || 'Рыбак',
      username: user.username || '',
    };
  } catch { return null; }
}

function authFrom(initData, guestId, guestName) {
  const tgUser = verifyInitData(initData);
  if (tgUser) return tgUser;
  if (CFG.allowGuest && typeof guestId === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(guestId)) {
    let name = 'Гость';
    try { name = decodeURIComponent(guestName || '').replace(/[<>]/g, '').trim().slice(0, 24) || name; } catch { /* keep default */ }
    return { id: 'g_' + guestId, name, username: '' };
  }
  return null;
}

/* ───────────────────────── web server & API ───────────────────────── */

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) res.set('Cache-Control', 'no-cache');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: 'index.html' }));

function api(handler) {
  return (req, res) => {
    const who = authFrom(req.get('X-Init-Data'), req.get('X-Guest-Id'), req.get('X-Guest-Name'));
    if (!who) return res.status(401).json({ error: 'Откройте игру через Telegram' });
    ensureUser(who.id, who.name, who.username);
    try {
      const out = handler(who, req.body || {}, req);
      res.json(out);
    } catch (e) {
      if (e.userError) return res.status(400).json({ error: e.message });
      log('api error', e);
      res.status(500).json({ error: 'Что-то пошло не так' });
    }
  };
}
const fail = msg => { const e = new Error(msg); e.userError = true; throw e; };

app.get('/api/config', (req, res) => {
  res.json({ botUsername: CFG.botUsername, appLink: appLink(), guest: CFG.allowGuest, maxPlayers: G.MAX_PLAYERS });
});

app.post('/api/me', api(who => ({ profile: profile(who.id) })));

app.post('/api/look', api((who, body) => {
  const look = G.sanitizeLook(body.look, ownedSet(who.id));
  Q.setLook.run(JSON.stringify(look), who.id);
  rooms.updatePlayer(who.id);
  return { profile: profile(who.id) };
}));

app.post('/api/buy', api((who, body) => {
  const item = String(body.item || '');
  const [slot, id] = item.split(':');
  let price;
  if (slot === 'rod') { const rod = G.ROD_BY_ID[id]; if (!rod) fail('Нет такой удочки'); price = rod.price; }
  else { const it = G.findItem(slot, id); if (!it) fail('Нет такого предмета'); price = it.price; }
  tx(() => {
    const u = Q.user.get(who.id);
    if (ownedSet(who.id).has(item)) fail('Уже куплено');
    if (u.coins < price) fail('Не хватает монет');
    Q.addCoins.run(-price, who.id);
    Q.own.run(who.id, item);
    if (slot === 'rod') Q.setRod.run(id, who.id);
  });
  if (slot === 'rod') rooms.updatePlayer(who.id);
  return { profile: profile(who.id) };
}));

app.post('/api/equip', api((who, body) => {
  const id = String(body.rod || '');
  if (!G.ROD_BY_ID[id] || !ownedSet(who.id).has('rod:' + id)) fail('Удочка не куплена');
  if (rooms.isBusy(who.id)) fail('Сначала вытащите леску');
  Q.setRod.run(id, who.id);
  rooms.updatePlayer(who.id);
  return { profile: profile(who.id) };
}));

app.post('/api/sell', api((who, body) => {
  const total = tx(() => {
    let sum = 0;
    if (body.all) {
      for (const k of Q.keepAll.all(who.id)) sum += k.price;
      Q.keepClear.run(who.id);
    } else {
      const ids = Array.isArray(body.ids) ? body.ids.slice(0, 500) : [];
      for (const raw of ids) {
        const k = Q.keepGet.get(who.id, Number(raw));
        if (k) { sum += k.price; Q.keepDel.run(who.id, k.id); }
      }
    }
    if (sum) Q.earned.run(sum, sum, who.id);
    return sum;
  });
  return { sold: total, profile: profile(who.id) };
}));

app.get('/api/rooms', (req, res) => res.json({ rooms: rooms.publicList() }));

app.get('/api/top', (req, res) => {
  res.json({
    top: Q.top.all(20).map(r => ({
      id: r.id, name: r.name, level: G.levelFromXp(r.xp).level, caught: r.total_caught, earned: r.total_earned,
      species: r.species, bestSpecies: r.best_species, bestWeight: r.best_weight, look: G.sanitizeLook(parseJson(r.look, null)),
    })),
  });
});

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.count(), online: rooms.online() }));

/* ───────────────────────── rooms & fishing (WebSocket) ───────────────────────── */

const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join('');

const rooms = (() => {
  const byId = new Map();     // room id -> room
  const byCode = new Map();   // code -> room
  const players = new Map();  // user id -> player

  function send(p, msg) {
    if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }
  function broadcast(room, msg, exceptId) {
    const s = JSON.stringify(msg);
    for (const p of room.players.values()) if (p.id !== exceptId && p.ws && p.ws.readyState === 1) p.ws.send(s);
  }
  function pub(p) {
    return { id: p.id, name: p.name, look: p.look, rod: p.rod, slot: p.slot, level: p.level, state: p.state, depth: p.depth };
  }
  function roomState(room) {
    return {
      id: room.id, code: room.code, name: room.name, isPublic: room.isPublic, solo: room.solo,
      max: room.max, hostId: room.hostId, link: room.solo ? null : appLink('room_' + room.code),
      players: [...room.players.values()].map(pub),
    };
  }
  function clearTimers(p) { p.timers.forEach(clearTimeout); p.timers = []; }
  function later(p, ms, fn) { p.timers.push(setTimeout(fn, ms)); }

  function create(p, opts) {
    leave(p);
    let code; do { code = genCode(); } while (byCode.has(code));
    const room = {
      id: crypto.randomUUID(), code, players: new Map(), hostId: p.id, createdAt: Date.now(),
      solo: !!opts.solo, isPublic: !opts.solo && !!opts.isPublic, max: opts.solo ? 1 : G.MAX_PLAYERS,
      name: String(opts.name || '').replace(/[<>]/g, '').trim().slice(0, 28) || `Рыбалка у ${p.name}`,
    };
    byId.set(room.id, room); byCode.set(code, room);
    log(`room ${code} created by ${p.name} (${room.solo ? 'solo' : room.isPublic ? 'public' : 'private'})`);
    enter(p, room);
  }

  function join(p, code) {
    const room = byCode.get(String(code || '').toUpperCase().trim());
    if (!room || room.solo) return send(p, { t: 'error', msg: 'Комната не найдена' });
    if (room.players.has(p.id)) return send(p, { t: 'room', room: roomState(room) });
    if (room.players.size >= room.max) return send(p, { t: 'error', msg: 'Комната заполнена (5/5)' });
    leave(p);
    enter(p, room);
  }

  function enter(p, room) {
    const used = new Set([...room.players.values()].map(x => x.slot));
    p.slot = [0, 1, 2, 3, 4].find(s => !used.has(s));
    p.room = room; p.state = 'idle'; p.depth = 0;
    room.players.set(p.id, p);
    room.emptySince = 0;
    send(p, { t: 'room', room: roomState(room) });
    broadcast(room, { t: 'join', player: pub(p) }, p.id);
  }

  function leave(p) {
    const room = p.room;
    if (!room) return;
    clearTimers(p);
    room.players.delete(p.id);
    p.room = null; p.state = 'idle';
    broadcast(room, { t: 'leave', id: p.id });
    if (room.hostId === p.id && room.players.size) room.hostId = room.players.keys().next().value;
    if (!room.players.size) room.emptySince = Date.now();
  }

  // empty rooms survive a minute so a quick reconnect lands back in the same room
  setInterval(() => {
    const now = Date.now();
    for (const room of byId.values()) {
      if (!room.players.size && room.emptySince && now - room.emptySince > (room.solo ? 5000 : 60000)) {
        byId.delete(room.id); byCode.delete(room.code);
      }
    }
  }, 5000).unref();

  function loadPlayer(p) {
    const u = Q.user.get(p.id);
    p.look = G.sanitizeLook(parseJson(u.look, null), ownedSet(p.id));
    p.rod = G.ROD_BY_ID[u.rod] ? u.rod : 'bamboo';
    p.level = G.levelFromXp(u.xp).level;
    p.name = u.name;
  }

  /* ---- fishing state machine (server is the referee) ---- */

  function cast(p, power) {
    if (!p.room || p.state !== 'idle') return;
    const rod = G.ROD_BY_ID[p.rod];
    power = clamp(Number(power) || 0, 0.05, 1);
    p.depth = Math.round(clamp(power * rod.depth, 0.04, 1) * 1000) / 1000;
    p.plan = G.planCast(p.depth, rod, p.hour);
    p.state = 'wait';
    broadcast(p.room, { t: 'cast', id: p.id, depth: p.depth });
    const base = 900 + p.depth * 1600; // bobber flight + hook sinking (mirrors client animation)
    const plan = p.plan;
    later(p, base + plan.approachAt, () => broadcast(p.room, { t: 'approach', id: p.id, species: plan.species, weight: plan.weight }));
    plan.nibbles.forEach(ms => later(p, base + ms, () => broadcast(p.room, { t: 'nibble', id: p.id })));
    later(p, base + plan.biteAt, () => {
      p.state = 'bite';
      p.biteAt = Date.now();
      broadcast(p.room, { t: 'bite', id: p.id, window: plan.biteWindow });
      later(p, plan.biteWindow + 350, () => {
        if (p.state !== 'bite') return;
        p.state = 'idle';
        broadcast(p.room, { t: 'missed', id: p.id, reason: 'late' });
      });
    });
  }

  function hook(p) {
    if (!p.room) return;
    if (p.state === 'wait') {
      clearTimers(p); p.state = 'idle';
      broadcast(p.room, { t: 'missed', id: p.id, reason: 'early' });
    } else if (p.state === 'bite') {
      clearTimers(p); p.state = 'reel'; p.hookedAt = Date.now();
      broadcast(p.room, { t: 'hooked', id: p.id, species: p.plan.species, fight: p.plan.fight });
    }
  }

  function land(p) {
    if (!p.room || p.state !== 'reel') return;
    const rod = G.ROD_BY_ID[p.rod];
    const minMs = (p.plan.fight.stamina / (rod.reel * 1.6)) * 1000 * 0.55;
    if (Date.now() - p.hookedAt < minMs) {
      p.state = 'idle';
      return broadcast(p.room, { t: 'lost', id: p.id, reason: 'escape' });
    }
    p.state = 'idle';
    const res = recordCatch(p.id, p.plan.species, p.plan.weight);
    loadPlayer(p);
    send(p, { t: 'caught', id: p.id, fish: res, profile: profile(p.id) });
    broadcast(p.room, { t: 'caught', id: p.id, fish: { species: res.species, weight: res.weight, isNew: res.isNew }, level: p.level }, p.id);
    if (res.levelUp) broadcast(p.room, { t: 'levelup', id: p.id, level: res.levelUp });
  }

  function lose(p, reason) {
    if (!p.room || p.state !== 'reel') return;
    p.state = 'idle';
    broadcast(p.room, { t: 'lost', id: p.id, reason: reason === 'snap' ? 'snap' : 'escape' });
  }

  function cancel(p) {
    if (!p.room || p.state === 'idle') return;
    clearTimers(p); p.state = 'idle';
    broadcast(p.room, { t: 'reset', id: p.id });
  }

  const EMOTES = new Set(['wave', 'laugh', 'wow', 'party', 'like', 'love']);

  function onMessage(p, msg) {
    switch (msg.t) {
      case 'create': return create(p, msg);
      case 'join': return join(p, msg.code);
      case 'leave': return leave(p), send(p, { t: 'left' });
      case 'cast': return cast(p, msg.power);
      case 'hook': return hook(p);
      case 'reel':
        if (p.room && p.state === 'reel') broadcast(p.room, { t: 'reel', id: p.id, p: clamp(+msg.p || 0, 0, 1), k: clamp(+msg.k || 0, 0, 1) }, p.id);
        return;
      case 'land': return land(p);
      case 'fail': return lose(p, msg.reason);
      case 'cancel': return cancel(p);
      case 'emote':
        if (p.room && EMOTES.has(msg.e) && Date.now() - (p.lastEmote || 0) > 900) {
          p.lastEmote = Date.now();
          broadcast(p.room, { t: 'emote', id: p.id, e: msg.e });
        }
        return;
      case 'hour': p.hour = clamp(Math.floor(+msg.hour || 0), 0, 23); return;
      case 'ping': return send(p, { t: 'pong' });
    }
  }

  function attach(ws) {
    let p = null;
    let tokens = 30, last = Date.now();
    ws.on('message', raw => {
      const now = Date.now();
      tokens = Math.min(30, tokens + (now - last) / 50); last = now;
      if (--tokens < 0) return;
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (!p) {
        if (msg.t !== 'hello') return;
        const who = authFrom(msg.initData, msg.guestId, msg.guestName);
        if (!who) { ws.send(JSON.stringify({ t: 'error', msg: 'Нет авторизации', fatal: true })); return ws.close(); }
        ensureUser(who.id, who.name, who.username);
        const prev = players.get(who.id);
        let room = null;
        if (prev) { // same account opened elsewhere — take over its seat
          room = prev.room; clearTimers(prev);
          if (prev.ws && prev.ws !== ws) { try { prev.ws.send(JSON.stringify({ t: 'kicked' })); prev.ws.close(); } catch { /* gone */ } }
          if (room) { room.players.delete(prev.id); broadcast(room, { t: 'leave', id: prev.id }); prev.room = null; }
        }
        p = { id: who.id, ws, timers: [], room: null, state: 'idle', hour: clamp(Math.floor(+msg.hour || 12), 0, 23) };
        loadPlayer(p);
        players.set(p.id, p);
        ws.send(JSON.stringify({ t: 'welcome', id: p.id }));
        if (room && !room.solo && room.players.size < room.max) enter(p, room);
        return;
      }
      onMessage(p, msg);
    });
    ws.on('close', () => {
      if (!p || players.get(p.id) !== p) return;
      leave(p);
      players.delete(p.id);
    });
  }

  return {
    attach,
    publicList() {
      return [...byId.values()].filter(r => r.isPublic && r.players.size)
        .sort((a, b) => b.players.size - a.players.size || b.createdAt - a.createdAt).slice(0, 30)
        .map(r => ({ code: r.code, name: r.name, players: r.players.size, max: r.max,
          host: (r.players.get(r.hostId) || {}).name || '', looks: [...r.players.values()].slice(0, 5).map(x => x.look) }));
    },
    updatePlayer(id) {
      const p = players.get(id);
      if (!p) return;
      loadPlayer(p);
      if (p.room) broadcast(p.room, { t: 'player', player: pub(p) });
    },
    isBusy(id) { const p = players.get(id); return !!(p && p.room && p.state !== 'idle'); },
    count: () => byId.size,
    online: () => players.size,
  };
})();

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });
wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  rooms.attach(ws);
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000).unref();

/* ───────────────────────── Telegram bot ───────────────────────── */

const bot = (() => {
  if (!CFG.token) return null;
  const API = `https://api.telegram.org/bot${CFG.token}/`;

  async function call(method, payload = {}) {
    const res = await fetch(API + method, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({ ok: false, description: 'bad response' }));
    if (!data.ok) { const e = new Error(`${method}: ${data.description}`); e.tg = data; throw e; }
    return data.result;
  }

  /* ---- premium emoji from the "tgiosicons" pack ----
     IDs are resolved at startup with getStickerSet and matched by the emoji each icon is tagged with.
     Override any of them with EMOJI_IDS='{"play":"5368324170671202286"}'. */
  const WANT = {
    logo:     ['🎣', '🐟', '🐠', '🌊', '⚓'],
    play:     ['▶️', '🎮', '🕹', '🚀', '⚡'],
    coop:     ['👥', '👫', '🫂', '🤝', '💬'],
    profile:  ['👤', '🙂', '😊', '🧑', '👨'],
    collection: ['📚', '🗂', '📦', '📁', '📒', '🐟'],
    top:      ['🏆', '🥇', '🏅', '👑', '📊'],
    help:     ['❓', 'ℹ️', '💡', '📖', '❔'],
    invite:   ['📨', '✉️', '🔗', '📢', '➕'],
    coins:    ['💰', '🪙', '💵', '💸', '💎'],
    level:    ['⭐️', '🌟', '✨', '📈'],
    fish:     ['🐟', '🐠', '🐡', '🎣'],
    back:     ['◀️', '⬅️', '🔙', '↩️'],
    check:    ['✅', '✔️', '☑️'],
    lock:     ['🔒', '🔐', '❌'],
    gift:     ['🎁', '🎉'],
    fire:     ['🔥', '⚡'],
    shop:     ['🛍', '🛒', '💳'],
  };
  const FALLBACK = Object.fromEntries(Object.entries(WANT).map(([k, v]) => [k, v[0]]));
  const emoji = {}; // key -> { id, char }
  let customEmojiOk = true;

  async function loadEmoji() {
    try {
      const set = await call('getStickerSet', { name: CFG.emojiPack });
      const byChar = new Map();
      for (const s of set.stickers || []) {
        if (!s.custom_emoji_id || !s.emoji) continue;
        const key = s.emoji.replace(/️/g, '');
        if (!byChar.has(key)) byChar.set(key, { id: s.custom_emoji_id, char: s.emoji });
      }
      for (const [k, list] of Object.entries(WANT)) {
        const hit = list.map(c => byChar.get(c.replace(/️/g, ''))).find(Boolean);
        if (hit) emoji[k] = hit;
      }
      log(`emoji pack "${CFG.emojiPack}": ${set.stickers.length} icons, matched ${Object.keys(emoji).length}/${Object.keys(WANT).length}`);
    } catch (e) {
      log('emoji pack not loaded:', e.message);
    }
    for (const [k, id] of Object.entries(CFG.emojiOverrides || {})) emoji[k] = { id: String(id), char: (emoji[k] && emoji[k].char) || FALLBACK[k] || '⭐' };
  }

  const E = k => {
    const e = emoji[k];
    return e && customEmojiOk ? `<tg-emoji emoji-id="${e.id}">${e.char}</tg-emoji>` : (FALLBACK[k] || '');
  };
  // inline button with colored style + premium icon (falls back to a plain emoji prefix)
  function btn(text, icon, extra = {}) {
    const b = Object.assign({ text }, extra);
    if (icon && emoji[icon] && customEmojiOk) b.icon_custom_emoji_id = emoji[icon].id;
    else if (icon) b.text = `${FALLBACK[icon]} ${text}`;
    return b;
  }
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const num = n => Number(n || 0).toLocaleString('ru-RU');
  const webApp = (query = '') => (CFG.webUrl ? { web_app: { url: CFG.webUrl + '/' + query } } : { callback_data: 'nodomain' });

  // send / edit with automatic fallback if premium emoji are not allowed for this bot
  async function deliver(method, payload, build) {
    try { return await call(method, Object.assign(payload, build())); }
    catch (e) {
      const d = (e.tg && e.tg.description || '').toLowerCase();
      if (d.includes('message is not modified')) return null;
      if (customEmojiOk && (d.includes('emoji') || d.includes('entit') || d.includes('icon') || d.includes('button'))) {
        customEmojiOk = false;
        log('premium emoji disabled (bot owner needs Telegram Premium):', e.message);
        return call(method, Object.assign(payload, build()));
      }
      throw e;
    }
  }

  /* ---- screens ---- */

  function mainMenu(u) {
    const p = profile(u.id);
    const lvl = p.level.level;
    const coll = Object.keys(p.collection).length;
    return () => ({
      text:
        `${E('logo')} <b>Hooked</b> — уютная рыбалка с друзьями!\n\n` +
        `Привет, <b>${esc(p.name)}</b>! Озеро уже проснулось: забрасывай удочку, лови редких рыб, ` +
        `собирай коллекцию и рыбачь вместе с друзьями — до ${G.MAX_PLAYERS} человек в комнате.\n\n` +
        `${E('coins')} Монеты: <b>${num(p.coins)}</b>   ${E('level')} Уровень: <b>${lvl}</b>\n` +
        `${E('fish')} Поймано: <b>${num(p.stats.caught)}</b>   ${E('collection')} Коллекция: <b>${coll}/${G.FISH.length}</b>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [btn('Играть', 'play', Object.assign({ style: 'success' }, webApp()))],
        [btn('Рыбачить с друзьями', 'coop', Object.assign({ style: 'primary' }, webApp('?action=coop')))],
        [btn('Профиль', 'profile', { callback_data: 'profile', style: 'primary' }), btn('Коллекция', 'collection', { callback_data: 'collection', style: 'primary' })],
        [btn('Топ рыбаков', 'top', { callback_data: 'top', style: 'danger' }), btn('Как играть', 'help', { callback_data: 'help' })],
        [btn('Пригласить друга', 'invite', { url: shareUrl(), style: 'success' })],
      ] },
    });
  }

  function shareUrl(startParam) {
    const link = appLink(startParam);
    return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('🎣 Погнали на рыбалку в Hooked! Лови рыбу вместе со мной.')}`;
  }

  const backRow = () => [btn('В меню', 'back', { callback_data: 'menu' }), btn('Играть', 'play', Object.assign({ style: 'success' }, webApp()))];

  function profileScreen(u) {
    const p = profile(u.id);
    const rod = G.ROD_BY_ID[p.rod];
    const best = p.stats.bestSpecies ? `${G.FISH_BY_ID[p.stats.bestSpecies].name}, ${p.stats.bestWeight.toFixed(2)} кг` : '—';
    return () => ({
      text:
        `${E('profile')} <b>Профиль рыбака</b>\n\n` +
        `<b>${esc(p.name)}</b>${p.username ? ' · @' + esc(p.username) : ''}\n` +
        `${E('level')} Уровень <b>${p.level.level}</b> · ${p.level.cur}/${p.level.need} XP\n` +
        `${E('coins')} Монеты: <b>${num(p.coins)}</b>\n` +
        `${E('fish')} Поймано рыб: <b>${num(p.stats.caught)}</b>\n` +
        `${E('fire')} Заработано: <b>${num(p.stats.earned)}</b>\n` +
        `${E('top')} Лучший трофей: <b>${esc(best)}</b>\n` +
        `${E('shop')} Удочка: <b>${esc(rod.name)}</b>\n` +
        `${E('collection')} В садке: <b>${p.keepnet.length}</b> рыб`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [backRow()] },
    });
  }

  function collectionScreen(u) {
    const p = profile(u.id);
    const lines = G.FISH.map(f => {
      const c = p.collection[f.id];
      return c
        ? `${E('check')} <b>${f.name}</b> — ${G.RARITY[f.rarity].name.toLowerCase()}, ×${c.count}, рекорд ${c.best.toFixed(2)} кг`
        : `${E('lock')} <i>??? (${G.RARITY[f.rarity].name.toLowerCase()})</i>`;
    });
    return () => ({
      text: `${E('collection')} <b>Коллекция: ${Object.keys(p.collection).length}/${G.FISH.length}</b>\n\n${lines.join('\n')}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [backRow()] },
    });
  }

  function topScreen() {
    const medals = ['🥇', '🥈', '🥉'];
    const rows = Q.top.all(10);
    const lines = rows.length
      ? rows.map((r, i) => `${medals[i] || `<b>${i + 1}.</b>`} ${esc(r.name)} — ${E('coins')} ${num(r.total_earned)} · ${E('fish')} ${num(r.total_caught)}`)
      : ['Пока никто ничего не поймал. Стань первым!'];
    return () => ({
      text: `${E('top')} <b>Лучшие рыбаки</b>\n\n${lines.join('\n')}`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [backRow()] },
    });
  }

  function helpScreen() {
    return () => ({
      text:
        `${E('help')} <b>Как играть</b>\n\n` +
        `<b>1.</b> Зажми кнопку «Заброс» — чем дольше держишь, тем глубже уйдёт крючок. Глубже — крупнее и реже рыба.\n` +
        `<b>2.</b> Жди поклёвку. Поплавок дёргается — не торопись! Когда он уйдёт под воду и появится «!», жми «Подсечь».\n` +
        `<b>3.</b> Вываживай: держи «Тянуть», но следи за натяжением. Красная зона — леска порвётся, слабина — рыба уйдёт.\n` +
        `<b>4.</b> Продавай улов, покупай удочки и одежду, собирай все ${G.FISH.length} видов.\n\n` +
        `${E('coop')} <b>Кооп:</b> создай комнату (публичную или приватную) и позови до 4 друзей по ссылке или коду.\n` +
        `${E('fire')} Ночью клюют совсем другие рыбы — загляни на озеро после 21:00.`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [backRow()] },
    });
  }

  async function handle(up) {
    try {
      if (up.message) await onMessage(up.message);
      else if (up.callback_query) await onCallback(up.callback_query);
      else if (up.inline_query) await onInline(up.inline_query);
    } catch (e) { log('update error:', e.message); }
  }

  // updates of one user are handled in order, different users in parallel
  const queues = new Map();
  function onUpdate(up) {
    const from = (up.message || up.callback_query || up.inline_query || {}).from;
    const key = from ? from.id : 0;
    const next = (queues.get(key) || Promise.resolve()).then(() => handle(up));
    queues.set(key, next);
    next.then(() => { if (queues.get(key) === next) queues.delete(key); });
  }

  const userOf = from => ensureUser(String(from.id), [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 40), from.username);

  async function onMessage(m) {
    if (!m.from || m.chat.type !== 'private') return;
    const text = (m.text || '').trim();
    const u = userOf(m.from);
    const [cmd, arg] = text.split(/\s+/);
    const send = build => deliver('sendMessage', { chat_id: m.chat.id }, build);
    switch (cmd.replace(/@\w+$/, '')) {
      case '/start':
        if (arg && /^room_[A-Z0-9]{5}$/i.test(arg)) {
          const code = arg.slice(5).toUpperCase();
          return send(() => ({
            text: `${E('coop')} Тебя зовут на рыбалку! Комната <b>${esc(code)}</b> ждёт.`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[btn('Войти в комнату', 'play', Object.assign({ style: 'success' }, webApp('?room=' + code)))]] },
          }));
        }
        return send(mainMenu(u));
      case '/play':
        return send(() => ({ text: `${E('play')} Озеро ждёт!`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[btn('Играть', 'play', Object.assign({ style: 'success' }, webApp()))]] } }));
      case '/profile': return send(profileScreen(u));
      case '/collection': return send(collectionScreen(u));
      case '/top': return send(topScreen());
      case '/help': return send(helpScreen());
      case '/emoji': // admin helper: shows which premium icons were matched
        if (!CFG.admins.includes(String(m.from.id))) return;
        return send(() => ({
          text: Object.keys(WANT).map(k => `${E(k)} <code>${k}</code> ${emoji[k] ? '<code>' + emoji[k].id + '</code>' : '— (обычный эмодзи)'}`).join('\n'),
          parse_mode: 'HTML',
        }));
      default:
        return send(mainMenu(u));
    }
  }

  async function onCallback(q) {
    const u = userOf(q.from);
    const screens = { menu: () => mainMenu(u), profile: () => profileScreen(u), collection: () => collectionScreen(u), top: topScreen, help: helpScreen };
    if (q.data === 'nodomain') {
      return call('answerCallbackQuery', { callback_query_id: q.id, text: 'Игра ещё не опубликована: администратор должен указать DOMAIN.', show_alert: true });
    }
    await call('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    const make = screens[q.data];
    if (!make || !q.message) return;
    await deliver('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id }, make());
  }

  async function onInline(q) {
    const m = /room_([A-Z0-9]{5})/i.exec(q.query || '');
    const code = m ? m[1].toUpperCase() : '';
    const link = appLink(code ? 'room_' + code : '');
    await call('answerInlineQuery', {
      inline_query_id: q.id, cache_time: 5, is_personal: true,
      results: [{
        type: 'article', id: code || 'invite',
        title: code ? `🎣 Позвать в комнату ${code}` : '🎣 Позвать на рыбалку',
        description: 'Hooked — кооперативная рыбалка прямо в Telegram',
        input_message_content: {
          message_text: code
            ? `🎣 <b>Погнали на рыбалку!</b>\nЯ уже на озере — заходи в мою комнату <b>${code}</b>.`
            : '🎣 <b>Погнали на рыбалку в Hooked!</b>\nЛовим редких рыб и собираем коллекцию вместе.',
          parse_mode: 'HTML',
        },
        reply_markup: { inline_keyboard: [[{ text: code ? 'Войти в комнату' : 'Играть', url: link, style: 'success' }]] },
      }],
    });
  }

  async function setup() {
    const me = await call('getMe');
    if (me.username && me.username.toLowerCase() !== CFG.botUsername.toLowerCase()) {
      log(`BOT_USERNAME=${CFG.botUsername}, but token belongs to @${me.username} — using @${me.username} for links`);
      CFG.botUsername = me.username;
    }
    await loadEmoji();
    await call('setMyCommands', { commands: [
      { command: 'start', description: 'Главное меню' },
      { command: 'play', description: 'Открыть игру' },
      { command: 'profile', description: 'Мой профиль' },
      { command: 'collection', description: 'Коллекция рыб' },
      { command: 'top', description: 'Лучшие рыбаки' },
      { command: 'help', description: 'Как играть' },
    ] }).catch(e => log(e.message));
    await call('setMyShortDescription', { short_description: 'Уютная кооперативная рыбалка: лови рыбу с друзьями прямо в Telegram 🎣' }).catch(() => {});
    if (CFG.webUrl) {
      await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: CFG.webUrl + '/' } } }).catch(e => log(e.message));
    } else {
      log('DOMAIN is not set — Mini App buttons are disabled until you set it');
    }
    log(`bot @${me.username} is ready (${CFG.botMode})`);
  }

  async function poll() {
    await call('deleteWebhook', { drop_pending_updates: false }).catch(() => {});
    let offset = 0;
    for (;;) {
      try {
        const ups = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'inline_query'] });
        for (const up of ups) { offset = up.update_id + 1; onUpdate(up); }
      } catch (e) {
        log('polling error:', e.message);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  async function start() {
    try { await setup(); } catch (e) { log('bot setup failed:', e.message); return; }
    if (CFG.botMode === 'webhook' && CFG.webUrl) {
      const hookPath = `/tg/${CFG.webhookSecret}`;
      app.post(hookPath, (req, res) => {
        if (req.get('X-Telegram-Bot-Api-Secret-Token') !== CFG.webhookSecret) return res.sendStatus(403);
        res.sendStatus(200);
        onUpdate(req.body);
      });
      await call('setWebhook', { url: CFG.webUrl + hookPath, secret_token: CFG.webhookSecret, allowed_updates: ['message', 'callback_query', 'inline_query'] });
    } else {
      poll();
    }
  }

  return { start };
})();

/* ───────────────────────── start ───────────────────────── */

server.listen(CFG.port, () => {
  log(`Hooked web: http://localhost:${CFG.port}  ${CFG.webUrl ? '→ ' + CFG.webUrl : ''}`);
  log(`players in db: ${Q.usersCount.get().n}${CFG.allowGuest ? ' · guest mode ON' : ''}`);
  if (bot) bot.start(); else log('BOT_TOKEN is not set — running the site only');
});

function shutdown() {
  log('shutting down…');
  server.close();
  try { db.close(); } catch { /* already closed */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
