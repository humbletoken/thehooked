/* Hooked — lake scene renderer (canvas 2D) */
(function () {
  'use strict';
  const D = window.HData, A = window.HArt;
  const OL = A.OL;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

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
      this.hourOverride = null;
      this.t = 0;
      this.ripples = [];
      this.parts = [];
      this.bubbles = [];
      this.ambient = [];
      this.texts = [];
      this.sil = new Map();
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

    resize() {
      const r = this.cv.getBoundingClientRect();
      const W = Math.max(280, r.width || window.innerWidth), H = Math.max(400, r.height || window.innerHeight);
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = W; this.H = H;
      this.cv.width = Math.round(W * this.dpr);
      this.cv.height = Math.round(H * this.dpr);
      this.surfaceY = Math.round(H * 0.36);
      this.horizonY = Math.round(this.surfaceY - Math.min(56, H * 0.075));
      this.dockTop = this.surfaceY - 12;
      this.floorY = H - 26;
      this.bgKey = '';
      this.layout();
      this.buildDecor();
    }

    depthToY(d) { return this.surfaceY + 34 + d * (this.floorY - this.surfaceY - 74); }

    /* ---------- players ---------- */
    setRoom(room) {
      this.solo = !room || room.max === 1;
      this.layout();
    }
    layout() {
      const W = this.W;
      // the group stands centered on the dock, ordered by seat
      const list = [...this.players.values()].sort((a, b) => a.slot - b.slot);
      list.forEach((p, i) => {
        if (this.solo) { p.scale = clamp(W / 200 * 0.42, 0.42, 0.62); p.tx = W * 0.3; }
        else { p.scale = clamp(W / 5 / 200 * 0.92, 0.3, 0.46); p.tx = W * (0.448 + (i - (list.length - 1) / 2) * 0.18); }
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
      Object.assign(p, { name: info.name, level: info.level || 1, slot: info.slot || 0, rod: info.rod || 'bamboo', look: info.look });
      p.img = A.charImage(info.look, 'fish');
      this.players.set(info.id, p);
      this.layout();
      if (info.state && info.state !== 'idle' && !old) { p.state = 'wait'; p.depth = info.depth || 0.3; this._placeCast(p, true); }
      return p;
    }
    removePlayer(id) { this.players.delete(id); }
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
    cast(id, depth) {
      const p = this.players.get(id); if (!p) return;
      p.state = 'cast'; p.depth = depth; p.castT = 0; p.fish = null; p.bend = 0; p.tension = 0; p.progress = 0;
      p.bob.vis = false;
      this.emit('sound', { s: 'whoosh', id });
    }
    _placeCast(p, instant) {
      const tip = this.rodTip(p);
      p.bob.x = tip.x + 4; p.bob.y = this.surfaceY; p.bob.vis = true; p.bob.sub = 0;
      p.hookY = instant ? this.depthToY(p.depth) : this.surfaceY + 6;
      p.state = 'wait';
    }
    approach(id, species, weight) {
      const p = this.players.get(id); if (!p || !p.bob.vis) return;
      const f = D.FISH_BY_ID[species];
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
      if (!p.fish) this.approach(id, species, null), p.fish && (p.fish.x = p.bob.x, p.fish.y = p.hookY);
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
      const f = p.fish || { species, sz: this.fishSize(species), x: p.bob.x, y: this.surfaceY + 20 };
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

    fishSize(species, weight) {
      const f = D.FISH_BY_ID[species];
      const t = weight == null ? 0.5 : (weight - f.minW) / Math.max(0.01, f.maxW - f.minW);
      const base = { crucian: 50, roach: 46, perch: 52, ruffe: 38, bream: 64, carp: 76, trout: 64, pike: 96, zander: 80, salmon: 88, catfish: 112, koi: 70, eel: 100, sturgeon: 124, goldfish: 46 }[species] || 56;
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
      const R = srand(Math.round(this.W) * 7 + 3);
      const W = this.W;
      this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: R() * W * 1.2, y: 18 + R() * (this.horizonY - 110), s: 0.6 + R() * 0.7, v: 4 + R() * 7 }));
      this.weeds = Array.from({ length: Math.round(W / 34) }, () => ({
        x: R() * W, h: 30 + R() * 70, w: 6 + R() * 6, ph: R() * TAU, c: ['#3f9e4a', '#2f8a46', '#5cb85c', '#6b9e2f'][Math.floor(R() * 4)],
      }));
      this.rocks = Array.from({ length: Math.round(W / 70) }, () => ({ x: R() * W, r: 10 + R() * 18, c: ['#8a8f98', '#9aa0a6', '#7b8088'][Math.floor(R() * 3)] }));
      this.posts = []; for (let x = 30; x < W; x += Math.max(90, W / 4.2)) this.posts.push(x);
      this.stars = Array.from({ length: 70 }, () => ({ x: R() * W, y: R() * (this.horizonY - 10), r: 0.6 + R() * 1.4, ph: R() * TAU }));
      this.birds = Array.from({ length: 3 }, () => ({ x: R() * W, y: 30 + R() * (this.horizonY * 0.4), v: 14 + R() * 10, ph: R() * TAU }));
      this.flies = Array.from({ length: 14 }, () => ({ x: R() * W, y: this.horizonY - 40 + R() * 70, ph: R() * TAU, v: 0.3 + R() * 0.5 }));
      this.pads = [{ x: W * 0.04, s: 1 }, { x: W * 0.96, s: 0.8 }, { x: W * 0.55, s: 0.6 }];
      this.chest = { x: W * 0.78 };
      this.boot = { x: W * 0.18 };
      this.ambient = [];
      const n = Math.round(clamp(W / 55, 5, 9));
      for (let i = 0; i < n; i++) this.spawnAmbient(true);
    }

    spawnAmbient(anywhere) {
      const night = D.isNight(this.hour);
      const pool = D.FISH.filter(f => f.rarity !== 'legendary' && (f.time === 'any' || (f.time === 'night') === night));
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
      const W = this.W, H = this.H, dpr = this.dpr;
      const sky = skyAt(hour);
      const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * dpr); c.height = Math.round(this.surfaceY * dpr) + 2; const x = c.getContext('2d'); x.scale(dpr, dpr); return [c, x]; };
      const [skyC, s] = mk();
      const g = s.createLinearGradient(0, 0, 0, this.horizonY);
      g.addColorStop(0, sky.top); g.addColorStop(1, sky.bottom);
      s.fillStyle = g; s.fillRect(0, 0, W, this.surfaceY);

      // sun / moon
      const night = sky.light < 0.3;
      const dayT = clamp((hour - 5.5) / 15, 0, 1);
      const nightT = ((hour + 24 - 20.5) % 24) / 9.5;
      const t = night ? nightT : dayT;
      const cx = lerp(W * 0.12, W * 0.88, t), cy = this.horizonY - Math.sin(t * Math.PI) * (this.horizonY * 0.72) + 10;
      if (night) {
        const mg = s.createRadialGradient(cx, cy, 6, cx, cy, 70);
        mg.addColorStop(0, 'rgba(255,250,220,0.35)'); mg.addColorStop(1, 'rgba(255,250,220,0)');
        s.fillStyle = mg; s.fillRect(cx - 70, cy - 70, 140, 140);
        s.fillStyle = '#fff6d6'; s.beginPath(); s.arc(cx, cy, 20, 0, TAU); s.fill();
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
      // mountains
      const R = srand(42 + Math.round(W));
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
      mtn(hz - 18, hz * 0.45, tint('#a9c9e6', L), true, 7);
      mtn(hz - 6, hz * 0.3, tint('#86b6d9', L), false, 19);
      // hills
      const hill = (y, amp, col, seed, dark) => {
        const r = srand(seed);
        l.fillStyle = col; l.beginPath(); l.moveTo(0, hz + 2);
        l.lineTo(0, y);
        for (let x = 0; x <= W + 80; x += 80) l.quadraticCurveTo(x + 40, y - amp * (0.5 + r() * 0.7), x + 80, y - amp * 0.2 * r());
        l.lineTo(W, hz + 2); l.closePath(); l.fill();
        if (dark) { l.strokeStyle = dark; l.lineWidth = 2; l.stroke(); }
      };
      hill(hz - 16, 26, tint('#8fd07e', L), 3);
      // trees
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
      for (let x = -10; x < W + 20; x += 14 + R() * 14) tree(x, hz - 8 - R() * 6, 26 + R() * 16, tint(R() < 0.5 ? '#3f8f4f' : '#4f9d55', L), R() < 0.35);
      hill(hz + 1, 10, tint('#5daa52', L), 11, tint('#3f8a40', L));
      for (let x = -6; x < W + 20; x += 22 + R() * 26) tree(x, hz + 2, 34 + R() * 22, tint(R() < 0.5 ? '#2f7d45' : '#3a8a4c', L), R() < 0.4);
      // shore line
      l.fillStyle = tint('#d9c08a', L); l.fillRect(0, hz - 1, W, 4);
      // back water strip with sky reflection
      const wg = l.createLinearGradient(0, hz, 0, this.surfaceY);
      wg.addColorStop(0, tint('#6fc7ea', L, 0.7)); wg.addColorStop(1, tint('#3aa6d6', L, 0.7));
      l.fillStyle = wg; l.fillRect(0, hz + 2, W, this.surfaceY - hz);
      l.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 9; i++) { const y = hz + 6 + R() * (this.surfaceY - hz - 10); rr(l, R() * W, y, 20 + R() * 50, 2.5, 1.5); l.fill(); }
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
      for (const f of this.ambient) {
        f.x += f.dir * f.v * dt;
        f.y += Math.sin(t * 1.3 + f.ph) * 6 * dt;
      }
      this.ambient = this.ambient.filter(f => f.x > -f.sz * 1.5 && f.x < this.W + f.sz * 1.5);
      while (this.ambient.length < Math.round(clamp(this.W / 55, 5, 9))) this.spawnAmbient(false);
      if (Math.random() < dt * 1.2) this.bubbles.push({ x: Math.random() * this.W, y: this.floorY - 6, r: 2 + Math.random() * 3, v: 30 + Math.random() * 30, ph: Math.random() * TAU });
      if (Math.random() < dt * 0.5) this.bubbles.push({ x: this.chest.x + 10, y: this.floorY - 22, r: 2.5, v: 36, ph: 0 });
      for (const b of this.bubbles) { b.y -= b.v * dt; b.x += Math.sin(t * 3 + b.ph) * 10 * dt; }
      this.bubbles = this.bubbles.filter(b => b.y > this.surfaceY + 4);
      for (const r of this.ripples) r.t += dt;
      this.ripples = this.ripples.filter(r => r.t < 1.2);
      for (const p of this.parts) {
        p.life -= dt * (p.type === 'line' ? 0.8 : 1.3);
        p.vy += 380 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type === 'drop' && p.y > this.surfaceY + 2 && p.vy > 0) p.life = 0;
      }
      this.parts = this.parts.filter(p => p.life > 0);
      for (const x of this.texts) x.t += dt;
      this.texts = this.texts.filter(x => x.t < 1.8);

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
          const ndir = tx > f.x + 0.5 ? 1 : tx < f.x - 0.5 ? -1 : f.dir;
          f.dir = ndir;
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
      const key = W + 'x' + H + ':' + Math.round(hour * 12);
      if (key !== this.bgKey) { this.buildBackground(hour); this.bgKey = key; }
      const L = this.sky.light;
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
      if (L > 0.5) {
        ctx.strokeStyle = 'rgba(40,40,60,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (const b of this.birds) {
          const f = Math.sin(t * 8 + b.ph) * 4;
          ctx.beginPath(); ctx.moveTo(b.x - 7, b.y - f); ctx.quadraticCurveTo(b.x - 3, b.y - 3, b.x, b.y); ctx.quadraticCurveTo(b.x + 3, b.y - 3, b.x + 7, b.y - f); ctx.stroke();
        }
      }
      ctx.drawImage(this.landLayer, 0, 0, W, this.surfaceY + 2 / this.dpr);
      // back water sparkle
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) {
        const x = (i * 97 + t * 12) % (W + 60) - 30, y = this.horizonY + 8 + (i * 13) % (this.surfaceY - this.horizonY - 14);
        ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 2 + i);
        rr(ctx, x, y, 14 + (i % 3) * 8, 2, 1); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // fireflies at night / dragonflies by day
      if (L < 0.4) {
        for (const f of this.flies) {
          const x = f.x + Math.sin(t * f.v + f.ph) * 20, y = f.y + Math.cos(t * f.v * 1.3 + f.ph) * 10;
          const a = 0.5 + 0.5 * Math.sin(t * 3 + f.ph);
          const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
          g.addColorStop(0, `rgba(255,245,140,${0.9 * a})`); g.addColorStop(1, 'rgba(255,245,140,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 9, y - 9, 18, 18);
        }
      } else {
        for (let i = 0; i < 2; i++) {
          const x = (W * (0.3 + i * 0.4)) + Math.sin(t * 0.7 + i * 3) * W * 0.18, y = this.horizonY - 20 + Math.sin(t * 1.9 + i) * 14;
          this.drawDragonfly(x, y, t + i);
        }
      }

      this.drawUnderwater(ctx, W, H, t, L);
      this.drawDock(ctx, W, L);

      // players (back to front by slot)
      const list = [...this.players.values()].sort((a, b) => a.slot - b.slot);
      for (const p of list) this.drawPlayer(ctx, p, t);
      for (const p of list) this.drawLine(ctx, p, t);

      // surface highlight wave
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) { const y = this.surfaceY + Math.sin(x * 0.05 + t * 2) * 1.6 + Math.sin(x * 0.11 - t * 1.3) * 1; x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
      this.drawPads(ctx, t, L);

      for (const p of list) this.drawBobber(ctx, p, t);
      // ripples
      for (const r of this.ripples) {
        if (r.t < 0) continue;
        const k = r.t / 1.2;
        ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(r.x, r.y + 1, r.max * k + 4, (r.max * k + 4) * 0.22, 0, 0, TAU); ctx.stroke();
      }
      // particles
      for (const p of this.parts) {
        if (p.type === 'drop') {
          ctx.globalAlpha = clamp(p.life, 0, 1);
          ctx.fillStyle = '#e8f8ff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(40,120,170,0.6)'; ctx.lineWidth = 1; ctx.stroke();
        } else if (p.type === 'line') {
          ctx.globalAlpha = clamp(p.life, 0, 1);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 10, p.y + 20, p.x - 6, p.y + 40); ctx.stroke();
        }
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
      const c = tint('#ffffff', L, 0.55), sh = tint('#d6ecfb', L, 0.6);
      const blobs = [[0, 0, 22], [24, -10, 26], [52, -2, 22], [74, 6, 16], [-18, 8, 15]];
      ctx.fillStyle = sh;
      for (const [dx, dy, r] of blobs) { ctx.beginPath(); ctx.arc(x + dx * s, y + (dy + 5) * s, r * s, 0, TAU); ctx.fill(); }
      ctx.fillStyle = c;
      for (const [dx, dy, r] of blobs) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, TAU); ctx.fill(); }
      ctx.fillRect(x - 18 * s, y, 92 * s, 12 * s);
      ctx.fillStyle = sh; ctx.fillRect(x - 18 * s, y + 12 * s, 92 * s, 4 * s);
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

    drawUnderwater(ctx, W, H, t, L) {
      const sy = this.surfaceY, fy = this.floorY;
      const top = tint('#43bde6', L, 0.75), mid = tint('#1f7fb6', L, 0.75), deep = tint('#0e3c6e', L, 0.7);
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
        ctx.fillStyle = tint('#4c8f3a', L);
        for (let i = 0; i < 3; i++) { const yy = sy + 40 + i * 70 + Math.sin(x) * 20; if (yy < fy - 10) { rr(ctx, x - 10, yy, 20, 8, 4); ctx.fill(); } }
      }
      // floor
      const sand = tint('#e4c98f', L, 0.7);
      ctx.fillStyle = sand;
      ctx.beginPath(); ctx.moveTo(0, fy);
      for (let x = 0; x <= W + 40; x += 40) ctx.quadraticCurveTo(x + 20, fy - 7 - Math.sin(x * 0.7) * 5, x + 40, fy);
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      ctx.strokeStyle = tint('#b99a5a', L, 0.7); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = tint('#cfb276', L, 0.7);
      for (let i = 0; i < W / 18; i++) { ctx.beginPath(); ctx.arc((i * 37) % W, fy + 6 + (i * 7) % 14, 1.5, 0, TAU); ctx.fill(); }
      // rocks
      for (const r of this.rocks) {
        ctx.fillStyle = tint(r.c, L, 0.7);
        ctx.beginPath(); ctx.ellipse(r.x, fy + 2, r.r * 1.3, r.r * 0.8, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(43,29,22,0.55)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(r.x - r.r * 0.4, fy - r.r * 0.45, r.r * 0.35, r.r * 0.16, -0.3, 0, TAU); ctx.fill();
      }
      this.drawChest(ctx, this.chest.x, fy, L);
      this.drawBoot(ctx, this.boot.x, fy, L);
      // seaweed
      for (const w of this.weeds) {
        const c = tint(w.c, L, 0.7);
        ctx.fillStyle = c; ctx.strokeStyle = A.shade(c, -0.3); ctx.lineWidth = 1.5;
        ctx.beginPath();
        const n = 6, pts = [];
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          pts.push([w.x + Math.sin(t * 1.2 + w.ph + k * 2.2) * 10 * k, fy + 4 - w.h * k]);
        }
        ctx.moveTo(pts[0][0] - w.w / 2, pts[0][1]);
        for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0] - (w.w / 2) * (1 - i / n), pts[i][1]);
        for (let i = n; i >= 0; i--) ctx.lineTo(pts[i][0] + (w.w / 2) * (1 - i / n), pts[i][1]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // ambient fish
      for (const f of this.ambient) this.drawAmbient(ctx, f, t);
      // target fish (silhouettes) of every player
      for (const p of this.players.values()) if (p.fish && p.fish.mode !== 'land') this.drawFish(ctx, p.fish, true, 1);

      // water tint overlay (depth fog)
      const o = ctx.createLinearGradient(0, sy, 0, H);
      o.addColorStop(0, `rgba(40,170,220,${0.12})`);
      o.addColorStop(0.6, `rgba(16,70,130,${0.3 + (1 - L) * 0.2})`);
      o.addColorStop(1, `rgba(6,28,60,${0.45 + (1 - L) * 0.2})`);
      ctx.fillStyle = o; ctx.fillRect(0, sy, W, H - sy);

      // light rays
      if (L > 0.15) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) {
          const x = (W / 5) * i + W * 0.08 + Math.sin(t * 0.25 + i * 1.7) * 26;
          const w = 26 + (i % 3) * 18;
          const rg = ctx.createLinearGradient(0, sy, 0, sy + (fy - sy) * 0.8);
          rg.addColorStop(0, `rgba(255,255,230,${0.13 * L})`); rg.addColorStop(1, 'rgba(255,255,230,0)');
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x + w, sy); ctx.lineTo(x + w + 90, sy + (fy - sy) * 0.8); ctx.lineTo(x + 50, sy + (fy - sy) * 0.8); ctx.fill();
        }
        ctx.restore();
      }
      // caustic band under the surface
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
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
      ctx.scale(f.dir, 1);
      const wig = f.mode === 'fight' ? Math.sin(t * 22) * 0.08 : Math.sin(t * 5) * 0.03;
      ctx.rotate(wig);
      if (silhouette && f.mode === 'fight') { ctx.shadowColor = D.RARITY[f.rarity].glow; ctx.shadowBlur = 18; }
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

    drawDock(ctx, W, L) {
      const top = this.dockTop, sy = this.surfaceY;
      // lanterns
      const lamp = (x) => {
        ctx.fillStyle = tint('#7a4f2a', L); ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
        rr(ctx, x - 3, top - 54, 6, 54, 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, top - 54); ctx.lineTo(x + 12, top - 54); ctx.stroke();
        const glow = L < 0.6;
        if (glow) {
          const g = ctx.createRadialGradient(x + 12, top - 44, 2, x + 12, top - 44, 46);
          g.addColorStop(0, `rgba(255,214,110,${0.55 * (1 - L)})`); g.addColorStop(1, 'rgba(255,214,110,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 40, top - 96, 104, 104);
        }
        ctx.fillStyle = glow ? '#ffe28a' : '#fff4c4';
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
      // bucket by the first player for the cozy vibe
      if (!this.solo) return;
      const bx = this.W * 0.62, by = top - 4;
      ctx.fillStyle = tint('#4fa3d8', L); ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bx - 14, by - 24); ctx.lineTo(bx + 14, by - 24); ctx.lineTo(bx + 11, by); ctx.lineTo(bx - 11, by); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(bx, by - 24, 14, 4, 0, 0, TAU); ctx.fillStyle = tint('#2f6f99', L); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 13, by - 24); ctx.quadraticCurveTo(bx, by - 46, bx + 13, by - 24); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx - 9, by - 20, 3, 14);
    }

    drawPads(ctx, t, L) {
      for (const p of this.pads) {
        const x = p.x, y = this.surfaceY + 1 + Math.sin(t * 1.4 + x) * 1.2, s = p.s;
        ctx.fillStyle = tint('#5cb85c', L); ctx.strokeStyle = OL; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, 22 * s, 6 * s, 0, 0.25, TAU - 0.25); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (s > 0.9) {
          ctx.fillStyle = '#ff9fc4';
          for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; ctx.beginPath(); ctx.ellipse(x + 6 + Math.cos(a) * 5, y - 6 + Math.sin(a) * 5, 3.5, 6, a + Math.PI / 2, 0, TAU); ctx.fill(); ctx.stroke(); }
          ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(x + 6, y - 6, 2.6, 0, TAU); ctx.fill();
        }
      }
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
      const e = p.img;
      if (!e.ready) return;
      const s = p.scale, w = 200 * s, h = 260 * s;
      const breath = 1 + Math.sin(p.breath) * 0.012;
      const shake = p.shake ? Math.sin(t * 60) * p.shake * 1.5 : 0;
      ctx.save();
      ctx.translate(p.x + shake, this.dockTop + 2);
      ctx.scale(1, breath);
      ctx.drawImage(e.img, -w / 2, -254 * s - 2, w, h);
      ctx.restore();
      this.drawRod(ctx, p, t);
    }

    drawRod(ctx, p, t) {
      const rod = D.ROD_BY_ID[p.rod] || D.RODS[0];
      const [c1, c2, c3] = rod.colors;
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
          ctx.strokeStyle = pass ? (i < 3 ? (p.rod === 'bamboo' ? '#b9874a' : c2) : c1) : OL;
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
      // clip: above the water full color, below faded
      const drawBody = () => {
        ctx.strokeStyle = OL; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -9); ctx.stroke();
        ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(0, -2, 8, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff8ef'; ctx.beginPath(); ctx.arc(0, -2, 8, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-3, -6, 2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, -19, 2.2, 0, TAU); ctx.fill(); ctx.stroke();
      };
      drawBody();
      ctx.restore();
      if (p.state !== 'cast') {
        // water line over the lower half
        ctx.save();
        ctx.beginPath(); ctx.rect(b.x - 14 * s, this.surfaceY + 1, 28 * s, 20 * s); ctx.clip();
        ctx.fillStyle = 'rgba(70,180,225,0.6)';
        ctx.beginPath(); ctx.ellipse(b.x, this.surfaceY + 1, 10.5 * s, 13 * s, 0, 0, TAU); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
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
      const s = p.scale;
      // "!" on bite
      if (p.state === 'bite' && p.bang) {
        const bounce = Math.abs(Math.sin(p.bang * 9)) * 6;
        const bx = clamp(p.x, 20, this.W - 20), by = ly - 18 - bounce;
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = OL; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(bx, by, 15, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = OL; ctx.font = '900 22px Nunito, system-ui, sans-serif'; ctx.fillText('!', bx, by + 8);
      }
      // emote bubble
      if (p.emote) {
        const k = p.emote.t;
        const pop = k < 0.2 ? k / 0.2 : k > 2.3 ? (2.6 - k) / 0.3 : 1;
        const bx = clamp(p.x, 24, this.W - 24), by = ly - 26 - (p.state === 'bite' && p.bang ? 36 : 0);
        ctx.save(); ctx.translate(bx, by); ctx.scale(pop, pop);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = OL; ctx.lineWidth = 2.5;
        rr(ctx, -20, -18, 40, 34, 14); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-7, 15); ctx.lineTo(0, 25); ctx.lineTo(7, 15); ctx.fill(); ctx.beginPath(); ctx.moveTo(-7, 16.5); ctx.lineTo(0, 25); ctx.lineTo(7, 16.5); ctx.stroke();
        ctx.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.fillText(EMOTES[p.emote.e] || '👋', 0, 7);
        ctx.restore();
      }
    }
  }

  const EMOTES = { wave: '👋', laugh: '😂', wow: '😮', party: '🎉', like: '👍', love: '😍' };

  window.HScene = Scene;
  window.HScene.EMOTES = EMOTES;
})();
