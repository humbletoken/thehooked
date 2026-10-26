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
    { gender: 'f', face: 0, skin: 0, hair: 'long', hairColor: 3, top: 'hoodie', topColor: 8, bottom: 'skirt', bottomColor: 6, hat: 'none', hatColor: 0, acc: 'glasses' },
    { gender: 'm', face: 3, skin: 2, hair: 'short', hairColor: 5, top: 'vest', topColor: 3, bottom: 'waders', bottomColor: 9, hat: 'straw', hatColor: 0, acc: 'beard' },
    { gender: 'f', face: 1, skin: 4, hair: 'curly', hairColor: 0, top: 'raincoat', topColor: 2, bottom: 'jeans', bottomColor: 6, hat: 'beanie', hatColor: 7, acc: 'scarf' },
    { gender: 'm', face: 2, skin: 1, hair: 'messy', hairColor: 4, top: 'overalls', topColor: 0, bottom: 'jeans', bottomColor: 6, hat: 'fishhat', hatColor: 0, acc: 'headphones' },
    { gender: 'f', face: 3, skin: 3, hair: 'pony', hairColor: 7, top: 'sailor', topColor: 6, bottom: 'shorts', bottomColor: 10, hat: 'captain', hatColor: 0, acc: 'flower' },
  ];
  const metaDefault = () => ({
    lic: {}, bait: 'worm', baits: {}, line: 'mono', hook: 'basic', loc: 'lake', effect: 'none', pose: 'none', skin: 'none',
    house: { slots: {}, tank: [], trophies: [] }, quests: {}, locs: [], bossWins: 0, tourney: { played: 0, wins: 0, podium: 0 },
    hosted: 0, gifts: 0, ach: {},
  });

  function Local() {
    const self = {};
    const fresh = () => ({
      id: 'local', name: (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) || 'Рыбак',
      username: '', coins: D.START_COINS, xp: 0, look: Object.assign({}, D.DEFAULT_LOOK), customized: false, rod: 'bamboo',
      owned: ['rod:bamboo'], stats: { caught: 0, earned: 0, bestSpecies: null, bestWeight: 0 }, keepnet: [], collection: {}, nextKeep: 1,
      license: false, title: '', meta: metaDefault(), pass: {}, inbox: [],
    });
    let P = ls.get('offline') || fresh();
    // saves from older versions: fill new fields, license has to be earned again
    if (!P.meta) { P.meta = metaDefault(); P.license = false; P.title = ''; P.pass = {}; P.inbox = []; }
    P.meta = Object.assign(metaDefault(), P.meta);
    P.meta.house = Object.assign({ slots: {}, tank: [], trophies: [] }, P.meta.house);
    P.meta.tourney = Object.assign({ played: 0, wins: 0, podium: 0 }, P.meta.tourney);
    const save = () => ls.set('offline', P);
    const err = m => { const e = new Error(m); e.user = true; throw e; };
    const owned = () => new Set(P.owned);
    const own = key => { if (!P.owned.includes(key)) P.owned.push(key); };
    const passRow = id => (P.pass[id] = P.pass[id] || { xp: 0, premium: false, claimedFree: [], claimedPrem: [] });

    const pub = () => {
      const now = Date.now();
      if (P.customized) P.meta.lic.look = 1;
      if (P.license) D.syncQuests(P.meta.quests, now);
      const out = JSON.parse(JSON.stringify(P));
      out.level = D.levelFromXp(P.xp);
      out.look = D.sanitizeLook(P.look, owned());
      out.lic = P.meta.lic;
      out.licNo = 'OFF' + String(P.stats.caught % 1000).padStart(3, '0');
      const season = D.seasonAt(now);
      if (season) {
        const r = passRow(season.id), lv = D.passLevel(r.xp);
        out.season = { id: season.id, name: season.name, title: season.title, end: season.end, xp: r.xp, level: lv.level, cur: lv.cur, need: lv.need, max: lv.max, premium: r.premium, claimedFree: r.claimedFree, claimedPrem: r.claimedPrem, price: D.PASS_PRICE_STARS };
      } else out.season = null;
      out.quests = P.license ? D.questView(P.meta.quests, now) : null;
      delete out.meta.quests;
      out.inbox = (P.inbox || []).filter(x => !x.seen);
      out.trades = { incoming: [], outgoing: [] };
      delete out.nextKeep; delete out.pass;
      save();
      return out;
    };
    const requireLicense = () => { if (!P.license) err('Сначала получи лицензию рыбака'); };
    const addPassXp = xp => {
      const season = D.seasonAt(Date.now());
      if (!season || !(xp > 0)) return null;
      const r = passRow(season.id), before = r.xp;
      r.xp += Math.round(xp);
      return { gained: Math.round(xp), xp: r.xp, level: D.passLevel(r.xp).level, levelUp: D.passLevel(r.xp).level > D.passLevel(before).level };
    };
    const questEvent = ev => {
      if (!P.license) return { done: [], xp: 0 };
      D.syncQuests(P.meta.quests, Date.now());
      const done = D.questProgress(P.meta.quests, ev);
      return { done, xp: done.reduce((s, q) => s + q.xp, 0) };
    };
    const checkAch = () => {
      const season = D.seasonAt(Date.now());
      const pr = season ? passRow(season.id) : null;
      const ids = D.evalAchievements({
        caught: P.stats.caught, earned: P.stats.earned, collection: P.collection, locs: P.meta.locs, bossWins: P.meta.bossWins, tourney: P.meta.tourney,
        passLevel: pr ? D.passLevel(pr.xp).level : 0, license: P.license, gifts: P.meta.gifts, hosted: P.meta.hosted, season: season && season.id,
      }).filter(id => !P.meta.ach[id]);
      return ids.map(id => {
        const a = D.ACH_BY_ID[id];
        P.meta.ach[id] = Date.now();
        P.coins += a.coins || 0;
        if (a.title) own('title:' + id);
        return { id, name: a.name, coins: a.coins, title: a.title || null };
      });
    };
    const grantReward = r => {
      if (r.coins) P.coins += r.coins;
      if (r.bait) P.meta.baits[r.bait] = (P.meta.baits[r.bait] || 0) + r.n;
      D.rewardItems(r).forEach(own);
    };

    self.seed = (p) => { P = Object.assign(fresh(), p); save(); };
    self.profile = pub;

    self.api = async (path, body = {}) => {
      await new Promise(r => setTimeout(r, 60));
      const now = Date.now();
      switch (path) {
        case '/api/config': return { botUsername: 'HookedGame', appLink: 'https://t.me/HookedGame?startapp', guest: true, maxPlayers: D.MAX_PLAYERS, offline: true, stars: false };
        case '/api/me': return { profile: pub() };
        case '/api/look': P.look = D.sanitizeLook(body.look, owned()); P.customized = true; P.meta.lic.look = 1; return { profile: pub() };
        case '/api/buy': {
          requireLicense();
          const item = String(body.item || '');
          const [kind, id] = item.split(':');
          const season = D.seasonAt(now);
          if (kind === 'bait') {
            const b = D.BAIT_BY_ID[id];
            if (!b || !b.price) err('Нет такой наживки');
            if (P.coins < b.price) err('Не хватает монет');
            P.coins -= b.price; P.meta.baits[id] = (P.meta.baits[id] || 0) + b.pack;
            return { profile: pub() };
          }
          const info = D.itemInfo(item);
          if (!info) err('Нет такого предмета');
          if (info.pass) err('Этот предмет можно получить только в рыболовном пропуске');
          if (!info.price) err('Этот предмет и так твой');
          if (info.season && (!season || season.id !== info.season)) err('Сезонный предмет сейчас не продаётся');
          if (P.owned.includes(item)) err('Уже куплено');
          if (P.coins < info.price) err('Не хватает монет');
          P.coins -= info.price; own(item);
          if (kind === 'rod') P.rod = id;
          if (kind === 'line' || kind === 'hook') P.meta[kind] = id;
          return { profile: pub() };
        }
        case '/api/equip': if (!P.owned.includes('rod:' + body.rod)) err('Удочка не куплена'); P.rod = body.rod; return { profile: pub() };
        case '/api/bait': {
          const id = String(body.bait || 'worm');
          if (!D.BAIT_BY_ID[id]) err('Нет такой наживки');
          if (id !== 'worm' && !(P.meta.baits[id] > 0)) err('Эта наживка закончилась');
          P.meta.bait = id;
          return { profile: pub() };
        }
        case '/api/tackle': {
          requireLicense();
          for (const kind of ['line', 'hook']) {
            if (body[kind] == null) continue;
            const t = D.findTackle(kind, String(body[kind]));
            if (!t) err('Нет такой снасти');
            if (t.price && !P.owned.includes(kind + ':' + t.id)) err('Сначала купи «' + t.name + '»');
            P.meta[kind] = t.id;
          }
          return { profile: pub() };
        }
        case '/api/loc': {
          requireLicense();
          const loc = String(body.loc || '');
          if (!D.LOC_BY_ID[loc]) err('Нет такой локации');
          if (!D.locUnlocked(loc, D.levelFromXp(P.xp).level)) err(`Откроется на ${D.LOC_BY_ID[loc].level} уровне`);
          P.meta.loc = loc;
          return { profile: pub() };
        }
        case '/api/style': {
          requireLicense();
          const pick = (list, kind, v) => { const id = String(v); if (!list.some(x => x.id === id)) err('Нет такого стиля'); if (id !== 'none' && !P.owned.includes(kind + ':' + id)) err('Этот стиль ещё не получен'); return id; };
          if (body.effect != null) P.meta.effect = pick(D.EFFECTS, 'effect', body.effect);
          if (body.pose != null) P.meta.pose = pick(D.POSES, 'pose', body.pose);
          if (body.skin != null) P.meta.skin = pick(D.ROD_SKINS, 'skin', body.skin);
          if (body.title != null) { const id = String(body.title); if (id && !(D.TITLES[id] && P.owned.includes('title:' + id))) err('Этот титул ещё не получен'); P.title = id; }
          return { profile: pub() };
        }
        case '/api/sell': {
          let sum = 0;
          const ids = body.all ? P.keepnet.map(k => k.id) : (body.ids || []);
          P.keepnet = P.keepnet.filter(k => { if (ids.includes(k.id)) { sum += k.price; return false; } return true; });
          P.coins += sum; P.stats.earned += sum;
          const out = { sold: sum, quests: [], pass: null, ach: [], lic: null };
          if (sum) {
            if (!P.license) { if (D.licenseProgress(P.meta.lic, 'sell')) out.lic = P.meta.lic; }
            else { const q = questEvent({ type: 'sell', coins: sum }); out.quests = q.done; out.pass = addPassXp(q.xp); out.ach = checkAch(); }
          }
          out.profile = pub();
          return out;
        }
        case '/api/license/exam': {
          if (P.license) err('Лицензия уже получена');
          if (P.customized) P.meta.lic.look = 1;
          if (!D.licenseReadyForExam(P.meta.lic)) err('Сначала выполни все задания лицензии');
          const answers = Array.isArray(body.answers) ? body.answers : [];
          if (!D.checkExam(answers)) return { ok: false, wrong: D.LICENSE.exam.map((q, i) => (Number(answers[i]) === q.ok ? -1 : i)).filter(i => i >= 0), profile: pub() };
          const rw = D.LICENSE.reward;
          P.license = true; P.meta.lic.exam = 1; P.coins += rw.coins;
          P.meta.baits[rw.bait] = (P.meta.baits[rw.bait] || 0) + rw.n;
          const ach = checkAch();
          return { ok: true, reward: rw, ach, profile: pub() };
        }
        case '/api/pass/claim': {
          requireLicense();
          const season = D.seasonAt(now);
          if (!season) err('Сейчас межсезонье');
          const r = passRow(season.id), level = D.passLevel(r.xp).level;
          const want = [];
          if (body.all) {
            for (let l = 1; l <= level; l++) {
              if (season.free[l] && !r.claimedFree.includes(l)) want.push(['free', l]);
              if (r.premium && season.premium[l] && !r.claimedPrem.includes(l)) want.push(['prem', l]);
            }
          } else {
            const l = Number(body.level), track = body.track === 'prem' ? 'prem' : 'free';
            if (!(l >= 1 && l <= level)) err('Этот уровень ещё не открыт');
            if (track === 'prem' && !r.premium) err('Нужен премиум-пропуск');
            if ((track === 'prem' ? r.claimedPrem : r.claimedFree).includes(l)) err('Награда уже получена');
            want.push([track, l]);
          }
          if (!want.length) err('Новых наград пока нет');
          const got = want.map(([track, l]) => {
            const rw = (track === 'prem' ? season.premium : season.free)[l];
            grantReward(rw);
            (track === 'prem' ? r.claimedPrem : r.claimedFree).push(l);
            return D.rewardName(rw);
          });
          return { got, profile: pub() };
        }
        case '/api/pass/invoice': err('Покупка за Telegram Stars доступна только в игре внутри Telegram'); break;
        case '/api/events': {
          const t = D.tournamentAt(now);
          return { now, schedule: D.eventSchedule(now), tourney: t ? Object.assign({}, t, { top: [], me: null, count: 0, offline: true }) : null, last: null, boss: D.bossFor((D.seasonAt(now) || {}).id).name, offline: true };
        }
        case '/api/archive': {
          const cur = D.seasonAt(now);
          return {
            current: cur ? { id: cur.id, title: cur.title, end: cur.end } : null,
            seasons: D.SEASONS.filter(s => s.end <= now).map(s => {
              const r = P.pass[s.id] || { xp: 0, premium: false, claimedFree: [], claimedPrem: [] };
              return { id: s.id, title: s.title, start: s.start, end: s.end, xp: r.xp, level: D.passLevel(r.xp).level, premium: r.premium,
                rewards: r.claimedFree.map(l => D.rewardName(s.free[l])).concat(r.claimedPrem.map(l => D.rewardName(s.premium[l]))), podiums: [] };
            }),
          };
        }
        case '/api/house': {
          requireLicense();
          const h = P.meta.house;
          if (body.slot) {
            const slot = String(body.slot), id = body.item ? String(body.item) : null;
            if (!D.HOUSE_SLOTS.some(s => s.id === slot)) err('Нет такого места в домике');
            if (id) {
              const f = D.FURN_BY_ID[id];
              if (!f || f.slot !== slot) err('Сюда это не поставить');
              if (!(D.itemInfo('furn:' + id).free || P.owned.includes('furn:' + id))) err('Сначала получи «' + f.name + '»');
              h.slots[slot] = id;
            } else { delete h.slots[slot]; if (slot === 'tank') h.tank = []; }
          }
          if (Array.isArray(body.tank)) { if (!h.slots.tank) err('Сначала поставь аквариум'); h.tank = [...new Set(body.tank)].filter(s => P.collection[s]).slice(0, 3); }
          if (Array.isArray(body.trophies)) h.trophies = [...new Set(body.trophies)].filter(s => P.collection[s]).slice(0, 3);
          return { profile: pub() };
        }
        case '/api/house/visit': err('Ходить в гости можно только в онлайн-игре'); break;
        case '/api/inbox/read': (P.inbox || []).forEach(x => { x.seen = true; }); return { profile: pub() };
        case '/api/gift': case '/api/trade/offer': case '/api/trade/respond': case '/api/trade/cancel': case '/api/trade/inventory':
          err('Обмен и подарки доступны только в онлайн-игре'); break;
        case '/api/rooms': return { rooms: [
          { code: 'KARAS', name: 'Утренний клёв', loc: 'lake', players: 3, max: 5, host: 'Маша', looks: BOT_LOOKS.slice(0, 3) },
          { code: 'SOM42', name: 'Ночная охота на сома', loc: 'river', players: 2, max: 5, host: 'Дед Егор', looks: BOT_LOOKS.slice(1, 3) },
          { code: 'LAKE7', name: 'Тихая заводь', loc: 'lake', players: 5, max: 5, host: 'Котя', looks: BOT_LOOKS },
        ] };
        case '/api/top': return { top: BOT_NAMES.slice(0, 6).map((n, i) => ({ id: 'b' + i, name: n, level: 18 - i * 2, caught: 420 - i * 55, earned: 48000 - i * 6100, species: 15 - i, title: '', look: BOT_LOOKS[i % 5] })) };
      }
      err('Неизвестный запрос');
      return null;
    };

    // ctx: { loc, bait, depth, hour, coop }
    self.recordCatch = (species, weight, ctx) => {
      ctx = ctx || {};
      const now = Date.now();
      const f = D.FISH_BY_ID[species];
      const price = D.fishPrice(species, weight), xp = D.fishXp(species, weight);
      const tier = D.RARITY_ORDER.indexOf(f.rarity);
      const isNew = !P.collection[species];
      const c = P.collection[species] || { count: 0, best: 0, first: now };
      c.count++;
      if (weight > c.best) Object.assign(c, { best: weight, loc: ctx.loc || 'lake', bait: ctx.bait || 'worm', depth: ctx.depth, hour: ctx.hour, at: now });
      P.collection[species] = c;
      const keepId = P.nextKeep++;
      P.keepnet.unshift({ id: keepId, species, weight, price, at: now });
      const before = D.levelFromXp(P.xp).level;
      P.xp += xp; P.stats.caught++;
      if (weight > P.stats.bestWeight) { P.stats.bestWeight = weight; P.stats.bestSpecies = species; }
      const after = D.levelFromXp(P.xp).level;
      let reward = 0; for (let l = before + 1; l <= after; l++) reward += D.levelReward(l);
      P.coins += reward;
      const res = { keepId, species, weight, price, xp, isNew, levelUp: after > before ? after : 0, reward, pass: null, quests: [], ach: [], lic: null, tourney: null };
      if (ctx.loc && !P.meta.locs.includes(ctx.loc)) P.meta.locs.push(ctx.loc);
      if (!P.license) { if (D.licenseProgress(P.meta.lic, 'catch')) res.lic = P.meta.lic; }
      else {
        const season = D.seasonAt(now), mods = D.eventMods(now);
        let passXp = season ? D.PASS_XP_RARITY[tier] * mods.passXp : 0;
        const q = questEvent({ type: 'catch', species, weight, tier, loc: ctx.loc || 'lake', night: D.isNight(ctx.hour == null ? 12 : ctx.hour), coop: !!ctx.coop, bait: ctx.bait || 'worm', seasonal: !!f.season });
        res.quests = q.done; passXp += q.xp;
        res.pass = addPassXp(passXp);
        res.ach = checkAch();
      }
      save();
      return res;
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
      const pubP = p => ({ id: p.id, name: p.name, look: p.look, rod: p.rod, slot: p.slot, level: p.level, state: p.state, title: p.title || '', skin: p.skin || 'none', effect: p.effect || 'none', pose: p.pose || 'none' });
      const roomState = (r) => ({ id: 'local', code: r.code, name: r.name, isPublic: r.isPublic, solo: r.solo, loc: r.loc, max: r.max, hostId: 'local', link: r.solo ? null : 'https://t.me/HookedGame?startapp=room_' + r.code, players: [...room.players.values()].map(pubP), boss: null });

      function addMe() {
        const pr = pub();
        room.players.set('local', { id: 'local', name: pr.name, look: pr.look, rod: pr.rod, slot: 0, level: pr.level.level, state: 'idle', bot: false, title: D.TITLES[pr.title] || '', skin: pr.meta.skin, effect: pr.meta.effect, pose: pr.meta.pose });
      }
      function addBot(i) {
        const id = 'bot' + i;
        const p = { id, name: BOT_NAMES[i % BOT_NAMES.length], look: BOT_LOOKS[i % BOT_LOOKS.length], rod: D.RODS[(i + 1) % 4].id, slot: i + 1, level: 4 + i * 3, state: 'idle', bot: true };
        room.players.set(id, p);
        return p;
      }
      function botLoop(p) {
        if (!room.players.has(p.id)) return;
        later(p.id, 1500 + Math.random() * 4000, () => doCast(p, 0.3 + Math.random() * 0.7));
      }
      function doCast(p, power) {
        const now = Date.now();
        let g;
        if (p.bot) g = D.gear(p.rod, {}, hour());
        else {
          const m = P.meta;
          if (m.bait !== 'worm' && !(m.baits[m.bait] > 0)) m.bait = 'worm';
          p.castBait = m.bait;
          if (m.bait !== 'worm') { m.baits[m.bait] -= 1; if (m.baits[m.bait] <= 0) { delete m.baits[m.bait]; m.bait = 'worm'; } }
          g = D.gear(p.rod, Object.assign({}, m, { bait: p.castBait }), hour());
          if (!P.license) { if (D.licenseProgress(m.lic, 'cast')) emit({ t: 'lic', lic: m.lic }); }
          else { const q = questEvent({ type: 'cast' }); if (q.done.length) emit({ t: 'quest', done: q.done, pass: addPassXp(q.xp) }); }
          save();
          emit({ t: 'bait', bait: m.bait, baits: m.baits });
        }
        p.gear = g;
        p.depth = Math.max(0.04, power * g.depth);
        const season = D.seasonAt(now), mods = D.eventMods(now);
        p.plan = D.planCast(p.depth, g, hour(), { loc: room.loc, season: season && season.id, bite: mods.bite, seasonFish: mods.seasonFish });
        p.state = 'wait';
        emit({ t: 'cast', id: p.id, depth: p.depth, fx: p.bot ? 'none' : P.meta.effect });
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
              if (msg.t === 'join' || !msg.solo) { if (!P.license) { emit({ t: 'error', msg: 'Кооп-комнаты откроются после получения лицензии рыбака' }); return; } }
              room.players.forEach((x, id) => clear(id));
              room.players.clear();
              const solo = msg.t === 'create' && msg.solo;
              const lvl = D.levelFromXp(P.xp).level;
              const want = String(msg.loc || P.meta.loc || 'lake');
              room.loc = P.license && D.locUnlocked(want, lvl) ? want : 'lake';
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
              const res = self.recordCatch(p.plan.species, p.plan.weight, { loc: room.loc, bait: p.castBait, depth: p.depth, hour: hour(), coop: !room.solo && room.players.size > 1 });
              const pr = pub(); p.level = pr.level.level;
              emit({ t: 'caught', id: 'local', fish: res, profile: pr });
              return;
            }
            case 'fail': if (p && p.state === 'reel') { p.state = 'idle'; emit({ t: 'lost', id: 'local', reason: msg.reason === 'snap' ? 'snap' : 'escape' }); } return;
            case 'cancel': if (p && p.state !== 'idle') { clear('local'); p.state = 'idle'; emit({ t: 'reset', id: 'local' }); } return;
            case 'emote': {
              const e = D.EMOTE_BY_ID[msg.e];
              if (!e || (e.pass && !P.owned.includes('emote:' + e.id))) return;
              emit({ t: 'emote', id: 'local', e: e.id });
              for (const b of room.players.values()) if (b.bot && Math.random() < 0.5) setTimeout(() => emit({ t: 'emote', id: b.id, e: ['wave', 'like', 'laugh', 'party'][Math.floor(Math.random() * 4)] }), 700 + Math.random() * 1500);
              return;
            }
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
  const GET_PATHS = new Set(['/api/rooms', '/api/top']);
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
      const get = GET_PATHS.has(path);
      const r = await fetch(path.replace(/^\//, ''), {
        method: get ? 'GET' : 'POST',
        headers: this.headers(),
        body: get ? undefined : JSON.stringify(body || {}),
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
