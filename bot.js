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
  support: (env.SUPPORT_CONTACT || '').trim(),
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
  CREATE TABLE IF NOT EXISTS season_pass (
    user_id TEXT NOT NULL, season TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0, premium INTEGER NOT NULL DEFAULT 0,
    claimed_free TEXT NOT NULL DEFAULT '[]', claimed_prem TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, season)
  );
  CREATE TABLE IF NOT EXISTS payments (
    charge_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, season TEXT NOT NULL, amount INTEGER NOT NULL,
    payload TEXT, created_at INTEGER NOT NULL, refunded INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tourney (
    tid TEXT NOT NULL, user_id TEXT NOT NULL, species TEXT NOT NULL, weight REAL NOT NULL, at INTEGER NOT NULL,
    PRIMARY KEY (tid, user_id)
  );
  CREATE TABLE IF NOT EXISTS tourney_done (tid TEXT PRIMARY KEY, done_at INTEGER NOT NULL, results TEXT);
  CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, text TEXT NOT NULL,
    created_at INTEGER NOT NULL, seen INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS inbox_user ON inbox(user_id, seen);
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
    give TEXT NOT NULL, want TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS trades_to ON trades(to_id, status);
  CREATE INDEX IF NOT EXISTS trades_from ON trades(from_id, status);
`);

let txDepth = 0;
function tx(fn) {
  if (txDepth) return fn();
  txDepth++;
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { txDepth--; }
}
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

// schema migrations (PRAGMA user_version)
if (db.prepare('PRAGMA user_version').get().user_version < 1) {
  tx(() => {
    addColumn('users', 'license', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('users', 'title', "TEXT NOT NULL DEFAULT ''");
    addColumn('users', 'meta', "TEXT NOT NULL DEFAULT '{}'");
    for (const [c, d] of [['loc', 'TEXT'], ['bait', 'TEXT'], ['depth', 'REAL'], ['hour', 'INTEGER'], ['best_at', 'INTEGER']]) addColumn('collection', c, d);
    // the fisher's license is new: every existing player passes the starter quest again; coins, catches and collection stay
    db.exec('UPDATE users SET license = 0');
  });
  db.exec('PRAGMA user_version = 1');
  log('database migrated to v1: fisher license reset for all players, progress kept');
}
db.exec('CREATE INDEX IF NOT EXISTS users_username ON users(username COLLATE NOCASE)');

const Q = {
  user: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  insertUser: db.prepare(`INSERT INTO users (id, name, username, coins, look, created_at, last_seen)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`),
  touchUser: db.prepare('UPDATE users SET name = ?, username = ?, last_seen = ? WHERE id = ?'),
  setLook: db.prepare('UPDATE users SET look = ?, customized = 1 WHERE id = ?'),
  setRod: db.prepare('UPDATE users SET rod = ? WHERE id = ?'),
  setMeta: db.prepare('UPDATE users SET meta = ? WHERE id = ?'),
  setTitle: db.prepare('UPDATE users SET title = ? WHERE id = ?'),
  setLicense: db.prepare('UPDATE users SET license = ? WHERE id = ?'),
  addCoins: db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?'),
  owned: db.prepare('SELECT item FROM owned WHERE user_id = ?'),
  own: db.prepare('INSERT OR IGNORE INTO owned (user_id, item) VALUES (?, ?)'),
  disown: db.prepare('DELETE FROM owned WHERE user_id = ? AND item = ?'),
  keepnet: db.prepare('SELECT id, species, weight, price, caught_at FROM keepnet WHERE user_id = ? ORDER BY id DESC'),
  keepAdd: db.prepare('INSERT INTO keepnet (user_id, species, weight, price, caught_at) VALUES (?, ?, ?, ?, ?)'),
  keepGet: db.prepare('SELECT id, price FROM keepnet WHERE user_id = ? AND id = ?'),
  keepFull: db.prepare('SELECT * FROM keepnet WHERE user_id = ? AND id = ?'),
  keepDel: db.prepare('DELETE FROM keepnet WHERE user_id = ? AND id = ?'),
  keepAll: db.prepare('SELECT id, price FROM keepnet WHERE user_id = ?'),
  keepClear: db.prepare('DELETE FROM keepnet WHERE user_id = ?'),
  collection: db.prepare('SELECT * FROM collection WHERE user_id = ?'),
  collGet: db.prepare('SELECT count, best_weight FROM collection WHERE user_id = ? AND species = ?'),
  collAdd: db.prepare(`INSERT INTO collection (user_id, species, count, best_weight, first_at, loc, bait, depth, hour, best_at)
                       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(user_id, species) DO UPDATE SET count = count + 1,
                         loc = CASE WHEN excluded.best_weight > best_weight THEN excluded.loc ELSE loc END,
                         bait = CASE WHEN excluded.best_weight > best_weight THEN excluded.bait ELSE bait END,
                         depth = CASE WHEN excluded.best_weight > best_weight THEN excluded.depth ELSE depth END,
                         hour = CASE WHEN excluded.best_weight > best_weight THEN excluded.hour ELSE hour END,
                         best_at = CASE WHEN excluded.best_weight > best_weight THEN excluded.best_at ELSE best_at END,
                         best_weight = MAX(best_weight, excluded.best_weight)`),
  catchStats: db.prepare(`UPDATE users SET xp = xp + ?, total_caught = total_caught + 1,
                          best_species = CASE WHEN ? > best_weight THEN ? ELSE best_species END,
                          best_weight = MAX(best_weight, ?) WHERE id = ?`),
  earned: db.prepare('UPDATE users SET coins = coins + ?, total_earned = total_earned + ? WHERE id = ?'),
  top: db.prepare(`SELECT u.id, u.name, u.username, u.xp, u.total_caught, u.total_earned, u.best_species, u.best_weight, u.look, u.title,
                   (SELECT COUNT(*) FROM collection c WHERE c.user_id = u.id) AS species
                   FROM users u WHERE u.total_caught > 0 ORDER BY u.total_earned DESC, u.xp DESC LIMIT ?`),
  usersCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
  licensedCount: db.prepare('SELECT COUNT(*) AS n FROM users WHERE license = 1'),
  passGet: db.prepare('SELECT * FROM season_pass WHERE user_id = ? AND season = ?'),
  passXp: db.prepare(`INSERT INTO season_pass (user_id, season, xp) VALUES (?, ?, ?)
                      ON CONFLICT(user_id, season) DO UPDATE SET xp = xp + excluded.xp`),
  passPremium: db.prepare(`INSERT INTO season_pass (user_id, season, premium) VALUES (?, ?, ?)
                           ON CONFLICT(user_id, season) DO UPDATE SET premium = excluded.premium`),
  passClaimed: db.prepare('UPDATE season_pass SET claimed_free = ?, claimed_prem = ? WHERE user_id = ? AND season = ?'),
  passUser: db.prepare('SELECT * FROM season_pass WHERE user_id = ?'),
  premiumCount: db.prepare('SELECT COUNT(*) AS n FROM season_pass WHERE season = ? AND premium = 1'),
  payAdd: db.prepare('INSERT OR IGNORE INTO payments (charge_id, user_id, season, amount, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  payList: db.prepare('SELECT rowid AS rid, * FROM payments ORDER BY created_at DESC LIMIT ?'),
  payGet: db.prepare('SELECT rowid AS rid, * FROM payments WHERE rowid = ?'),
  paySum: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS stars FROM payments WHERE refunded = 0'),
  payRefund: db.prepare('UPDATE payments SET refunded = 1 WHERE rowid = ?'),
  tourneyGet: db.prepare('SELECT * FROM tourney WHERE tid = ? AND user_id = ?'),
  tourneyPut: db.prepare(`INSERT INTO tourney (tid, user_id, species, weight, at) VALUES (?, ?, ?, ?, ?)
                          ON CONFLICT(tid, user_id) DO UPDATE SET weight = excluded.weight, at = excluded.at WHERE excluded.weight > tourney.weight`),
  tourneyTop: db.prepare(`SELECT t.user_id, t.weight, t.at, u.name, u.look, u.title FROM tourney t JOIN users u ON u.id = t.user_id
                          WHERE t.tid = ? ORDER BY t.weight DESC, t.at ASC LIMIT ?`),
  tourneyCount: db.prepare('SELECT COUNT(*) AS n FROM tourney WHERE tid = ?'),
  tourneyDone: db.prepare('SELECT * FROM tourney_done WHERE tid = ?'),
  tourneyDoneAdd: db.prepare('INSERT OR IGNORE INTO tourney_done (tid, done_at, results) VALUES (?, ?, ?)'),
  tourneyDoneRange: db.prepare('SELECT * FROM tourney_done WHERE done_at >= ? AND done_at < ? + 172800000'),
  inboxAdd: db.prepare('INSERT INTO inbox (user_id, text, created_at) VALUES (?, ?, ?)'),
  inboxNew: db.prepare('SELECT id, text, created_at FROM inbox WHERE user_id = ? AND seen = 0 ORDER BY id DESC LIMIT 20'),
  inboxSeen: db.prepare('UPDATE inbox SET seen = 1 WHERE user_id = ?'),
  tradeAdd: db.prepare(`INSERT INTO trades (from_id, to_id, give, want, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)`),
  tradeGet: db.prepare('SELECT * FROM trades WHERE id = ?'),
  tradeSet: db.prepare('UPDATE trades SET status = ?, updated_at = ? WHERE id = ?'),
  tradesIn: db.prepare(`SELECT t.*, u.name AS other FROM trades t JOIN users u ON u.id = t.from_id WHERE t.to_id = ? AND t.status = 'pending' ORDER BY t.id DESC LIMIT 20`),
  tradesOut: db.prepare(`SELECT t.*, u.name AS other FROM trades t JOIN users u ON u.id = t.to_id WHERE t.from_id = ? AND t.status = 'pending' ORDER BY t.id DESC LIMIT 20`),
  tradesPendingOut: db.prepare(`SELECT COUNT(*) AS n FROM trades WHERE from_id = ? AND status = 'pending'`),
  tradesExpire: db.prepare(`UPDATE trades SET status = 'expired', updated_at = ? WHERE status = 'pending' AND created_at < ?`),
};

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
const titleName = id => (id && G.TITLES[id]) || '';
const fail = msg => { const e = new Error(msg); e.userError = true; throw e; };
const licenseNumber = id => crypto.createHash('md5').update('lic:' + id).digest('hex').slice(0, 6).toUpperCase();

/* ---------- per-player state (meta JSON) ---------- */
const metaDefault = () => ({
  lic: {}, bait: 'worm', baits: {}, line: 'mono', hook: 'basic', loc: 'lake', effect: 'none', pose: 'none', skin: 'none',
  house: { slots: {}, tank: [], trophies: [] }, quests: {}, locs: [], bossWins: 0, tourney: { played: 0, wins: 0, podium: 0 },
  hosted: 0, gifts: 0, ach: {},
});
function metaOf(u) {
  const m = Object.assign(metaDefault(), parseJson(u && u.meta, {}));
  m.house = Object.assign({ slots: {}, tank: [], trophies: [] }, m.house || {});
  m.tourney = Object.assign({ played: 0, wins: 0, podium: 0 }, m.tourney || {});
  m.lic = m.lic || {}; m.baits = m.baits || {}; m.quests = m.quests || {}; m.locs = m.locs || []; m.ach = m.ach || {};
  return m;
}
// load → change → save, always in one synchronous step
function withMeta(id, fn) {
  const u = Q.user.get(id);
  if (!u) return undefined;
  const m = metaOf(u);
  const r = fn(m, u);
  Q.setMeta.run(JSON.stringify(m), id);
  return r;
}
function collectionMap(id) {
  const out = {};
  for (const c of Q.collection.all(id)) out[c.species] = { count: c.count, best: c.best_weight, first: c.first_at, loc: c.loc, bait: c.bait, depth: c.depth, hour: c.hour, at: c.best_at };
  return out;
}
function requireLicense(id) {
  const u = Q.user.get(id);
  if (!u || !u.license) fail('Сначала получи лицензию рыбака');
  return u;
}

/* ---------- season pass, quests, achievements ---------- */
function passView(id, season) {
  if (!season) return null;
  const r = Q.passGet.get(id, season.id) || { xp: 0, premium: 0, claimed_free: '[]', claimed_prem: '[]' };
  const lv = G.passLevel(r.xp);
  return {
    id: season.id, name: season.name, title: season.title, end: season.end, xp: r.xp, level: lv.level, cur: lv.cur, need: lv.need, max: lv.max,
    premium: !!r.premium, claimedFree: parseJson(r.claimed_free, []), claimedPrem: parseJson(r.claimed_prem, []), price: G.PASS_PRICE_STARS,
  };
}
function addPassXp(userId, xp) {
  const season = G.seasonAt(Date.now());
  if (!season || !(xp > 0)) return null;
  const before = (Q.passGet.get(userId, season.id) || { xp: 0 }).xp;
  Q.passXp.run(userId, season.id, Math.round(xp));
  const after = before + Math.round(xp);
  const lb = G.passLevel(before).level, la = G.passLevel(after).level;
  return { gained: Math.round(xp), xp: after, level: la, levelUp: la > lb };
}
function setPremium(userId, seasonId, on) { Q.passPremium.run(userId, seasonId, on ? 1 : 0); }
// returns { done:[...], xp } — pass XP is added by the caller
function questEvent(userId, ev) {
  const u = Q.user.get(userId);
  if (!u || !u.license) return { done: [], xp: 0 };
  const done = withMeta(userId, m => { G.syncQuests(m.quests, Date.now()); return G.questProgress(m.quests, ev); });
  return { done, xp: done.reduce((s, q) => s + q.xp, 0) };
}
function checkAchievements(userId) {
  const u = Q.user.get(userId);
  if (!u) return [];
  const m = metaOf(u);
  const season = G.seasonAt(Date.now());
  const pass = season ? Q.passGet.get(userId, season.id) : null;
  const ids = G.evalAchievements({
    caught: u.total_caught, earned: u.total_earned, collection: collectionMap(userId), locs: m.locs, bossWins: m.bossWins, tourney: m.tourney,
    passLevel: pass ? G.passLevel(pass.xp).level : 0, license: !!u.license, gifts: m.gifts, hosted: m.hosted, season: season && season.id,
  }).filter(id => !m.ach[id]);
  if (!ids.length) return [];
  const list = ids.map(id => G.ACH_BY_ID[id]);
  tx(() => {
    withMeta(userId, mm => { for (const id of ids) mm.ach[id] = Date.now(); });
    for (const a of list) {
      if (a.coins) Q.addCoins.run(a.coins, userId);
      if (a.title) Q.own.run(userId, 'title:' + a.id);
    }
  });
  return list.map(a => ({ id: a.id, name: a.name, coins: a.coins, title: a.title || null }));
}
function grantReward(userId, r) {
  if (r.coins) Q.addCoins.run(r.coins, userId);
  if (r.bait) withMeta(userId, m => { m.baits[r.bait] = (m.baits[r.bait] || 0) + r.n; });
  for (const key of G.rewardItems(r)) Q.own.run(userId, key);
}

/* ---------- trades & gifts ---------- */
function parseSpec(spec) {
  spec = String(spec || '');
  let m;
  if ((m = /^fish:(\d+)$/.exec(spec))) return { type: 'fish', keepId: Number(m[1]) };
  if ((m = /^bait:([a-z]+):(\d+)$/.exec(spec))) return G.BAIT_BY_ID[m[1]] && m[1] !== 'worm' && Number(m[2]) > 0 ? { type: 'bait', id: m[1], n: Number(m[2]) } : null;
  const info = G.itemInfo(spec);
  return info && info.tradable ? { type: 'item', key: spec, info } : null;
}
function specLabel(userId, s) {
  if (s.type === 'fish') { const k = Q.keepFull.get(userId, s.keepId); return k ? `${G.FISH_BY_ID[k.species].name} · ${k.weight.toFixed(2)} кг` : 'рыба'; }
  if (s.type === 'bait') return `${G.BAIT_BY_ID[s.id].name} ×${s.n}`;
  return s.info.name;
}
function hasSpec(userId, s) {
  if (s.type === 'fish') return !!Q.keepFull.get(userId, s.keepId);
  if (s.type === 'bait') return (metaOf(Q.user.get(userId)).baits[s.id] || 0) >= s.n;
  return ownedSet(userId).has(s.key);
}
function moveSpec(fromId, toId, s) {
  if (s.type === 'fish') {
    const k = Q.keepFull.get(fromId, s.keepId);
    if (!k) fail('Этой рыбы уже нет в садке');
    Q.keepDel.run(fromId, k.id);
    Q.keepAdd.run(toId, k.species, k.weight, k.price, Date.now());
  } else if (s.type === 'bait') {
    withMeta(fromId, m => {
      if ((m.baits[s.id] || 0) < s.n) fail('Не хватает наживки');
      m.baits[s.id] -= s.n;
      if (!m.baits[s.id]) { delete m.baits[s.id]; if (m.bait === s.id) m.bait = 'worm'; }
    });
    withMeta(toId, m => { m.baits[s.id] = (m.baits[s.id] || 0) + s.n; });
  } else {
    if (!ownedSet(fromId).has(s.key)) fail('Предмета уже нет');
    if (ownedSet(toId).has(s.key)) fail('У получателя уже есть «' + s.info.name + '»');
    Q.disown.run(fromId, s.key);
    Q.own.run(toId, s.key);
    if (s.info.kind === 'furn') withMeta(fromId, m => { for (const k of Object.keys(m.house.slots)) if (m.house.slots[k] === s.info.id) delete m.house.slots[k]; });
  }
}
function tradables(id) {
  const m = metaOf(Q.user.get(id));
  return {
    fish: Q.keepnet.all(id).slice(0, 60).map(k => ({ spec: 'fish:' + k.id, label: `${G.FISH_BY_ID[k.species].name} · ${k.weight.toFixed(2)} кг`, kind: 'fish', id: k.species })),
    baits: Object.entries(m.baits).filter(([b, n]) => n > 0 && G.BAIT_BY_ID[b]).map(([b, n]) => ({ kind: 'bait', id: b, max: n, label: G.BAIT_BY_ID[b].name })),
    items: [...ownedSet(id)].map(k => G.itemInfo(k)).filter(i => i && i.tradable).map(i => ({ spec: i.key, label: i.name, kind: i.kind, id: i.id })),
  };
}
function findUser(to) {
  to = String(to || '').trim().replace(/^@/, '');
  if (!to) return null;
  if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(to)) { const u = Q.userByName.get(to); if (u) return u; }
  return Q.user.get(to) || null;
}
function tradePub(r) {
  const give = parseJson(r.give, {}), want = parseJson(r.want, null);
  return { id: r.id, from: r.from_id, to: r.to_id, other: r.other, give: give.label, giveSpec: give.spec, want: want ? want.label : null, wantSpec: want ? want.spec : null, at: r.created_at };
}
function inbox(userId, text) { Q.inboxAdd.run(userId, text, Date.now()); }
function notify(userId, text) { if (bot && /^\d+$/.test(String(userId))) bot.notify(String(userId), text).catch(() => {}); }

/* ---------- profile ---------- */
function profile(id) {
  const u = Q.user.get(id);
  if (!u) return null;
  const now = Date.now();
  const owned = ownedSet(id);
  const m = metaOf(u);
  let changed = false;
  if (u.customized && !(m.lic.look >= 1)) { m.lic.look = 1; changed = true; }
  if (u.license && G.syncQuests(m.quests, now)) changed = true;
  if (changed) Q.setMeta.run(JSON.stringify(m), id);
  const season = G.seasonAt(now);
  const { quests, ...metaOut } = m;
  return {
    id: u.id, name: u.name, username: u.username, coins: u.coins, xp: u.xp, level: G.levelFromXp(u.xp),
    look: G.sanitizeLook(parseJson(u.look, null), owned), customized: !!u.customized, rod: u.rod,
    owned: [...owned],
    stats: { caught: u.total_caught, earned: u.total_earned, bestSpecies: u.best_species, bestWeight: u.best_weight },
    keepnet: Q.keepnet.all(id).map(k => ({ id: k.id, species: k.species, weight: k.weight, price: k.price, at: k.caught_at })),
    collection: collectionMap(id),
    license: !!u.license, licNo: licenseNumber(id), lic: m.lic, title: u.title || '',
    meta: metaOut,
    season: passView(id, season),
    quests: u.license ? G.questView(quests, now) : null,
    inbox: Q.inboxNew.all(id).map(r => ({ id: r.id, text: r.text, at: r.created_at })),
    trades: { incoming: Q.tradesIn.all(id).map(tradePub), outgoing: Q.tradesOut.all(id).map(tradePub) },
  };
}

/* ---------- catching ---------- */
// ctx: { loc, bait, depth, hour, coop }
function recordCatch(userId, species, weight, ctx = {}) {
  const now = Date.now();
  const price = G.fishPrice(species, weight);
  const xp = G.fishXp(species, weight);
  const f = G.FISH_BY_ID[species];
  const tier = G.RARITY_ORDER.indexOf(f.rarity);
  const res = tx(() => {
    const before = Q.user.get(userId);
    const isNew = !Q.collGet.get(userId, species);
    const r = Q.keepAdd.run(userId, species, weight, price, now);
    Q.collAdd.run(userId, species, weight, now, ctx.loc || 'lake', ctx.bait || 'worm', ctx.depth == null ? null : ctx.depth, ctx.hour == null ? null : ctx.hour, now);
    Q.catchStats.run(xp, weight, species, weight, userId);
    const lvlBefore = G.levelFromXp(before.xp).level;
    const lvlAfter = G.levelFromXp(before.xp + xp).level;
    let reward = 0;
    for (let l = lvlBefore + 1; l <= lvlAfter; l++) reward += G.levelReward(l);
    if (reward) Q.addCoins.run(reward, userId);
    return { keepId: Number(r.lastInsertRowid), species, weight, price, xp, isNew, levelUp: lvlAfter > lvlBefore ? lvlAfter : 0, reward, licensed: !!before.license };
  });
  const extra = { pass: null, quests: [], ach: [], lic: null, tourney: null };
  withMeta(userId, m => {
    if (!res.licensed && G.licenseProgress(m.lic, 'catch')) extra.lic = m.lic;
    if (ctx.loc && !m.locs.includes(ctx.loc)) m.locs.push(ctx.loc);
  });
  if (res.licensed) {
    const season = G.seasonAt(now), mods = G.eventMods(now);
    let passXp = season ? G.PASS_XP_RARITY[tier] * mods.passXp : 0;
    const q = questEvent(userId, {
      type: 'catch', species, weight, tier, loc: ctx.loc || 'lake', night: G.isNight(ctx.hour == null ? 12 : ctx.hour),
      coop: !!ctx.coop, bait: ctx.bait || 'worm', seasonal: !!f.season,
    });
    extra.quests = q.done; passXp += q.xp;
    const t = G.tournamentAt(now);
    if (t && t.active && t.species === species) {
      const prev = Q.tourneyGet.get(t.id, userId);
      Q.tourneyPut.run(t.id, userId, species, weight, now);
      extra.tourney = { id: t.id, weight: prev ? Math.max(prev.weight, weight) : weight, first: !prev };
      if (!prev) {
        withMeta(userId, m => { m.tourney.played++; });
        const tq = questEvent(userId, { type: 'tourney' });
        extra.quests = extra.quests.concat(tq.done);
        passXp += tq.xp + G.TOURNEY.joinXp;
      }
    }
    if (passXp) extra.pass = addPassXp(userId, passXp);
    extra.ach = checkAchievements(userId);
  }
  return Object.assign(res, extra);
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
  return async (req, res) => {
    const who = authFrom(req.get('X-Init-Data'), req.get('X-Guest-Id'), req.get('X-Guest-Name'));
    if (!who) return res.status(401).json({ error: 'Откройте игру через Telegram' });
    ensureUser(who.id, who.name, who.username);
    try {
      res.json(await handler(who, req.body || {}, req));
    } catch (e) {
      if (e.userError) return res.status(400).json({ error: e.message });
      if (e.tg) { log('telegram api:', e.message); return res.status(502).json({ error: 'Telegram не ответил, попробуй ещё раз' }); }
      log('api error', e);
      res.status(500).json({ error: 'Что-то пошло не так' });
    }
  };
}

app.get('/api/config', (req, res) => {
  res.json({ botUsername: CFG.botUsername, appLink: appLink(), guest: CFG.allowGuest, maxPlayers: G.MAX_PLAYERS, stars: !!CFG.token });
});

app.post('/api/me', api(who => ({ profile: profile(who.id) })));

app.post('/api/look', api((who, body) => {
  const look = G.sanitizeLook(body.look, ownedSet(who.id));
  Q.setLook.run(JSON.stringify(look), who.id);
  withMeta(who.id, m => { m.lic.look = 1; });
  rooms.updatePlayer(who.id);
  return { profile: profile(who.id) };
}));

app.post('/api/buy', api((who, body) => {
  requireLicense(who.id);
  const item = String(body.item || '');
  const [kind, id] = item.split(':');
  const season = G.seasonAt(Date.now());
  let price, info = null;
  if (kind === 'bait') {
    const b = G.BAIT_BY_ID[id];
    if (!b || !b.price) fail('Нет такой наживки');
    price = b.price;
  } else {
    info = G.itemInfo(item);
    if (!info) fail('Нет такого предмета');
    if (info.pass) fail('Этот предмет можно получить только в рыболовном пропуске');
    if (!info.price) fail('Этот предмет и так твой');
    if (info.season && (!season || season.id !== info.season)) fail('Сезонный предмет сейчас не продаётся');
    if (kind === 'title') fail('Титулы не продаются');
    price = info.price;
  }
  tx(() => {
    const u = Q.user.get(who.id);
    if (info && ownedSet(who.id).has(item)) fail('Уже куплено');
    if (u.coins < price) fail('Не хватает монет');
    Q.addCoins.run(-price, who.id);
    if (kind === 'bait') withMeta(who.id, m => { m.baits[id] = (m.baits[id] || 0) + G.BAIT_BY_ID[id].pack; });
    else {
      Q.own.run(who.id, item);
      if (kind === 'rod') Q.setRod.run(id, who.id);
      if (kind === 'line' || kind === 'hook') withMeta(who.id, m => { m[kind] = id; });
    }
  });
  rooms.updatePlayer(who.id);
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

app.post('/api/bait', api((who, body) => {
  const id = String(body.bait || 'worm');
  if (!G.BAIT_BY_ID[id]) fail('Нет такой наживки');
  withMeta(who.id, m => {
    if (id !== 'worm' && !((m.baits[id] || 0) > 0)) fail('Эта наживка закончилась');
    m.bait = id;
  });
  rooms.updatePlayer(who.id);
  return { profile: profile(who.id) };
}));

app.post('/api/tackle', api((who, body) => {
  requireLicense(who.id);
  const owned = ownedSet(who.id);
  withMeta(who.id, m => {
    for (const kind of ['line', 'hook']) {
      if (body[kind] == null) continue;
      const t = G.findTackle(kind, String(body[kind]));
      if (!t) fail('Нет такой снасти');
      if (t.price && !owned.has(kind + ':' + t.id)) fail('Сначала купи «' + t.name + '»');
      m[kind] = t.id;
    }
  });
  rooms.updatePlayer(who.id);
  return { profile: profile(who.id) };
}));

app.post('/api/loc', api((who, body) => {
  const u = requireLicense(who.id);
  const loc = String(body.loc || '');
  if (!G.LOC_BY_ID[loc]) fail('Нет такой локации');
  if (!G.locUnlocked(loc, G.levelFromXp(u.xp).level)) fail(`Откроется на ${G.LOC_BY_ID[loc].level} уровне`);
  withMeta(who.id, m => { m.loc = loc; });
  return { profile: profile(who.id) };
}));

app.post('/api/style', api((who, body) => {
  requireLicense(who.id);
  const owned = ownedSet(who.id);
  const pick = (list, kind, v) => {
    const id = String(v);
    if (!list.some(x => x.id === id)) fail('Нет такого стиля');
    if (id !== 'none' && !owned.has(kind + ':' + id)) fail('Этот стиль ещё не получен');
    return id;
  };
  withMeta(who.id, m => {
    if (body.effect != null) m.effect = pick(G.EFFECTS, 'effect', body.effect);
    if (body.pose != null) m.pose = pick(G.POSES, 'pose', body.pose);
    if (body.skin != null) m.skin = pick(G.ROD_SKINS, 'skin', body.skin);
  });
  if (body.title != null) {
    const id = String(body.title);
    if (id && !(G.TITLES[id] && owned.has('title:' + id))) fail('Этот титул ещё не получен');
    Q.setTitle.run(id, who.id);
  }
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
  const out = { sold: total, quests: [], pass: null, ach: [], lic: null };
  if (total) {
    const u = Q.user.get(who.id);
    if (!u.license) withMeta(who.id, m => { if (G.licenseProgress(m.lic, 'sell')) out.lic = m.lic; });
    else {
      const q = questEvent(who.id, { type: 'sell', coins: total });
      out.quests = q.done;
      if (q.xp) out.pass = addPassXp(who.id, q.xp);
      out.ach = checkAchievements(who.id);
    }
  }
  out.profile = profile(who.id);
  return out;
}));

app.post('/api/license/exam', api((who, body) => {
  const u = Q.user.get(who.id);
  if (u.license) fail('Лицензия уже получена');
  const m = metaOf(u);
  if (u.customized) m.lic.look = 1;
  if (!G.licenseReadyForExam(m.lic)) fail('Сначала выполни все задания лицензии');
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!G.checkExam(answers)) {
    return { ok: false, wrong: G.LICENSE.exam.map((q, i) => (Number(answers[i]) === q.ok ? -1 : i)).filter(i => i >= 0), profile: profile(who.id) };
  }
  const rw = G.LICENSE.reward;
  tx(() => {
    withMeta(who.id, mm => { mm.lic.look = 1; mm.lic.exam = 1; mm.baits[rw.bait] = (mm.baits[rw.bait] || 0) + rw.n; });
    Q.setLicense.run(1, who.id);
    Q.addCoins.run(rw.coins, who.id);
  });
  const ach = checkAchievements(who.id);
  rooms.updatePlayer(who.id);
  log('license granted', who.id, who.name);
  return { ok: true, reward: rw, ach, profile: profile(who.id) };
}));

app.post('/api/pass/claim', api((who, body) => {
  requireLicense(who.id);
  const season = G.seasonAt(Date.now());
  if (!season) fail('Сейчас межсезонье');
  const row = Q.passGet.get(who.id, season.id) || { xp: 0, premium: 0, claimed_free: '[]', claimed_prem: '[]' };
  const level = G.passLevel(row.xp).level;
  const cf = new Set(parseJson(row.claimed_free, [])), cp = new Set(parseJson(row.claimed_prem, []));
  const want = [];
  if (body.all) {
    for (let l = 1; l <= level; l++) {
      if (season.free[l] && !cf.has(l)) want.push(['free', l]);
      if (row.premium && season.premium[l] && !cp.has(l)) want.push(['prem', l]);
    }
  } else {
    const l = Number(body.level), track = body.track === 'prem' ? 'prem' : 'free';
    if (!(l >= 1 && l <= level)) fail('Этот уровень ещё не открыт');
    if (track === 'prem' && !row.premium) fail('Нужен премиум-пропуск');
    if ((track === 'prem' ? cp : cf).has(l)) fail('Награда уже получена');
    if (!(track === 'prem' ? season.premium : season.free)[l]) fail('На этом уровне нет награды');
    want.push([track, l]);
  }
  if (!want.length) fail('Новых наград пока нет');
  const got = [];
  tx(() => {
    if (!Q.passGet.get(who.id, season.id)) Q.passXp.run(who.id, season.id, 0);
    for (const [track, l] of want) {
      const r = (track === 'prem' ? season.premium : season.free)[l];
      grantReward(who.id, r);
      (track === 'prem' ? cp : cf).add(l);
      got.push(G.rewardName(r));
    }
    Q.passClaimed.run(JSON.stringify([...cf]), JSON.stringify([...cp]), who.id, season.id);
  });
  rooms.updatePlayer(who.id);
  return { got, profile: profile(who.id) };
}));

app.post('/api/pass/invoice', api(async who => {
  requireLicense(who.id);
  if (!bot) fail('Покупка доступна только в Telegram');
  if (!/^\d+$/.test(who.id)) fail('Покупка доступна только для аккаунтов Telegram');
  const season = G.seasonAt(Date.now());
  if (!season) fail('Сейчас межсезонье');
  const row = Q.passGet.get(who.id, season.id);
  if (row && row.premium) fail('Премиум-пропуск уже активен');
  const link = await bot.call('createInvoiceLink', {
    title: `Премиум-пропуск · ${season.name}`,
    description: `Премиум-ветка наград сезона ${season.name}: сеты Kai Angel и 9mice, эффекты заброса, позы, скины удочек и готическая мебель.`,
    payload: `pass:${season.id}:${who.id}`,
    currency: 'XTR',
    prices: [{ label: 'Премиум-пропуск', amount: G.PASS_PRICE_STARS }],
  });
  return { link };
}));

app.post('/api/events', api(who => {
  const now = Date.now();
  const t = G.tournamentAt(now), last = G.lastTournament(now);
  const mapTop = rows => rows.map(r => ({ id: r.user_id, name: r.name, weight: r.weight, title: titleName(r.title), look: G.sanitizeLook(parseJson(r.look, null)) }));
  const lastDone = last ? Q.tourneyDone.get(last.id) : null;
  const season = G.seasonAt(now);
  return {
    now,
    schedule: G.eventSchedule(now),
    tourney: t ? Object.assign({}, t, { top: mapTop(Q.tourneyTop.all(t.id, 10)), me: (Q.tourneyGet.get(t.id, who.id) || {}).weight || null, count: Q.tourneyCount.get(t.id).n }) : null,
    last: lastDone ? Object.assign({}, last, { results: parseJson(lastDone.results, []) }) : null,
    boss: G.bossFor(season && season.id).name,
  };
}));

app.post('/api/archive', api(who => {
  const now = Date.now();
  const rows = Object.fromEntries(Q.passUser.all(who.id).map(r => [r.season, r]));
  const cur = G.seasonAt(now);
  return {
    current: cur ? { id: cur.id, title: cur.title, end: cur.end } : null,
    seasons: G.SEASONS.filter(s => s.end <= now).map(s => {
      const r = rows[s.id];
      const cf = r ? parseJson(r.claimed_free, []) : [], cp = r ? parseJson(r.claimed_prem, []) : [];
      const wins = Q.tourneyDoneRange.all(s.start, s.end).map(d => parseJson(d.results, [])).flat().filter(x => x.id === who.id);
      return {
        id: s.id, title: s.title, start: s.start, end: s.end, xp: r ? r.xp : 0, level: r ? G.passLevel(r.xp).level : 0, premium: !!(r && r.premium),
        rewards: cf.map(l => G.rewardName(s.free[l])).concat(cp.map(l => G.rewardName(s.premium[l]))),
        podiums: wins.map(w => w.place),
      };
    }),
  };
}));

app.post('/api/house', api((who, body) => {
  requireLicense(who.id);
  const owned = ownedSet(who.id);
  const col = collectionMap(who.id);
  withMeta(who.id, m => {
    if (body.slot) {
      const slot = String(body.slot);
      if (!G.HOUSE_SLOTS.some(s => s.id === slot)) fail('Нет такого места в домике');
      const id = body.item ? String(body.item) : null;
      if (id) {
        const f = G.FURN_BY_ID[id];
        if (!f || f.slot !== slot) fail('Сюда это не поставить');
        if (!(G.itemInfo('furn:' + id).free || owned.has('furn:' + id))) fail('Сначала получи «' + f.name + '»');
        m.house.slots[slot] = id;
      } else {
        delete m.house.slots[slot];
        if (slot === 'tank') m.house.tank = [];
      }
    }
    if (Array.isArray(body.tank)) {
      if (!m.house.slots.tank) fail('Сначала поставь аквариум');
      m.house.tank = [...new Set(body.tank.map(String))].filter(s => col[s]).slice(0, 3);
    }
    if (Array.isArray(body.trophies)) m.house.trophies = [...new Set(body.trophies.map(String))].filter(s => col[s]).slice(0, 3);
  });
  return { profile: profile(who.id) };
}));

app.post('/api/house/visit', api((who, body) => {
  const owner = Q.user.get(String(body.id || ''));
  if (!owner || !owner.license) fail('Домик не найден');
  const m = metaOf(owner);
  const col = collectionMap(owner.id);
  const trophies = {};
  for (const s of m.house.trophies) if (col[s]) trophies[s] = { best: col[s].best };
  const out = {
    owner: { id: owner.id, name: owner.name, look: G.sanitizeLook(parseJson(owner.look, null), ownedSet(owner.id)), title: titleName(owner.title), pose: m.pose },
    house: m.house, collection: trophies, quests: [], pass: null,
  };
  const me = Q.user.get(who.id);
  if (owner.id !== who.id && me.license) {
    withMeta(owner.id, mm => { mm.hosted = (mm.hosted || 0) + 1; });
    checkAchievements(owner.id);
    inbox(owner.id, `🏠 ${me.name} заглянул(а) к тебе в домик`);
    const q = questEvent(who.id, { type: 'visit' });
    out.quests = q.done;
    if (q.xp) out.pass = addPassXp(who.id, q.xp);
  }
  return out;
}));

app.post('/api/inbox/read', api(who => { Q.inboxSeen.run(who.id); return { profile: profile(who.id) }; }));

app.post('/api/trade/inventory', api((who, body) => {
  requireLicense(who.id);
  const u = findUser(body.to);
  if (!u || !u.license) fail('Рыбак не найден или ещё без лицензии');
  if (u.id === who.id) fail('Это ты сам');
  return { user: { id: u.id, name: u.name, username: u.username, look: G.sanitizeLook(parseJson(u.look, null), ownedSet(u.id)), title: titleName(u.title) }, items: tradables(u.id) };
}));

app.post('/api/gift', api((who, body) => {
  const me = requireLicense(who.id);
  const to = findUser(body.to);
  if (!to) fail('Рыбак не найден');
  if (to.id === who.id) fail('Нельзя подарить самому себе');
  if (!to.license) fail('У получателя ещё нет лицензии рыбака');
  const s = parseSpec(body.item);
  if (!s) fail('Этот предмет нельзя подарить');
  if (!hasSpec(who.id, s)) fail('У тебя нет этого предмета');
  const label = specLabel(who.id, s);
  tx(() => {
    moveSpec(who.id, to.id, s);
    withMeta(who.id, m => { m.gifts = (m.gifts || 0) + 1; });
    inbox(to.id, `🎁 ${me.name} подарил(а) тебе: ${label}`);
  });
  notify(to.id, `🎁 <b>${me.name}</b> подарил(а) тебе: <b>${label}</b>`);
  const q = questEvent(who.id, { type: 'gift' });
  const pass = q.xp ? addPassXp(who.id, q.xp) : null;
  const ach = checkAchievements(who.id);
  rooms.updatePlayer(who.id); rooms.updatePlayer(to.id);
  return { label, quests: q.done, pass, ach, profile: profile(who.id) };
}));

app.post('/api/trade/offer', api((who, body) => {
  const me = requireLicense(who.id);
  const to = findUser(body.to);
  if (!to || !to.license) fail('Рыбак не найден или ещё без лицензии');
  if (to.id === who.id) fail('Нельзя меняться с самим собой');
  const give = parseSpec(body.give), want = parseSpec(body.want);
  if (!give || !want) fail('Выбери, что отдаёшь и что хочешь получить');
  if (!hasSpec(who.id, give)) fail('У тебя нет этого предмета');
  if (!hasSpec(to.id, want)) fail('У рыбака нет этого предмета');
  if (Q.tradesPendingOut.get(who.id).n >= 10) fail('Слишком много открытых предложений');
  const now = Date.now();
  const g = { spec: body.give, label: specLabel(who.id, give) }, w = { spec: body.want, label: specLabel(to.id, want) };
  Q.tradeAdd.run(who.id, to.id, JSON.stringify(g), JSON.stringify(w), now, now);
  inbox(to.id, `🔄 ${me.name} предлагает обмен: ${g.label} ↔ ${w.label}`);
  notify(to.id, `🔄 <b>${me.name}</b> предлагает обмен:\n${g.label} ↔ ${w.label}\nОткрой игру, чтобы ответить.`);
  return { profile: profile(who.id) };
}));

app.post('/api/trade/respond', api((who, body) => {
  requireLicense(who.id);
  const t = Q.tradeGet.get(Number(body.id));
  if (!t || t.to_id !== who.id || t.status !== 'pending') fail('Предложение уже неактуально');
  const g = parseJson(t.give, {}), w = parseJson(t.want, {});
  const now = Date.now();
  const me = Q.user.get(who.id);
  if (!body.accept) {
    Q.tradeSet.run('declined', now, t.id);
    inbox(t.from_id, `🔄 ${me.name} отклонил(а) обмен: ${g.label} ↔ ${w.label}`);
    return { profile: profile(who.id) };
  }
  const give = parseSpec(g.spec), want = parseSpec(w.spec);
  tx(() => {
    if (!give || !want || !hasSpec(t.from_id, give) || !hasSpec(who.id, want)) { Q.tradeSet.run('expired', now, t.id); fail('Предметы для обмена больше недоступны'); }
    moveSpec(t.from_id, who.id, give);
    moveSpec(who.id, t.from_id, want);
    Q.tradeSet.run('done', now, t.id);
    inbox(t.from_id, `✅ ${me.name} принял(а) обмен: ${g.label} ↔ ${w.label}`);
  });
  notify(t.from_id, `✅ <b>${me.name}</b> принял(а) обмен: ${g.label} ↔ ${w.label}`);
  rooms.updatePlayer(who.id); rooms.updatePlayer(t.from_id);
  return { profile: profile(who.id) };
}));

app.post('/api/trade/cancel', api((who, body) => {
  const t = Q.tradeGet.get(Number(body.id));
  if (!t || t.from_id !== who.id || t.status !== 'pending') fail('Предложение уже неактуально');
  Q.tradeSet.run('cancelled', Date.now(), t.id);
  return { profile: profile(who.id) };
}));

app.get('/api/rooms', (req, res) => res.json({ rooms: rooms.publicList() }));

app.get('/api/top', (req, res) => {
  res.json({
    top: Q.top.all(20).map(r => ({
      id: r.id, name: r.name, level: G.levelFromXp(r.xp).level, caught: r.total_caught, earned: r.total_earned, title: titleName(r.title),
      species: r.species, bestSpecies: r.best_species, bestWeight: r.best_weight, look: G.sanitizeLook(parseJson(r.look, null)),
    })),
  });
});

app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.count(), online: rooms.online() }));

/* ───────────────────────── rooms & fishing (WebSocket) ───────────────────────── */

const CODE_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => CODE_ABC[crypto.randomInt(CODE_ABC.length)]).join('');
const BASE_EMOTES = new Set(G.EMOTES.filter(e => !e.pass).map(e => e.id));

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
    return {
      id: p.id, name: p.name, look: p.look, rod: p.rod, slot: p.slot, level: p.level, state: p.state, depth: p.depth,
      title: titleName(p.title), skin: p.meta.skin, effect: p.meta.effect, pose: p.meta.pose,
    };
  }
  const bossPub = b => (b ? { name: b.name, fish: b.fish, hp: b.hp, max: b.max, endsAt: b.endsAt } : null);
  function roomState(room) {
    return {
      id: room.id, code: room.code, name: room.name, isPublic: room.isPublic, solo: room.solo, loc: room.loc,
      max: room.max, hostId: room.hostId, link: room.solo ? null : appLink('room_' + room.code),
      players: [...room.players.values()].map(pub), boss: bossPub(room.boss),
    };
  }
  function clearTimers(p) { p.timers.forEach(clearTimeout); p.timers = []; }
  function later(p, ms, fn) { p.timers.push(setTimeout(fn, ms)); }

  function create(p, opts) {
    if (!opts.solo && !p.license) return send(p, { t: 'error', msg: 'Кооп-комнаты откроются после получения лицензии рыбака' });
    leave(p);
    const want = String(opts.loc || p.meta.loc || 'lake');
    const loc = p.license && G.locUnlocked(want, p.level) ? want : 'lake';
    let code; do { code = genCode(); } while (byCode.has(code));
    const room = {
      id: crypto.randomUUID(), code, players: new Map(), hostId: p.id, createdAt: Date.now(), loc, boss: null, nextBossAt: 0,
      solo: !!opts.solo, isPublic: !opts.solo && !!opts.isPublic, max: opts.solo ? 1 : G.MAX_PLAYERS,
      name: String(opts.name || '').replace(/[<>]/g, '').trim().slice(0, 28) || `Рыбалка у ${p.name}`,
    };
    byId.set(room.id, room); byCode.set(code, room);
    log(`room ${code} created by ${p.name} (${room.solo ? 'solo' : room.isPublic ? 'public' : 'private'}, ${loc})`);
    enter(p, room);
  }

  function join(p, code) {
    if (!p.license) return send(p, { t: 'error', msg: 'Кооп-комнаты откроются после получения лицензии рыбака' });
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

  function loadPlayer(p) {
    const u = Q.user.get(p.id);
    p.owned = ownedSet(p.id);
    p.meta = metaOf(u);
    p.look = G.sanitizeLook(parseJson(u.look, null), p.owned);
    p.rod = G.ROD_BY_ID[u.rod] ? u.rod : 'bamboo';
    p.level = G.levelFromXp(u.xp).level;
    p.name = u.name;
    p.title = u.title;
    p.license = !!u.license;
  }

  /* ---- co-op boss ---- */
  const nextBossDelay = () => { const [a, b] = G.BOSS.every; return (a + Math.random() * (b - a)) / G.eventMods(Date.now()).boss; };
  function spawnBoss(room, now) {
    const season = G.seasonAt(now);
    const def = G.bossFor(season && season.id);
    const hp = G.BOSS.hpPerPlayer * room.players.size;
    room.boss = { name: def.name, fish: def.fish, hp, max: hp, endsAt: now + G.BOSS.duration, hits: new Map() };
    broadcast(room, { t: 'boss', boss: bossPub(room.boss) });
  }
  function hitBoss(room, p, species, weight) {
    const b = room.boss;
    if (!b) return;
    const dmg = G.bossDamage(species, weight);
    b.hp = Math.max(0, b.hp - dmg);
    b.hits.set(p.id, (b.hits.get(p.id) || 0) + dmg);
    broadcast(room, { t: 'bossHit', id: p.id, dmg, hp: b.hp, max: b.max });
    if (b.hp <= 0) defeatBoss(room);
  }
  function defeatBoss(room) {
    const b = room.boss;
    room.boss = null;
    room.nextBossAt = Date.now() + nextBossDelay();
    const winners = [...b.hits.keys()].filter(id => room.players.has(id));
    broadcast(room, { t: 'bossEnd', win: true, name: b.name, winners: winners.map(id => room.players.get(id).name) });
    for (const id of winners) {
      const pl = room.players.get(id);
      Q.addCoins.run(G.BOSS.reward.coins, id);
      withMeta(id, m => { m.bossWins = (m.bossWins || 0) + 1; });
      const q = questEvent(id, { type: 'boss' });
      const pass = addPassXp(id, G.BOSS.reward.xp + q.xp);
      const ach = checkAchievements(id);
      loadPlayer(pl);
      send(pl, { t: 'bossReward', coins: G.BOSS.reward.coins, pass, quests: q.done, ach, profile: profile(id) });
    }
  }
  function tick(now) {
    for (const room of byId.values()) {
      if (!room.players.size && room.emptySince && now - room.emptySince > (room.solo ? 5000 : 60000)) {
        byId.delete(room.id); byCode.delete(room.code);
        continue;
      }
      if (room.solo) continue;
      if (room.boss) {
        if (now >= room.boss.endsAt) {
          broadcast(room, { t: 'bossEnd', win: false, name: room.boss.name });
          room.boss = null;
          room.nextBossAt = now + nextBossDelay();
        }
        continue;
      }
      if (room.players.size < 2) { room.nextBossAt = 0; continue; }
      if (!room.nextBossAt) { room.nextBossAt = now + nextBossDelay(); continue; }
      if (now >= room.nextBossAt) spawnBoss(room, now);
    }
  }

  /* ---- fishing state machine (server is the referee) ---- */

  function cast(p, power) {
    if (!p.room || p.state !== 'idle') return;
    const now = Date.now();
    let licStep = false;
    const meta = withMeta(p.id, m => {
      if (m.bait !== 'worm' && !((m.baits[m.bait] || 0) > 0)) m.bait = 'worm';
      p.castBait = m.bait;
      if (m.bait !== 'worm') {
        m.baits[m.bait] -= 1;
        if (m.baits[m.bait] <= 0) { delete m.baits[m.bait]; m.bait = 'worm'; }
      }
      if (!p.license) licStep = G.licenseProgress(m.lic, 'cast');
      return m;
    });
    p.meta = meta;
    const gear = G.gear(p.rod, Object.assign({}, meta, { bait: p.castBait }), p.hour);
    power = clamp(Number(power) || 0, 0.05, 1);
    p.depth = Math.round(clamp(power * gear.depth, 0.04, 1) * 1000) / 1000;
    const season = G.seasonAt(now), mods = G.eventMods(now);
    p.gear = gear;
    p.plan = G.planCast(p.depth, gear, p.hour, { loc: p.room.loc, season: season && season.id, bite: mods.bite, seasonFish: mods.seasonFish });
    p.state = 'wait';
    broadcast(p.room, { t: 'cast', id: p.id, depth: p.depth, fx: meta.effect, bait: p.castBait });
    send(p, { t: 'bait', bait: meta.bait, baits: meta.baits });
    if (licStep) send(p, { t: 'lic', lic: meta.lic });
    if (p.license) {
      const q = questEvent(p.id, { type: 'cast' });
      if (q.done.length) send(p, { t: 'quest', done: q.done, pass: q.xp ? addPassXp(p.id, q.xp) : null });
    }
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
    const reel = (p.gear && p.gear.reel) || G.ROD_BY_ID[p.rod].reel;
    const minMs = (p.plan.fight.stamina / (reel * 1.6)) * 1000 * 0.55;
    if (Date.now() - p.hookedAt < minMs) {
      p.state = 'idle';
      return broadcast(p.room, { t: 'lost', id: p.id, reason: 'escape' });
    }
    p.state = 'idle';
    const room = p.room;
    const res = recordCatch(p.id, p.plan.species, p.plan.weight, {
      loc: room.loc, bait: p.castBait, depth: p.depth, hour: p.hour, coop: !room.solo && room.players.size > 1,
    });
    loadPlayer(p);
    send(p, { t: 'caught', id: p.id, fish: res, profile: profile(p.id) });
    broadcast(room, { t: 'caught', id: p.id, fish: { species: res.species, weight: res.weight, isNew: res.isNew }, level: p.level }, p.id);
    if (res.levelUp) broadcast(room, { t: 'levelup', id: p.id, level: res.levelUp });
    if (room.boss) hitBoss(room, p, res.species, res.weight);
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
      case 'emote': {
        const e = String(msg.e || '');
        if (p.room && (BASE_EMOTES.has(e) || (G.EMOTE_BY_ID[e] && p.owned.has('emote:' + e))) && Date.now() - (p.lastEmote || 0) > 900) {
          p.lastEmote = Date.now();
          broadcast(p.room, { t: 'emote', id: p.id, e });
        }
        return;
      }
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
      try { onMessage(p, msg); } catch (e) { log('ws error', e); }
    });
    ws.on('close', () => {
      if (!p || players.get(p.id) !== p) return;
      leave(p);
      players.delete(p.id);
    });
  }

  return {
    attach, tick,
    publicList() {
      return [...byId.values()].filter(r => r.isPublic && r.players.size)
        .sort((a, b) => b.players.size - a.players.size || b.createdAt - a.createdAt).slice(0, 30)
        .map(r => ({ code: r.code, name: r.name, loc: r.loc, players: r.players.size, max: r.max, boss: !!r.boss,
          host: (r.players.get(r.hostId) || {}).name || '', looks: [...r.players.values()].slice(0, 5).map(x => x.look) }));
    },
    updatePlayer(id) {
      const p = players.get(id);
      if (!p) return;
      loadPlayer(p);
      if (p.room) broadcast(p.room, { t: 'player', player: pub(p) });
      send(p, { t: 'bait', bait: p.meta.bait, baits: p.meta.baits });
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
setInterval(() => rooms.tick(Date.now()), 5000).unref();

/* ---------- tournaments & housekeeping ---------- */
function finalizeTournament() {
  const now = Date.now();
  const lt = G.lastTournament(now);
  if (!lt || Q.tourneyDone.get(lt.id)) return;
  const top = Q.tourneyTop.all(lt.id, 3);
  const results = top.map((r, i) => ({ id: r.user_id, name: r.name, weight: r.weight, place: i + 1 }));
  const fishName = G.FISH_BY_ID[lt.species].name;
  tx(() => {
    Q.tourneyDoneAdd.run(lt.id, now, JSON.stringify(results));
    top.forEach((r, i) => {
      const prize = G.TOURNEY.prizes[i];
      Q.addCoins.run(prize.coins, r.user_id);
      withMeta(r.user_id, m => { m.tourney.podium++; if (i === 0) m.tourney.wins++; });
      addPassXp(r.user_id, prize.xp);
      inbox(r.user_id, `🏆 Турнир «${fishName}»: ${i + 1} место (${r.weight.toFixed(2)} кг)! Награда: ${prize.coins} монет и ${prize.xp} опыта пропуска`);
    });
  });
  for (const r of results) {
    checkAchievements(r.id);
    notify(r.id, `🏆 <b>Турнир «${fishName}» завершён!</b>\nТвоё место: <b>${r.place}</b> (${r.weight.toFixed(2)} кг). Награда уже в игре.`);
  }
  log(`tournament ${lt.id} finalized: ${results.length} winners`);
}
setTimeout(() => { try { finalizeTournament(); } catch (e) { log('tournament error', e.message); } }, 10000).unref();
setInterval(() => {
  try { finalizeTournament(); } catch (e) { log('tournament error', e.message); }
  try { Q.tradesExpire.run(Date.now(), Date.now() - 2 * G.DAY); } catch (e) { log('trades error', e.message); }
}, 60000).unref();

/* ───────────────────────── Telegram bot ───────────────────────── */

const bot = (() => {
  if (!CFG.token) return null;
  const API = `https://api.telegram.org/bot${CFG.token}/`;
  const UPDATES = ['message', 'callback_query', 'inline_query', 'pre_checkout_query'];

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
    ticket:   ['🎟', '🎫', '⭐️'],
    admin:    ['🛠', '⚙️', '🔧'],
    stats:    ['📊', '📈'],
    search:   ['🔍', '🔎'],
    star:     ['⭐️', '🌟'],
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
  const isAdmin = id => CFG.admins.includes(String(id));

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
        `Привет, <b>${esc(p.name)}</b>! Водоёмы уже проснулись: получи лицензию рыбака, лови редких рыб, ` +
        `проходи сезонный пропуск и рыбачь вместе с друзьями — до ${G.MAX_PLAYERS} человек в комнате.\n\n` +
        `${E('coins')} Монеты: <b>${num(p.coins)}</b>   ${E('level')} Уровень: <b>${lvl}</b>\n` +
        `${E('fish')} Поймано: <b>${num(p.stats.caught)}</b>   ${E('collection')} Дневник: <b>${coll}/${G.FISH.length}</b>` +
        (p.license ? '' : `\n\n${E('lock')} Сначала пройди экзамен на <b>лицензию рыбака</b> — это займёт пару минут.`),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [btn('Играть', 'play', Object.assign({ style: 'success' }, webApp()))],
        [btn('Как играть', 'help', { callback_data: 'help', style: 'primary' })],
      ] },
    });
  }

  const backRow = () => [btn('В меню', 'back', { callback_data: 'menu' }), btn('Играть', 'play', Object.assign({ style: 'success' }, webApp()))];

  function profileScreen(u) {
    const p = profile(u.id);
    const rod = G.ROD_BY_ID[p.rod];
    const best = p.stats.bestSpecies ? `${G.FISH_BY_ID[p.stats.bestSpecies].name}, ${p.stats.bestWeight.toFixed(2)} кг` : '—';
    return () => ({
      text:
        `${E('profile')} <b>Профиль рыбака</b>\n\n` +
        `<b>${esc(p.name)}</b>${p.username ? ' · @' + esc(p.username) : ''}${p.title ? ' · <i>' + esc(titleName(p.title)) + '</i>' : ''}\n` +
        `${E('ticket')} Лицензия: <b>${p.license ? '№ ' + p.licNo : 'не получена'}</b>\n` +
        `${E('level')} Уровень <b>${p.level.level}</b> · ${p.level.cur}/${p.level.need} XP\n` +
        `${E('coins')} Монеты: <b>${num(p.coins)}</b>\n` +
        `${E('fish')} Поймано рыб: <b>${num(p.stats.caught)}</b>\n` +
        `${E('fire')} Заработано: <b>${num(p.stats.earned)}</b>\n` +
        `${E('top')} Лучший трофей: <b>${esc(best)}</b>\n` +
        `${E('shop')} Удочка: <b>${esc(rod.name)}</b>\n` +
        (p.season ? `${E('star')} Пропуск «${esc(p.season.name)}»: <b>${p.season.level}/${p.season.max}</b>${p.season.premium ? ' · премиум' : ''}\n` : '') +
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
      text: `${E('collection')} <b>Дневник: ${Object.keys(p.collection).length}/${G.FISH.length}</b>\n\n${lines.join('\n')}`,
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
        `${E('ticket')} <b>Лицензия.</b> Новичок сдаёт экзамен: создаёт рыбака, делает забросы, ловит и продаёт рыбу, отвечает на 4 вопроса. После этого открывается вся игра.\n\n` +
        `<b>1.</b> Зажми «Заброс» — чем дольше держишь, тем глубже уйдёт крючок. Глубже — крупнее и реже рыба.\n` +
        `<b>2.</b> Жди поклёвку. Поплавок дёргается — не торопись! Когда он уйдёт под воду и появится «!», жми «Подсечь».\n` +
        `<b>3.</b> Вываживай: держи «Тяни», но следи за натяжением. Красная зона — леска порвётся, слабина — рыба уйдёт.\n` +
        `<b>4.</b> Наживка и снасти меняют клёв: блесна для хищников, живец для трофеев, светлячок — ночью.\n\n` +
        `${E('star')} <b>Сезон и пропуск.</b> Выполняй ежедневные, еженедельные и особые задания, качай пропуск на 30 уровней и забирай награды — бесплатные и премиум.\n` +
        `${E('coop')} <b>Кооп.</b> До ${G.MAX_PLAYERS} рыбаков в комнате, совместные боссы, турниры по выходным.\n` +
        `${E('fire')} Ночью клюют совсем другие рыбы — загляни на воду после 21:00.`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [backRow()] },
    });
  }

  /* ---- admin panel ---- */
  const adminState = new Map(); // admin id -> pending action
  function adminPanel() {
    const season = G.seasonAt(Date.now());
    const pay = Q.paySum.get();
    return () => ({
      text:
        `${E('admin')} <b>Админ-панель Hooked</b>\n\n` +
        `${E('profile')} Игроков: <b>${num(Q.usersCount.get().n)}</b> · с лицензией: <b>${num(Q.licensedCount.get().n)}</b>\n` +
        `${E('coop')} Онлайн: <b>${rooms.online()}</b> · комнат: <b>${rooms.count()}</b>\n` +
        (season ? `${E('ticket')} Премиум «${esc(season.name)}»: <b>${num(Q.premiumCount.get(season.id).n)}</b>\n` : `${E('ticket')} Сейчас межсезонье\n`) +
        `${E('star')} Оплат: <b>${num(pay.n)}</b> · Stars: <b>${num(pay.stars)}</b>`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [btn('Выдать пропуск', 'ticket', { callback_data: 'admin:grant', style: 'success' }), btn('Забрать пропуск', 'lock', { callback_data: 'admin:revoke', style: 'danger' })],
        [btn('Найти игрока', 'search', { callback_data: 'admin:find', style: 'primary' }), btn('Выдать монеты', 'coins', { callback_data: 'admin:coins', style: 'primary' })],
        [btn('Платежи', 'stats', { callback_data: 'admin:pays' }), btn('Обновить', 'check', { callback_data: 'admin:panel' })],
      ] },
    });
  }
  function playerCard(u) {
    const season = G.seasonAt(Date.now());
    const pv = season ? passView(u.id, season) : null;
    return () => ({
      text:
        `${E('profile')} <b>${esc(u.name)}</b>${u.username ? ' · @' + esc(u.username) : ''}\n` +
        `ID: <code>${esc(u.id)}</code>\n` +
        `${E('level')} Уровень <b>${G.levelFromXp(u.xp).level}</b> · ${E('coins')} <b>${num(u.coins)}</b>\n` +
        `${E('fish')} Поймано: <b>${num(u.total_caught)}</b> · заработано: <b>${num(u.total_earned)}</b>\n` +
        `${E('ticket')} Лицензия: <b>${u.license ? 'есть' : 'нет'}</b>\n` +
        (pv ? `${E('star')} Пропуск: <b>${pv.level}/${pv.max}</b> · премиум: <b>${pv.premium ? 'да' : 'нет'}</b>` : 'Межсезонье'),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [
        [btn('Выдать пропуск', 'ticket', { callback_data: 'admin:g:' + u.id, style: 'success' }), btn('Забрать', 'lock', { callback_data: 'admin:r:' + u.id, style: 'danger' })],
        [btn('+1000 монет', 'coins', { callback_data: 'admin:c:' + u.id, style: 'primary' }), btn('Панель', 'back', { callback_data: 'admin:panel' })],
      ] },
    });
  }
  function grantPass(u, on, by) {
    const season = G.seasonAt(Date.now());
    if (!season) return 'Сейчас межсезонье — выдавать нечего.';
    setPremium(u.id, season.id, on);
    if (on) {
      inbox(u.id, `🎟 Тебе выдан премиум-пропуск сезона «${season.name}»! Забирай награды.`);
      notify(u.id, `🎟 <b>Тебе выдан премиум-пропуск сезона «${esc(season.name)}»!</b>\nОткрой игру и забери награды.`);
    }
    rooms.updatePlayer(u.id);
    log(`admin ${by}: premium ${on ? 'granted to' : 'revoked from'} ${u.id}`);
    return on ? `${E('check')} Премиум-пропуск выдан: <b>${esc(u.name)}</b>` : `${E('lock')} Премиум-пропуск забран у <b>${esc(u.name)}</b>`;
  }
  function paymentsScreen() {
    const rows = Q.payList.all(10);
    return () => ({
      text: `${E('stats')} <b>Последние оплаты</b>\n\n` + (rows.length ? rows.map(r => {
        const u = Q.user.get(r.user_id);
        return `${r.refunded ? '↩️' : E('star')} ${new Date(r.created_at).toISOString().slice(0, 16).replace('T', ' ')} · <b>${esc(u ? u.name : r.user_id)}</b> · ${r.amount}⭐ · ${esc(r.season)}`;
      }).join('\n') : 'Оплат пока нет.'),
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: rows.filter(r => !r.refunded).slice(0, 5).map(r => [btn(`Возврат #${r.rid}`, 'back', { callback_data: 'admin:rf:' + r.rid, style: 'danger' })]).concat([[btn('Панель', 'back', { callback_data: 'admin:panel' })]]) },
    });
  }
  async function adminInput(m, text) {
    const st = adminState.get(String(m.from.id));
    if (!st) return false;
    adminState.delete(String(m.from.id));
    const send = build => deliver('sendMessage', { chat_id: m.chat.id }, build);
    const [who, amount] = text.split(/\s+/);
    const u = findUser(who);
    if (!u) { await send(() => ({ text: 'Игрок не найден. Нужен Telegram ID или @username, который уже заходил в игру.', parse_mode: 'HTML' })); return true; }
    if (st === 'grant' || st === 'revoke') await send(() => ({ text: grantPass(u, st === 'grant', m.from.id), parse_mode: 'HTML', reply_markup: { inline_keyboard: [[btn('Панель', 'back', { callback_data: 'admin:panel' })]] } }));
    else if (st === 'coins') {
      const n = Math.trunc(Number(amount));
      if (!n) { await send(() => ({ text: 'Формат: <code>@username 500</code>', parse_mode: 'HTML' })); return true; }
      Q.addCoins.run(n, u.id);
      inbox(u.id, `💰 Администратор начислил тебе ${n} монет`);
      await send(() => ({ text: `${E('coins')} ${n > 0 ? 'Начислено' : 'Списано'} ${Math.abs(n)} монет: <b>${esc(u.name)}</b>`, parse_mode: 'HTML' }));
    } else await send(playerCard(u));
    return true;
  }
  async function onAdminCallback(q) {
    if (!isAdmin(q.from.id)) return call('answerCallbackQuery', { callback_query_id: q.id, text: 'Нет доступа', show_alert: true });
    const parts = q.data.split(':');
    const chat = q.message && q.message.chat.id;
    const edit = build => deliver('editMessageText', { chat_id: chat, message_id: q.message.message_id }, build);
    const send = build => deliver('sendMessage', { chat_id: chat }, build);
    const prompts = { grant: 'Кому выдать премиум-пропуск? Отправь Telegram ID или @username.', revoke: 'У кого забрать премиум-пропуск? Отправь Telegram ID или @username.', find: 'Отправь Telegram ID или @username игрока.', coins: 'Отправь: <code>@username 500</code> (можно с минусом).' };
    await call('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
    switch (parts[1]) {
      case 'panel': return edit(adminPanel());
      case 'grant': case 'revoke': case 'find': case 'coins':
        adminState.set(String(q.from.id), parts[1]);
        return send(() => ({ text: prompts[parts[1]] + '\n/cancel — отмена', parse_mode: 'HTML', reply_markup: { force_reply: true } }));
      case 'pays': return edit(paymentsScreen());
      case 'g': case 'r': {
        const u = Q.user.get(parts.slice(2).join(':'));
        if (!u) return send(() => ({ text: 'Игрок не найден' }));
        await send(() => ({ text: grantPass(u, parts[1] === 'g', q.from.id), parse_mode: 'HTML' }));
        return edit(playerCard(Q.user.get(u.id)));
      }
      case 'c': {
        const u = Q.user.get(parts.slice(2).join(':'));
        if (!u) return null;
        Q.addCoins.run(1000, u.id);
        inbox(u.id, '💰 Администратор начислил тебе 1000 монет');
        return edit(playerCard(Q.user.get(u.id)));
      }
      case 'rf': {
        const pay = Q.payGet.get(Number(parts[2]));
        if (!pay || pay.refunded) return send(() => ({ text: 'Платёж не найден или уже возвращён' }));
        try {
          await call('refundStarPayment', { user_id: Number(pay.user_id), telegram_payment_charge_id: pay.charge_id });
        } catch (e) { return send(() => ({ text: 'Telegram отклонил возврат: ' + esc(e.message), parse_mode: 'HTML' })); }
        Q.payRefund.run(pay.rid);
        setPremium(pay.user_id, pay.season, false);
        rooms.updatePlayer(pay.user_id);
        await send(() => ({ text: `↩️ Возврат ${pay.amount}⭐ выполнен, премиум снят.` }));
        return edit(paymentsScreen());
      }
    }
    return null;
  }

  /* ---- payments (Telegram Stars) ---- */
  function checkPassPayload(payload, fromId, currency, amount, forPayment) {
    const [kind, seasonId, userId] = String(payload || '').split(':');
    if (kind !== 'pass') return 'Неизвестный товар';
    if (userId !== String(fromId)) return 'Счёт выставлен другому игроку';
    if (currency !== 'XTR' || amount !== G.PASS_PRICE_STARS) return 'Неверная сумма';
    const season = G.SEASON_BY_ID[seasonId];
    if (!season) return 'Сезон не найден';
    if (!forPayment) {
      const cur = G.seasonAt(Date.now());
      if (!cur || cur.id !== seasonId) return 'Сезон уже закончился';
      const u = Q.user.get(userId);
      if (!u || !u.license) return 'Сначала получи лицензию рыбака';
      const row = Q.passGet.get(userId, seasonId);
      if (row && row.premium) return 'Премиум-пропуск уже активен';
    }
    return null;
  }
  async function onPreCheckout(q) {
    const err = checkPassPayload(q.invoice_payload, q.from.id, q.currency, q.total_amount, false);
    await call('answerPreCheckoutQuery', err ? { pre_checkout_query_id: q.id, ok: false, error_message: err } : { pre_checkout_query_id: q.id, ok: true });
  }
  async function onPaid(m) {
    const sp = m.successful_payment;
    const [, seasonId] = String(sp.invoice_payload || '').split(':');
    const userId = String(m.from.id);
    const err = checkPassPayload(sp.invoice_payload, m.from.id, sp.currency, sp.total_amount, true);
    const added = Q.payAdd.run(sp.telegram_payment_charge_id, userId, seasonId || '?', sp.total_amount, sp.invoice_payload, Date.now());
    if (!added.changes) return; // duplicate update
    if (err) { log('payment with bad payload', userId, err); return; }
    setPremium(userId, seasonId, true);
    inbox(userId, `🎟 Премиум-пропуск сезона «${G.SEASON_BY_ID[seasonId].name}» активирован. Спасибо!`);
    rooms.updatePlayer(userId);
    log(`stars payment: ${userId} bought premium ${seasonId}`);
    await deliver('sendMessage', { chat_id: m.chat.id }, () => ({
      text: `${E('ticket')} <b>Премиум-пропуск активирован!</b>\nВсе премиум-награды сезона «${esc(G.SEASON_BY_ID[seasonId].name)}» уже ждут тебя в игре.`,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[btn('Забрать награды', 'play', Object.assign({ style: 'success' }, webApp('?open=pass')))]] },
    }));
  }

  async function handle(up) {
    try {
      if (up.pre_checkout_query) await onPreCheckout(up.pre_checkout_query);
      else if (up.message) await onMessage(up.message);
      else if (up.callback_query) await onCallback(up.callback_query);
      else if (up.inline_query) await onInline(up.inline_query);
    } catch (e) { log('update error:', e.message); }
  }

  // updates of one user are handled in order, different users in parallel
  const queues = new Map();
  function onUpdate(up) {
    const from = (up.message || up.callback_query || up.inline_query || up.pre_checkout_query || {}).from;
    const key = from ? from.id : 0;
    const next = (queues.get(key) || Promise.resolve()).then(() => handle(up));
    queues.set(key, next);
    next.then(() => { if (queues.get(key) === next) queues.delete(key); });
  }

  const userOf = from => ensureUser(String(from.id), [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 40), from.username);

  async function onMessage(m) {
    if (!m.from || m.chat.type !== 'private') return;
    if (m.successful_payment) return onPaid(m);
    const text = (m.text || '').trim();
    const u = userOf(m.from);
    const send = build => deliver('sendMessage', { chat_id: m.chat.id }, build);
    if (isAdmin(m.from.id) && text && !text.startsWith('/') && await adminInput(m, text)) return null;
    const [cmd, ...args] = text.split(/\s+/);
    const arg = args[0];
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
        if (arg && /^house_[A-Za-z0-9_-]{1,48}$/.test(arg)) {
          const id = arg.slice(6);
          const owner = Q.user.get(id);
          return send(() => ({
            text: `${E('gift')} Тебя приглашают в гости в домик рыбака${owner ? ' <b>' + esc(owner.name) + '</b>' : ''}!`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[btn('Зайти в гости', 'play', Object.assign({ style: 'success' }, webApp('?house=' + encodeURIComponent(id))))]] },
          }));
        }
        return send(mainMenu(u));
      case '/play':
        return send(() => ({ text: `${E('play')} Водоёмы ждут!`, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[btn('Играть', 'play', Object.assign({ style: 'success' }, webApp()))]] } }));
      case '/profile': return send(profileScreen(u));
      case '/collection': return send(collectionScreen(u));
      case '/top': return send(topScreen());
      case '/help': return send(helpScreen());
      case '/paysupport':
        return send(() => ({
          text: `${E('help')} <b>Поддержка по оплате</b>\n\nПремиум-пропуск стоит ${G.PASS_PRICE_STARS} ⭐ и активируется сразу после оплаты.` +
            ` Если что-то пошло не так — напиши ${CFG.support ? esc(CFG.support) : 'администратору бота'}, приложи дату оплаты, и мы поможем или вернём Stars.`,
          parse_mode: 'HTML',
        }));
      case '/admin':
        if (!isAdmin(m.from.id)) return send(() => ({ text: 'Эта команда только для администраторов.' }));
        return send(adminPanel());
      case '/grant': case '/revoke': case '/player': case '/coins': {
        if (!isAdmin(m.from.id)) return null;
        const target = findUser(arg);
        if (!target) return send(() => ({ text: 'Игрок не найден. Формат: <code>' + cmd + ' @username' + (cmd === '/coins' ? ' 500' : '') + '</code>', parse_mode: 'HTML' }));
        if (cmd === '/player') return send(playerCard(target));
        if (cmd === '/coins') {
          const n = Math.trunc(Number(args[1]));
          if (!n) return send(() => ({ text: 'Формат: <code>/coins @username 500</code>', parse_mode: 'HTML' }));
          Q.addCoins.run(n, target.id);
          inbox(target.id, `💰 Администратор начислил тебе ${n} монет`);
          return send(() => ({ text: `${E('coins')} Готово: ${n} монет → <b>${esc(target.name)}</b>`, parse_mode: 'HTML' }));
        }
        return send(() => ({ text: grantPass(target, cmd === '/grant', m.from.id), parse_mode: 'HTML' }));
      }
      case '/cancel':
        adminState.delete(String(m.from.id));
        return send(() => ({ text: 'Отменено.' }));
      case '/emoji': // admin helper: shows which premium icons were matched
        if (!isAdmin(m.from.id)) return null;
        return send(() => ({
          text: Object.keys(WANT).map(k => `${E(k)} <code>${k}</code> ${emoji[k] ? '<code>' + emoji[k].id + '</code>' : '— (обычный эмодзи)'}`).join('\n'),
          parse_mode: 'HTML',
        }));
      default:
        return send(mainMenu(u));
    }
  }

  async function onCallback(q) {
    if (q.data && q.data.startsWith('admin:')) return onAdminCallback(q);
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
            ? `🎣 <b>Погнали на рыбалку!</b>\nЯ уже на воде — заходи в мою комнату <b>${code}</b>.`
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
    const commands = [
      { command: 'start', description: 'Главное меню' },
      { command: 'play', description: 'Открыть игру' },
      { command: 'profile', description: 'Мой профиль' },
      { command: 'collection', description: 'Дневник рыбака' },
      { command: 'top', description: 'Лучшие рыбаки' },
      { command: 'help', description: 'Как играть' },
      { command: 'paysupport', description: 'Поддержка по оплате' },
    ];
    await call('setMyCommands', { commands }).catch(e => log(e.message));
    for (const id of CFG.admins) {
      if (!/^\d+$/.test(id)) continue;
      await call('setMyCommands', {
        scope: { type: 'chat', chat_id: Number(id) },
        commands: commands.concat([{ command: 'admin', description: 'Админ-панель' }, { command: 'grant', description: 'Выдать пропуск: /grant @username' }]),
      }).catch(() => {});
    }
    await call('setMyShortDescription', { short_description: 'Уютная кооперативная рыбалка: лови рыбу с друзьями прямо в Telegram 🎣' }).catch(() => {});
    if (CFG.webUrl) {
      await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: CFG.webUrl + '/' } } }).catch(e => log(e.message));
    } else {
      log('DOMAIN is not set — Mini App buttons are disabled until you set it');
    }
    if (!CFG.admins.length) log('ADMIN_IDS is empty — /admin panel is disabled');
    log(`bot @${me.username} is ready (${CFG.botMode})`);
  }

  async function poll() {
    await call('deleteWebhook', { drop_pending_updates: false }).catch(() => {});
    let offset = 0;
    for (;;) {
      try {
        const ups = await call('getUpdates', { offset, timeout: 30, allowed_updates: UPDATES });
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
      await call('setWebhook', { url: CFG.webUrl + hookPath, secret_token: CFG.webhookSecret, allowed_updates: UPDATES });
    } else {
      poll();
    }
  }

  async function notifyUser(chatId, text) {
    return call('sendMessage', {
      chat_id: Number(chatId), text, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[Object.assign({ text: '🎣 Играть', style: 'success' }, webApp())]] },
    });
  }

  return { start, call, notify: notifyUser };
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
