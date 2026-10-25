/* Hooked — fishing gameplay: input, minigame, HUD and room events */
(function () {
  'use strict';
  const D = window.HData, A = window.HArt, S = window.HAudio, N = window.HNet;
  const tg = window.Telegram && window.Telegram.WebApp;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const haptic = (kind, v) => {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === 'impact') tg.HapticFeedback.impactOccurred(v || 'light');
      else if (kind === 'notify') tg.HapticFeedback.notificationOccurred(v || 'success');
      else tg.HapticFeedback.selectionChanged();
    } catch { /* not in Telegram */ }
  };
  const nextFrame = /[?&]demo/.test(location.search) ? fn => setTimeout(fn, 16) : fn => requestAnimationFrame(fn);
  const fishName = id => (D.FISH_BY_ID[id] || {}).name || 'рыбу';

  const G = {
    scene: null, app: null, room: null, myId: null, active: false,
    state: 'idle', holding: false, power: 0, powerDir: 1, castBusy: false,
    fight: null, tension: 0, progress: 0, rush: false, phaseT: 0, overT: 0, slackT: 0, sendT: 0,
    hooked: null, tutorialStep: 0,

    init(scene, app) {
      this.scene = scene; this.app = app;
      scene.on('sound', e => {
        if (e.s === 'whoosh' || e.s === 'plop' || e.s === 'splash' || e.s === 'snap') S.play(e.s);
        else if (e.id === this.myId) S.play(e.s);
      });
      scene.on('landed', e => { if (e.id === this.myId && this.pendingCatch) { const c = this.pendingCatch; this.pendingCatch = null; this.app.showCatch(c.fish, c.profile); } });
      let last = performance.now();
      const loop = () => { const now = performance.now(); const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (this.active) this.tick(dt); nextFrame(loop); };
      nextFrame(loop);
    },

    /* ---------- room lifecycle ---------- */
    enter(room) {
      this.room = room;
      this.active = true;
      this.state = 'idle'; this.holding = false; this.pendingCatch = null;
      const sc = this.scene;
      sc.clearPlayers();
      sc.localId = this.myId;
      sc.showLabels = true;
      sc.setRoom(room);
      for (const p of room.players) sc.addPlayer(p);
      this.renderHud();
      this.app.onGameEnter(room);
      if (!(window.HStore.get('tutorialDone'))) this.tutorial(0);
    },
    exit() {
      this.active = false;
      this.room = null;
      this.state = 'idle';
      document.getElementById('hud').hidden = true;
      document.getElementById('hud').innerHTML = '';
    },
    leave() {
      N.send({ t: 'leave' });
      this.exit();
      this.app.onGameLeave();
    },

    /* ---------- HUD ---------- */
    renderHud() {
      const hud = document.getElementById('hud');
      const r = this.room;
      const solo = r.solo;
      hud.hidden = false;
      hud.innerHTML = `
        <div class="hud-top">
          <button class="icon-btn" id="hud-back" aria-label="Назад">${A.icon('back', '#ffb84d', 26)}</button>
          <div class="room-pill" id="room-pill">
            <div class="rn"><div>${solo ? 'Тихое озеро' : esc(r.name)}</div><small>${solo ? 'СОЛО' : A.icon(r.isPublic ? 'globe' : 'lock', r.isPublic ? '#7fd4f5' : '#ffd23f', 13) + ' ' + r.code}</small></div>
            <span class="cnt" id="room-cnt">${A.icon('users', '#fff', 18)}${r.players.length}/${r.max}</span>
          </div>
          <div class="spacer"></div>
          <div class="chip coins" id="hud-coins">${A.icon('coin', '', 28)}<span class="num">${fmt(this.app.profile.coins)}</span></div>
        </div>
        <div class="feed" id="feed"></div>
        <div class="reel-ui" id="reel-ui" hidden>
          <div class="hint"><span id="reel-hint">Держи, чтобы тянуть!</span><span class="rar" id="reel-rar">?</span></div>
          <div class="gauge"><div class="needle" id="needle"></div></div>
          <div class="gauge-labels"><span>слабо</span><span>отлично</span><span>опасно</span><span>обрыв!</span></div>
          <div class="dist"><i id="dist"></i></div>
        </div>
        <button class="btn white sm cancel-btn" id="cancel-btn" hidden>${A.icon('hook', '#9fd2ff', 20)} Смотать</button>
        <div class="tutorial" id="tut" hidden></div>
        <div class="hud-bottom">
          <button class="icon-btn hud-side" id="emote-btn" aria-label="Эмоции"><span style="font-size:28px;line-height:1">😊</span></button>
          <div class="cast-wrap">
            <svg class="cast-ring" viewBox="0 0 138 138"><circle class="bg" cx="69" cy="69" r="62"/><circle class="fg" id="ring" cx="69" cy="69" r="62" stroke-dasharray="389.6" stroke-dashoffset="389.6"/></svg>
            <button class="cast-btn" id="cast-btn"></button>
          </div>
          <button class="icon-btn hud-side" id="side-btn" aria-label="${solo ? 'Звук' : 'Пригласить'}">${solo ? A.icon(S.sfxOn ? 'sound' : 'mute', '#9fd2ff', 28) : A.icon('share', '#7ee081', 28)}</button>
        </div>`;
      hud.querySelector('#hud-back').onclick = () => { S.play('click'); this.leave(); };
      hud.querySelector('#room-pill').onclick = () => { if (!solo) { S.play('click'); this.app.roomInfoModal(this.room); } };
      hud.querySelector('#cancel-btn').onclick = () => { S.play('click'); if (this.state === 'wait') N.send({ t: 'cancel' }); };
      hud.querySelector('#emote-btn').onclick = () => this.toggleEmotes();
      hud.querySelector('#side-btn').onclick = e => {
        S.play('click');
        if (solo) { S.setSfx(!S.sfxOn); e.currentTarget.innerHTML = A.icon(S.sfxOn ? 'sound' : 'mute', '#9fd2ff', 28); }
        else this.app.invite(this.room);
      };
      const btn = hud.querySelector('#cast-btn');
      btn.addEventListener('pointerdown', e => { e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch { /* old webview */ } this.press(); });
      const up = e => { e.preventDefault(); this.release(); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', e => e.preventDefault());
      this.updateButton();
    },
    updateCount() {
      const el = document.getElementById('room-cnt');
      if (el && this.room) el.innerHTML = `${A.icon('users', '#fff', 18)}${this.room.players.length}/${this.room.max}`;
    },
    updateCoins() {
      const el = document.querySelector('#hud-coins .num');
      if (el) el.textContent = fmt(this.app.profile.coins);
    },
    updateButton() {
      const b = document.getElementById('cast-btn');
      if (!b) return;
      const st = this.state;
      b.className = 'cast-btn' + (st === 'wait' ? ' hook' : st === 'bite' ? ' bite' : st === 'reel' ? ' reel' : '') + (this.holding ? ' pressed' : '');
      const labels = {
        idle: [A.icon('rod', '#fff', 30), 'ЗАБРОС', 'зажми'],
        aim: [A.icon('rod', '#fff', 30), 'ЗАБРОС', 'отпусти!'],
        cast: [A.icon('rod', '#fff', 30), '…', ''],
        wait: [A.icon('hook', '#fff', 30), 'ПОДСЕЧЬ', 'жди клёва'],
        bite: [A.icon('hook', '#fff', 30), 'ПОДСЕЧЬ!', 'жми!'],
        reel: [A.icon('fish', '#fff', 30), 'ТЯНИ!', 'держи'],
        busy: [A.icon('fish', '#fff', 30), '…', ''],
      }[st] || ['', '', ''];
      b.innerHTML = `${labels[0]}<span>${labels[1]}</span>${labels[2] ? `<small>${labels[2]}</small>` : ''}`;
      document.getElementById('cancel-btn').hidden = st !== 'wait';
      document.getElementById('reel-ui').hidden = st !== 'reel';
      if (st !== 'aim') this.setRing(0);
    },
    setRing(v, color) {
      const r = document.getElementById('ring');
      if (!r) return;
      r.style.strokeDashoffset = String(389.6 * (1 - v));
      r.style.stroke = color || '#ffd23f';
    },
    feed(html) {
      const f = document.getElementById('feed');
      if (!f) return;
      const d = document.createElement('div');
      d.innerHTML = html;
      f.appendChild(d);
      while (f.children.length > 3) f.firstChild.remove();
      setTimeout(() => d.remove(), 4100);
    },
    bigMsg(text, color) {
      const hud = document.getElementById('hud');
      if (!hud) return;
      const d = document.createElement('div');
      d.className = 'big-msg outline';
      d.style.color = color || '#fff';
      d.textContent = text;
      hud.appendChild(d);
      setTimeout(() => d.remove(), 1500);
    },
    toggleEmotes() {
      S.play('pop');
      const hud = document.getElementById('hud');
      const ex = hud.querySelector('.emote-pop');
      if (ex) return ex.remove();
      const pop = document.createElement('div');
      pop.className = 'emote-pop';
      pop.innerHTML = Object.entries(window.HScene.EMOTES).map(([k, e]) => `<button data-e="${k}">${e}</button>`).join('');
      pop.onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        N.send({ t: 'emote', e: b.dataset.e });
        pop.remove();
      };
      hud.appendChild(pop);
    },
    tutorial(step) {
      const el = document.getElementById('tut');
      if (!el) return;
      const tips = [
        'Зажми «Заброс» и отпусти — чем сильнее, тем глубже крючок 🎣',
        'Жди! Подсекай только когда поплавок уйдёт под воду и появится «!»',
        'Держи «Тяни», но отпускай, когда рыба делает рывок и стрелка в красном!',
      ];
      if (step >= tips.length) { el.hidden = true; window.HStore.set('tutorialDone', true); return; }
      this.tutorialStep = step;
      el.textContent = tips[step];
      el.hidden = false;
    },

    /* ---------- input ---------- */
    press() {
      S.unlock();
      const st = this.state;
      if (st === 'idle') {
        this.state = 'aim'; this.holding = true; this.power = 0; this.powerDir = 1;
        this.scene.aim(this.myId, 0);
        haptic('select');
      } else if (st === 'wait' || st === 'bite') {
        N.send({ t: 'hook' });
        haptic('impact', 'medium');
        this.holding = true;
      } else if (st === 'reel') {
        this.holding = true;
      }
      this.updateButton();
    },
    release() {
      if (!this.holding) return;
      this.holding = false;
      if (this.state === 'aim') {
        const power = clamp(this.power, 0.05, 1);
        const rod = D.ROD_BY_ID[this.myRod()] || D.RODS[0];
        this.state = 'cast';
        this.localCast = Date.now();
        this.scene.cast(this.myId, clamp(power * rod.depth, 0.04, 1));
        N.send({ t: 'cast', power });
        haptic('impact', 'light');
        if (this.tutorialStep === 0 && !document.getElementById('tut').hidden) this.tutorial(1);
        setTimeout(() => { if (this.state === 'cast') { this.state = 'wait'; this.updateButton(); } }, 950);
      }
      this.updateButton();
    },
    myRod() { const p = this.room && this.room.players.find(x => x.id === this.myId); return (p && p.rod) || this.app.profile.rod; },

    /* ---------- per-frame ---------- */
    tick(dt) {
      if (this.state === 'aim' && this.holding) {
        this.power += this.powerDir * dt / 1.15;
        if (this.power >= 1) { this.power = 1; this.powerDir = -1; }
        if (this.power <= 0) { this.power = 0; this.powerDir = 1; }
        this.scene.aim(this.myId, this.power);
        this.setRing(this.power, this.power > 0.85 ? '#ff6b6b' : this.power > 0.5 ? '#ffa62b' : '#ffd23f');
      }
      if (this.state === 'reel' && this.fight) this.reelTick(dt);
    },

    startFight(fight, species) {
      const rod = D.ROD_BY_ID[this.myRod()] || D.RODS[0];
      this.fight = Object.assign({}, fight, { rod, species });
      this.tension = 0.35; this.progress = 0.04; this.rush = false; this.phaseT = 1.2;
      this.overT = 0; this.slackT = 0; this.sendT = 0; this.reelSound = 0; this.warnT = 0;
      this.state = 'reel';
      const rar = D.RARITY[D.FISH_BY_ID[species].rarity];
      const tag = document.getElementById('reel-rar');
      tag.textContent = rar.name; tag.style.setProperty('--rc', rar.color);
      if (this.tutorialStep === 1 && !document.getElementById('tut').hidden) this.tutorial(2);
      this.updateButton();
    },

    reelTick(dt) {
      const f = this.fight, rod = f.rod;
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.rush) { this.rush = false; this.phaseT = 1.0 + Math.random() * 2.2 * (1.35 - f.rushiness); }
        else { this.rush = true; this.phaseT = 0.5 + Math.random() * (0.5 + f.strength * 0.9); haptic('impact', 'heavy'); }
      }
      const sq = Math.sqrt(rod.power);
      const holdTarget = this.rush ? (0.62 + f.strength * 0.55) / sq : (0.34 + f.strength * 0.25) / sq;
      const relTarget = this.rush ? 0.3 + f.strength * 0.15 : 0.05;
      const target = this.holding ? holdTarget : relTarget;
      const rate = this.holding ? (this.rush ? 1.6 : 1.1) : 1.4;
      this.tension += (target - this.tension) * Math.min(1, rate * dt) + (Math.random() - 0.5) * 0.02 * (this.rush ? 2 : 1);
      this.tension = clamp(this.tension, 0, 1);
      if (this.holding) this.progress += (this.rush ? 0.25 : 1) * rod.reel * 1.6 / f.stamina * dt;
      else this.progress -= (this.rush ? 0.06 + f.strength * 0.06 : 0.03) * dt;
      this.progress = clamp(this.progress, 0, 1);

      // failure conditions
      if (this.tension >= 0.97) this.overT += dt; else this.overT = Math.max(0, this.overT - dt * 2);
      if (this.tension < 0.14) this.slackT += dt; else this.slackT = Math.max(0, this.slackT - dt);

      const needle = document.getElementById('needle'), dist = document.getElementById('dist'), ui = document.getElementById('reel-ui'), hint = document.getElementById('reel-hint');
      if (needle) needle.style.left = (this.tension * 100).toFixed(1) + '%';
      if (dist) dist.style.width = (this.progress * 100).toFixed(1) + '%';
      const danger = this.tension > 0.8;
      if (ui) ui.classList.toggle('danger', danger);
      if (hint) hint.textContent = danger ? 'Отпусти! Леска трещит!' : this.slackT > 1 ? 'Тяни! Рыба уходит!' : this.rush ? 'Рывок! Осторожно…' : 'Держи, чтобы тянуть!';
      this.warnT -= dt;
      if (danger && this.warnT <= 0) { S.play('warn'); haptic('impact', 'rigid'); this.warnT = 0.35; }
      if (this.holding) { this.reelSound -= dt; if (this.reelSound <= 0) { S.play('reel'); this.reelSound = this.rush ? 0.14 : 0.08; } }

      this.scene.reel(this.myId, this.progress, this.tension);
      this.sendT -= dt;
      if (this.sendT <= 0) { N.send({ t: 'reel', p: +this.progress.toFixed(3), k: +this.tension.toFixed(3) }); this.sendT = 0.15; }

      if (this.overT > 0.25) return this.endFight('snap');
      if (this.slackT > 2.5) return this.endFight('escape');
      if (this.progress >= 1) return this.endFight('land');
    },

    endFight(result) {
      this.fight = null;
      this.holding = false;
      this.state = 'busy';
      if (result === 'land') N.send({ t: 'land' });
      else N.send({ t: 'fail', reason: result });
      this.updateButton();
    },

    /* ---------- server events ---------- */
    onMessage(m) {
      if (!this.active) return;
      const sc = this.scene, me = m.id === this.myId;
      const pl = id => this.room.players.find(p => p.id === id);
      switch (m.t) {
        case 'join':
          if (!pl(m.player.id)) this.room.players.push(m.player);
          sc.addPlayer(m.player); this.updateCount();
          this.feed(`👋 <b>${esc(m.player.name)}</b> пришёл порыбачить`);
          S.play('join');
          break;
        case 'leave': {
          const p = pl(m.id);
          this.room.players = this.room.players.filter(x => x.id !== m.id);
          sc.removePlayer(m.id); this.updateCount();
          if (p) this.feed(`🚪 <b>${esc(p.name)}</b> ушёл с озера`);
          break;
        }
        case 'player': {
          const i = this.room.players.findIndex(x => x.id === m.player.id);
          if (i >= 0) this.room.players[i] = m.player;
          sc.addPlayer(m.player);
          break;
        }
        case 'cast':
          if (me && this.localCast && Date.now() - this.localCast < 1500) { const p = sc.players.get(m.id); if (p) p.depth = m.depth; }
          else sc.cast(m.id, m.depth);
          if (me) this.localCast = 0;
          break;
        case 'approach': sc.approach(m.id, m.species, m.weight); break;
        case 'nibble':
          sc.nibble(m.id);
          if (me) haptic('impact', 'light');
          break;
        case 'bite':
          sc.bite(m.id);
          if (me) { this.state = 'bite'; this.updateButton(); haptic('notify', 'warning'); }
          break;
        case 'missed':
          sc.missed(m.id);
          if (me) {
            this.state = 'idle'; this.holding = false; this.updateButton();
            this.bigMsg(m.reason === 'early' ? 'Рано! Рыба испугалась' : 'Не успел…', '#ffd23f');
            S.play('miss'); haptic('notify', 'error');
          }
          break;
        case 'hooked':
          sc.hooked(m.id, m.species);
          if (me) { this.startFight(m.fight, m.species); haptic('notify', 'success'); S.play('splash'); }
          break;
        case 'reel': if (!me) sc.reel(m.id, m.p, m.k); break;
        case 'caught':
          sc.caught(m.id, m.fish.species);
          if (me) {
            this.state = 'idle'; this.holding = false; this.updateButton();
            this.pendingCatch = { fish: m.fish, profile: m.profile };
            haptic('notify', 'success');
            if (this.tutorialStep === 2) this.tutorial(3);
            setTimeout(() => { if (this.pendingCatch) { const c = this.pendingCatch; this.pendingCatch = null; this.app.showCatch(c.fish, c.profile); } }, 1500);
          } else {
            const p = pl(m.id);
            const f = D.FISH_BY_ID[m.fish.species];
            this.feed(`🎣 <b>${esc(p ? p.name : 'Рыбак')}</b> поймал(а) <b style="color:${D.RARITY[f.rarity].color}">${f.name}</b> · ${m.fish.weight.toFixed(2)} кг`);
            sc.floatText(m.id, `${m.fish.weight.toFixed(1)} кг`, D.RARITY[f.rarity].glow);
            if (D.RARITY_ORDER.indexOf(f.rarity) >= 3) this.bigMsg(`${f.name}!`, D.RARITY[f.rarity].color);
          }
          break;
        case 'lost':
          sc.lost(m.id, m.reason);
          if (me) {
            this.state = 'idle'; this.holding = false; this.updateButton();
            this.bigMsg(m.reason === 'snap' ? 'Леска порвалась!' : 'Рыба ушла…', '#ff8a8a');
            S.play('miss'); haptic('notify', 'error');
          }
          break;
        case 'reset':
          sc.reset(m.id);
          if (me) { this.state = 'idle'; this.updateButton(); }
          break;
        case 'emote':
          sc.emote(m.id, m.e);
          S.play('emote');
          break;
        case 'levelup': {
          const p = pl(m.id);
          if (p) { p.level = m.level; const e = sc.players.get(m.id); if (e) e.level = m.level; }
          this.feed(`⭐ <b>${esc(p ? p.name : 'Рыбак')}</b> достиг ${m.level} уровня!`);
          break;
        }
      }
    },
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function fmt(n) { return Number(n || 0).toLocaleString('ru-RU'); }

  window.HGame = G;
  window.HUtil = { esc, fmt, haptic, fishName };
})();
