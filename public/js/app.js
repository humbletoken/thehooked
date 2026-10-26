/* Hooked — app shell: loading, menus, customization, rooms, collection, shop */
(function () {
  'use strict';
  const D = window.HData, A = window.HArt, S = window.HAudio, N = window.HNet, Game = window.HGame, U = window.HUtil;
  const tg = window.Telegram && window.Telegram.WebApp;
  const $ = s => document.querySelector(s);
  const { esc, fmt, haptic } = U;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const coin = (s = 22) => A.icon('coin', '', s);
  const fishName = id => (D.FISH_BY_ID[id] || { name: id }).name;
  const NAV_COLORS = { shop: '#ff8fab', home: '#4fc3f7', collection: '#ffd23f', info: '#7ee081', profile: '#c39bff' };
  const NAV_ICONS = { shop: 'bag', home: 'fish', collection: 'box', info: 'info', profile: 'user' };
  const LOC_COLORS = { lake: '#4fc3f7', river: '#26a69a', swamp: '#9ccc65', sea: '#5c8dff' };
  const TIPS = [
    'Совет: ночью клюют сом, судак и светящийся угорь 🌙',
    'Совет: чем глубже заброс — тем крупнее и реже рыба',
    'Совет: не подсекай, пока поплавок только дёргается!',
    'Совет: блесна приманивает щук и окуней',
    'Совет: зови друзей — в комнате до 5 рыбаков',
    'Совет: хорошая леска выдерживает сильные рывки',
    'Совет: в Goth-сезоне по ночам клюёт рыба-вампир 🦇',
  ];
  const crop = (look, box, opts) => A.character(look, opts).replace('viewBox="0 0 200 260"', `viewBox="${box}"`);

  const App = {
    profile: null, tab: 'home', scene: null, inGame: false, sub: null,
    params: new URLSearchParams(location.search),

    /* =================== boot =================== */
    async start() {
      this.setupTelegram();
      this.renderLoadingArt();
      const demo = this.params.get('demo') != null;
      const t0 = performance.now();
      const tipEl = $('#ld-tip');
      let tipI = Math.floor(Math.random() * TIPS.length);
      const tipTimer = setInterval(() => { tipEl.textContent = TIPS[tipI++ % TIPS.length]; }, 2600);
      const steps = [
        ['Разматываем леску…', async () => {
          if (document.fonts && document.fonts.load) await Promise.race([Promise.all([document.fonts.load('900 20px Nunito'), document.fonts.load('20px "Luckiest Guy"')]), sleep(2500)]).catch(() => {});
        }],
        ['Будим рыбу…', () => N.boot()],
        ['Рисуем озеро…', async () => {
          this.scene = new window.HScene($('#scene'));
          const h = parseFloat(this.params.get('hour'));
          if (!isNaN(h)) this.scene.hourOverride = h;
          this.applyInsets();
          await A.preload(D.FISH.map(f => A.fishImage(f.id)));
        }],
        ['Наживляем червячка…', async () => {
          if (demo && !N.online) N.local.seed(demoProfile());
          const r = await N.api('/api/me');
          this.profile = r.profile;
          this.applySeason();
        }],
        ['Почти готово…', async () => {
          await A.preload([A.charImage(this.profile.look, 'fish')]);
          Game.init(this.scene, this);
          this.connect();
        }],
      ];
      try {
        for (let i = 0; i < steps.length; i++) {
          tipEl.textContent = steps[i][0];
          await steps[i][1]();
          this.setLoad((i + 1) / steps.length);
        }
      } catch (e) {
        clearInterval(tipTimer);
        tipEl.innerHTML = `<b>${esc(e.message || 'Ошибка загрузки')}</b><br>Открой игру через бота @${esc((N.config && N.config.botUsername) || 'HookedGame')}`;
        return;
      }
      if (this.params.get('stay') === 'loading') { this.setLoad(0.66); clearInterval(tipTimer); tipEl.textContent = TIPS[0]; return; }
      const wait = 2300 - (performance.now() - t0);
      if (wait > 0) await sleep(wait);
      clearInterval(tipTimer);
      this.scene.start();
      S.setNight(D.isNight(this.scene.hour));
      $('#loading').classList.add('gone');
      setTimeout(() => $('#loading').remove(), 700);
      document.addEventListener('pointerdown', () => S.unlock(), { once: true });
      window.addEventListener('resize', () => this.applyInsets());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.profile && this.profile.customized && !this.inGame) this.refreshProfile().then(() => this.showInbox());
      });

      if (demo && !N.online && this.params.get('screen')) return this.runDemo(this.params.get('screen'));
      if (!this.profile.customized) this.openCustomize(true);
      else { this.setTab('home'); this.showInbox(); }
      this.handleDeepLink();
    },

    setupTelegram() {
      if (!tg) return;
      try {
        tg.ready(); tg.expand();
        if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        // phones: immersive fullscreen + portrait lock (Bot API 8.0+); Telegram exposes safe-area CSS vars we pad with
        if (/^(ios|android)$/.test(tg.platform) && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
          if (tg.requestFullscreen) tg.requestFullscreen();
          if (tg.lockOrientation) tg.lockOrientation();
        }
        if (tg.setHeaderColor) tg.setHeaderColor('#49b8ff');
        if (tg.setBackgroundColor) tg.setBackgroundColor('#49b8ff');
        if (tg.setBottomBarColor) tg.setBottomBarColor('#262b57');
        tg.BackButton.onClick(() => this.back());
        // the scene keeps heads and emote bubbles below Telegram's header — re-measure whenever the safe area moves
        const ins = () => requestAnimationFrame(() => this.applyInsets());
        for (const ev of ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged']) tg.onEvent(ev, ins);
      } catch { /* old client */ }
    },
    // --safe-t (CSS) combines env() and Telegram's safe-area variables; a hidden probe turns it into pixels for the canvas
    applyInsets() {
      if (!this.scene) return;
      let probe = document.getElementById('safe-probe');
      if (!probe) { probe = document.createElement('div'); probe.id = 'safe-probe'; document.body.appendChild(probe); }
      this.scene.setInsets(probe.offsetHeight);
    },
    applySeason() {
      const s = this.profile && this.profile.season;
      document.body.dataset.season = s ? s.id : '';
      if (this.scene) this.scene.setSeason(s ? s.id : null);
    },
    handleDeepLink() {
      const sp = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
      const room = this.params.get('room') || (/^room_([A-Z0-9]{5})$/i.exec(sp) || [])[1];
      if (room) { this.pendingJoin = room.toUpperCase(); if (this.profile.customized) this.joinRoom(this.pendingJoin); return; }
      const house = this.params.get('house') || (/^house_([A-Za-z0-9_-]{1,48})$/.exec(sp) || [])[1];
      if (house) { this.pendingHouse = house; if (this.profile.customized) this.runPending(); return; }
      if (!this.profile.customized) return;
      if (this.params.get('open') === 'pass' && this.profile.license) this.openSub('pass');
      else if (this.params.get('action') === 'coop' && this.profile.license) this.roomsModal();
    },
    runPending() {
      if (this.pendingJoin) return this.joinRoom(this.pendingJoin);
      if (this.pendingHouse) { const id = this.pendingHouse; this.pendingHouse = null; return this.visitHouse(id); }
      if (this.params.get('action') === 'coop' && this.profile.license) this.roomsModal();
    },
    updateBackButton() {
      if (!tg) return;
      const show = this.inGame || !!$('.modal-bg') || (!!this.sub && !(this.sub === 'custom' && !this.profile.customized));
      try { show ? tg.BackButton.show() : tg.BackButton.hide(); } catch { /* old client */ }
    },
    back() {
      const m = document.querySelectorAll('.modal-bg');
      if (m.length) return this.closeModal(m[m.length - 1]);
      if (this.inGame) return Game.leave();
      if (this.sub === 'custom') { if (this.profile.customized) this.setTab('profile'); return; }
      if (this.sub) this.closeSub();
    },

    renderLoadingArt() {
      $('#ld-logo').innerHTML = logoHtml();
      $('#ld-bob').innerHTML = A.bobberSvg(34);
    },
    setLoad(v) {
      $('#ld-fill').style.width = `calc(${(v * 100).toFixed(0)}% - 6px)`;
      $('#ld-bob').style.left = (v * 100).toFixed(0) + '%';
    },

    connect() {
      N.connect(m => this.onSocket(m), st => { this.socketState = st; });
    },
    onSocket(m) {
      switch (m.t) {
        case 'welcome': Game.myId = m.id; return;
        case 'room':
          if (this.inGame && Game.room && Game.room.id === m.room.id) { Game.room = m.room; Game.enter(m.room); return; }
          this.closeAllModals();
          if (this.sub && this.sub !== 'custom') this.sub = null;
          Game.enter(m.room);
          return;
        case 'left': return;
        case 'error': this.toast(m.msg, 'err'); S.play('error'); return;
        case 'kicked': this.toast('Игра открыта в другом окне', 'err'); if (this.inGame) { Game.exit(); this.onGameLeave(); } return;
        case 'pong': return;
      }
      if (m.profile && m.id === Game.myId) this.setProfile(m.profile, true);
      Game.onMessage(m);
    },

    setProfile(p, silent) {
      const old = this.profile;
      this.profile = p;
      if (old && JSON.stringify(old.look) !== JSON.stringify(p.look)) A.preload([A.charImage(p.look, 'fish')]);
      this.applySeason();
      Game.updateCoins();
      Game.updateBait();
      if (!silent && !this.inGame) this.refresh();
    },
    refresh() {
      if (this.sub === 'custom') return;
      if (this.sub) return this.renderSub(true);
      this.setTab(this.tab, true);
    },

    /* =================== navigation =================== */
    setTab(tab, keepScroll) {
      const prevScroll = keepScroll && $('.screen.scroll') ? $('.screen.scroll').scrollTop : 0;
      if (this.tab !== tab && !keepScroll) S.play('tab');
      this.tab = tab; this.sub = null; this.subData = null;
      $('#nav').hidden = false;
      this.renderNav();
      this.showMenuScene();
      const html = { home: () => this.homeHtml(), shop: () => this.shopHtml(), collection: () => this.collectionHtml(), info: () => this.infoHtml(), profile: () => this.profileHtml() }[tab]();
      $('#screens').innerHTML = html;
      const sc = $('.screen');
      if (keepScroll && sc) { sc.style.animation = 'none'; sc.scrollTop = prevScroll; }
      this['bind_' + tab] && this['bind_' + tab]();
      this.updateBackButton();
    },
    renderNav() {
      document.querySelectorAll('#nav [data-tab]').forEach(b => {
        const t = b.dataset.tab, on = t === this.tab;
        b.classList.toggle('on', on);
        b.innerHTML = A.icon(NAV_ICONS[t], on ? NAV_COLORS[t] : '#eef0ff', 32);
        b.onclick = () => { haptic('select'); this.setTab(t); };
      });
      const items = [...document.querySelectorAll('.nav-item')];
      const i = items.findIndex(b => b.dataset.tab === this.tab);
      const blob = $('.nav-blob');
      blob.style.opacity = i < 0 ? '0' : '1';
      if (i >= 0) blob.style.transform = `translateX(${i * 66}px)`;
    },
    showMenuScene() {
      const sc = this.scene, p = this.profile, m = p.meta || {};
      if (this.inGame) return;
      sc.clearPlayers();
      sc.localId = 'me';
      sc.showLabels = false;
      sc.setRoom({ max: 1, loc: p.license ? m.loc || 'lake' : 'lake' });
      sc.addPlayer({ id: 'me', name: p.name, look: p.look, rod: p.rod, slot: 0, level: p.level.level, skin: m.skin, effect: m.effect, pose: m.pose });
    },

    /* =================== screens =================== */
    topbar() {
      const p = this.profile, lv = p.level;
      return `<div class="topbar">
        <button class="me-chip" data-go="profile"><span class="ava">${A.avatar(p.look)}</span>
          <span><div class="nm">${esc(p.name)}</div><div class="lv">Уровень ${lv.level}</div><div class="xpbar"><i style="width:${(lv.cur / lv.need * 100).toFixed(0)}%"></i></div></span></button>
        <div class="spacer"></div>
        <div class="chip coins" id="coins-chip">${coin(28)}<span class="num">${fmt(p.coins)}</span></div>
      </div>`;
    },
    bindCommon() {
      document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => this.setTab(b.dataset.go));
      document.querySelectorAll('#screens [data-open]').forEach(b => b.onclick = () => { S.play('click'); this.openSub(b.dataset.open); });
    },
    lockedHtml(title, text) {
      return `<section class="screen scroll dim">
        ${this.topbar()}
        <div class="title outline">${title}</div>
        <div class="panel empty locked-panel"><div class="big">🔒</div>${text}<br><br><button class="btn sm" data-go="home">${A.icon('scroll', '#fff', 20)} К заданиям лицензии</button></div>
      </section>`;
    },

    homeHtml() {
      const p = this.profile;
      if (!p.license) {
        return `<section class="screen scroll home">
          ${this.topbar()}
          <div class="home-hero"><div class="logo small">${logoLetters()}</div></div>
          <div class="home-actions">${this.licenseCardHtml()}</div>
        </section>`;
      }
      const night = D.isNight(this.scene.hour);
      const loc = D.LOC_BY_ID[p.meta.loc] || D.LOCATIONS[0];
      const here = D.FISH.filter(f => f.loc.includes(loc.id) && !f.season);
      const timed = here.filter(f => f.time === (night ? 'night' : 'day'));
      const names = (timed.length ? timed : here).slice(0, 3).map(f => f.name.toLowerCase()).join(', ');
      const tag = `${night ? '🌙 Ночь' : '☀️ День'}: клюют ${names}`;
      const now = Date.now();
      const q = p.quests;
      const qLeft = q ? q.daily.concat(q.weekly).filter(x => !x.done).length : 0;
      const t = D.tournamentAt(now);
      const evN = D.eventSchedule(now).filter(e => e.active).length + (t && t.active ? 1 : 0);
      const inc = (p.trades && p.trades.incoming.length) || 0;
      const tile = (id, icon, color, label, badge) => `<button class="home-tile" data-open="${id}">${A.icon(icon, color, 30)}<span>${label}</span>${badge ? `<i class="badge">${badge}</i>` : ''}</button>`;
      return `<section class="screen scroll home">
        ${this.topbar()}
        ${this.passBannerHtml()}
        <div class="home-hero"><div class="logo small">${logoLetters()}</div></div>
        <div class="home-actions">
          <div class="home-tag">${tag}</div>
          <div class="loc-row">
            <button class="loc-chip" id="loc-btn" style="--lc:${LOC_COLORS[loc.id]}"><span class="em">${loc.emoji}</span><span class="stack"><b>${esc(loc.name)}</b><small>сменить локацию</small></span>${A.icon('pin', LOC_COLORS[loc.id], 24)}</button>
            <button class="btn white sm" id="play-code">${A.icon('key', '#ffd23f', 22)} Код</button>
          </div>
          <button class="btn xl block" id="play-solo"><span class="badge-ico">${A.icon('play', '#fff', 26)}</span><span class="stack">Играть соло<span class="sub">${esc(loc.name)} только для тебя</span></span></button>
          <div class="row">
            <button class="btn blue sm-col" id="play-create">${A.icon('users', '#bfe3ff', 30)}Создать комнату</button>
            <button class="btn orange sm-col" id="play-find">${A.icon('globe', '#ffe0a8', 30)}Найти комнату</button>
          </div>
          <div class="home-tiles ${N.online ? '' : 'three'}">
            ${tile('quests', 'scroll', '#7ee081', 'Задания', qLeft)}${tile('events', 'calendar', '#ffb84d', 'События', evN)}${tile('house', 'house', '#ffd9a8', 'Домик')}${N.online ? tile('trade', 'gift', '#ff8fab', 'Обмен', inc) : ''}
          </div>
        </div>
      </section>`;
    },
    bind_home() {
      this.bindCommon();
      const p = this.profile;
      $('#play-solo').onclick = () => { S.unlock(); S.play('click'); N.send({ t: 'create', solo: true, loc: p.license ? p.meta.loc : 'lake' }); };
      if (!p.license) {
        const ex = $('#lic-exam'); if (ex) ex.onclick = () => { S.play('click'); this.examModal(); };
        return;
      }
      $('#play-create').onclick = () => { S.play('click'); this.createRoomModal(); };
      $('#play-find').onclick = () => { S.play('click'); this.roomsModal(); };
      $('#play-code').onclick = () => { S.play('click'); this.codeModal(); };
      $('#loc-btn').onclick = () => { S.play('click'); this.locModal(); };
    },

    shopHtml() {
      const p = this.profile;
      if (!p.license) return this.lockedHtml('Магазин', 'Магазин откроется, когда ты получишь лицензию рыбака. Задания лицензии — на главном экране.');
      const sub = this.shopSub || 'rods';
      const owned = new Set(p.owned), m = p.meta;
      const season = D.seasonAt(Date.now());
      const gender = p.look.gender;
      let body = '';
      if (sub === 'rods') {
        const mx = { power: 1.95, reel: 1.7, luck: 2.2 };
        body = `<div class="list">${D.RODS.map(r => {
          const has = owned.has('rod:' + r.id), eq = p.rod === r.id;
          const bar = (k, v, c) => `<span>${k}</span><div class="stat-bar"><i style="width:${(v * 100).toFixed(0)}%;--c:${c}"></i></div>`;
          const act = eq ? `<button class="btn white sm" disabled>${A.icon('check', '#5ccf5c', 18)} Выбрана</button>`
            : has ? `<button class="btn blue sm" data-equip="${r.id}">Взять</button>`
              : `<button class="btn yellow sm" data-buy="rod:${r.id}" ${p.coins < r.price ? 'disabled' : ''}>${coin(20)} ${fmt(r.price)}</button>`;
          return `<div class="panel rod-card">${has ? `<span class="tag-owned">${eq ? 'в руках' : 'куплена'}</span>` : ''}
            <div class="art">${A.rodSvg(r.id, 84, eq ? m.skin : null)}</div>
            <div><h3>${r.name}</h3><p>${r.desc}</p>
              <div class="stats">${bar('Сила', r.power / mx.power, '#ff6b6b')}${bar('Скорость', r.reel / mx.reel, '#4aa3ff')}${bar('Удача', r.luck / mx.luck, '#b07bff')}${bar('Глубина ' + Math.round(r.depth * 12) + 'м', r.depth, '#22c3b5')}</div>
              <div class="actions">${act}</div></div></div>`;
        }).join('')}</div>`;
      } else if (sub === 'tackle') {
        const card = (kind, t) => {
          const key = kind + ':' + t.id, has = !t.price || owned.has(key), eq = (m[kind] || D.TACKLE[kind][0].id) === t.id;
          const act = eq ? `<button class="btn white sm" disabled>${A.icon('check', '#5ccf5c', 18)} Стоит</button>`
            : has ? `<button class="btn blue sm" data-tackle="${kind}:${t.id}">Поставить</button>`
              : `<button class="btn yellow sm" data-buy="${key}" ${p.coins < t.price ? 'disabled' : ''}>${coin(20)} ${fmt(t.price)}</button>`;
          return `<div class="panel rod-card">${eq ? '<span class="tag-owned">стоит</span>' : has && t.price ? '<span class="tag-owned">куплено</span>' : ''}
            <div class="art">${A.tackleSvg(kind, t.id, 64)}</div><div><h3>${t.name}</h3><p>${t.desc}</p><div class="actions">${act}</div></div></div>`;
        };
        body = `<div class="section-title outline-sm">Леска</div><div class="list">${D.TACKLE.line.map(t => card('line', t)).join('')}</div>
          <div class="section-title outline-sm">Крючки</div><div class="list">${D.TACKLE.hook.map(t => card('hook', t)).join('')}</div>`;
      } else if (sub === 'bait') {
        const baits = m.baits || {}, cur = m.bait || 'worm';
        body = `<div class="list">${D.BAITS.map(b => {
          const n = b.id === 'worm' ? 0 : baits[b.id] || 0, on = cur === b.id;
          const likes = b.likes.slice(0, 5).map(fishName).join(', ');
          return `<div class="panel rod-card bait-card">${on ? '<span class="tag-owned">на крючке</span>' : ''}
            <div class="art">${A.baitSvg(b.id, 64)}</div>
            <div><h3>${b.name} <small class="bait-have">${b.id === 'worm' ? '∞' : '×' + n}</small></h3><p>${b.desc}${likes ? `<br>Любят: ${likes}` : ''}</p>
              <div class="actions">${b.price ? `<button class="btn yellow sm" data-buy="bait:${b.id}" ${p.coins < b.price ? 'disabled' : ''}>${coin(20)} ${fmt(b.price)} · ×${b.pack}</button>` : ''}
                ${!on && (b.id === 'worm' || n > 0) ? `<button class="btn blue sm" data-bait="${b.id}">Взять</button>` : ''}</div></div></div>`;
        }).join('')}</div>`;
      } else if (sub === 'wear') {
        const keys = [];
        for (const slot of ['hat', 'top', 'acc', 'bottom']) for (const it of D.ITEMS[slot]) if (it.price > 0 && !it.season && !(it.g && it.g !== gender)) keys.push(slot + ':' + it.id);
        body = `<div class="grid">${keys.map(k => this.shopItem(k)).join('')}</div>`;
      } else if (sub === 'furn') {
        const keys = D.FURNITURE.filter(f => f.price > 0 && !f.season).map(f => 'furn:' + f.id);
        body = `<div class="subtitle">Купленную мебель расставь в своём домике</div><div class="grid">${keys.map(k => this.shopItem(k)).join('')}</div>`;
      } else {
        if (!season) body = '<div class="panel empty"><div class="big">🌙</div>Сейчас межсезонье — сезонный магазин откроется с новым сезоном.</div>';
        else {
          const keys = [];
          for (const slot of D.LOOK_SLOTS) for (const it of D.ITEMS[slot]) if (it.season === season.id && it.price > 0 && !it.pass && !(it.g && it.g !== gender)) keys.push(slot + ':' + it.id);
          for (const s of D.ROD_SKINS) if (s.season === season.id && s.price > 0) keys.push('skin:' + s.id);
          for (const f of D.FURNITURE) if (f.season === season.id && f.price > 0) keys.push('furn:' + f.id);
          body = `<div class="panel season-shop"><b>${esc(season.title)}</b><small>Эти вещи продаются только до ${new Date(season.end).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}. Потом — только у тех, кто успел.</small></div>
            <div class="grid">${keys.map(k => this.shopItem(k)).join('')}</div>`;
        }
      }
      const tabs = [['rods', 'Удочки', 'rod'], ['tackle', 'Снасти', 'hook'], ['bait', 'Наживка', 'fish'], ['wear', 'Одежда', 'shirt'], ['furn', 'Мебель', 'sofa'], ['season', season ? season.name : 'Сезон', 'bolt']];
      return `<section class="screen scroll dim">
        ${this.topbar()}
        <div class="title outline">Магазин</div>
        <div class="seg wrap">${tabs.map(([k, n, ic]) => `<button data-sub="${k}" class="${sub === k ? 'on' : ''}">${A.icon(ic, sub === k ? '#ff8fab' : '#dfe4ff', 20)} ${esc(n)}</button>`).join('')}</div>
        ${body}
      </section>`;
    },
    // grid card for any coin-shop item 'kind:id'
    shopItem(key) {
      const p = this.profile, info = D.itemInfo(key), has = p.owned.includes(key), m = p.meta;
      const buy = `<button class="btn yellow sm" data-buy="${key}" ${p.coins < info.price ? 'disabled' : ''}>${coin(18)}${fmt(info.price)}</button>`;
      let act;
      if (D.LOOK_SLOTS.includes(info.kind)) {
        act = p.look[info.kind] === info.id ? '<button class="btn white sm" disabled>Надето</button>'
          : has ? `<button class="btn blue sm" data-wear="${key}">Надеть</button>` : buy;
      } else if (info.kind === 'furn') act = has ? '<button class="btn blue sm" data-open="house">В домик</button>' : buy;
      else if (info.kind === 'skin') {
        act = m.skin === info.id ? '<button class="btn white sm" disabled>Выбран</button>'
          : has ? `<button class="btn blue sm" data-skinpick="${info.id}">Выбрать</button>` : buy;
      } else act = has ? '<button class="btn white sm" disabled>Есть</button>' : buy;
      return `<div class="item-card"><div class="thumb">${this.thumb(key)}</div><div class="nm">${esc(info.name)}</div>${act}</div>`;
    },
    bind_shop() {
      this.bindCommon();
      document.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { this.shopSub = b.dataset.sub; S.play('tab'); this.setTab('shop', true); $('.screen').scrollTop = 0; });
      document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => this.buy(b.dataset.buy));
      document.querySelectorAll('[data-equip]').forEach(b => b.onclick = () => this.equip(b.dataset.equip));
      document.querySelectorAll('[data-wear]').forEach(b => b.onclick = () => {
        const [slot, id] = b.dataset.wear.split(':');
        this.saveLook(Object.assign({}, this.profile.look, { [slot]: id }));
      });
      document.querySelectorAll('[data-tackle]').forEach(b => b.onclick = async () => {
        const [kind, id] = b.dataset.tackle.split(':');
        try { const r = await N.api('/api/tackle', { [kind]: id }); S.play('pop'); this.setProfile(r.profile); } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
      });
      document.querySelectorAll('[data-bait]').forEach(b => b.onclick = async () => { await this.setBait(b.dataset.bait); this.refresh(); });
      document.querySelectorAll('[data-skinpick]').forEach(b => b.onclick = async () => {
        try { const r = await N.api('/api/style', { skin: b.dataset.skinpick }); S.play('pop'); this.setProfile(r.profile); } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
      });
    },

    collectionHtml() {
      const sub = this.collSub || 'fish';
      const p = this.profile;
      const got = Object.keys(p.collection).filter(id => D.FISH_BY_ID[id]).length;
      let body;
      if (sub === 'fish') {
        const f = this.diaryLoc || 'all';
        const chips = [['all', 'Все']].concat(D.LOCATIONS.map(l => [l.id, l.emoji + ' ' + l.short]), D.FISH.some(x => x.season) ? [['season', '🦇 Сезон']] : []);
        const list = D.FISH.filter(x => f === 'all' || (f === 'season' ? !!x.season : x.loc.includes(f)));
        body = `<div class="chips">${chips.map(([id, n]) => `<button class="fchip ${f === id ? 'on' : ''}" data-dloc="${id}">${n}</button>`).join('')}</div>
          <div class="grid">${list.map(x => {
            const c = p.collection[x.id], r = D.RARITY[x.rarity];
            return `<button class="fish-card ${c ? '' : 'locked'}" style="--rc:${r.color}" data-fish="${x.id}">
              ${c ? `<span class="cnt">×${c.count}</span>` : ''}${x.season ? '<span class="season-tag">🦇</span>' : ''}
              <div class="pic">${A.fishSvg(x.id).svg}</div>
              <div class="nm">${c ? x.name : '???'}</div>
              <div class="meta">${c ? 'рекорд ' + c.best.toFixed(2) + ' кг' : r.name}</div></button>`;
          }).join('')}</div>`;
      } else {
        const k = p.keepnet;
        const total = k.reduce((s, x) => s + x.price, 0);
        body = k.length ? `<div class="list">${k.map(x => {
          const f = D.FISH_BY_ID[x.species], r = D.RARITY[f.rarity];
          return `<div class="panel keep-row"><div class="pic">${A.fishSvg(x.species).svg}</div>
            <div><div class="nm">${f.name} <span class="rar" style="--rc:${r.color}">${r.name}</span></div><div class="w">${x.weight.toFixed(2)} кг</div></div>
            <button class="btn yellow sm" data-sell="${x.id}">${coin(18)}${fmt(x.price)}</button></div>`;
        }).join('')}</div>
          <div class="sell-all"><button class="btn orange xl block" id="sell-all">${A.icon('sell', '#ffe0a8', 28)} Продать всё · ${fmt(total)}</button></div>`
          : `<div class="panel empty"><div class="big">🪣</div>Садок пуст. Самое время порыбачить!</div>`;
      }
      return `<section class="screen scroll dim">
        ${this.topbar()}
        <div class="title outline">Дневник рыбака</div>
        <div class="panel progress-card"><div class="big">${got}/${D.FISH.length}</div><div style="flex:1"><div style="font-size:13px;margin-bottom:5px">Видов в дневнике</div><div class="pbar"><i style="width:${(got / D.FISH.length * 100).toFixed(0)}%"></i></div></div></div>
        <div class="seg"><button data-csub="fish" class="${sub === 'fish' ? 'on' : ''}">${A.icon('fish', sub === 'fish' ? '#4fc3f7' : '#dfe4ff', 22)} Рыбы</button><button data-csub="keep" class="${sub === 'keep' ? 'on' : ''}">${A.icon('box', sub === 'keep' ? '#ffd23f' : '#dfe4ff', 22)} Садок · ${p.keepnet.length}</button></div>
        ${body}
      </section>`;
    },
    bind_collection() {
      this.bindCommon();
      document.querySelectorAll('[data-csub]').forEach(b => b.onclick = () => { this.collSub = b.dataset.csub; S.play('tab'); this.setTab('collection', true); $('.screen').scrollTop = 0; });
      document.querySelectorAll('[data-dloc]').forEach(b => b.onclick = () => { this.diaryLoc = b.dataset.dloc; S.play('tab'); this.setTab('collection', true); });
      document.querySelectorAll('[data-fish]').forEach(b => b.onclick = () => { S.play('pop'); this.fishModal(b.dataset.fish); });
      document.querySelectorAll('[data-sell]').forEach(b => b.onclick = e => this.sell([+b.dataset.sell], e.currentTarget));
      const all = $('#sell-all'); if (all) all.onclick = e => this.sell('all', e.currentTarget);
    },

    infoHtml() {
      const steps = [
        ['#4fc3f7', 'Заброс', 'Зажми кнопку и отпусти. Сила заброса = глубина. Глубже живут крупные и редкие рыбы.'],
        ['#ffa62b', 'Поклёвка', 'Поплавок дёргается — рыба пробует наживку. Жди, пока он не нырнёт и не появится «!».'],
        ['#ff6b6b', 'Подсечка', 'Как только появился «!», жми «Подсечь». Опоздаешь — рыба уйдёт, поспешишь — испугаешь.'],
        ['#5ccf5c', 'Вываживание', 'Держи «Тяни», следи за натяжением. Рывок рыбы — отпускай, иначе леска лопнет.'],
      ];
      const topics = [
        ['📜', 'Лицензия рыбака', 'Новичок рыбачит только на учебном озере. Сделай 3 заброса, поймай 3 рыбы, продай улов и сдай теорию — откроются кооп-комнаты, магазин, локации, пропуск и домик.'],
        ['🗺️', 'Локации', D.LOCATIONS.map(l => `${l.emoji} ${l.name} — с ${l.level} уровня`).join('<br>')],
        ['🪱', 'Наживка и снасти', 'Наживка тратится по одной за заброс и меняет клёв: мотыль ускоряет поклёвку, блесна манит хищников, живец — крупную рыбу. Прочная леска держит рывки, хороший крючок даёт больше времени на подсечку.'],
        ['🎟', 'Сезон и пропуск', `Опыт пропуска дают улов и задания — ежедневные, еженедельные и особые. ${D.PASS_LEVELS} уровней наград: бесплатная ветка и премиум за ${D.PASS_PRICE_STARS} ⭐ Telegram Stars.`],
        ['📅', 'События', 'Каждый вечер — час клёва, по выходным — турнир на самую тяжёлую рыбу, в кооп-комнатах всплывает босс, которого ловят вместе.'],
        ['🏠', 'Домик и обмен', 'Расставляй мебель, заводи аквариум и вешай трофеи, зови друзей в гости. Рыбу, наживку и вещи из магазина можно дарить и менять.'],
      ];
      const plain = D.FISH.filter(f => !f.season);
      const night = plain.filter(f => f.time === 'night').map(f => f.name).join(', ');
      const day = plain.filter(f => f.time === 'day').map(f => f.name).join(', ');
      return `<section class="screen scroll dim">
        ${this.topbar()}
        <div class="title outline">Как играть</div>
        <div class="panel">${steps.map((s, i) => `<div class="info-step"><div class="n" style="--c:${s[0]}">${i + 1}</div><div><b>${s[1]}</b><span>${s[2]}</span></div></div>`).join('')}</div>
        <div class="section-title outline-sm">Что ещё есть в игре</div>
        <div class="panel">${topics.map(t => `<div class="info-step"><div class="n emoji">${t[0]}</div><div><b>${t[1]}</b><span>${t[2]}</span></div></div>`).join('')}</div>
        <div class="section-title outline-sm">Редкость</div>
        <div class="panel">${D.RARITY_ORDER.map(k => { const r = D.RARITY[k]; const n = D.FISH.filter(f => f.rarity === k).length; return `<div class="rar-row"><span class="rar" style="--rc:${r.color}">${r.name}</span><span>${n} ${n === 1 ? 'вид' : n < 5 ? 'вида' : 'видов'} · +${r.xp} XP</span></div>`; }).join('')}</div>
        <div class="section-title outline-sm">День и ночь</div>
        <div class="panel" style="font-size:14px;line-height:1.4">☀️ <b>Только днём:</b> ${day}<br><br>🌙 <b>Только ночью (21:00–6:00):</b> ${night}</div>
        <div class="section-title outline-sm">Лучшие рыбаки</div>
        <div class="panel" id="top-list"><div class="empty">Загружаем…</div></div>
        <div class="section-title outline-sm">Настройки</div>
        <div class="panel">
          <div class="toggle-row"><span>${'🔊'} Звуки природы и эффекты</span><button class="toggle ${S.sfxOn ? 'on' : ''}" id="tg-sfx"></button></div>
          <div class="toggle-row"><span>${'🎵'} Музыка</span><button class="toggle ${S.musicOn ? 'on' : ''}" id="tg-mus"></button></div>
        </div>
        <div style="text-align:center;margin:18px 0 6px;font-size:12px;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.35)">Hooked · @${esc((N.config && N.config.botUsername) || 'HookedGame')}${N.online ? '' : ' · офлайн-режим'}</div>
      </section>`;
    },
    async bind_info() {
      this.bindCommon();
      $('#tg-sfx').onclick = e => { S.unlock(); S.setSfx(!S.sfxOn); e.currentTarget.classList.toggle('on', S.sfxOn); S.play('click'); };
      $('#tg-mus').onclick = e => { S.unlock(); S.setMusic(!S.musicOn); e.currentTarget.classList.toggle('on', S.musicOn); S.play('click'); };
      try {
        const { top } = await N.api('/api/top');
        const el = $('#top-list'); if (!el) return;
        const visit = N.online && this.profile.license;
        el.innerHTML = top.length ? top.slice(0, 10).map((r, i) => `<${visit ? `button data-visit="${esc(r.id)}"` : 'div'} class="top-row"><div class="pl">${['🥇', '🥈', '🥉'][i] || i + 1}</div><div class="ava">${A.avatar(r.look)}</div>
          <div><div class="nm">${esc(r.name)}</div><div class="sm">${r.title ? esc(r.title) + ' · ' : ''}Ур. ${r.level} · ${r.caught} рыб · ${r.species}/${D.FISH.length} видов</div></div>
          <div class="price">${coin(18)}${fmt(r.earned)}</div></${visit ? 'button' : 'div'}>`).join('') + (visit ? '<div class="pick-hint">Нажми на рыбака, чтобы заглянуть к нему в домик</div>' : '')
          : '<div class="empty">Пока пусто — стань первым!</div>';
        el.querySelectorAll('[data-visit]').forEach(b => b.onclick = () => { S.play('click'); this.visitHouse(b.dataset.visit); });
      } catch { /* offline */ }
    },

    profileHtml() {
      const p = this.profile, lv = p.level, rod = D.ROD_BY_ID[p.rod], m = p.meta || {};
      const best = p.stats.bestSpecies ? `${fishName(p.stats.bestSpecies)}` : '—';
      const title = p.title && D.TITLES[p.title];
      const achN = Object.keys(m.ach || {}).length;
      const line = D.findTackle('line', m.line) || D.TACKLE.line[0], hook = D.findTackle('hook', m.hook) || D.TACKLE.hook[0];
      const bait = D.BAIT_BY_ID[m.bait] || D.BAITS[0];
      const myId = p.username ? '@' + p.username : p.id;
      return `<section class="screen scroll dim">
        ${this.topbar()}
        <div class="profile-hero">
          <div class="stage">${A.character(p.look, { pose: this.housePose(m.pose) })}</div>
          <div class="profile-name outline">${esc(p.name)}</div>
          ${title ? `<div class="profile-title">${A.icon('medal', '#ffd23f', 20)} ${esc(title)}</div>` : ''}
          <div class="lic-badge ${p.license ? 'ok' : ''}">${p.license ? `📜 Лицензия № ${esc(p.licNo || '')}` : '📜 Лицензии пока нет'}</div>
          <div class="lvl-row"><div class="lvl-badge">${lv.level}</div><div class="bar"><i style="width:${(lv.cur / lv.need * 100).toFixed(0)}%"></i><span>${lv.cur} / ${lv.need} XP</span></div></div>
          <div class="stat-grid">
            <div class="stat-tile"><div class="k">Поймано рыб</div><div class="v">${A.icon('fish', '#4fc3f7', 26)}${fmt(p.stats.caught)}</div></div>
            <div class="stat-tile"><div class="k">Заработано</div><div class="v">${coin(26)}${fmt(p.stats.earned)}</div></div>
            <div class="stat-tile"><div class="k">Дневник</div><div class="v">${A.icon('box', '#ffd23f', 26)}${Object.keys(p.collection).length}/${D.FISH.length}</div></div>
            <div class="stat-tile"><div class="k">Трофей</div><div class="v" style="font-size:15px">${A.icon('trophy', '#ffd23f', 26)}<span>${best}${p.stats.bestWeight ? `<br><small style="color:var(--ink-soft)">${p.stats.bestWeight.toFixed(2)} кг</small>` : ''}</span></div></div>
          </div>
          <div class="panel rod-card" style="width:100%;margin-top:12px;grid-template-columns:70px 1fr">
            <div class="art" style="width:70px;height:70px">${A.rodSvg(rod.id, 62, m.skin)}</div>
            <div><div style="font-size:12px;color:var(--ink-soft)">Удочка в руках</div><h3 style="margin:2px 0 0">${rod.name}</h3><div style="font-size:12px">Глубина до ${Math.round(rod.depth * 12)} м · удача ×${rod.luck}</div>
              <div style="font-size:12px;color:var(--ink-soft)">${line.name} · ${hook.name} · ${bait.name}</div></div>
          </div>
          <div class="prof-btns">
            <button class="btn purple block" id="edit-look">${A.icon('shirt', '#e6dbff', 26)} Изменить внешность</button>
            <div class="row2">
              ${p.license ? `<button class="btn teal" data-open="style">${A.icon('palette', '#e9fffb', 24)} Стиль</button>` : ''}
              <button class="btn orange" data-open="ach">${A.icon('medal', '#ffe0a8', 24)} ${achN}/${D.ACHIEVEMENTS.length}</button>
              ${p.license ? `<button class="btn" data-open="house">${A.icon('house', '#d6ffd0', 24)} Домик</button>` : ''}
              <button class="btn blue" data-open="archive">${A.icon('archive', '#bfe3ff', 24)} Архив</button>
            </div>
            <button class="btn block" id="invite-friend">${A.icon('share', '#d6ffd0', 24)} Пригласить друга</button>
          </div>
          ${N.online ? `<button class="my-id" id="my-id">Твой ID для подарков и обмена: <b>${esc(myId)}</b> ${A.icon('copy', '#9fd2ff', 18)}</button>` : ''}
        </div>
      </section>`;
    },
    bind_profile() {
      this.bindCommon();
      $('#edit-look').onclick = () => { S.play('click'); this.openCustomize(false); };
      $('#invite-friend').onclick = () => { S.play('click'); this.invite(null); };
      const id = $('#my-id'); if (id) id.onclick = () => this.copy(this.profile.username ? '@' + this.profile.username : this.profile.id, 'ID скопирован');
    },

    /* =================== customization =================== */
    openCustomize(first) {
      this.sub = 'custom';
      this.draftLook = Object.assign({}, this.profile.look);
      this.customSlot = this.customSlot || (first ? 'face' : 'top');
      $('#nav').hidden = true;
      this.renderCustomize(first);
      this.updateBackButton();
    },
    renderCustomize(first) {
      const look = this.draftLook, owned = new Set(this.profile.owned);
      const season = D.seasonAt(Date.now());
      const slots = [['face', 'Лицо', '🙂'], ['hair', 'Причёска', '💇'], ['top', 'Одежда', '👕'], ['bottom', 'Низ', '👖'], ['hat', 'Шапка', '🧢'], ['acc', 'Аксессуар', '🕶️'], ['tattoo', 'Тату', '🖋️'], ['makeup', 'Макияж', '💄']];
      const slot = this.customSlot;
      let opts = '', sw = '', head = '';
      const optBtn = (on, svg, attrs, lock, label) =>
        `<button class="opt ${on ? 'on' : ''} ${lock ? 'locked' : ''}" ${attrs}>${svg}${lock ? `<span class="lock">${lock}</span>` : label ? `<span class="lbl">${label}</span>` : ''}</button>`;
      if (slot === 'face') {
        head = `<div class="gender-row">${D.GENDERS.map(g => `<button class="gbtn ${look.gender === g.id ? 'on' : ''}" data-gender="${g.id}">${g.id === 'm' ? '👦' : '👧'} ${g.name}</button>`).join('')}</div>`;
        opts = D.FACES[look.gender].map((fc, i) => optBtn(look.face === i, A.avatar(Object.assign({}, look, { face: i })), `data-face="${i}"`, '', fc.name)).join('');
        sw = `<div class="sw-title">Цвет кожи</div><div class="swatches">${D.SKINS.map((c, i) => `<button class="sw ${look.skin === i ? 'on' : ''}" style="--c:${c}" data-skin="${i}"></button>`).join('')}</div>`;
      } else {
        for (const it of D.ITEMS[slot]) {
          if (it.g && it.g !== look.gender) continue;
          const has = D.isFreeItem(it) || owned.has(slot + ':' + it.id);
          if (!has && it.season && !it.pass && !(season && season.id === it.season)) continue;
          const test = Object.assign({}, look, { [slot]: it.id });
          if (slot === 'hair') test.hat = 'none';
          const svg = slot === 'top' ? crop(test, '40 100 120 120')
            : slot === 'bottom' ? crop(test, '40 140 120 120')
              : slot === 'tattoo' ? crop(test, '20 30 160 160')
                : A.avatar(test);
          opts += optBtn(look[slot] === it.id, svg, `data-item="${it.id}"`, has ? '' : it.pass ? '🎟 пропуск' : `🔒 ${fmt(it.price)}`);
        }
        const colorKey = { hair: 'hairColor', top: 'topColor', bottom: 'bottomColor', hat: 'hatColor', acc: 'hatColor' }[slot];
        const palette = slot === 'hair' ? D.HAIR_COLORS : D.CLOTH_COLORS;
        if (colorKey && !(slot === 'acc' && look.acc !== 'scarf')) {
          sw = `<div class="swatches">${palette.map((c, i) => `<button class="sw ${look[colorKey] === i ? 'on' : ''}" style="--c:${c}" data-color="${colorKey}:${i}"></button>`).join('')}</div>`;
        }
      }
      $('#screens').innerHTML = `<section class="screen full custom">
        <div class="topbar">${first ? '' : `<button class="icon-btn" id="cust-back">${A.icon('back', '#ffb84d', 26)}</button>`}<div class="spacer"></div><div class="chip coins">${coin(28)}<span class="num">${fmt(this.profile.coins)}</span></div></div>
        <div class="title outline" style="margin-top:-6px">${first ? 'Создай рыбака' : 'Гардероб'}</div>
        <div class="stage">
          <span class="sparkle" style="left:18%;top:20%"></span><span class="sparkle" style="right:20%;top:8%;animation-delay:.7s"></span><span class="sparkle" style="left:26%;top:62%;animation-delay:1.3s"></span>
          <div class="char">${A.character(look)}</div>
          <button class="icon-btn dice" id="dice" aria-label="Случайно"><span style="font-size:26px;line-height:1">🎲</span></button>
        </div>
        <div class="slot-tabs">${slots.map(([k, n, e]) => `<button data-slot="${k}" class="${k === slot ? 'on' : ''}"><i>${e}</i>${n}</button>`).join('')}</div>
        <div class="panel custom-panel">${head}<div class="opt-grid">${opts}</div>${sw}</div>
        <button class="btn xl block done" id="cust-done">${A.icon('check', '#fff', 26)} ${first ? 'На рыбалку!' : 'Сохранить'}</button>
      </section>`;
      const rerender = () => { const sc0 = $('.screen'); const st = sc0 ? sc0.scrollTop : 0; this.renderCustomize(first); const sc1 = $('.screen'); sc1.style.animation = 'none'; sc1.scrollTop = st; };
      document.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { this.customSlot = b.dataset.slot; S.play('tab'); rerender(); });
      document.querySelectorAll('[data-gender]').forEach(b => b.onclick = () => {
        const g = b.dataset.gender;
        if (g === look.gender) return;
        look.gender = g; look.face = 0;
        // drop items that belong to the other gender
        for (const s of D.LOOK_SLOTS) { const it = D.findItem(s, look[s]); if (it && it.g && it.g !== g) look[s] = D.DEFAULT_LOOK[s]; }
        S.play('pop'); haptic('select'); rerender();
      });
      document.querySelectorAll('[data-face]').forEach(b => b.onclick = () => { look.face = +b.dataset.face; S.play('pop'); rerender(); });
      document.querySelectorAll('[data-skin]').forEach(b => b.onclick = () => { look.skin = +b.dataset.skin; S.play('pop'); rerender(); });
      document.querySelectorAll('[data-item]').forEach(b => b.onclick = () => {
        const id = b.dataset.item, it = D.findItem(slot, id);
        if (!D.isFreeItem(it) && !owned.has(slot + ':' + id)) {
          if (it.pass) { S.play('pop'); return this.toast(`«${it.name}» — награда рыболовного пропуска`); }
          return this.buyItemModal(slot, it, () => { look[slot] = id; rerender(); });
        }
        look[slot] = id; S.play('pop'); haptic('select'); rerender();
      });
      document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.color.split(':'); look[k] = +i; S.play('pop'); rerender(); });
      $('#dice').onclick = () => {
        S.play('pop');
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const free = s => D.ITEMS[s].filter(i => (D.isFreeItem(i) || owned.has(s + ':' + i.id)) && !(i.g && i.g !== look.gender)).map(i => i.id);
        Object.assign(look, {
          face: Math.floor(Math.random() * D.FACES[look.gender].length),
          skin: Math.floor(Math.random() * D.SKINS.length), hair: pick(free('hair')), hairColor: Math.floor(Math.random() * D.HAIR_COLORS.length),
          top: pick(free('top')), topColor: Math.floor(Math.random() * D.CLOTH_COLORS.length), bottom: pick(free('bottom')), bottomColor: Math.floor(Math.random() * D.CLOTH_COLORS.length),
          hat: pick(free('hat')), hatColor: Math.floor(Math.random() * D.CLOTH_COLORS.length), acc: pick(free('acc')), tattoo: pick(free('tattoo')), makeup: pick(free('makeup')),
        });
        rerender();
      };
      const back = $('#cust-back'); if (back) back.onclick = () => { S.play('click'); this.setTab('profile'); };
      $('#cust-done').onclick = async () => {
        S.unlock(); S.play('click');
        await this.saveLook(look, true);
        if (first) {
          this.toast('Отличный рыбак! Удачного клёва 🎣', 'ok');
          this.setTab('home');
          this.runPending();
        } else this.setTab('profile');
      };
    },

    /* =================== actions =================== */
    async saveLook(look, quiet) {
      try {
        const r = await N.api('/api/look', { look });
        this.setProfile(r.profile, true);
        if (!quiet) { S.play('pop'); this.refresh(); }
      } catch (e) { this.toast(e.message, 'err'); }
    },
    async buy(item, after) {
      try {
        const r = await N.api('/api/buy', { item });
        S.play('buy'); haptic('notify', 'success');
        this.setProfile(r.profile, true);
        const [kind, id] = item.split(':');
        const name = kind === 'bait' ? D.BAIT_BY_ID[id].name : (D.itemInfo(item) || { name: item }).name;
        this.toast(`Куплено: ${name}!`, 'ok');
        if (after) after(); else this.refresh();
      } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
    },
    async equip(rod) {
      try {
        const r = await N.api('/api/equip', { rod });
        S.play('pop'); this.setProfile(r.profile);
      } catch (e) { this.toast(e.message, 'err'); }
    },
    async sell(ids, fromEl) {
      try {
        const r = await N.api('/api/sell', ids === 'all' ? { all: true } : { ids });
        if (r.sold) { S.play('coin'); haptic('notify', 'success'); this.coinBurst(fromEl); this.toast(`+${fmt(r.sold)} монет`, 'ok'); }
        this.setProfile(r.profile);
        this.extras(Object.assign({ licStep: 'sell' }, r));
      } catch (e) { this.toast(e.message, 'err'); }
    },
    joinRoom(code) {
      this.pendingJoin = null;
      if (!this.profile.license) { S.play('error'); return this.toast('Кооп-комнаты откроются после получения лицензии рыбака', 'err'); }
      N.send({ t: 'join', code: String(code).toUpperCase() });
    },
    invite(room) {
      const code = room && room.code;
      const link = (room && room.link) || (N.config && N.config.appLink) || 'https://t.me/HookedGame';
      const text = code ? `🎣 Залетай ко мне на рыбалку в Hooked! Комната ${code}` : '🎣 Погнали на рыбалку в Hooked — лови рыбу вместе со мной!';
      this.share(link, text);
    },
    copy(text, msg) {
      const ok = () => this.toast(msg || 'Скопировано', 'ok');
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, ok); else ok();
    },

    /* =================== game hooks =================== */
    onGameEnter(room) {
      this.inGame = true;
      $('#nav').hidden = true;
      $('#screens').innerHTML = '';
      this.updateBackButton();
    },
    onGameLeave() {
      this.inGame = false;
      this.setTab('home');
    },

    /* =================== modals =================== */
    modal(html, opts = {}) {
      const bg = document.createElement('div');
      bg.className = 'modal-bg' + (opts.bottom ? ' bottom' : '');
      bg.innerHTML = `<div class="modal panel ${opts.cls || ''}" style="${opts.style || ''}">${opts.noClose ? '' : `<button class="icon-btn close" data-close>${A.icon('close', '#ff8a8a', 22)}</button>`}${html}</div>`;
      bg.addEventListener('click', e => { if (e.target === bg && !opts.sticky) this.closeModal(bg); });
      bg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { S.play('click'); this.closeModal(bg); });
      $('#modal-root').appendChild(bg);
      this.updateBackButton();
      return bg;
    },
    closeModal(bg) { bg.remove(); this.updateBackButton(); if (bg._onClose) bg._onClose(); },
    closeAllModals() { document.querySelectorAll('.modal-bg').forEach(b => b.remove()); this.updateBackButton(); },

    async roomsModal() {
      const bg = this.modal(`<h2>Комнаты</h2><div id="rooms-list" class="list"><div class="empty">Ищем рыбаков…</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <button class="btn white sm" id="rooms-refresh">${A.icon('globe', '#9fd2ff', 20)} Обновить</button>
          <button class="btn blue sm" id="rooms-create">${A.icon('plus', '#fff', 18)} Своя</button>
        </div>`);
      const load = async () => {
        const el = bg.querySelector('#rooms-list');
        try {
          const { rooms } = await N.api('/api/rooms');
          el.innerHTML = rooms.length ? rooms.map(r => {
            const loc = D.LOC_BY_ID[r.loc] || D.LOCATIONS[0];
            return `<div class="panel room-card">
              <div><div class="nm">${esc(r.name)}</div><div class="host">${loc.emoji} ${esc(loc.short)} · Хозяин: ${esc(r.host)}${r.boss ? ' · 👹 босс!' : ''}</div><div class="faces">${r.looks.map(l => `<span>${A.avatar(l)}</span>`).join('')}</div></div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><div class="cnt">${r.players}/${r.max}</div>
              <button class="btn ${r.players >= r.max ? 'white' : ''} sm" data-join="${r.code}" ${r.players >= r.max ? 'disabled' : ''}>${r.players >= r.max ? 'Полная' : 'Войти'}</button></div></div>`;
          }).join('')
            : `<div class="empty"><div class="big">🎣</div>Публичных комнат пока нет.<br>Создай свою и позови друзей!</div>`;
          el.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { S.play('click'); this.joinRoom(b.dataset.join); });
        } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      };
      bg.querySelector('#rooms-refresh').onclick = () => { S.play('click'); load(); };
      bg.querySelector('#rooms-create').onclick = () => { S.play('click'); this.closeModal(bg); this.createRoomModal(); };
      load();
    },
    createRoomModal() {
      const p = this.profile, lvl = p.level.level;
      let pub = true, loc = D.locUnlocked(p.meta.loc, lvl) ? p.meta.loc : 'lake';
      const bg = this.modal(`<h2>Новая комната</h2>
        <div class="field"><label>Название</label><input class="input" id="room-name" maxlength="28" placeholder="Рыбалка у ${esc(p.name)}"></div>
        <div class="field"><label>Локация</label><div class="loc-pick">${D.LOCATIONS.map(l => { const open = D.locUnlocked(l.id, lvl); return `<button data-rloc="${l.id}" class="${l.id === loc ? 'on' : ''} ${open ? '' : 'locked'}"><span>${l.emoji}</span>${esc(l.short)}${open ? '' : `<small>ур. ${l.level}</small>`}</button>`; }).join('')}</div></div>
        <div class="privacy">
          <button data-pub="1" class="on">${A.icon('globe', '#7fd4f5', 34)}Публичная<small>Видна всем в списке комнат</small></button>
          <button data-pub="0">${A.icon('lock', '#ffd23f', 34)}Приватная<small>Вход только по коду или ссылке</small></button>
        </div>
        <div style="text-align:center;font-size:13px;margin:-4px 0 12px;color:var(--ink-soft)">До ${D.MAX_PLAYERS} рыбаков в комнате</div>
        <button class="btn xl block" id="room-go">${A.icon('play', '#fff', 24)} Создать</button>`);
      bg.querySelectorAll('[data-pub]').forEach(b => b.onclick = () => {
        pub = b.dataset.pub === '1'; S.play('pop');
        bg.querySelectorAll('[data-pub]').forEach(x => x.classList.toggle('on', x === b));
      });
      bg.querySelectorAll('[data-rloc]').forEach(b => b.onclick = () => {
        const l = D.LOC_BY_ID[b.dataset.rloc];
        if (!D.locUnlocked(l.id, lvl)) { S.play('error'); return this.toast(`${l.name} откроется на ${l.level} уровне`, 'err'); }
        loc = l.id; S.play('pop');
        bg.querySelectorAll('[data-rloc]').forEach(x => x.classList.toggle('on', x === b));
      });
      bg.querySelector('#room-go').onclick = () => {
        S.unlock(); S.play('click');
        N.send({ t: 'create', name: bg.querySelector('#room-name').value.trim(), isPublic: pub, loc });
      };
    },
    codeModal() {
      const bg = this.modal(`<h2>Вход по коду</h2>
        <div class="field"><input class="input code" id="room-code" maxlength="5" placeholder="•••••" autocomplete="off"></div>
        <button class="btn blue xl block" id="code-go">${A.icon('key', '#fff2a8', 24)} Войти</button>`);
      const inp = bg.querySelector('#room-code');
      setTimeout(() => inp.focus(), 100);
      const go = () => { const c = inp.value.trim().toUpperCase(); if (c.length < 5) { S.play('error'); return this.toast('Код из 5 символов', 'err'); } S.play('click'); this.joinRoom(c); };
      bg.querySelector('#code-go').onclick = go;
      inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    },
    roomInfoModal(room) {
      const loc = D.LOC_BY_ID[room.loc] || D.LOCATIONS[0];
      const bg = this.modal(`<h2>${esc(room.name)}</h2>
        <div style="text-align:center;font-size:13px;color:var(--ink-soft)">${loc.emoji} ${esc(loc.name)} · ${room.isPublic ? 'публичная' : 'приватная'} · ${room.players.length}/${room.max}</div>
        <div class="input code" style="display:grid;place-items:center;margin:12px 0 14px">${room.code}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button class="btn white sm" id="ri-copy">${A.icon('copy', '#9fd2ff', 20)} Код</button>
          <button class="btn sm" id="ri-share">${A.icon('share', '#d6ffd0', 20)} Позвать</button>
        </div>`);
      bg.querySelector('#ri-copy').onclick = () => this.copy(room.code, 'Код скопирован');
      bg.querySelector('#ri-share').onclick = () => this.invite(room);
    },
    buyItemModal(slot, it, after) {
      if (!this.profile.license) { S.play('error'); return this.toast('Покупки откроются после получения лицензии рыбака', 'err'); }
      const can = this.profile.coins >= it.price;
      const look = Object.assign({}, this.draftLook || this.profile.look, { [slot]: it.id });
      const bg = this.modal(`<h2>${it.name}</h2>
        <div style="width:150px;height:150px;margin:0 auto 10px;border-radius:24px;border:3px solid var(--ink);overflow:hidden;background:radial-gradient(circle,#e9f8ff,#a8dcf7)">${slot === 'top' || slot === 'bottom' || slot === 'tattoo' ? A.character(look).replace('viewBox="0 0 200 260"', 'viewBox="20 40 160 220"') : A.avatar(look)}</div>
        <div style="text-align:center;margin-bottom:14px;font-size:14px">${D.SLOT_NAMES[slot]} из ${it.season ? 'сезонного ' : ''}магазина</div>
        <button class="btn yellow xl block" id="bi-go" ${can ? '' : 'disabled'}>${coin(26)} Купить за ${fmt(it.price)}</button>
        ${can ? '' : '<div style="text-align:center;margin-top:10px;font-size:13px;color:#e03a3a">Не хватает монет — налови и продай рыбу!</div>'}`);
      bg.querySelector('#bi-go').onclick = () => { this.closeModal(bg); this.buy(slot + ':' + it.id, after); };
    },
    fishModal(id) {
      const f = D.FISH_BY_ID[id], r = D.RARITY[f.rarity], c = this.profile.collection[id];
      const time = f.time === 'day' ? '☀️ Днём' : f.time === 'night' ? '🌙 Ночью' : '🌗 Всегда';
      const dep = `${Math.round(f.depth[0] * 12)}–${Math.round(f.depth[1] * 12)} м`;
      const locs = f.loc.map(l => `${D.LOC_BY_ID[l].emoji} ${D.LOC_BY_ID[l].short}`).join(' · ');
      const baits = D.BAITS.filter(b => b.likes.includes(id)).map(b => b.name).join(', ');
      const season = f.season && D.SEASON_BY_ID[f.season];
      let cond = '';
      if (c && c.loc) {
        const parts = [];
        const L = D.LOC_BY_ID[c.loc]; if (L) parts.push(`${L.emoji} ${L.name}`);
        if (c.bait && D.BAIT_BY_ID[c.bait]) parts.push(`наживка: ${D.BAIT_BY_ID[c.bait].name.toLowerCase()}`);
        if (c.depth != null) parts.push(`глубина ${Math.max(1, Math.round(c.depth * 12))} м`);
        if (c.hour != null) parts.push(`${String(c.hour).padStart(2, '0')}:00 ${D.isNight(c.hour) ? '🌙' : '☀️'}`);
        if (c.at) parts.push(new Date(c.at).toLocaleDateString('ru-RU'));
        cond = `<div class="diary-note"><b>Рекорд пойман:</b> ${parts.join(' · ')}</div>`;
      }
      this.modal(`<div class="catch" style="--rc:${r.color};padding-top:4px">
        <div class="burst" style="height:160px"><div class="fish" style="${c ? '' : 'filter:brightness(0) opacity(.35)'}">${A.fishSvg(id).svg}</div></div>
        <div class="name outline">${c ? f.name : '???'}</div><span class="rar" style="--rc:${r.color}">${r.name}</span>${season ? `<span class="rar season-rar">🦇 ${esc(season.name)}</span>` : ''}
        <div class="facts"><div><b>${dep}</b><small>глубина</small></div><div><b>${time}</b><small>клюёт</small></div><div><b>${f.minW}–${f.maxW}</b><small>кг</small></div></div>
        <div class="desc">${c ? f.desc : 'Эту рыбу ты ещё не ловил. Попробуй забросить на нужную глубину!'}</div>
        <div class="diary-note"><b>Где водится:</b> ${locs}${baits ? `<br><b>Любит:</b> ${baits}` : ''}${season ? `<br><b>Только в сезон</b> «${esc(season.name)}»` : ''}</div>
        ${c ? `<div class="facts" style="margin-top:10px"><div><b>×${c.count}</b><small>поймано</small></div><div><b>${c.best.toFixed(2)}</b><small>рекорд, кг</small></div><div><b>${fmt(D.fishPrice(id, c.best))}</b><small>цена рекорда</small></div></div>${cond}` : ''}
      </div>`);
    },

    showCatch(res, profile) {
      if (profile) this.setProfile(profile, true);
      const f = D.FISH_BY_ID[res.species], r = D.RARITY[f.rarity];
      const tier = D.RARITY_ORDER.indexOf(f.rarity);
      S.play('catch', tier);
      const title = tier >= 4 ? 'ЛЕГЕНДА!' : tier >= 3 ? 'Невероятно!' : tier >= 2 ? 'Отличный улов!' : 'Улов!';
      const chips = [
        res.pass && res.pass.gained ? `🎟 +${res.pass.gained} XP пропуска` : '',
        f.season ? '🦇 сезонная рыба' : '',
        res.tourney ? `🏆 турнир: ${res.tourney.weight.toFixed(2)} кг` : '',
      ].filter(Boolean);
      const bg = this.modal(`<div class="ribbon outline-sm" style="background:linear-gradient(180deg,${A.shade(r.color, 0.15)},${A.shade(r.color, -0.15)})">${title}</div>
        <div class="burst"><div class="fish">${A.fishSvg(res.species).svg}</div></div>
        <div><span class="name outline" style="display:inline-block">${f.name}</span></div>
        <div style="margin-top:4px"><span class="rar" style="--rc:${r.color}">${r.name}</span>${res.isNew ? '<span class="newb">НОВЫЙ ВИД!</span>' : ''}</div>
        <div class="facts"><div><b>${res.weight.toFixed(2)}</b><small>кг</small></div><div><b style="color:#c27c00">+${fmt(res.price)}</b><small>цена</small></div><div><b style="color:#5c7cfa">+${res.xp || 0}</b><small>опыт</small></div></div>
        ${chips.length ? `<div class="xchips">${chips.map(c => `<span>${c}</span>`).join('')}</div>` : ''}
        <div class="desc">${f.desc}</div>
        <div class="acts"><button class="btn blue" data-keep>${A.icon('box', '#fff2a8', 24)} В садок</button><button class="btn yellow" data-sellnow>${coin(24)} +${fmt(res.price)}</button></div>`,
      { cls: 'has-ribbon catch', style: `--rc:${r.color}`, noClose: true, sticky: true });
      if (tier >= 2) this.confetti(tier >= 4 ? 90 : 50);
      bg.querySelector('[data-keep]').onclick = () => { S.play('click'); this.closeModal(bg); };
      bg.querySelector('[data-sellnow]').onclick = async e => {
        const el = e.currentTarget; el.disabled = true;
        await this.sell([res.keepId], el);
        this.closeModal(bg);
      };
      bg._onClose = () => {
        if (res.levelUp) {
          S.play('level');
          this.toast(`⭐ Уровень ${res.levelUp}! Награда +${fmt(res.reward)} монет`, 'ok');
          const opened = D.LOCATIONS.find(l => l.level === res.levelUp);
          if (opened && this.profile.license) setTimeout(() => this.toast(`${opened.emoji} Открыта новая локация: ${opened.name}!`, 'ok'), 500);
        }
        this.extras(Object.assign({ licStep: 'catch' }, res));
      };
    },

    /* =================== fx =================== */
    toast(msg, kind) {
      const t = document.createElement('div');
      t.className = 'toast ' + (kind || '');
      t.textContent = msg;
      $('#toasts').appendChild(t);
      while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2400 + Math.min(2000, msg.length * 25));
    },
    confetti(n) {
      const box = document.createElement('div');
      box.className = 'confetti';
      const colors = ['#ff5d5d', '#ffd23f', '#5ccf5c', '#3fa2ff', '#ff7eb6', '#9b6bff'];
      for (let i = 0; i < n; i++) {
        const c = document.createElement('i');
        c.style.left = Math.random() * 100 + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
        c.style.animationDelay = Math.random() * 0.6 + 's';
        c.style.transform = `rotate(${Math.random() * 360}deg)`;
        box.appendChild(c);
      }
      $('#app').appendChild(box);
      setTimeout(() => box.remove(), 4200);
    },
    coinBurst(fromEl) {
      const target = $('#coins-chip') || $('#hud-coins');
      if (!fromEl || !target) return;
      const a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
      for (let i = 0; i < 7; i++) {
        const c = document.createElement('div');
        c.className = 'coin-fly';
        c.innerHTML = coin(28);
        c.style.left = a.left + a.width / 2 - 14 + (Math.random() - 0.5) * 40 + 'px';
        c.style.top = a.top + a.height / 2 - 14 + 'px';
        $('#app').appendChild(c);
        setTimeout(() => {
          c.style.transform = `translate(${b.left - a.left - a.width / 2 + 20}px, ${b.top - a.top - a.height / 2 + 6}px) scale(.7)`;
          c.style.opacity = '0.2';
        }, 20 + i * 60);
        setTimeout(() => c.remove(), 1000 + i * 60);
      }
    },

    /* =================== demo scenes (offline screenshots) =================== */
    runDemo(screen) {
      const sc = this.scene, me = 'local';
      const after = (ms, fn) => setTimeout(fn, ms);
      switch (screen) {
        case 'custom': this.customSlot = this.params.get('slot') || 'hat'; return this.openCustomize(true);
        case 'shop': this.shopSub = this.params.get('sub') || 'rods'; return this.setTab('shop');
        case 'wear': this.shopSub = 'wear'; return this.setTab('shop');
        case 'collection': return this.setTab('collection');
        case 'keepnet': this.collSub = 'keep'; return this.setTab('collection');
        case 'info': return this.setTab('info');
        case 'profile': return this.setTab('profile');
        case 'rooms': this.setTab('home'); return this.roomsModal();
        case 'create': this.setTab('home'); return this.createRoomModal();
        case 'fish': this.setTab('collection'); return this.fishModal(this.params.get('id') || 'pike');
        case 'home': return this.setTab('home');
        case 'pass': case 'quests': case 'events': case 'house': case 'archive': case 'style': case 'ach':
          this.setTab('home'); return this.openSub(screen);
        case 'aim':
          N.send({ t: 'create', solo: true });
          return after(300, () => { Game.state = 'aim'; Game.holding = true; Game.power = 0.72; Game.powerDir = 0; Game.updateButton(); Game.setRing(0.72, '#ffa62b'); sc.aim(me, 0.72); Game.tick = () => {}; });
        case 'game':
          N.send({ t: 'create', solo: true });
          return after(300, () => {
            Game.tutorial(3);
            sc.cast(me, 0.42); Game.state = 'wait'; Game.updateButton();
            after(1700, () => { sc.approach(me, 'perch', 1.1); after(1600, () => sc.nibble(me)); });
          });
        case 'reel':
          N.send({ t: 'create', solo: true });
          return after(300, () => {
            Game.tutorial(3);
            sc.cast(me, 0.6);
            after(2400, () => {
              sc.approach(me, 'pike', 6); const p = sc.players.get(me); p.fish.x = p.bob.x; p.fish.y = p.hookY;
              sc.hooked(me, 'pike');
              Game.startFight({ strength: 0.6, stamina: 99, rushiness: 0.5, power: 1, reel: 1 }, 'pike');
              Game.holding = true; Game.tension = 0.55; Game.progress = 0.42;
              Game.reelTick = function () {
                this.tension = 0.6 + Math.sin(performance.now() / 300) * 0.06; this.progress = 0.45;
                document.getElementById('needle').style.left = (this.tension * 100) + '%';
                document.getElementById('dist').style.width = '45%';
                sc.reel(me, this.progress, this.tension);
              };
              Game.updateButton();
            });
          });
        case 'catch':
          N.send({ t: 'create', solo: true });
          return after(400, () => this.showCatch({ species: this.params.get('id') || 'pike', weight: 6.84, price: D.fishPrice('pike', 6.84), xp: 44, isNew: true, keepId: 999 }));
        case 'coop':
          N.send({ t: 'create', name: 'Утренний клёв', isPublic: true, bots: 4 });
          return after(400, () => {
            Game.tutorial(3);
            const bots = N.sock.botPlayers();
            bots.forEach(b => N.sock.forceBot(b.id, (p, k) => k.clear(p.id)));
            sc.cast(me, 0.5); Game.state = 'wait'; Game.updateButton();
            sc.cast('bot0', 0.35); sc.cast('bot1', 0.8); sc.cast('bot2', 0.55); sc.cast('bot3', 0.3);
            after(2600, () => {
              sc.approach('bot1', 'catfish', 20); const p1 = sc.players.get('bot1'); p1.fish.x = p1.bob.x; p1.fish.y = p1.hookY;
              sc.hooked('bot1', 'catfish'); sc.reel('bot1', 0.35, 0.7);
              sc.approach('bot2', 'carp', 4); sc.players.get('bot2').fish.x = sc.players.get('bot2').bob.x - 40;
              sc.bite('bot2');
              sc.emote('bot0', 'wave'); sc.emote('bot3', 'party');
              sc.approach(me, 'trout', 1.4);
              Game.feed('🎣 <b>Ника</b> поймала <b style="color:#29b6f6">Форель</b> · 1.86 кг');
              Game.feed('👋 <b>Тимур</b> пришёл порыбачить');
              const keep = () => { const e = sc.players.get('bot0'); if (e && e.emote) e.emote.t = 1; const e3 = sc.players.get('bot3'); if (e3 && e3.emote) e3.emote.t = 1; const b2 = sc.players.get('bot2'); if (b2) b2.bang = 0.3; requestAnimationFrame(keep); };
              keep();
            });
          });
      }
      this.setTab('home');
    },
  };
  Object.assign(App, window.HScreens);

  function logoLetters() {
    const letters = ['H', 'bob', 'O', 'K', 'E', 'D'];
    const colors = ['#ffd23f', '', '#ff8a3d', '#5ce1e6', '#7ee081', '#ff7eb6'];
    return letters.map((l, i) => l === 'bob'
      ? `<span class="l bob" style="--i:${i}">${A.bobberSvg(40)}</span>`
      : `<span class="l" style="--i:${i};--c:${colors[i]}">${l}</span>`).join('');
  }
  function logoHtml() { return logoLetters(); }

  function demoProfile() {
    const col = {};
    const add = (id, n, best) => { col[id] = { count: n, best, first: Date.now() - 86400000 * n }; };
    add('crucian', 23, 1.21); add('roach', 17, 0.74); add('perch', 31, 1.52); add('ruffe', 12, 0.33); add('bream', 8, 3.4);
    add('carp', 5, 6.8); add('trout', 6, 2.9); add('pike', 3, 8.4); add('koi', 1, 4.2);
    return {
      name: 'Алекс', coins: 4820, xp: 1830, customized: true, rod: 'carbon', license: true,
      look: { gender: 'm', face: 0, skin: 1, hair: 'messy', hairColor: 1, top: 'vest', topColor: 3, bottom: 'jeans', bottomColor: 11, hat: 'bucket', hatColor: 2, acc: 'none', tattoo: 'none', makeup: 'none' },
      owned: ['rod:bamboo', 'rod:fiberglass', 'rod:carbon', 'hat:straw', 'top:raincoat', 'acc:scarf'],
      stats: { caught: 106, earned: 9340, bestSpecies: 'pike', bestWeight: 8.4 },
      collection: col,
      keepnet: [
        { id: 1, species: 'pike', weight: 5.62, price: D.fishPrice('pike', 5.62), at: Date.now() },
        { id: 2, species: 'perch', weight: 1.12, price: D.fishPrice('perch', 1.12), at: Date.now() },
        { id: 3, species: 'carp', weight: 4.9, price: D.fishPrice('carp', 4.9), at: Date.now() },
        { id: 4, species: 'crucian', weight: 0.86, price: D.fishPrice('crucian', 0.86), at: Date.now() },
        { id: 5, species: 'trout', weight: 2.05, price: D.fishPrice('trout', 2.05), at: Date.now() },
        { id: 6, species: 'roach', weight: 0.41, price: D.fishPrice('roach', 0.41), at: Date.now() },
      ],
      nextKeep: 7,
    };
  }

  window.HApp = App;
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => App.start());
  else App.start();
})();
