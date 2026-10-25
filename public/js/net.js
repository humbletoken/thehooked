/* Hooked — networking: REST + WebSocket, with an offline/demo local server */
(function () {
  'use strict';
  const D = window.HData;
  const tg = window.Telegram && window.Telegram.WebApp;

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem('hooked.' + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('hooked.' + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };

  function guestId() {
    let id = ls.get('guest');
    if (!id) { id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4); ls.set('guest', id); }
    return id;
  }

  /* ======================= offline local server ======================= */
  const BOT_NAMES = ['Маша', 'Дед Егор', 'Котя', 'Лёха', 'Ника', 'Тимур', 'Соня'];
  const BOT_LOOKS = [
    { skin: 0, hair: 'long', hairColor: 3, top: 'hoodie', topColor: 8, bottom: 'shorts', bottomColor: 6, hat: 'none', hatColor: 0, acc: 'glasses' },
    { skin: 2, hair: 'short', hairColor: 5, top: 'vest', topColor: 3, bottom: 'waders', bottomColor: 9, hat: 'straw', hatColor: 0, acc: 'beard' },
    { skin: 4, hair: 'curly', hairColor: 0, top: 'raincoat', topColor: 2, bottom: 'jeans', bottomColor: 6, hat: 'beanie', hatColor: 7, acc: 'scarf' },
    { skin: 1, hair: 'messy', hairColor: 4, top: 'overalls', topColor: 0, bottom: 'jeans', bottomColor: 6, hat: 'fishhat', hatColor: 0, acc: 'headphones' },
    { skin: 3, hair: 'pony', hairColor: 7, top: 'sailor', topColor: 6, bottom: 'shorts', bottomColor: 10, hat: 'captain', hatColor: 0, acc: 'flower' },
  ];

  function Local() {
    const self = {};
    const fresh = () => ({
      id: 'local', name: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || 'Рыбак',
      username: '', coins: D.START_COINS, xp: 0, look: Object.assign({}, D.DEFAULT_LOOK), customized: false, rod: 'bamboo',
      owned: ['rod:bamboo'], stats: { caught: 0, earned: 0, bestSpecies: null, bestWeight: 0 }, keepnet: [], collection: {}, nextKeep: 1,
    });
    let P = ls.get('offline') || fresh();
    const save = () => ls.set('offline', P);
    const pub = () => {
      const out = JSON.parse(JSON.stringify(P));
      out.level = D.levelFromXp(P.xp);
      out.look = D.sanitizeLook(P.look, new Set(P.owned));
      delete out.nextKeep;
      return out;
    };
    const err = m => { const e = new Error(m); e.user = true; throw e; };

    self.seed = (p) => { P = Object.assign(fresh(), p); save(); };
    self.profile = pub;

    self.api = async (path, body = {}) => {
      await new Promise(r => setTimeout(r, 60));
      switch (path) {
        case '/api/config': return { botUsername: 'HookedGame', appLink: 'https://t.me/HookedGame?startapp', guest: true, maxPlayers: D.MAX_PLAYERS, offline: true };
        case '/api/me': return { profile: pub() };
        case '/api/look': P.look = D.sanitizeLook(body.look, new Set(P.owned)); P.customized = true; save(); return { profile: pub() };
        case '/api/buy': {
          const [slot, id] = String(body.item).split(':');
          const price = slot === 'rod' ? (D.ROD_BY_ID[id] || err('Нет такой удочки')).price : (D.findItem(slot, id) || err('Нет такого предмета')).price;
          if (P.owned.includes(body.item)) err('Уже куплено');
          if (P.coins < price) err('Не хватает монет');
          P.coins -= price; P.owned.push(body.item); if (slot === 'rod') P.rod = id;
          save(); return { profile: pub() };
        }
        case '/api/equip': if (!P.owned.includes('rod:' + body.rod)) err('Удочка не куплена'); P.rod = body.rod; save(); return { profile: pub() };
        case '/api/sell': {
          let sum = 0;
          const ids = body.all ? P.keepnet.map(k => k.id) : (body.ids || []);
          P.keepnet = P.keepnet.filter(k => { if (ids.includes(k.id)) { sum += k.price; return false; } return true; });
          P.coins += sum; P.stats.earned += sum; save();
          return { sold: sum, profile: pub() };
        }
        case '/api/rooms': return { rooms: [
          { code: 'KARAS', name: 'Утренний клёв', players: 3, max: 5, host: 'Маша', looks: BOT_LOOKS.slice(0, 3) },
          { code: 'SOM42', name: 'Ночная охота на сома', players: 2, max: 5, host: 'Дед Егор', looks: BOT_LOOKS.slice(1, 3) },
          { code: 'LAKE7', name: 'Тихая заводь', players: 5, max: 5, host: 'Котя', looks: BOT_LOOKS },
        ] };
        case '/api/top': return { top: BOT_NAMES.slice(0, 6).map((n, i) => ({ id: 'b' + i, name: n, level: 18 - i * 2, caught: 420 - i * 55, earned: 48000 - i * 6100, species: 15 - i, look: BOT_LOOKS[i % 5] })) };
      }
      err('Неизвестный запрос');
    };

    self.recordCatch = (species, weight) => {
      const price = D.fishPrice(species, weight), xp = D.fishXp(species, weight);
      const isNew = !P.collection[species];
      const c = P.collection[species] || { count: 0, best: 0, first: Date.now() };
      c.count++; c.best = Math.max(c.best, weight); P.collection[species] = c;
      const keepId = P.nextKeep++;
      P.keepnet.unshift({ id: keepId, species, weight, price, at: Date.now() });
      const before = D.levelFromXp(P.xp).level;
      P.xp += xp; P.stats.caught++;
      if (weight > P.stats.bestWeight) { P.stats.bestWeight = weight; P.stats.bestSpecies = species; }
      const after = D.levelFromXp(P.xp).level;
      let reward = 0; for (let l = before + 1; l <= after; l++) reward += D.levelReward(l);
      P.coins += reward; save();
      return { keepId, species, weight, price, xp, isNew, levelUp: after > before ? after : 0, reward };
    };

    // --- emulated socket ---
    self.socket = (onMsg) => {
      const emit = m => setTimeout(() => onMsg(m), 10);
      const room = { players: new Map() };
      const timers = new Map();
      const me = () => room.players.get('local');
      const later = (id, ms, fn) => { const t = setTimeout(fn, ms); (timers.get(id) || timers.set(id, []).get(id)).push(t); };
      const clear = id => { (timers.get(id) || []).forEach(clearTimeout); timers.set(id, []); };
      const hour = () => new Date().getHours();
      const pubP = p => ({ id: p.id, name: p.name, look: p.look, rod: p.rod, slot: p.slot, level: p.level, state: p.state });
      const roomState = (r) => ({ id: 'local', code: r.code, name: r.name, isPublic: r.isPublic, solo: r.solo, max: r.max, hostId: 'local', link: r.solo ? null : 'https://t.me/HookedGame?startapp=room_' + r.code, players: [...room.players.values()].map(pubP) });

      function addMe() {
        const pr = pub();
        room.players.set('local', { id: 'local', name: pr.name, look: pr.look, rod: pr.rod, slot: 0, level: pr.level.level, state: 'idle', bot: false });
      }
      function addBot(i) {
        const id = 'bot' + i;
        const p = { id, name: BOT_NAMES[i % BOT_NAMES.length], look: BOT_LOOKS[i % BOT_LOOKS.length], rod: D.RODS[(i + 1) % 4].id, slot: i + 1, level: 4 + i * 3, state: 'idle', bot: true };
        room.players.set(id, p);
        return p;
      }
      function botLoop(p) {
        if (!room.players.has(p.id)) return;
        later(p.id, 1500 + Math.random() * 4000, () => {
          doCast(p, 0.3 + Math.random() * 0.7);
        });
      }
      function doCast(p, power) {
        const rod = D.ROD_BY_ID[p.rod];
        p.depth = Math.max(0.04, power * rod.depth);
        p.plan = D.planCast(p.depth, rod, hour());
        p.state = 'wait';
        emit({ t: 'cast', id: p.id, depth: p.depth });
        const base = 900 + p.depth * 1600, plan = p.plan;
        later(p.id, base + plan.approachAt, () => emit({ t: 'approach', id: p.id, species: plan.species, weight: plan.weight }));
        plan.nibbles.forEach(ms => later(p.id, base + ms, () => emit({ t: 'nibble', id: p.id })));
        later(p.id, base + plan.biteAt, () => {
          p.state = 'bite';
          emit({ t: 'bite', id: p.id, window: plan.biteWindow });
          if (p.bot) {
            if (Math.random() < 0.85) later(p.id, 250 + Math.random() * 400, () => doHook(p));
            else later(p.id, plan.biteWindow + 300, () => { p.state = 'idle'; emit({ t: 'missed', id: p.id, reason: 'late' }); botLoop(p); });
          } else {
            later(p.id, plan.biteWindow + 350, () => { if (p.state === 'bite') { p.state = 'idle'; emit({ t: 'missed', id: p.id, reason: 'late' }); } });
          }
        });
      }
      function doHook(p) {
        if (p.state === 'wait') { clear(p.id); p.state = 'idle'; emit({ t: 'missed', id: p.id, reason: 'early' }); return; }
        if (p.state !== 'bite') return;
        clear(p.id); p.state = 'reel'; p.hookedAt = Date.now();
        emit({ t: 'hooked', id: p.id, species: p.plan.species, fight: p.plan.fight });
        if (p.bot) {
          let prog = 0;
          const dur = 3000 + p.plan.fight.stamina * 300;
          const step = () => {
            if (p.state !== 'reel') return;
            prog = Math.min(1, prog + 0.06 + Math.random() * 0.05);
            emit({ t: 'reel', id: p.id, p: prog, k: 0.35 + Math.random() * 0.4 });
            if (prog >= 1) {
              p.state = 'idle';
              emit({ t: 'caught', id: p.id, fish: { species: p.plan.species, weight: p.plan.weight } });
              botLoop(p);
            } else later(p.id, dur / 16, step);
          };
          later(p.id, 300, step);
        }
      }

      const api = {
        send(msg) {
          const p = me();
          switch (msg.t) {
            case 'create': case 'join': {
              room.players.clear();
              const solo = msg.t === 'create' && msg.solo;
              room.code = msg.t === 'join' ? String(msg.code || 'LAKE7').toUpperCase() : 'H00K' + Math.floor(Math.random() * 10);
              room.name = msg.t === 'create' ? (msg.name || 'Рыбалка у ' + pub().name) : 'Утренний клёв';
              room.solo = solo; room.isPublic = !!msg.isPublic || msg.t === 'join'; room.max = solo ? 1 : 5;
              addMe();
              const bots = msg.bots != null ? msg.bots : (solo ? 0 : msg.t === 'join' ? 3 : 0);
              for (let i = 0; i < bots; i++) addBot(i);
              emit({ t: 'room', room: roomState(room) });
              for (const b of room.players.values()) if (b.bot) botLoop(b);
              return;
            }
            case 'leave': room.players.forEach((x, id) => clear(id)); room.players.clear(); emit({ t: 'left' }); return;
            case 'cast': if (p && p.state === 'idle') doCast(p, Math.max(0.05, Math.min(1, msg.power))); return;
            case 'hook': if (p) doHook(p); return;
            case 'land': {
              if (!p || p.state !== 'reel') return;
              p.state = 'idle';
              const res = self.recordCatch(p.plan.species, p.plan.weight);
              const pr = pub(); p.level = pr.level.level;
              emit({ t: 'caught', id: 'local', fish: res, profile: pr });
              return;
            }
            case 'fail': if (p && p.state === 'reel') { p.state = 'idle'; emit({ t: 'lost', id: 'local', reason: msg.reason === 'snap' ? 'snap' : 'escape' }); } return;
            case 'cancel': if (p && p.state !== 'idle') { clear('local'); p.state = 'idle'; emit({ t: 'reset', id: 'local' }); } return;
            case 'emote':
              emit({ t: 'emote', id: 'local', e: msg.e });
              for (const b of room.players.values()) if (b.bot && Math.random() < 0.5) setTimeout(() => emit({ t: 'emote', id: b.id, e: ['wave', 'like', 'laugh', 'party'][Math.floor(Math.random() * 4)] }), 700 + Math.random() * 1500);
              return;
          }
        },
        close() { room.players.forEach((x, id) => clear(id)); },
        botPlayers: () => [...room.players.values()].filter(p => p.bot),
        forceBot(id, fn) { const p = room.players.get(id); if (p) fn(p, { doCast, doHook, emit, clear }); },
      };
      setTimeout(() => onMsg({ t: 'welcome', id: 'local' }), 20);
      return api;
    };
    return self;
  }

  /* ======================= public Net ======================= */
  const Net = {
    online: false,
    config: null,
    local: null,
    params: new URLSearchParams(location.search),

    headers() {
      const h = { 'content-type': 'application/json' };
      if (tg && tg.initData) h['X-Init-Data'] = tg.initData;
      else { h['X-Guest-Id'] = guestId(); h['X-Guest-Name'] = encodeURIComponent(ls.get('guestName') || 'Гость'); }
      return h;
    },

    async boot() {
      const forceOffline = location.protocol === 'file:' || this.params.has('demo') || this.params.has('offline');
      if (!forceOffline) {
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 5000);
          const r = await fetch('api/config', { signal: ctl.signal });
          clearTimeout(timer);
          if (r.ok) { this.config = await r.json(); this.online = true; return; }
        } catch { /* fall back to offline */ }
      }
      this.local = Local();
      this.config = await this.local.api('/api/config');
      this.online = false;
    },

    async api(path, body) {
      if (!this.online) return this.local.api(path, body);
      const r = await fetch(path.replace(/^\//, ''), {
        method: path === '/api/rooms' || path === '/api/top' ? 'GET' : 'POST',
        headers: this.headers(),
        body: path === '/api/rooms' || path === '/api/top' ? undefined : JSON.stringify(body || {}),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(data.error || 'Ошибка сети'); e.user = true; throw e; }
      return data;
    },

    connect(onMsg, onState) {
      if (!this.online) {
        this.sock = this.local.socket(onMsg);
        onState && onState('open');
        return;
      }
      let ws, closedByUs = false, retry = 0, pending = [];
      const open = () => {
        const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws';
        ws = new WebSocket(url);
        ws.onopen = () => {
          retry = 0;
          const hello = { t: 'hello', hour: new Date().getHours() };
          if (tg && tg.initData) hello.initData = tg.initData;
          else { hello.guestId = guestId(); hello.guestName = encodeURIComponent(ls.get('guestName') || 'Гость'); }
          ws.send(JSON.stringify(hello));
          pending.forEach(m => ws.send(JSON.stringify(m))); pending = [];
          onState && onState('open');
        };
        ws.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch { /* ignore bad frame */ } };
        ws.onclose = () => {
          onState && onState('closed');
          if (closedByUs) return;
          setTimeout(open, Math.min(8000, 600 * Math.pow(1.7, retry++)));
        };
      };
      open();
      const ping = setInterval(() => { if (ws && ws.readyState === 1) ws.send('{"t":"ping"}'); }, 25000);
      this.sock = {
        send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); else pending.push(m); },
        close() { closedByUs = true; clearInterval(ping); ws && ws.close(); },
      };
    },
    send(m) { this.sock && this.sock.send(m); },
  };

  window.HNet = Net;
  window.HStore = ls;
})();
