/* Hooked — water scene renderer (canvas 2D) */
(function () {
  'use strict';
  const D = window.HData, A = window.HArt;
  const OL = A.OL;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const rgba = (hex, a) => { const [r, g, b] = A.hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; };

  // seeded random for stable decorations
  function srand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ---------- time of day palette ---------- */
  const SKY = [
    [0,    '#0b1536', '#27336a', 0.0],
    [4.5,  '#121a46', '#36407c', 0.0],
    [6,    '#5a6cc6', '#ffb68a', 0.45],
    [7.5,  '#4fb3f2', '#ffe1b0', 0.85],
    [9,    '#43b2f4', '#bfe9ff', 1.0],
    [16.5, '#43b2f4', '#c8edff', 1.0],
    [18.5, '#6f63d6', '#ffb07a', 0.7],
    [20,   '#3b2f7d', '#ff8a6b', 0.35],
    [21.3, '#141b4a', '#3c3a7c', 0.05],
    [24,   '#0b1536', '#27336a', 0.0],
  ];
  function skyAt(h) {
    for (let i = 0; i < SKY.length - 1; i++) {
      const a = SKY[i], b = SKY[i + 1];
      if (h >= a[0] && h <= b[0]) {
        const t = (h - a[0]) / (b[0] - a[0]);
        return { top: A.mix(a[1], b[1], t), bottom: A.mix(a[2], b[2], t), light: lerp(a[3], b[3], t) };
      }
    }
    return { top: SKY[0][1], bottom: SKY[0][2], light: 0 };
  }
  const NIGHT = '#16204a';
  const tint = (c, light, amt = 0.62) => A.mix(c, NIGHT, (1 - light) * amt);

  /* ---------- location themes ---------- */
  const THEMES = {
    lake:  { mtn: ['#a9c9e6', '#86b6d9'], snow: true, hill: '#8fd07e', hill2: '#5daa52', hillLine: '#3f8a40', trees: ['#3f8f4f', '#4f9d55'], trees2: ['#2f7d45', '#3a8a4c'], round: 0.38,
             shore: '#d9c08a', back: ['#6fc7ea', '#3aa6d6'], water: ['#43bde6', '#1f7fb6', '#0e3c6e'], fog: '#28aadc', sand: '#e4c98f', sandLine: '#b99a5a',
             weeds: ['#3f9e4a', '#2f8a46', '#5cb85c', '#6b9e2f'], pads: true, reeds: true, chest: true, rays: 1 },
    river: { mtn: ['#9fb8cf', '#7e9fbd'], snow: true, hill: '#7fc07a', hill2: '#4f9a50', hillLine: '#3b7d3d', trees: ['#2f6b45', '#3a7a50'], trees2: ['#24603d', '#2f6e46'], round: 0.12,
             shore: '#b9b2a4', back: ['#86dbe8', '#4bb8d0'], water: ['#4ccbd9', '#2392ad', '#0f4a66'], fog: '#2ab4c8', sand: '#c9c0ae', sandLine: '#9a9284',
             weeds: ['#3f8f5a', '#2f7a4a', '#4f9f6a'], pebbles: true, current: true, reeds: true, rocks: 1.8, rays: 1 },
    swamp: { mtn: null, hill: '#6f8a4a', hill2: '#4d6a35', hillLine: '#3a5228', trees: ['#4a5d34', '#3d4f2a'], trees2: ['#33442a', '#2c3b22'], round: 0.7, dead: true,
             shore: '#6b5a3a', back: ['#8aa66a', '#5f7f47'], water: ['#6f9a5a', '#3f6b3c', '#1c3a24'], fog: '#4a7a3a', sand: '#5b4a2f', sandLine: '#3f331f',
             weeds: ['#5a7a2a', '#4a6a22', '#6b8a32'], pads: true, reeds: true, mist: true, log: true, rays: 0.4 },
    sea:   { mtn: null, sea: true, back: ['#66c0ec', '#2f8fd0'], water: ['#3fa9e0', '#1a6fb3', '#0a2f66'], fog: '#1e90d0', sand: '#f0d9a4', sandLine: '#c9a96a',
             weeds: ['#2f9a7a', '#3fb28a', '#1f8a6a'], corals: true, gulls: true, rays: 1.2, kelp: 1.6 },
  };

  // headless screenshot runs (?demo) have no animation frames — drive the loop with a timer there
  const nextFrame = /[?&]demo/.test(location.search) ? fn => setTimeout(fn, 16) : fn => requestAnimationFrame(fn);

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  }

  class Scene {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.players = new Map();
      this.localId = null;
      this.showLabels = true;
      this.solo = true;
      this.loc = 'lake';
      this.season = null;
      this.insetTop = 0;
      this.hourOverride = null;
      this.t = 0;
      this.ripples = [];
      this.parts = [];
      this.bubbles = [];
      this.ambient = [];
      this.texts = [];
      this.sil = new Map();
      this.boss = null;
      this.running = false;
      this.listeners = {};
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
    emit(ev, d) { (this.listeners[ev] || []).forEach(f => f(d)); }

    get hour() {
      if (this.hourOverride != null) return this.hourOverride;
      const d = new Date();
      return d.getHours() + d.getMinutes() / 60;
    }
    get theme() { return THEMES[this.loc] || THEMES.lake; }

    resize() {
      const r = this.cv.getBoundingClientRect();
      const W = Math.max(280, r.width || window.innerWidth), H = Math.max(400, r.height || window.innerHeight);
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = W; this.H = H;
      this.cv.width = Math.round(W * this.dpr);
      this.cv.height = Math.round(H * this.dpr);
      this.computeLayout(true);
    }
    // keeps heads, name tags and emote bubbles below the top HUD and Telegram's safe area
    computeLayout(force) {
      const W = this.W, H = this.H;
      const topReserve = this.insetTop + 66;
      const sMax = this.solo ? clamp(W / 200 * 0.42, 0.42, 0.62) : clamp(W / 5 / 200 * 0.92, 0.3, 0.46);
      const dockTop = Math.round(clamp(topReserve + 78 + 260 * sMax, H * 0.3, H * 0.44));
      const scale = clamp((dockTop - topReserve - 78) / 260, 0.24, sMax);
      const changed = force || dockTop !== this.dockTop || scale !== this.charScale;
      this.dockTop = dockTop;
      this.charScale = scale;
      this.surfaceY = dockTop + 12;
      this.horizonY = Math.round(this.surfaceY - Math.min(56, H * 0.075));
      this.floorY = H - 26;
      try { document.documentElement.style.setProperty('--surface-y', this.surfaceY + 'px'); } catch { /* no DOM */ }
      if (changed) { this.bgKey = ''; this.buildDecor(); }
      this.layout();
    }
    setInsets(top) {
      top = Math.max(0, Math.round(top || 0));
      if (top === this.insetTop) return;
      this.insetTop = top;
      this.computeLayout(false);
    }
    setLocation(loc) {
      loc = D.LOC_BY_ID[loc] ? loc : 'lake';
      if (loc === this.loc) return;
      this.loc = loc;
      this.bgKey = '';
      this.buildDecor();
    }
    setSeason(id) { if (id !== this.season) { this.season = id || null; this.bgKey = ''; } }

    depthToY(d) { return this.surfaceY + 34 + d * (this.floorY - this.surfaceY - 74); }

    /* ---------- players ---------- */
    setRoom(room) {
      this.solo = !room || room.max === 1;
      if (room && room.loc) this.setLocation(room.loc);
      this.setBoss(room && room.boss);
      this.computeLayout(false);
    }
    layout() {
      const W = this.W;
      // the group stands centered on the dock, ordered by seat
      const list = [...this.players.values()].sort((a, b) => a.slot - b.slot);
      list.forEach((p, i) => {
        p.scale = this.charScale;
        p.tx = this.solo ? W * 0.3 : W * (0.448 + (i - (list.length - 1) / 2) * 0.18);
        if (p.x == null || this.solo) p.x = p.tx;
      });
    }
    addPlayer(info) {
      const old = this.players.get(info.id);
      const p = old || {
        id: info.id, state: 'idle', rodAngle: -1.0, rodTarget: -1.0, bend: 0, power: 0, depth: 0,
        bob: { x: 0, y: 0, vis: false, sub: 0, fly: 0 }, hookY: 0, castT: 0, fish: null, tension: 0, progress: 0,
        emote: null, bang: 0, shake: 0, breath: Math.random() * TAU,
      };
      Object.assign(p, {
        name: info.name, level: info.level || 1, slot: info.slot || 0, rod: info.rod || 'bamboo', look: info.look,
        skin: info.skin || 'none', effect: info.effect || 'none', pose: info.pose || 'none', title: info.title || '',
      });
      p.img = A.charImage(info.look, 'fish');
      p.poseImg = p.pose && p.pose !== 'none' ? A.charImage(info.look, p.pose) : null;
      this.players.set(info.id, p);
      this.layout();
      if (info.state && info.state !== 'idle' && !old) { p.state = 'wait'; p.depth = info.depth || 0.3; this._placeCast(p, true); }
      return p;
    }
    removePlayer(id) { this.players.delete(id); this.layout(); }
    clearPlayers() { this.players.clear(); }

    handPos(p) {
      const s = p.scale;
      return { x: p.x - 100 * s + A.HAND.x * s, y: this.dockTop - 254 * s + A.HAND.y * s };
    }
    rodLen(p) { return 260 * p.scale * 0.62; }
    rodTip(p) {
      const h = this.handPos(p), L = this.rodLen(p);
      const dx = Math.cos(p.rodAngle), dy = Math.sin(p.rodAngle);
      return { x: h.x + dx * L * 0.8 + p.bend * L * 0.1, y: h.y + dy * L * 0.8 + p.bend * L * 0.45 };
    }

    /* ---------- events from the game ---------- */
    aim(id, power) {
      const p = this.players.get(id); if (!p) return;
      if (power == null) { if (p.state === 'aim') p.state = 'idle'; return; }
      p.state = 'aim'; p.power = power;
    }
    cast(id, depth, fx) {
      const p = this.players.get(id); if (!p) return;
      p.state = 'cast'; p.depth = depth; p.castT = 0; p.fish = null; p.bend = 0; p.tension = 0; p.progress = 0;
      p.bob.vis = false;
      if (fx) p.effect = fx;
      this.emit('sound', { s: 'whoosh', id });
    }
    _placeCast(p, instant) {
      const tip = this.rodTip(p);
      p.bob.x = tip.x + 4; p.bob.y = this.surfaceY; p.bob.vis = true; p.bob.sub = 0;
      p.hookY = instant ? this.depthToY(p.depth) : this.surfaceY + 6;
      p.state = 'wait';
      if (!instant) this.castFx(p.effect, p.bob.x, this.surfaceY);
    }
    castFx(fx, x, y) {
      if (!fx || fx === 'none') return;
      const n = { bats: 6, feathers: 8, mist: 9, wisps: 5 }[fx] || 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        this.parts.push({
          type: 'fx', fx, life: 1, ph: Math.random() * TAU, s: 0.7 + Math.random() * 0.6,
          x: x + (fx === 'feathers' ? (Math.random() - 0.5) * 60 : (Math.random() - 0.5) * 16),
          y: fx === 'feathers' ? y - 50 - Math.random() * 40 : y - 6,
          vx: fx === 'bats' ? Math.cos(a) * 60 : fx === 'mist' ? Math.cos(a) * 18 : (Math.random() - 0.5) * 16,
          vy: fx === 'bats' ? -50 - Math.random() * 50 : fx === 'feathers' ? 14 + Math.random() * 10 : fx === 'mist' ? -8 - Math.random() * 10 : -24 - Math.random() * 16,
        });
      }
    }
    approach(id, species, weight) {
      const p = this.players.get(id); if (!p || !p.bob.vis) return;
      const f = D.FISH_BY_ID[species];
      if (!f) return;
      const sz = this.fishSize(species, weight);
      const fromLeft = Math.random() < 0.5;
      p.fish = {
        species, sz, mode: 'approach', t: 0, dir: fromLeft ? 1 : -1,
        x: fromLeft ? -sz : this.W + sz, y: p.hookY + (Math.random() - 0.5) * 60, rarity: f.rarity,
      };
    }
    nibble(id) {
      const p = this.players.get(id); if (!p) return;
      p.bob.sub = 0.45; p.shake = 0.25;
      this.ripple(p.bob.x, this.surfaceY, 18);
      if (p.fish) { p.fish.mode = 'nibble'; p.fish.t = 0; }
      this.emit('sound', { s: 'nibble', id });
    }
    bite(id) {
      const p = this.players.get(id); if (!p) return;
      p.state = 'bite'; p.bob.sub = 1; p.bang = 1; p.shake = 1;
      this.ripple(p.bob.x, this.surfaceY, 34); this.ripple(p.bob.x, this.surfaceY, 22, 0.15);
      this.splash(p.bob.x, this.surfaceY, 6, 0.6);
      if (p.fish) { p.fish.mode = 'bite'; p.fish.t = 0; }
      this.emit('sound', { s: 'bite', id });
    }
    hooked(id, species) {
      const p = this.players.get(id); if (!p) return;
      p.state = 'reel'; p.bang = 0; p.progress = 0; p.tension = 0.3;
      if (!p.fish) { this.approach(id, species, null); if (p.fish) { p.fish.x = p.bob.x; p.fish.y = p.hookY; } }
      if (p.fish) { p.fish.mode = 'fight'; p.fish.t = 0; p.fish.baseX = p.bob.x; }
      p.bob.vis = false;
      this.splash(p.bob.x, this.surfaceY, 10, 0.8);
    }
    reel(id, progress, tension) {
      const p = this.players.get(id); if (!p) return;
      p.progress = progress; p.tension = tension;
    }
    caught(id, species) {
      const p = this.players.get(id); if (!p) return;
      const f = p.fish || { species, sz: this.fishSize(species), x: p.bob.x, y: this.surfaceY + 20, dir: 1 };
      f.species = species; f.mode = 'land'; f.t = 0; f.sx = f.x; f.sy = f.y;
      p.fish = f; p.state = 'idle'; p.bob.vis = false; p.bend = 0; p.tension = 0;
      this.splash(f.x, this.surfaceY, 18, 1.2);
      this.ripple(f.x, this.surfaceY, 40);
      this.emit('sound', { s: 'splash', id });
    }
    lost(id, reason) {
      const p = this.players.get(id); if (!p) return;
      if (p.fish) { p.fish.mode = 'flee'; p.fish.t = 0; }
      if (reason === 'snap') {
        const tip = this.rodTip(p);
        this.parts.push({ type: 'line', x: tip.x, y: tip.y, vx: 40, vy: -60, life: 1 });
        this.emit('sound', { s: 'snap', id });
      }
      p.state = 'idle'; p.bob.vis = false; p.bend = 0; p.bang = 0; p.tension = 0;
    }
    missed(id) {
      const p = this.players.get(id); if (!p) return;
      if (p.fish) { p.fish.mode = 'flee'; p.fish.t = 0; }
      p.bang = 0; p.bob.sub = 0;
      p.state = 'retrieve'; p.castT = 0;
    }
    reset(id) {
      const p = this.players.get(id); if (!p) return;
      if (p.fish) { p.fish.mode = 'flee'; p.fish.t = 0; }
      p.bang = 0; p.state = 'retrieve'; p.castT = 0;
    }
    emote(id, e) {
      const p = this.players.get(id); if (!p) return;
      p.emote = { e, t: 0 };
    }
    floatText(id, text, color) {
      const p = this.players.get(id); if (!p) return;
      this.texts.push({ x: p.x, y: this.dockTop - 270 * p.scale, text, color: color || '#ffd23f', t: 0 });
    }
    setBoss(b) {
      if (!b) { this.boss = null; return; }
      const prev = this.boss;
      this.boss = { name: b.name, fish: b.fish || 'catfish', hp: b.hp, max: b.max, x: prev ? prev.x : -120, dir: prev ? prev.dir : 1, flash: 0 };
    }
    bossHit(hp) { if (this.boss) { this.boss.hp = hp; this.boss.flash = 1; this.splash(this.boss.x, this.surfaceY, 6, 0.5); } }

    fishSize(species, weight) {
      const f = D.FISH_BY_ID[species];
      if (!f) return 56;
      const t = weight == null ? 0.5 : clamp((weight - f.minW) / Math.max(0.01, f.maxW - f.minW), 0, 1);
      const base = {
        crucian: 50, roach: 46, perch: 52, ruffe: 38, bream: 64, carp: 76, trout: 64, pike: 96, zander: 80, salmon: 88, catfish: 112, koi: 70, eel: 100, sturgeon: 124, goldfish: 46,
        chub: 58, grayling: 56, asp: 86, taimen: 120, rotan: 40, loach: 54, tench: 62, snakehead: 100, mackerel: 56, flounder: 64, seabass: 66, tuna: 120, swordfish: 140,
        sunfish: 120, bonefish: 56, vampfish: 54, ghostpike: 100,
      }[species] || 56;
      return base * (0.8 + t * 0.45) * clamp(this.W / 420, 0.75, 1.25);
    }

    ripple(x, y, max, delay = 0) { this.ripples.push({ x, y, max, t: -delay }); }
    splash(x, y, n, power = 1) {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const v = (90 + Math.random() * 140) * power;
        this.parts.push({ type: 'drop', x: x + (Math.random() - 0.5) * 10, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.5 + Math.random() * 2.5, life: 1 });
      }
    }

    silhouette(species) {
      if (this.sil.has(species)) return this.sil.get(species);
      const e = A.fishImage(species);
      if (!e.ready) return null;
      const c = document.createElement('canvas');
      c.width = Math.ceil(e.w); c.height = Math.ceil(e.h);
      const x = c.getContext('2d');
      x.drawImage(e.img, 0, 0, c.width, c.height);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = 'rgba(8,24,44,0.9)';
      x.fillRect(0, 0, c.width, c.height);
      const out = { img: c, w: e.w, h: e.h };
      this.sil.set(species, out);
      return out;
    }

    /* ---------- decor ---------- */
    buildDecor() {
      const R = srand(Math.round(this.W) * 7 + 3 + this.loc.length * 131);
      const W = this.W, th = this.theme;
      this.clouds = Array.from({ length: 5 }, () => ({ x: R() * W * 1.2, y: 18 + R() * Math.max(10, this.horizonY - 110), s: 0.6 + R() * 0.7, v: 4 + R() * 7 }));
      this.weeds = Array.from({ length: Math.round(W / 34) }, () => ({
        x: R() * W, h: (30 + R() * 70) * (th.kelp || 1), w: 6 + R() * 6, ph: R() * TAU, c: th.weeds[Math.floor(R() * th.weeds.length)],
      }));
      this.rocks = Array.from({ length: Math.round(W / 70 * (th.rocks || 1)) }, () => ({ x: R() * W, r: 10 + R() * 18, c: ['#8a8f98', '#9aa0a6', '#7b8088'][Math.floor(R() * 3)] }));
      this.pebbles = Array.from({ length: th.pebbles ? Math.round(W / 9) : 0 }, () => ({ x: R() * W, y: R() * 16, r: 2 + R() * 4, c: ['#a7a196', '#8f8a80', '#bdb6aa', '#7d786f'][Math.floor(R() * 4)] }));
      this.corals = Array.from({ length: th.corals ? Math.round(W / 60) : 0 }, () => ({ x: R() * W, h: 18 + R() * 30, c: ['#ff7f7f', '#ffb74d', '#f06292', '#ba68c8'][Math.floor(R() * 4)], kind: Math.floor(R() * 3) }));
      this.posts = []; for (let x = 30; x < W; x += Math.max(90, W / 4.2)) this.posts.push(x);
      this.stars = Array.from({ length: 70 }, () => ({ x: R() * W, y: R() * Math.max(10, this.horizonY - 10), r: 0.6 + R() * 1.4, ph: R() * TAU }));
      this.birds = Array.from({ length: 3 }, () => ({ x: R() * W, y: 30 + R() * (this.horizonY * 0.4), v: 14 + R() * 10, ph: R() * TAU }));
      this.bats = Array.from({ length: 5 }, () => ({ x: R() * W, y: 24 + R() * (this.horizonY * 0.5), v: 18 + R() * 14, ph: R() * TAU, a: R() * 20 }));
      this.flies = Array.from({ length: 14 }, () => ({ x: R() * W, y: this.horizonY - 40 + R() * 70, ph: R() * TAU, v: 0.3 + R() * 0.5 }));
      this.pads = th.pads ? [{ x: W * 0.04, s: 1 }, { x: W * 0.96, s: 0.8 }, { x: W * 0.55, s: 0.6 }].concat(this.loc === 'swamp' ? [{ x: W * 0.3, s: 0.7 }, { x: W * 0.78, s: 0.9 }] : []) : [];
      this.chest = { x: W * 0.78 };
      this.boot = { x: W * 0.18 };
      this.ambient = [];
      const n = Math.round(clamp(W / 55, 5, 9));
      for (let i = 0; i < n; i++) this.spawnAmbient(true);
    }

    spawnAmbient(anywhere) {
      const night = D.isNight(this.hour);
      const pool = D.FISH.filter(f => f.rarity !== 'legendary' && f.loc.includes(this.loc) && (!f.season || f.season === this.season) &&
        (f.time === 'any' || (f.time === 'night') === night));
      if (!pool.length) return;
      const f = pool[Math.floor(Math.random() * pool.length)];
      const d = lerp(f.depth[0], f.depth[1], Math.random());
      const dir = Math.random() < 0.5 ? 1 : -1;
      const sz = this.fishSize(f.id, f.minW + (f.maxW - f.minW) * Math.random() * 0.4) * 0.85;
      this.ambient.push({
        species: f.id, sz, dir, y: this.depthToY(d), v: 14 + Math.random() * 22, ph: Math.random() * TAU,
        x: anywhere ? Math.random() * this.W : dir > 0 ? -sz : this.W + sz,
      });
    }

    /* ---------- static background layers ---------- */
    buildBackground(hour) {
      const W = this.W, dpr = this.dpr, th = this.theme;
      const goth = this.season === 'goth';
      const sky = skyAt(hour);
      const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(this.surfaceY * dpr) + 2; const x = c.getContext('2d'); x.scale(dpr, dpr); return [c, x]; };
      const [skyC, s] = mk();
      const g = s.createLinearGradient(0, 0, 0, this.horizonY);
      g.addColorStop(0, sky.top); g.addColorStop(1, sky.bottom);
      s.fillStyle = g; s.fillRect(0, 0, W, this.surfaceY);
      if (goth) { s.fillStyle = `rgba(70,20,110,${0.14 + (1 - sky.light) * 0.14})`; s.fillRect(0, 0, W, this.surfaceY); }

      // sun / moon
      const night = sky.light < 0.3;
      const dayT = clamp((hour - 5.5) / 15, 0, 1);
      const nightT = ((hour + 24 - 20.5) % 24) / 9.5;
      const t = night ? nightT : dayT;
      const cx = lerp(W * 0.12, W * 0.88, t), cy = this.horizonY - Math.sin(t * Math.PI) * (this.horizonY * 0.72) + 10;
      if (night) {
        const mg = s.createRadialGradient(cx, cy, 6, cx, cy, 70);
        mg.addColorStop(0, goth ? 'rgba(220,190,255,0.4)' : 'rgba(255,250,220,0.35)'); mg.addColorStop(1, 'rgba(255,250,220,0)');
        s.fillStyle = mg; s.fillRect(cx - 70, cy - 70, 140, 140);
        s.fillStyle = goth ? '#f3e6ff' : '#fff6d6'; s.beginPath(); s.arc(cx, cy, goth ? 24 : 20, 0, TAU); s.fill();
        s.fillStyle = 'rgba(200,190,150,0.5)';
        [[-6, -4, 5], [7, 5, 3.5], [-2, 9, 2.5]].forEach(([dx, dy, r]) => { s.beginPath(); s.arc(cx + dx, cy + dy, r, 0, TAU); s.fill(); });
      } else {
        const warm = A.mix('#fff3b0', '#ffb36b', 1 - sky.light);
        const sg = s.createRadialGradient(cx, cy, 10, cx, cy, 110);
        sg.addColorStop(0, 'rgba(255,240,170,0.6)'); sg.addColorStop(1, 'rgba(255,240,170,0)');
        s.fillStyle = sg; s.fillRect(cx - 110, cy - 110, 220, 220);
        s.fillStyle = warm; s.beginPath(); s.arc(cx, cy, 26, 0, TAU); s.fill();
        s.fillStyle = 'rgba(255,255,255,0.55)'; s.beginPath(); s.arc(cx - 8, cy - 8, 8, 0, TAU); s.fill();
      }
      this.sunPos = { x: cx, y: cy, night };

      // land layer
      const [landC, l] = mk();
      const L = sky.light;
      const hz = this.horizonY;
      const R = srand(42 + Math.round(W) + this.loc.length * 17);
      const mtn = (base, amp, col, snow, seed) => {
        const r = srand(seed);
        l.fillStyle = col; l.beginPath(); l.moveTo(0, hz);
        let x = -20;
        const pts = [];
        while (x < W + 60) { const px = x + 40 + r() * 70, py = base - amp * (0.4 + r() * 0.6); pts.push([px, py]); x = px + 30 + r() * 60; }
        let prev = [-20, base];
        l.lineTo(-20, base);
        for (const [px, py] of pts) { l.quadraticCurveTo((prev[0] + px) / 2, py + 10, px, py); l.quadraticCurveTo(px + 22, py + 8, px + 40, base - amp * 0.2); prev = [px + 40, base - amp * 0.2]; }
        l.lineTo(W + 20, base); l.lineTo(W + 20, hz); l.closePath(); l.fill();
        if (snow) {
          l.fillStyle = tint('#ffffff', L, 0.55);
          for (const [px, py] of pts) {
            if (base - py < amp * 0.75) continue;
            l.beginPath(); l.moveTo(px - 12, py + 13); l.quadraticCurveTo(px - 4, py - 3, px, py); l.quadraticCurveTo(px + 6, py - 2, px + 13, py + 12);
            l.lineTo(px + 6, py + 9); l.lineTo(px + 1, py + 14); l.lineTo(px - 5, py + 9); l.closePath(); l.fill();
          }
        }
      };
      const hill = (y, amp, col, seed, dark) => {
        const r = srand(seed);
        l.fillStyle = col; l.beginPath(); l.moveTo(0, hz + 2);
        l.lineTo(0, y);
        for (let x = 0; x <= W + 80; x += 80) l.quadraticCurveTo(x + 40, y - amp * (0.5 + r() * 0.7), x + 80, y - amp * 0.2 * r());
        l.lineTo(W, hz + 2); l.closePath(); l.fill();
        if (dark) { l.strokeStyle = dark; l.lineWidth = 2; l.stroke(); }
      };
      const tree = (x, y, h, col, round) => {
        const dark = A.shade(col, -0.25), light = A.shade(col, 0.18);
        if (round) {
          l.fillStyle = tint('#7a5230', L); l.fillRect(x - 2, y - h * 0.35, 4, h * 0.35);
          l.fillStyle = col;
          [[0, -h * 0.62, h * 0.32], [-h * 0.2, -h * 0.45, h * 0.24], [h * 0.2, -h * 0.47, h * 0.25]].forEach(([dx, dy, r]) => { l.beginPath(); l.arc(x + dx, y + dy, r, 0, TAU); l.fill(); });
          l.fillStyle = light; l.beginPath(); l.arc(x - h * 0.08, y - h * 0.7, h * 0.12, 0, TAU); l.fill();
        } else {
          l.fillStyle = tint('#6b4428', L); l.fillRect(x - 2, y - h * 0.15, 4, h * 0.15);
          for (let i = 0; i < 3; i++) {
            const ty = y - h * 0.12 - i * h * 0.26, w = h * (0.34 - i * 0.08);
            l.fillStyle = i % 2 ? col : dark;
            l.beginPath(); l.moveTo(x - w, ty); l.quadraticCurveTo(x, ty - h * 0.42, x, ty - h * 0.45); l.quadraticCurveTo(x, ty - h * 0.42, x + w, ty); l.quadraticCurveTo(x, ty + 5, x - w, ty); l.fill();
          }
        }
      };
      const deadTree = (x, y, h) => {
        l.strokeStyle = tint('#3b3226', L, 0.5); l.lineCap = 'round';
        l.lineWidth = 4; l.beginPath(); l.moveTo(x, y); l.quadraticCurveTo(x + 3, y - h * 0.5, x - 2, y - h); l.stroke();
        l.lineWidth = 2.2;
        [[0.45, -1], [0.62, 1], [0.8, -1]].forEach(([k, d]) => { const yy = y - h * k; l.beginPath(); l.moveTo(x, yy); l.quadraticCurveTo(x + d * h * 0.18, yy - h * 0.08, x + d * h * 0.3, yy - h * 0.2); l.stroke(); });
      };

      if (th.sea) {
        // open sea to the horizon, island with a lighthouse and a little sailboat
        const og = l.createLinearGradient(0, hz - 6, 0, this.surfaceY);
        og.addColorStop(0, tint(th.back[0], L, 0.7)); og.addColorStop(1, tint(th.back[1], L, 0.7));
        l.fillStyle = og; l.fillRect(0, hz - 6, W, this.surfaceY - hz + 6);
        const ix = W * 0.76;
        l.fillStyle = tint('#6aa05a', L); l.beginPath(); l.ellipse(ix, hz - 4, 46, 12, 0, Math.PI, 0); l.fill();
        l.fillStyle = tint('#f4f1ea', L, 0.5); l.fillRect(ix + 10, hz - 40, 9, 30);
        l.fillStyle = tint('#e53935', L, 0.5); l.fillRect(ix + 10, hz - 32, 9, 5); l.fillRect(ix + 10, hz - 22, 9, 5);
        l.fillStyle = night ? '#fff2a8' : tint('#ffca28', L, 0.4); l.fillRect(ix + 9, hz - 46, 11, 6);
        if (night) { l.fillStyle = 'rgba(255,240,170,0.18)'; l.beginPath(); l.moveTo(ix + 14, hz - 43); l.lineTo(ix - 80, hz - 70); l.lineTo(ix - 80, hz - 30); l.closePath(); l.fill(); }
        const bx = W * 0.22;
        l.fillStyle = tint('#8d5a2b', L); l.beginPath(); l.moveTo(bx - 14, hz + 4); l.lineTo(bx + 14, hz + 4); l.lineTo(bx + 9, hz + 9); l.lineTo(bx - 9, hz + 9); l.fill();
        l.fillStyle = tint('#fafafa', L, 0.5); l.beginPath(); l.moveTo(bx, hz + 3); l.lineTo(bx, hz - 18); l.lineTo(bx + 11, hz + 1); l.closePath(); l.fill();
      } else {
        if (th.mtn) {
          mtn(hz - 18, hz * 0.45, tint(th.mtn[0], L), th.snow, 7);
          mtn(hz - 6, hz * 0.3, tint(th.mtn[1], L), false, 19);
        }
        hill(hz - 16, th.mtn ? 26 : 34, tint(th.hill, L), 3);
        if (goth && !th.dead) {
          // ruined castle on the far hill
          const cx0 = W * 0.7, base = hz - 18;
          l.fillStyle = tint('#4a4060', L, 0.4);
          l.fillRect(cx0 - 26, base - 30, 52, 30);
          [[-30, 46], [22, 54]].forEach(([dx, hh]) => {
            l.fillRect(cx0 + dx, base - hh, 10, hh);
            l.beginPath(); l.moveTo(cx0 + dx - 2, base - hh); l.lineTo(cx0 + dx + 5, base - hh - 12); l.lineTo(cx0 + dx + 12, base - hh); l.fill();
          });
          for (let i = 0; i < 5; i++) l.fillRect(cx0 - 24 + i * 11, base - 36, 6, 7);
          l.fillStyle = night ? 'rgba(255,214,120,0.8)' : 'rgba(30,20,40,0.6)';
          l.fillRect(cx0 - 4, base - 22, 6, 9); l.fillRect(cx0 + 24, base - 40, 4, 6);
        }
        for (let x = -10; x < W + 20; x += 14 + R() * 14) {
          if (th.dead && R() < 0.35) { deadTree(x, hz - 6, 26 + R() * 16); continue; }
          tree(x, hz - 8 - R() * 6, 26 + R() * 16, tint(th.trees[R() < 0.5 ? 0 : 1], L), R() < th.round);
        }
        hill(hz + 1, 10, tint(th.hill2, L), 11, tint(th.hillLine, L));
        for (let x = -6; x < W + 20; x += 22 + R() * 26) {
          if (th.dead && R() < 0.3) { deadTree(x, hz + 2, 36 + R() * 20); continue; }
          tree(x, hz + 2, 34 + R() * 22, tint(th.trees2[R() < 0.5 ? 0 : 1], L), R() < th.round);
        }
        if (th.shore) { l.fillStyle = tint(th.shore, L); l.fillRect(0, hz - 1, W, 4); }
        const wg = l.createLinearGradient(0, hz, 0, this.surfaceY);
        wg.addColorStop(0, tint(th.back[0], L, 0.7)); wg.addColorStop(1, tint(th.back[1], L, 0.7));
        l.fillStyle = wg; l.fillRect(0, hz + 2, W, this.surfaceY - hz);
      }
      l.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 9; i++) { const y = hz + 6 + R() * Math.max(4, this.surfaceY - hz - 10); rr(l, R() * W, y, 20 + R() * 50, 2.5, 1.5); l.fill(); }
      if (this.sunPos) {
        l.fillStyle = night ? 'rgba(255,248,210,0.35)' : 'rgba(255,240,180,0.45)';
        for (let i = 0; i < 4; i++) { rr(l, this.sunPos.x - 18 + i * 3, hz + 6 + i * 7, 36 - i * 6, 3, 1.5); l.fill(); }
      }
      this.skyLayer = skyC; this.landLayer = landC; this.sky = sky;
    }

    /* ---------- main loop ---------- */
    start() {
      if (this.running) return;
      this.running = true;
      let last = performance.now();
      const loop = () => {
        if (!this.running) return;
        const now = performance.now();
        const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
        this.update(dt);
        this.draw();
        nextFrame(loop);
      };
      nextFrame(loop);
    }
    stop() { this.running = false; }

    update(dt) {
      this.t += dt;
      const t = this.t;
      for (const c of this.clouds) { c.x += c.v * dt; if (c.x > this.W + 120 * c.s) c.x = -140 * c.s; }
      for (const b of this.birds) { b.x += b.v * dt; if (b.x > this.W + 30) { b.x = -30; b.y = 30 + Math.random() * this.horizonY * 0.4; } }
      for (const b of this.bats) { b.x += b.v * dt; if (b.x > this.W + 30) { b.x = -30; b.y = 24 + Math.random() * this.horizonY * 0.5; } }
      for (const f of this.ambient) {
        f.x += f.dir * f.v * dt;
        f.y += Math.sin(t * 1.3 + f.ph) * 6 * dt;
      }
      this.ambient = this.ambient.filter(f => f.x > -f.sz * 1.5 && f.x < this.W + f.sz * 1.5);
      let guard = 0;
      while (this.ambient.length < Math.round(clamp(this.W / 55, 5, 9)) && guard++ < 10) this.spawnAmbient(false);
      if (Math.random() < dt * 1.2) this.bubbles.push({ x: Math.random() * this.W, y: this.floorY - 6, r: 2 + Math.random() * 3, v: 30 + Math.random() * 30, ph: Math.random() * TAU });
      if (this.theme.chest && Math.random() < dt * 0.5) this.bubbles.push({ x: this.chest.x + 10, y: this.floorY - 22, r: 2.5, v: 36, ph: 0 });
      for (const b of this.bubbles) { b.y -= b.v * dt; b.x += Math.sin(t * 3 + b.ph) * 10 * dt; }
      this.bubbles = this.bubbles.filter(b => b.y > this.surfaceY + 4);
      for (const r of this.ripples) r.t += dt;
      this.ripples = this.ripples.filter(r => r.t < 1.2);
      for (const p of this.parts) {
        if (p.type === 'fx') {
          p.life -= dt * (p.fx === 'mist' ? 0.55 : 0.45);
          p.x += p.vx * dt + (p.fx === 'feathers' ? Math.sin(t * 3 + p.ph) * 26 * dt : p.fx === 'wisps' ? Math.sin(t * 4 + p.ph) * 18 * dt : 0);
          p.y += p.vy * dt;
          if (p.fx === 'mist') p.s += dt * 0.9;
          continue;
        }
        p.life -= dt * (p.type === 'line' ? 0.8 : 1.3);
        p.vy += 380 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type === 'drop' && p.y > this.surfaceY + 2 && p.vy > 0) p.life = 0;
      }
      this.parts = this.parts.filter(p => p.life > 0);
      for (const x of this.texts) x.t += dt;
      this.texts = this.texts.filter(x => x.t < 1.8);
      if (this.boss) {
        const b = this.boss, sz = this.bossSize();
        b.x += b.dir * 38 * dt;
        if (b.x > this.W + sz * 0.3) b.dir = -1;
        if (b.x < -sz * 0.3) b.dir = 1;
        b.flash = Math.max(0, b.flash - dt * 2.5);
      }

      for (const p of this.players.values()) this.updatePlayer(p, dt);
    }

    updatePlayer(p, dt) {
      const t = this.t;
      if (p.tx != null && Math.abs(p.tx - p.x) > 0.5) p.x += (p.tx - p.x) * Math.min(1, dt * 3);
      p.breath += dt * 2.2;
      p.shake = Math.max(0, p.shake - dt * 2);
      if (p.emote) { p.emote.t += dt; if (p.emote.t > 2.6) p.emote = null; }
      if (p.bang) p.bang += dt;
      // rod angle targets
      switch (p.state) {
        case 'idle': p.rodTarget = -1.05; break;
        case 'aim': p.rodTarget = -1.2 - p.power * 1.5; break;
        case 'cast': p.castT += dt; p.rodTarget = p.castT < 0.16 ? -2.6 : -0.42; break;
        case 'wait': p.rodTarget = -0.5 + Math.sin(t * 1.5) * 0.02; break;
        case 'bite': p.rodTarget = -0.32 + Math.sin(t * 40) * 0.04; break;
        case 'reel': p.rodTarget = -0.75 + Math.sin(t * 25) * 0.02 * p.tension; break;
        case 'retrieve': p.castT += dt; p.rodTarget = -1.05; break;
      }
      const k = p.state === 'cast' && p.castT > 0.16 ? 22 : 9;
      p.rodAngle += (p.rodTarget - p.rodAngle) * Math.min(1, dt * k);
      const bendTarget = p.state === 'reel' ? 0.25 + p.tension * 0.75 : p.state === 'bite' ? 0.35 : p.bob.sub > 0.3 ? 0.15 : 0;
      p.bend += (bendTarget - p.bend) * Math.min(1, dt * 8);

      // bobber flight & hook sinking
      if (p.state === 'cast') {
        if (p.castT > 0.18) {
          const ft = clamp((p.castT - 0.18) / 0.7, 0, 1);
          const tip = this.rodTip(p);
          const sx = tip.x, sy = tip.y, ex = tip.x + 4, ey = this.surfaceY;
          p.bob.vis = true;
          p.bob.x = lerp(sx + 30, ex, ease(ft));
          p.bob.y = lerp(sy, ey, ft) - Math.sin(ft * Math.PI) * 70;
          p.bob.fly = 1 - ft;
          p.hookY = p.bob.y + 6;
          if (ft >= 1) {
            this._placeCast(p);
            this.splash(p.bob.x, this.surfaceY, 8, 0.6);
            this.ripple(p.bob.x, this.surfaceY, 26);
            this.emit('sound', { s: 'plop', id: p.id });
          }
        }
      }
      if (p.state === 'wait' || p.state === 'bite') {
        const target = this.depthToY(p.depth);
        p.hookY += (target - p.hookY) * Math.min(1, dt * 1.6);
        p.bob.sub = Math.max(p.state === 'bite' ? 1 : 0, p.bob.sub - dt * 1.8);
        const tip = this.rodTip(p);
        p.bob.x += (tip.x + 4 - p.bob.x) * Math.min(1, dt * 3);
      }
      if (p.state === 'retrieve') {
        p.hookY += (this.surfaceY - p.hookY) * Math.min(1, dt * 7);
        const tip = this.rodTip(p);
        if (p.castT > 0.35) { p.bob.y += (tip.y - p.bob.y) * Math.min(1, dt * 10); p.bob.x += (tip.x - p.bob.x) * Math.min(1, dt * 10); }
        if (p.castT > 0.7) { p.state = 'idle'; p.bob.vis = false; }
      }
      // target fish
      const f = p.fish;
      if (f) {
        f.t += dt;
        const hx = p.bob.x, hy = p.hookY;
        if (f.mode === 'approach' || f.mode === 'nibble' || f.mode === 'bite') {
          const mouthOff = f.sz * 0.48;
          let tx = hx - f.dir * mouthOff, ty = hy + 4;
          if (f.mode === 'approach') tx -= f.dir * 28;
          if (f.mode === 'nibble') tx += f.dir * Math.max(0, Math.sin(f.t * 10)) * 6 - f.dir * 4;
          f.x += (tx - f.x) * Math.min(1, dt * (f.mode === 'bite' ? 10 : 1.8));
          f.y += (ty - f.y) * Math.min(1, dt * 2.5);
          if (f.mode === 'bite') f.y += Math.sin(t * 30) * 0.8;
        } else if (f.mode === 'fight') {
          const rush = p.tension > 0.65 ? 1 : 0.4;
          const sway = Math.sin(t * (2.5 + rush * 3)) * (26 + rush * 24) + Math.sin(t * 7.3) * 6;
          const tx = f.baseX + sway, ty = lerp(hy, this.surfaceY + 22, clamp(p.progress, 0, 1));
          f.dir = tx > f.x + 0.5 ? 1 : tx < f.x - 0.5 ? -1 : f.dir;
          f.x += (tx - f.x) * Math.min(1, dt * 4);
          f.y += (ty - f.y) * Math.min(1, dt * 3);
        } else if (f.mode === 'flee') {
          f.x += f.dir * -1 * 260 * dt; f.y += 30 * dt;
          if (f.x < -200 || f.x > this.W + 200) p.fish = null;
        } else if (f.mode === 'land') {
          const lt = clamp(f.t / 0.7, 0, 1);
          const hpos = this.handPos(p);
          f.x = lerp(f.sx, hpos.x + 6, ease(lt));
          f.y = lerp(f.sy, hpos.y - 30, lt) - Math.sin(lt * Math.PI) * 90;
          if (f.t > 0.95) { p.fish = null; this.emit('landed', { id: p.id }); }
        }
      }
    }

    /* ---------- drawing ---------- */
    draw() {
      const ctx = this.ctx, W = this.W, H = this.H, t = this.t;
      const hour = this.hour;
      const key = W + 'x' + H + ':' + Math.round(hour * 12) + ':' + this.loc + ':' + this.season + ':' + this.surfaceY;
      if (key !== this.bgKey) { this.buildBackground(hour); this.bgKey = key; }
      const L = this.sky.light, th = this.theme, goth = this.season === 'goth';
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // sky
      ctx.drawImage(this.skyLayer, 0, 0, W, this.surfaceY + 2 / this.dpr);
      if (L < 0.5) for (const s of this.stars) {
        ctx.globalAlpha = (1 - L * 2) * (0.5 + 0.5 * Math.sin(t * 2 + s.ph));
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const c of this.clouds) this.drawCloud(c.x, c.y, c.s, L);
      if (goth && L < 0.75) {
        for (const b of this.bats) this.drawBat(ctx, b.x, b.y + Math.sin(t * 2 + b.ph) * 8, 1, t + b.ph);
      } else if (L > 0.5) {
        ctx.strokeStyle = th.gulls ? 'rgba(255,255,255,0.9)' : 'rgba(40,40,60,0.7)'; ctx.lineWidth = th.gulls ? 2.4 : 2; ctx.lineCap = 'round';
        for (const b of this.birds) {
          const f = Math.sin(t * 8 + b.ph) * 4;
          ctx.beginPath(); ctx.moveTo(b.x - 7, b.y - f); ctx.quadraticCurveTo(b.x - 3, b.y - 3, b.x, b.y); ctx.quadraticCurveTo(b.x + 3, b.y - 3, b.x + 7, b.y - f); ctx.stroke();
        }
      }
      ctx.drawImage(this.landLayer, 0, 0, W, this.surfaceY + 2 / this.dpr);
      // back water sparkle
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) {
        const x = (i * 97 + t * (th.current ? 40 : 12)) % (W + 60) - 30, y = this.horizonY + 8 + (i * 13) % Math.max(4, this.surfaceY - this.horizonY - 14);
        ctx.globalAlpha = (0.25 + 0.25 * Math.sin(t * 2 + i)) * (0.5 + L * 0.5);
        rr(ctx, x, y, 14 + (i % 3) * 8, 2, 1); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // fireflies at night / dragonflies by day
      if (!th.sea) {
        if (L < 0.4) {
          for (const f of this.flies) {
            const x = f.x + Math.sin(t * f.v + f.ph) * 20, y = f.y + Math.cos(t * f.v * 1.3 + f.ph) * 10;
            const a = 0.5 + 0.5 * Math.sin(t * 3 + f.ph);
            const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
            const col = goth ? '200,160,255' : '255,245,140';
            g.addColorStop(0, `rgba(${col},${0.9 * a})`); g.addColorStop(1, `rgba(${col},0)`);
            ctx.fillStyle = g; ctx.fillRect(x - 9, y - 9, 18, 18);
          }
        } else {
          for (let i = 0; i < 2; i++) {
            const x = (W * (0.3 + i * 0.4)) + Math.sin(t * 0.7 + i * 3) * W * 0.18, y = this.horizonY - 20 + Math.sin(t * 1.9 + i) * 14;
            this.drawDragonfly(x, y, t + i);
          }
        }
      }
      // swamp mist / night fog of the Goth season
      if (th.mist || (goth && L < 0.5)) {
        const col = th.mist ? '235,245,230' : '200,170,240';
        for (let i = 0; i < 4; i++) {
          const x = ((i * 173 + t * 9) % (W + 260)) - 130, y = this.horizonY + 4 + i * 7;
          const g = ctx.createRadialGradient(x, y, 4, x, y, 120);
          g.addColorStop(0, `rgba(${col},${th.mist ? 0.35 : 0.22})`); g.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = g; ctx.fillRect(x - 120, y - 30, 240, 60);
        }
      }

      this.drawUnderwater(ctx, W, H, t, L);
      this.drawDock(ctx, W, L);

      // players (back to front by slot)
      const list = [...this.players.values()].sort((a, b) => a.slot - b.slot);
      for (const p of list) this.drawPlayer(ctx, p, t);
      for (const p of list) this.drawLine(ctx, p, t);

      // surface highlight wave
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.4 * L})`; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) { const y = this.surfaceY + Math.sin(x * 0.05 + t * 2) * 1.6 + Math.sin(x * 0.11 - t * 1.3) * 1; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
      this.drawPads(ctx, t, L);

      for (const p of list) this.drawBobber(ctx, p, t);
      // ripples
      for (const r of this.ripples) {
        if (r.t < 0) continue;
        const k = r.t / 1.2;
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k) * (0.45 + 0.55 * L)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(r.x, r.y + 1, r.max * k + 4, (r.max * k + 4) * 0.22, 0, 0, TAU); ctx.stroke();
      }
      // particles
      for (const p of this.parts) {
        ctx.globalAlpha = clamp(p.life, 0, 1);
        if (p.type === 'drop') {
          ctx.fillStyle = '#e8f8ff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(40,120,170,0.6)'; ctx.lineWidth = 1; ctx.stroke();
        } else if (p.type === 'line') {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 10, p.y + 20, p.x - 6, p.y + 40); ctx.stroke();
        } else if (p.type === 'fx') this.drawFx(ctx, p, t);
      }
      ctx.globalAlpha = 1;
      // landing fish fly above everything
      for (const p of list) if (p.fish && p.fish.mode === 'land') this.drawFish(ctx, p.fish, false, 1);
      for (const p of list) this.drawLabels(ctx, p, t);
      for (const x of this.texts) {
        const k = x.t / 1.8;
        ctx.globalAlpha = 1 - k * k;
        ctx.font = '900 18px Nunito, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = OL; ctx.strokeText(x.text, x.x, x.y - k * 40);
        ctx.fillStyle = x.color; ctx.fillText(x.text, x.x, x.y - k * 40);
      }
      ctx.globalAlpha = 1;
    }

    drawCloud(x, y, s, L) {
      const ctx = this.ctx;
      const goth = this.season === 'goth';
      const c = tint(goth ? '#efe6fb' : '#ffffff', L, 0.55), sh = tint(goth ? '#cfc0e6' : '#d6ecfb', L, 0.6);
      const blobs = [[0, 0, 22], [24, -10, 26], [52, -2, 22], [74, 6, 16], [-18, 8, 15]];
      ctx.fillStyle = sh;
      for (const [dx, dy, r] of blobs) { ctx.beginPath(); ctx.arc(x + dx * s, y + (dy + 5) * s, r * s, 0, TAU); ctx.fill(); }
      ctx.fillStyle = c;
      for (const [dx, dy, r] of blobs) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU); ctx.fill(); }
      ctx.fillRect(x - 18 * s, y, 92 * s, 12 * s);
      ctx.fillStyle = sh; ctx.fillRect(x - 18 * s, y + 12 * s, 92 * s, 4 * s);
    }

    drawBat(ctx, x, y, s, t) {
      const f = Math.sin(t * 14) * 0.6;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = '#1a1424';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-6, -6 - f * 6, -14, -4 - f * 8);
      ctx.quadraticCurveTo(-10, 0, -12, 4);
      ctx.quadraticCurveTo(-6, 2, 0, 4);
      ctx.quadraticCurveTo(6, 2, 12, 4);
      ctx.quadraticCurveTo(10, 0, 14, -4 - f * 8);
      ctx.quadraticCurveTo(6, -6 - f * 6, 0, 0);
      ctx.fill();
      ctx.beginPath(); ctx.arc(0, 1, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }

    drawFx(ctx, p, t) {
      switch (p.fx) {
        case 'bats': this.drawBat(ctx, p.x, p.y, 0.7 * p.s, t + p.ph); break;
        case 'feathers':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.sin(t * 3 + p.ph) * 0.7);
          ctx.fillStyle = '#1b1820'; ctx.strokeStyle = '#4a3f5c'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(0, 0, 3 * p.s, 9 * p.s, 0, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -9 * p.s); ctx.lineTo(0, 11 * p.s); ctx.stroke();
          ctx.restore(); break;
        case 'mist': {
          const r = 10 + p.s * 16;
          const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, r);
          g.addColorStop(0, 'rgba(170,110,255,0.55)'); g.addColorStop(1, 'rgba(170,110,255,0)');
          ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2); break;
        }
        case 'wisps': {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 12 * p.s);
          g.addColorStop(0, 'rgba(240,255,255,0.95)'); g.addColorStop(0.4, 'rgba(120,240,255,0.6)'); g.addColorStop(1, 'rgba(120,240,255,0)');
          ctx.fillStyle = g; ctx.fillRect(p.x - 12 * p.s, p.y - 12 * p.s, 24 * p.s, 24 * p.s); break;
        }
      }
    }

    drawDragonfly(x, y, t) {
      const ctx = this.ctx;
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(220,245,255,0.7)';
      const f = Math.sin(t * 50) * 0.5;
      ctx.beginPath(); ctx.ellipse(-2, -3, 7, 2.2, -0.4 + f, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2, -3, 7, 2.2, 0.4 - f, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#1e88a8'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-9, 1); ctx.lineTo(4, 0); ctx.stroke();
      ctx.fillStyle = '#1e88a8'; ctx.beginPath(); ctx.arc(5, 0, 2.4, 0, TAU); ctx.fill();
      ctx.restore();
    }

    bossSize() { return Math.min(340, this.W * 0.62); }

    drawUnderwater(ctx, W, H, t, L) {
      const sy = this.surfaceY, fy = this.floorY, th = this.theme;
      const top = tint(th.water[0], L, 0.75), mid = tint(th.water[1], L, 0.75), deep = tint(th.water[2], L, 0.7);
      this.waterTop = top;
      const g = ctx.createLinearGradient(0, sy, 0, H);
      g.addColorStop(0, top); g.addColorStop(0.45, mid); g.addColorStop(1, deep);
      ctx.fillStyle = g; ctx.fillRect(0, sy, W, H - sy);

      // far plants silhouettes
      ctx.fillStyle = A.mix(deep, mid, 0.3);
      ctx.beginPath(); ctx.moveTo(0, fy);
      for (let x = 0; x <= W + 30; x += 30) ctx.quadraticCurveTo(x + 15, fy - 40 - Math.sin(x) * 14, x + 30, fy - 8);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();

      // dock posts in water
      for (const x of this.posts) {
        const pg = ctx.createLinearGradient(x - 9, 0, x + 9, 0);
        pg.addColorStop(0, tint('#9a6a3c', L)); pg.addColorStop(1, tint('#6b4424', L));
        ctx.fillStyle = pg; rr(ctx, x - 9, this.dockTop, 18, fy - this.dockTop + 6, 6); ctx.fill();
        ctx.strokeStyle = OL; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = tint(th.sea ? '#e8e2d0' : '#4c8f3a', L);
        for (let i = 0; i < 3; i++) { const yy = sy + 40 + i * 70 + Math.sin(x) * 20; if (yy < fy - 10) { rr(ctx, x - 10, yy, 20, 8, 4); ctx.fill(); } }
      }
      // floor
      const sand = tint(th.sand, L, 0.7);
      ctx.fillStyle = sand;
      ctx.beginPath(); ctx.moveTo(0, fy);
      for (let x = 0; x <= W + 40; x += 40) ctx.quadraticCurveTo(x + 20, fy - 7 - Math.sin(x * 0.7) * 5, x + 40, fy);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      ctx.strokeStyle = tint(th.sandLine, L, 0.7); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = tint(A.shade(th.sand, -0.1), L, 0.7);
      for (let i = 0; i < W / 18; i++) { ctx.beginPath(); ctx.arc((i * 37) % W, fy + 6 + (i * 7) % 14, 1.5, 0, TAU); ctx.fill(); }
      for (const p of this.pebbles) {
        ctx.fillStyle = tint(p.c, L, 0.7); ctx.beginPath(); ctx.ellipse(p.x, fy + 2 + p.y * 0.6, p.r * 1.3, p.r, 0, 0, TAU); ctx.fill();
      }
      // rocks
      for (const r of this.rocks) {
        ctx.fillStyle = tint(r.c, L, 0.7);
        ctx.beginPath(); ctx.ellipse(r.x, fy + 2, r.r * 1.3, r.r * 0.8, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(43,29,22,0.55)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(r.x - r.r * 0.4, fy - r.r * 0.45, r.r * 0.35, r.r * 0.16, -0.3, 0, TAU); ctx.fill();
      }
      if (th.chest) { this.drawChest(ctx, this.chest.x, fy, L); this.drawBoot(ctx, this.boot.x, fy, L); }
      if (th.log) this.drawLog(ctx, W * 0.66, fy, L);
      if (th.corals) this.drawCorals(ctx, fy, L, t);
      // seaweed
      for (const w of this.weeds) {
        const c = tint(w.c, L, 0.7);
        ctx.fillStyle = c; ctx.strokeStyle = A.shade(c, -0.3); ctx.lineWidth = 1.5;
        ctx.beginPath();
        const n = 6, pts = [];
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          pts.push([w.x + Math.sin(t * 1.2 + w.ph + k * 2.2) * 10 * k + (th.current ? k * k * 14 : 0), fy + 4 - w.h * k]);
        }
        ctx.moveTo(pts[0][0] - w.w / 2, pts[0][1]);
        for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0] - (w.w / 2) * (1 - i / n), pts[i][1]);
        for (let i = n; i >= 0; i--) ctx.lineTo(pts[i][0] + (w.w / 2) * (1 - i / n), pts[i][1]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // ambient fish
      for (const f of this.ambient) this.drawAmbient(ctx, f, t);
      // co-op boss
      if (this.boss) this.drawBoss(ctx, t);
      // target fish (silhouettes) of every player
      for (const p of this.players.values()) if (p.fish && p.fish.mode !== 'land') this.drawFish(ctx, p.fish, true, 1);

      // water tint overlay (depth fog)
      const o = ctx.createLinearGradient(0, sy, 0, H);
      o.addColorStop(0, rgba(th.fog, 0.12));
      o.addColorStop(0.6, `rgba(16,70,130,${0.3 + (1 - L) * 0.2})`);
      o.addColorStop(1, `rgba(6,28,60,${0.45 + (1 - L) * 0.2})`);
      ctx.fillStyle = o; ctx.fillRect(0, sy, W, H - sy);
      if (th.mist) { ctx.fillStyle = 'rgba(60,80,40,0.18)'; ctx.fillRect(0, sy, W, H - sy); }

      // river current streaks
      if (th.current) {
        ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let i = 0; i < 9; i++) {
          const y = sy + 30 + (i * 53) % Math.max(40, fy - sy - 60), x = ((i * 131 + t * 70) % (W + 120)) - 60;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 40 + (i % 3) * 14, y); ctx.stroke();
        }
      }
      // light rays
      if (L > 0.15 && th.rays) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const x = (W / 5) * i + W * 0.08 + Math.sin(t * 0.25 + i * 1.7) * 26;
          const w = 26 + (i % 3) * 18;
          const rg = ctx.createLinearGradient(0, sy, 0, sy + (fy - sy) * 0.8);
          rg.addColorStop(0, `rgba(255,255,230,${0.13 * L * th.rays})`); rg.addColorStop(1, 'rgba(255,255,230,0)');
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + w, sy); ctx.lineTo(x + w + 90, sy + (fy - sy) * 0.8); ctx.lineTo(x + 50, sy + (fy - sy) * 0.8); ctx.fill();
        }
        ctx.restore();
      }
      // caustic band under the surface
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + 0.1 * L})`; ctx.lineWidth = 2;
      for (let row = 0; row < 2; row++) {
        ctx.beginPath();
        for (let x = 0; x <= W; x += 10) { const y = sy + 10 + row * 9 + Math.sin(x * 0.08 + t * 1.6 + row) * 2.5; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // bubbles
      for (const b of this.bubbles) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, TAU); ctx.fill();
      }
      // depth aim guide for the local player
      const me = this.players.get(this.localId);
      if (me && me.state === 'aim') {
        const rod = D.ROD_BY_ID[me.rod] || D.RODS[0];
        // where the bobber will land: the rod tip once the cast swings forward
        const saved = me.rodAngle; me.rodAngle = -0.5;
        const tip = this.rodTip(me); me.rodAngle = saved;
        const y = this.depthToY(me.power * rod.depth), ymax = this.depthToY(rod.depth);
        ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(tip.x + 4, sy + 6); ctx.lineTo(tip.x + 4, ymax); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, tip.x - 30, ymax - 2, 68, 4, 2); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(tip.x + 4, y, 7, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.font = '900 13px Nunito, system-ui, sans-serif'; ctx.textAlign = 'left';
        const label = (me.power * rod.depth * 12).toFixed(1) + ' м';
        ctx.lineWidth = 4; ctx.strokeText(label, tip.x + 16, y + 5); ctx.fillStyle = '#fff'; ctx.fillText(label, tip.x + 16, y + 5);
      }
    }

    drawBoss(ctx, t) {
      const b = this.boss;
      const src = this.silhouette(b.fish);
      if (!src) return;
      const w = this.bossSize(), h = w * src.h / src.w;
      const y = this.floorY - h * 0.55 - 10 + Math.sin(t * 0.8) * 6;
      ctx.save();
      ctx.translate(b.x, y);
      ctx.scale(b.dir, 1);
      ctx.rotate(Math.sin(t * 1.4) * 0.03);
      ctx.globalAlpha = 0.92;
      ctx.shadowColor = b.flash ? '#ffffff' : 'rgba(255,40,80,0.8)';
      ctx.shadowBlur = b.flash ? 30 : 16;
      ctx.drawImage(src.img, -w / 2, -h / 2, w, h);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      const ex = w * 0.36, ey = -h * 0.1, er = Math.max(4, w * 0.018);
      ctx.fillStyle = '#ff3b5c';
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,90,120,0.35)';
      ctx.beginPath(); ctx.arc(ex, ey, er * 2.6, 0, TAU); ctx.fill();
      if (b.flash) { ctx.globalAlpha = b.flash * 0.6; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, w * 0.4, h * 0.3, 0, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    drawAmbient(ctx, f, t) {
      const e = A.fishImage(f.species);
      if (!e.ready) return;
      const w = f.sz, h = f.sz * e.h / e.w;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.dir, 1);
      ctx.rotate(Math.sin(t * 2 + f.ph) * 0.04);
      const sq = 1 + Math.sin(t * 6 + f.ph) * 0.03;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(e.img, -w / 2, -h / 2, w * sq, h);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    drawFish(ctx, f, silhouette, alpha) {
      if (!ctx || !f) return false;
      const t = this.t;
      const src = silhouette ? this.silhouette(f.species) : A.fishImage(f.species);
      if (!src || (src.ready === false)) return true;
      const img = src.img;
      const w = f.sz, h = f.sz * src.h / src.w;
      ctx.save();
      ctx.translate(f.x, f.y);
      if (f.mode === 'land') ctx.rotate(Math.sin(f.t * 18) * 0.3);
      ctx.scale(f.dir || 1, 1);
      const wig = f.mode === 'fight' ? Math.sin(t * 22) * 0.08 : Math.sin(t * 5) * 0.03;
      ctx.rotate(wig);
      if (silhouette && f.mode === 'fight' && f.rarity) { ctx.shadowColor = D.RARITY[f.rarity].glow; ctx.shadowBlur = 18; }
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
      ctx.globalAlpha = 1;
      return true;
    }

    drawChest(ctx, x, fy, L) {
      ctx.save(); ctx.translate(x, fy - 2); ctx.rotate(-0.08);
      ctx.fillStyle = tint('#8d5a2b', L, 0.7); ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      rr(ctx, -20, -22, 40, 22, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tint('#a56a35', L, 0.7);
      ctx.beginPath(); ctx.moveTo(-20, -22); ctx.quadraticCurveTo(0, -42, 20, -22); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tint('#ffca28', L, 0.6);
      ctx.fillRect(-3, -26, 6, 12); ctx.strokeRect(-3, -26, 6, 12);
      ctx.fillStyle = 'rgba(255,230,120,0.8)'; ctx.beginPath(); ctx.arc(14, -30, 2, 0, TAU); ctx.fill();
      ctx.restore();
    }
    drawBoot(ctx, x, fy, L) {
      ctx.save(); ctx.translate(x, fy); ctx.rotate(0.35);
      ctx.fillStyle = tint('#5d4037', L, 0.7); ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-8, -30); ctx.lineTo(6, -30); ctx.lineTo(6, -8); ctx.quadraticCurveTo(22, -8, 22, 0); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    drawLog(ctx, x, fy, L) {
      ctx.save(); ctx.translate(x, fy - 8); ctx.rotate(-0.12);
      ctx.fillStyle = tint('#4e3b28', L, 0.7); ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      rr(ctx, -60, -12, 120, 24, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = tint('#7a5c3c', L, 0.7); ctx.beginPath(); ctx.ellipse(60, 0, 7, 12, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = tint('#6b8a32', L, 0.7); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-30, -12); ctx.quadraticCurveTo(-26, -30, -34, -42); ctx.moveTo(10, -12); ctx.quadraticCurveTo(16, -26, 8, -36); ctx.stroke();
      ctx.restore();
    }
    drawCorals(ctx, fy, L, t) {
      for (const c of this.corals) {
        const col = tint(c.c, L, 0.6);
        ctx.fillStyle = col; ctx.strokeStyle = A.shade(col, -0.35); ctx.lineWidth = 2; ctx.lineCap = 'round';
        if (c.kind === 0) {
          ctx.lineWidth = 5; ctx.strokeStyle = col;
          ctx.beginPath(); ctx.moveTo(c.x, fy); ctx.lineTo(c.x, fy - c.h); ctx.moveTo(c.x, fy - c.h * 0.5); ctx.lineTo(c.x - c.h * 0.4, fy - c.h * 0.85); ctx.moveTo(c.x, fy - c.h * 0.4); ctx.lineTo(c.x + c.h * 0.45, fy - c.h * 0.75); ctx.stroke();
        } else if (c.kind === 1) {
          ctx.beginPath(); ctx.ellipse(c.x, fy - c.h * 0.35, c.h * 0.6, c.h * 0.4, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else {
          // starfish
          ctx.beginPath();
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4 : 10; ctx.lineTo(c.x + Math.cos(a) * r, fy - 6 + Math.sin(a) * r); }
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
    }

    drawDock(ctx, W, L) {
      const top = this.dockTop, sy = this.surfaceY;
      const goth = this.season === 'goth';
      // lanterns
      const lamp = (x) => {
        ctx.fillStyle = tint('#7a4f2a', L); ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
        rr(ctx, x - 3, top - 54, 6, 54, 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, top - 54); ctx.lineTo(x + 12, top - 54); ctx.stroke();
        const glow = L < 0.6;
        const gc = goth ? '190,130,255' : '255,214,110';
        if (glow) {
          const g = ctx.createRadialGradient(x + 12, top - 44, 2, x + 12, top - 44, 46);
          g.addColorStop(0, `rgba(${gc},${0.55 * (1 - L)})`); g.addColorStop(1, `rgba(${gc},0)`);
          ctx.fillStyle = g; ctx.fillRect(x - 40, top - 96, 104, 104);
        }
        ctx.fillStyle = glow ? (goth ? '#d9b8ff' : '#ffe28a') : '#fff4c4';
        rr(ctx, x + 6, top - 52, 12, 15, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = tint('#3b2a1f', L); rr(ctx, x + 5, top - 55, 14, 4, 2); ctx.fill();
      };
      lamp(10); lamp(W - 26);
      // deck top
      const g = ctx.createLinearGradient(0, top - 4, 0, top + 6);
      g.addColorStop(0, tint('#d39a5c', L)); g.addColorStop(1, tint('#b77b40', L));
      ctx.fillStyle = g; ctx.fillRect(0, top - 4, W, 10);
      // front face planks
      const fg = ctx.createLinearGradient(0, top + 6, 0, sy + 8);
      fg.addColorStop(0, tint('#9b6533', L)); fg.addColorStop(1, tint('#7a4b24', L));
      ctx.fillStyle = fg; ctx.fillRect(0, top + 6, W, sy - top - 6);
      ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, top - 4); ctx.lineTo(W, top - 4); ctx.moveTo(0, top + 6); ctx.lineTo(W, top + 6); ctx.stroke();
      ctx.strokeStyle = 'rgba(43,29,22,0.45)'; ctx.lineWidth = 1.5;
      for (let x = 34; x < W; x += 58) { ctx.beginPath(); ctx.moveTo(x, top - 4); ctx.lineTo(x, top + 6); ctx.stroke(); }
      for (let x = 12; x < W; x += 47) { ctx.beginPath(); ctx.moveTo(x, top + 7); ctx.lineTo(x + 2, sy); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, top - 3, W, 2);
      ctx.fillStyle = tint('#5b3a1d', L);
      for (let x = 20; x < W; x += 58) { ctx.beginPath(); ctx.arc(x, top + 12, 1.6, 0, TAU); ctx.fill(); }
      // Goth season: jack-o'-lanterns by the lamps
      if (goth) { this.drawPumpkin(ctx, 30, top - 4, L, 0.9); this.drawPumpkin(ctx, W - 44, top - 4, L, 0.75); }
      // bucket by the solo player for the cozy vibe
      if (!this.solo) return;
      const bx = this.W * 0.62, by = top - 4;
      ctx.fillStyle = tint('#4fa3d8', L); ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bx - 14, by - 24); ctx.lineTo(bx + 14, by - 24); ctx.lineTo(bx + 11, by); ctx.lineTo(bx - 11, by); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx, by - 24, 14, 4, 0, 0, TAU); ctx.fillStyle = tint('#2f6f99', L); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 13, by - 24); ctx.quadraticCurveTo(bx, by - 46, bx + 13, by - 24); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx - 9, by - 20, 3, 14);
    }
    drawPumpkin(ctx, x, y, L, s) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = tint('#ff8a1f', L, 0.45); ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(0, -10, 13, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-5, -19); ctx.quadraticCurveTo(-7, -10, -5, -1); ctx.moveTo(5, -19); ctx.quadraticCurveTo(7, -10, 5, -1); ctx.stroke();
      ctx.fillStyle = '#5d7f3a'; rr(ctx, -2, -25, 4, 7, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = L < 0.6 ? '#ffe28a' : '#3a2010';
      ctx.beginPath(); ctx.moveTo(-8, -13); ctx.lineTo(-4, -16); ctx.lineTo(-3, -12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(8, -13); ctx.lineTo(4, -16); ctx.lineTo(3, -12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, -7); ctx.lineTo(4, -4); ctx.lineTo(0, -6); ctx.lineTo(-4, -4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    drawPads(ctx, t, L) {
      const th = this.theme;
      for (const p of this.pads) {
        const x = p.x, y = this.surfaceY + 1 + Math.sin(t * 1.4 + x) * 1.2, s = p.s;
        ctx.fillStyle = tint(this.loc === 'swamp' ? '#6b8a32' : '#5cb85c', L); ctx.strokeStyle = OL; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, 22 * s, 6 * s, 0, 0.25, TAU - 0.25); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (s > 0.9 && this.loc !== 'swamp') {
          ctx.fillStyle = '#ff9fc4';
          for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; ctx.beginPath(); ctx.ellipse(x + 6 + Math.cos(a) * 5, y - 6 + Math.sin(a) * 5, 3.5, 6, a + Math.PI / 2, 0, TAU); ctx.fill(); ctx.stroke(); }
          ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(x + 6, y - 6, 2.6, 0, TAU); ctx.fill();
        }
      }
      if (!th.reeds) return;
      // reeds at the corners
      const reeds = (x0, dir) => {
        for (let i = 0; i < 5; i++) {
          const x = x0 + dir * i * 7, h = 40 + (i % 3) * 16, sw = Math.sin(t * 1.1 + i) * 3;
          ctx.strokeStyle = tint('#4f8f3a', L); ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, this.surfaceY + 6); ctx.quadraticCurveTo(x + sw, this.surfaceY - h / 2, x + sw * 2, this.surfaceY - h); ctx.stroke();
          if (i % 2 === 0) { ctx.fillStyle = tint('#7a4f2a', L); rr(ctx, x + sw * 1.6 - 3, this.surfaceY - h + 2, 6, 15, 3); ctx.fill(); }
        }
      };
      reeds(4, 1); reeds(this.W - 4, -1);
    }

    drawPlayer(ctx, p, t) {
      // a unique pose shows while the player is idle and sends an emote
      const posing = p.emote && p.poseImg && p.poseImg.ready && p.state === 'idle';
      const e = posing ? p.poseImg : p.img;
      if (!e.ready) return;
      const s = p.scale, w = 200 * s, h = 260 * s;
      const breath = 1 + Math.sin(p.breath) * 0.012;
      const shake = p.shake ? Math.sin(t * 60) * p.shake * 1.5 : 0;
      ctx.save();
      ctx.translate(p.x + shake, this.dockTop + 2);
      ctx.scale(1, breath);
      ctx.drawImage(e.img, -w / 2, -254 * s - 2, w, h);
      ctx.restore();
      if (!posing) this.drawRod(ctx, p, t);
      else p._tip = this.rodTip(p);
    }

    drawRod(ctx, p, t) {
      const [c1, c2, c3] = A.rodColors(p.rod, p.skin);
      const skinned = p.skin && p.skin !== 'none';
      const hp = this.handPos(p), L = this.rodLen(p), s = p.scale;
      const dx = Math.cos(p.rodAngle), dy = Math.sin(p.rodAngle);
      const bx = hp.x - dx * L * 0.2, by = hp.y - dy * L * 0.2;
      const tip = this.rodTip(p);
      const cx = bx + dx * L * 0.62, cy = by + dy * L * 0.62;
      const pt = k => ({ x: (1 - k) * (1 - k) * bx + 2 * (1 - k) * k * cx + k * k * tip.x, y: (1 - k) * (1 - k) * by + 2 * (1 - k) * k * cy + k * k * tip.y });
      const wk = s / 0.36;
      ctx.lineCap = 'round';
      // outline pass then color pass, tapering
      for (const pass of [0, 1]) {
        const N = 10;
        for (let i = 0; i < N; i++) {
          const a = pt(i / N), b = pt((i + 1) / N);
          const wdt = lerp(5.2, 2, i / N) * wk;
          ctx.strokeStyle = pass ? (i < 3 ? (p.rod === 'bamboo' && !skinned ? '#b9874a' : c2) : c1) : OL;
          ctx.lineWidth = pass ? wdt : wdt + 3.2 * wk;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      // reel
      const r = pt(0.24);
      ctx.fillStyle = '#d7dee2'; ctx.strokeStyle = OL; ctx.lineWidth = 2 * wk;
      ctx.beginPath(); ctx.arc(r.x + 3 * wk, r.y + 3 * wk, 5 * wk, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c3; ctx.beginPath(); ctx.arc(r.x + 3 * wk, r.y + 3 * wk, 2.2 * wk, 0, TAU); ctx.fill();
      // hands over the grip
      const skin = D.SKINS[(p.look && p.look.skin) || 0];
      ctx.fillStyle = skin; ctx.lineWidth = 2.6 * wk;
      for (const k of [0.17, 0.31]) {
        const q = pt(k);
        ctx.beginPath(); ctx.arc(q.x, q.y, 4.6 * wk, 0, TAU); ctx.fill(); ctx.stroke();
      }
      p._tip = tip;
    }

    drawLine(ctx, p, t) {
      const tip = p._tip || this.rodTip(p);
      ctx.lineCap = 'round';
      if (p.state === 'reel' && p.fish) {
        const f = p.fish;
        const mx = f.x + f.dir * f.sz * 0.46, my = f.y;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(mx, my); ctx.stroke();
        // tension color hint on the line near the rod
        if (p.tension > 0.75) {
          ctx.strokeStyle = `rgba(255,80,80,${(p.tension - 0.75) * 3})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(lerp(tip.x, mx, 0.3), lerp(tip.y, my, 0.3)); ctx.stroke();
        }
        return;
      }
      if (!p.bob.vis) return;
      const b = p.bob;
      const by = b.y + (p.state === 'cast' ? 0 : b.sub * 9);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y);
      const sag = p.state === 'cast' ? 0 : 10;
      ctx.quadraticCurveTo((tip.x + b.x) / 2 + 4, (tip.y + by) / 2 + sag, b.x, by - 10);
      ctx.stroke();
      if (p.state !== 'cast' && p.hookY > this.surfaceY + 2) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(b.x, by + 6); ctx.quadraticCurveTo(b.x + Math.sin(t) * 3, (by + p.hookY) / 2, b.x, p.hookY - 4); ctx.stroke();
        this.drawHook(ctx, b.x, p.hookY, t);
      }
    }

    drawHook(ctx, x, y, t) {
      ctx.strokeStyle = '#cfd8dc'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 5); ctx.arc(x - 3.5, y + 5, 3.5, 0, Math.PI * 0.9); ctx.stroke();
      // wiggly worm
      ctx.strokeStyle = '#ff8fa6'; ctx.lineWidth = 3.4;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const k = i / 6, xx = x - 2 + Math.sin(t * 6 + k * 5) * 3, yy = y + 2 + k * 12;
        i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
    }

    drawBobber(ctx, p, t) {
      if (!p.bob.vis || p.state === 'reel') return;
      const b = p.bob, s = clamp(p.scale / 0.36, 0.85, 1.35);
      const bobY = p.state === 'cast' ? b.y : b.y + Math.sin(t * 2.4 + p.slot) * 1.5 + b.sub * 12 * s;
      ctx.save();
      ctx.translate(b.x, bobY);
      ctx.rotate(p.state === 'cast' ? -b.fly * 2 : Math.sin(t * 1.8 + p.slot) * 0.08);
      ctx.scale(s, s);
      ctx.strokeStyle = OL; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -9); ctx.stroke();
      ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(0, -2, 8, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff8ef'; ctx.beginPath(); ctx.arc(0, -2, 8, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-3, -6, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, -19, 2.2, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (p.state !== 'cast') {
        // the submerged half is covered with the actual water colour (a fixed day colour glowed at night)
        const L = this.sky ? this.sky.light : 1;
        ctx.save();
        ctx.beginPath(); ctx.rect(b.x - 14 * s, this.surfaceY + 1, 28 * s, 20 * s); ctx.clip();
        ctx.fillStyle = rgba(this.waterTop || '#43bde6', 0.82);
        ctx.beginPath(); ctx.ellipse(b.x, this.surfaceY + 1, 10.5 * s, 13 * s, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.45 * L})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(b.x, this.surfaceY + 1, 11 * s, 2.5, 0, 0, TAU); ctx.stroke();
      }
    }

    drawLabels(ctx, p, t) {
      const s = p.scale;
      const headY = this.dockTop - 262 * s - 8;
      // name tag
      const me = p.id === this.localId;
      if (!this.showLabels) { this.drawBubbles(ctx, p, t, headY); return; }
      ctx.font = `900 ${this.solo ? 14 : 11}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const maxW = (this.solo ? 180 : this.W * 0.175) - 26;
      let label = (p.name || 'Рыбак').slice(0, 14);
      while (label.length > 2 && ctx.measureText(label).width > maxW) label = label.slice(0, -2) + '…';
      const tw = ctx.measureText(label).width;
      const lw = tw + 30, lh = 18;
      const lx = p.x - lw / 2, ly = headY - lh;
      ctx.fillStyle = me ? '#ffd23f' : 'rgba(255,255,255,0.92)'; ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      rr(ctx, lx, ly, lw, lh, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5c7cfa'; ctx.beginPath(); ctx.arc(lx + 9, ly + lh / 2, 7, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '900 9px Nunito, system-ui, sans-serif'; ctx.fillText(String(p.level), lx + 9, ly + lh / 2 + 3.2);
      ctx.font = `900 ${this.solo ? 14 : 11}px Nunito, system-ui, sans-serif`;
      ctx.fillStyle = OL; ctx.fillText(label, p.x + 7, ly + lh / 2 + 4);

      this.drawBubbles(ctx, p, t, ly);
    }

    drawBubbles(ctx, p, t, ly) {
      ctx.textAlign = 'center';
      const minY = this.insetTop + 86; // never under the top HUD / Telegram header
      // "!" on bite
      if (p.state === 'bite' && p.bang) {
        const bounce = Math.abs(Math.sin(p.bang * 9)) * 6;
        const bx = clamp(p.x, 20, this.W - 20), by = Math.max(minY, ly - 18 - bounce);
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = OL; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(bx, by, 15, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = OL; ctx.font = '900 22px Nunito, system-ui, sans-serif'; ctx.fillText('!', bx, by + 8);
      }
      // emote bubble
      if (p.emote) {
        const k = p.emote.t;
        const pop = k < 0.2 ? k / 0.2 : k > 2.3 ? (2.6 - k) / 0.3 : 1;
        const bx = clamp(p.x, 24, this.W - 24), by = Math.max(minY, ly - 26 - (p.state === 'bite' && p.bang ? 36 : 0));
        ctx.save(); ctx.translate(bx, by); ctx.scale(pop, pop);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
        rr(ctx, -20, -18, 40, 34, 14); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7, 15); ctx.lineTo(0, 25); ctx.lineTo(7, 15); ctx.fill(); ctx.beginPath(); ctx.moveTo(-7, 16.5); ctx.lineTo(0, 25); ctx.lineTo(7, 16.5); ctx.stroke();
        ctx.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText((D.EMOTE_BY_ID[p.emote.e] || D.EMOTES[0]).e, 0, 7);
        ctx.restore();
      }
    }
  }

  window.HScene = Scene;
  window.HScene.EMOTES = Object.fromEntries(D.EMOTES.map(e => [e.id, e.e]));
})();
