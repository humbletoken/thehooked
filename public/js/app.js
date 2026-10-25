/* Hooked — app shell: loading, menus, customization, rooms, collection, shop */
(function () {
  'use strict';
  const D = window.HData, A = window.HArt, S = window.HAudio, N = window.HNet, Game = window.HGame, U = window.HUtil;
  const tg = window.Telegram && window.Telegram.WebApp;
  const $ = s => document.querySelector(s);
  const { esc, fmt, haptic } = U;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const coin = (s = 22) => A.icon('coin', '', s);
  const NAV_COLORS = { shop: '#ff8fab', home: '#4fc3f7', collection: '#ffd23f', info: '#7ee081', profile: '#c39bff' };
  const NAV_ICONS = { shop: 'bag', home: 'fish', collection: 'box', info: 'info', profile: 'user' };
  const TIPS = [
    'Совет: ночью клюют сом, судак и светящийся угорь 🌙',
    'Совет: чем глубже заброс — тем крупнее и реже рыба',
    'Совет: не подсекай, пока поплавок только дёргается!',
    'Совет: золотая рыбка живёт у самого дна…',
    'Совет: зови друзей — в комнате до 5 рыбаков',
    'Совет: хорошая удочка выдерживает сильные рывки',
  ];

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
          await A.preload(D.FISH.map(f => A.fishImage(f.id)));
        }],
        ['Наживляем червячка…', async () => {
          if (demo && !N.online) N.local.seed(demoProfile());
          const r = await N.api('/api/me');
          this.profile = r.profile;
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

      if (demo && !N.online && this.params.get('screen')) return this.runDemo(this.params.get('screen'));
      if (!this.profile.customized) this.openCustomize(true);
      else this.setTab('home');
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
      } catch { /* old client */ }
    },
    handleDeepLink() {
      const sp = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
      const room = this.params.get('room') || (/^room_([A-Z0-9]{5})$/i.exec(sp) || [])[1];
      if (room) { this.pendingJoin = room.toUpperCase(); if (this.profile.customized) this.joinRoom(this.pendingJoin); return; }
      if (this.params.get('action') === 'coop' && this.profile.customized) this.roomsModal();
    },
    updateBackButton() {
      if (!tg) return;
      const show = this.inGame || !!$('.modal-bg') || this.sub === 'custom';
      try { show ? tg.BackButton.show() : tg.BackButton.hide(); } catch { /* old client */ }
    },
    back() {
      const m = document.querySelectorAll('.modal-bg');
      if (m.length) return this.closeModal(m[m.length - 1]);
      if (this.inGame) return Game.leave();
      if (this.sub === 'custom' && this.profile.customized) return this.setTab('profile');
    },

    renderLoadingArt() {
      $('#ld-logo').innerHTML = logoHtml();
      $('#ld-fish').innerHTML = A.fishSvg('goldfish').svg;
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
      Game.updateCoins();
      if (!silent && !this.inGame) this.refresh();
    },
    refresh() { if (this.sub !== 'custom') this.setTab(this.tab, true); },

    /* =================== navigation =================== */
    setTab(tab, keepScroll) {
      const prevScroll = keepScroll && $('.screen.scroll') ? $('.screen.scroll').scrollTop : 0;
      if (this.tab !== tab && !keepScroll) S.play('tab');
      this.tab = tab; this.sub = null;
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
      const sc = this.scene;
      if (this.inGame) return;
      sc.clearPlayers();
      sc.localId = 'me';
      sc.showLabels = false;
      sc.setRoom({ max: 1 });
      sc.addPlayer({ id: 'me', name: this.profile.name, look: this.profile.look, rod: this.profile.rod, slot: 0, level: this.profile.level.level });
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
    },

    homeHtml() {
      const night = D.isNight(this.scene.hour);
      const tag = night ? '🌙 Ночь: клюют сом, судак и угорь' : '☀️ День: клюют окунь, щука и форель';
      return `<section class="screen">
        ${this.topbar()}
        <div class="home-hero"><div class="logo small">${logoLetters()}</div></div>
        <div class="home-actions">
          <div class="home-tag">${tag}</div>
          <button class="btn xl block" id="play-solo"><span class="badge-ico">${A.icon('play', '#fff', 26)}</span><span class="stack">Играть соло<span class="sub">Тихое озеро только для тебя</span></span></button>
          <div class="row">
            <button class="btn blue sm-col" id="play-create">${A.icon('users', '#bfe3ff', 30)}Создать комнату</button>
            <button class="btn orange sm-col" id="play-find">${A.icon('globe', '#ffe0a8', 30)}Найти комнату</button>
          </div>
          <button class="btn white sm block" id="play-code">${A.icon('key', '#ffd23f', 22)} Войти по коду</button>
        </div>
      </section>`;
    },
    bind_home() {
      this.bindCommon();
      $('#play-solo').onclick = () => { S.unlock(); S.play('click'); N.send({ t: 'create', solo: true }); };
      $('#play-create').onclick = () => { S.play('click'); this.createRoomModal(); };
      $('#play-find').onclick = () => { S.play('click'); this.roomsModal(); };
      $('#play-code').onclick = () => { S.play('click'); this.codeModal(); };
    },

    shopHtml() {
      const sub = this.shopSub || 'rods';
      const p = this.profile, owned = new Set(p.owned);
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
            <div class="art">${A.rodSvg(r.id, 84)}</div>
            <div><h3>${r.name}</h3><p>${r.desc}</p>
              <div class="stats">${bar('Сила', r.power / mx.power, '#ff6b6b')}${bar('Скорость', r.reel / mx.reel, '#4aa3ff')}${bar('Удача', r.luck / mx.luck, '#b07bff')}${bar('Глубина ' + Math.round(r.depth * 12) + 'м', r.depth, '#22c3b5')}</div>
              <div class="actions">${act}</div></div></div>`;
        }).join('')}</div>`;
      } else {
        const items = [];
        for (const slot of ['hat', 'top', 'acc', 'bottom']) for (const it of D.ITEMS[slot]) if (it.price > 0) items.push([slot, it]);
        body = `<div class="grid">${items.map(([slot, it]) => {
          const key = slot + ':' + it.id, has = owned.has(key), worn = p.look[slot] === it.id;
          const look = Object.assign({}, p.look, { [slot]: it.id });
          const thumb = slot === 'top' || slot === 'bottom' ? A.character(look).replace('viewBox="0 0 200 260"', 'viewBox="20 40 160 220"') : A.avatar(look);
          const act = worn ? `<button class="btn white sm" disabled>Надето</button>`
            : has ? `<button class="btn blue sm" data-wear="${key}">Надеть</button>`
              : `<button class="btn yellow sm" data-buy="${key}" ${p.coins < it.price ? 'disabled' : ''}>${coin(18)}${fmt(it.price)}</button>`;
          return `<div class="item-card"><div class="thumb">${thumb}</div><div class="nm">${it.name}</div>${act}</div>`;
        }).join('')}</div>`;
      }
      return `<section class="screen scroll dim">
        ${this.topbar()}
        <div class="title outline">Магазин</div>
        <div class="seg"><button data-sub="rods" class="${sub === 'rods' ? 'on' : ''}">${A.icon('rod', sub === 'rods' ? '#ff8fab' : '#dfe4ff', 22)} Удочки</button><button data-sub="wear" class="${sub === 'wear' ? 'on' : ''}">${A.icon('shirt', sub === 'wear' ? '#ff8fab' : '#dfe4ff', 22)} Одежда</button></div>
        ${body}
      </section>`;
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
    },

    collectionHtml() {
      const sub = this.collSub || 'fish';
      const p = this.profile;
      const got = Object.keys(p.collection).length;
      let body;
      if (sub === 'fish') {
        body = `<div class="grid">${D.FISH.map(f => {
          const c = p.collection[f.id], r = D.RARITY[f.rarity];
          return `<button class="fish-card ${c ? '' : 'locked'}" style="--rc:${r.color}" data-fish="${f.id}">
            ${c ? `<span class="cnt">×${c.count}</span>` : ''}
            <div class="pic">${A.fishSvg(f.id).svg}</div>
            <div class="nm">${c ? f.name : '???'}</div>
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
        <div class="title outline">Коллекция</div>
        <div class="panel progress-card"><div class="big">${got}/${D.FISH.length}</div><div style="flex:1"><div style="font-size:13px;margin-bottom:5px">Видов поймано</div><div class="pbar"><i style="width:${(got / D.FISH.length * 100).toFixed(0)}%"></i></div></div></div>
        <div class="seg"><button data-csub="fish" class="${sub === 'fish' ? 'on' : ''}">${A.icon('fish', sub === 'fish' ? '#4fc3f7' : '#dfe4ff', 22)} Рыбы</button><button data-csub="keep" class="${sub === 'keep' ? 'on' : ''}">${A.icon('box', sub === 'keep' ? '#ffd23f' : '#dfe4ff', 22)} Садок · ${p.keepnet.length}</button></div>
        ${body}
      </section>`;
    },
    bind_collection() {
      this.bindCommon();
      document.querySelectorAll('[data-csub]').forEach(b => b.onclick = () => { this.collSub = b.dataset.csub; S.play('tab'); this.setTab('collection', true); $('.screen').scrollTop = 0; });
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
      const night = D.FISH.filter(f => f.time === 'night').map(f => f.name).join(', ');
      const day = D.FISH.filter(f => f.time === 'day').map(f => f.name).join(', ');
      return `<section class="screen scroll dim">
        ${this.topbar()}
        <div class="title outline">Как играть</div>
        <div class="panel">${steps.map((s, i) => `<div class="info-step"><div class="n" style="--c:${s[0]}">${i + 1}</div><div><b>${s[1]}</b><span>${s[2]}</span></div></div>`).join('')}</div>
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
        el.innerHTML = top.length ? top.slice(0, 10).map((r, i) => `<div class="top-row"><div class="pl">${['🥇', '🥈', '🥉'][i] || i + 1}</div><div class="ava">${A.avatar(r.look)}</div>
          <div><div class="nm">${esc(r.name)}</div><div class="sm">Ур. ${r.level} · ${r.caught} рыб · ${r.species}/${D.FISH.length} видов</div></div>
          <div class="price">${coin(18)}${fmt(r.earned)}</div></div>`).join('') : '<div class="empty">Пока пусто — стань первым!</div>';
      } catch { /* offline */ }
    },

    profileHtml() {
      const p = this.profile, lv = p.level, rod = D.ROD_BY_ID[p.rod];
      const best = p.stats.bestSpecies ? `${D.FISH_BY_ID[p.stats.bestSpecies].name}` : '—';
      return `<section class="screen scroll dim">
        ${this.topbar()}
        <div class="profile-hero">
          <div class="stage">${A.character(p.look)}</div>
          <div class="profile-name outline">${esc(p.name)}</div>
          <div class="lvl-row"><div class="lvl-badge">${lv.level}</div><div class="bar"><i style="width:${(lv.cur / lv.need * 100).toFixed(0)}%"></i><span>${lv.cur} / ${lv.need} XP</span></div></div>
          <div class="stat-grid">
            <div class="stat-tile"><div class="k">Поймано рыб</div><div class="v">${A.icon('fish', '#4fc3f7', 26)}${fmt(p.stats.caught)}</div></div>
            <div class="stat-tile"><div class="k">Заработано</div><div class="v">${coin(26)}${fmt(p.stats.earned)}</div></div>
            <div class="stat-tile"><div class="k">Коллекция</div><div class="v">${A.icon('box', '#ffd23f', 26)}${Object.keys(p.collection).length}/${D.FISH.length}</div></div>
            <div class="stat-tile"><div class="k">Трофей</div><div class="v" style="font-size:15px">${A.icon('trophy', '#ffd23f', 26)}<span>${best}${p.stats.bestWeight ? `<br><small style="color:var(--ink-soft)">${p.stats.bestWeight.toFixed(2)} кг</small>` : ''}</span></div></div>
          </div>
          <div class="panel rod-card" style="width:100%;margin-top:12px;grid-template-columns:70px 1fr">
            <div class="art" style="width:70px;height:70px">${A.rodSvg(rod.id, 62)}</div>
            <div><div style="font-size:12px;color:var(--ink-soft)">Удочка в руках</div><h3 style="margin:2px 0 0">${rod.name}</h3><div style="font-size:12px">Глубина до ${Math.round(rod.depth * 12)} м · удача ×${rod.luck}</div></div>
          </div>
          <div style="display:grid;gap:12px;width:100%;margin-top:14px">
            <button class="btn purple block" id="edit-look">${A.icon('shirt', '#e6dbff', 26)} Изменить внешность</button>
            <button class="btn block" id="invite-friend">${A.icon('share', '#d6ffd0', 24)} Пригласить друга</button>
          </div>
        </div>
      </section>`;
    },
    bind_profile() {
      this.bindCommon();
      $('#edit-look').onclick = () => { S.play('click'); this.openCustomize(false); };
      $('#invite-friend').onclick = () => { S.play('click'); this.invite(null); };
    },

    /* =================== customization =================== */
    openCustomize(first) {
      this.sub = 'custom';
      this.draftLook = Object.assign({}, this.profile.look);
      this.customSlot = this.customSlot || 'top';
      $('#nav').hidden = true;
      this.renderCustomize(first);
      this.updateBackButton();
    },
    renderCustomize(first) {
      const look = this.draftLook, owned = new Set(this.profile.owned);
      const slots = [['skin', 'Кожа', '🎨'], ['hair', 'Причёска', '💇'], ['top', 'Одежда', '👕'], ['bottom', 'Низ', '👖'], ['hat', 'Шапка', '🧢'], ['acc', 'Аксессуар', '🕶️']];
      const slot = this.customSlot;
      let opts = '', sw = '';
      const optBtn = (on, svg, attrs, locked, price) =>
        `<button class="opt ${on ? 'on' : ''} ${locked ? 'locked' : ''}" ${attrs}>${svg}${locked ? `<span class="lock">🔒 ${fmt(price)}</span>` : ''}</button>`;
      if (slot === 'skin') {
        opts = D.SKINS.map((c, i) => optBtn(look.skin === i, A.avatar(Object.assign({}, look, { skin: i })), `data-skin="${i}"`)).join('');
      } else {
        for (const it of D.ITEMS[slot]) {
          const test = Object.assign({}, look, { [slot]: it.id });
          if (slot === 'hair') test.hat = 'none';
          const svg = slot === 'top' ? A.character(test).replace('viewBox="0 0 200 260"', 'viewBox="40 100 120 120"')
            : slot === 'bottom' ? A.character(test).replace('viewBox="0 0 200 260"', 'viewBox="40 140 120 120"')
              : A.avatar(test);
          const locked = it.price > 0 && !owned.has(slot + ':' + it.id);
          opts += optBtn(look[slot] === it.id, svg, `data-item="${it.id}"`, locked, it.price);
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
        <div class="panel custom-panel"><div class="opt-grid">${opts}</div>${sw}</div>
        <button class="btn xl block done" id="cust-done">${A.icon('check', '#fff', 26)} ${first ? 'На рыбалку!' : 'Сохранить'}</button>
      </section>`;
      const rerender = () => { const sc0 = $('.screen'); const st = sc0 ? sc0.scrollTop : 0; this.renderCustomize(first); const sc1 = $('.screen'); sc1.style.animation = 'none'; sc1.scrollTop = st; };
      document.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { this.customSlot = b.dataset.slot; S.play('tab'); rerender(); });
      document.querySelectorAll('[data-skin]').forEach(b => b.onclick = () => { look.skin = +b.dataset.skin; S.play('pop'); rerender(); });
      document.querySelectorAll('[data-item]').forEach(b => b.onclick = () => {
        const id = b.dataset.item, it = D.findItem(slot, id);
        if (it.price > 0 && !owned.has(slot + ':' + id)) return this.buyItemModal(slot, it, () => { look[slot] = id; rerender(); });
        look[slot] = id; S.play('pop'); haptic('select'); rerender();
      });
      document.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { const [k, i] = b.dataset.color.split(':'); look[k] = +i; S.play('pop'); rerender(); });
      $('#dice').onclick = () => {
        S.play('pop');
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const free = s => D.ITEMS[s].filter(i => i.price === 0 || owned.has(s + ':' + i.id)).map(i => i.id);
        Object.assign(look, {
          skin: Math.floor(Math.random() * D.SKINS.length), hair: pick(free('hair')), hairColor: Math.floor(Math.random() * D.HAIR_COLORS.length),
          top: pick(free('top')), topColor: Math.floor(Math.random() * D.CLOTH_COLORS.length), bottom: pick(free('bottom')), bottomColor: Math.floor(Math.random() * D.CLOTH_COLORS.length),
          hat: pick(free('hat')), hatColor: Math.floor(Math.random() * D.CLOTH_COLORS.length), acc: pick(free('acc')),
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
          if (this.pendingJoin) this.joinRoom(this.pendingJoin);
          else if (this.params.get('action') === 'coop') this.roomsModal();
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
        const [slot, id] = item.split(':');
        const name = slot === 'rod' ? D.ROD_BY_ID[id].name : D.findItem(slot, id).name;
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
      } catch (e) { this.toast(e.message, 'err'); }
    },
    joinRoom(code) {
      this.pendingJoin = null;
      N.send({ t: 'join', code: String(code).toUpperCase() });
    },
    invite(room) {
      const code = room && room.code;
      const link = (room && room.link) || (N.config && N.config.appLink) || 'https://t.me/HookedGame';
      const text = code ? `🎣 Залетай ко мне на рыбалку в Hooked! Комната ${code}` : '🎣 Погнали на рыбалку в Hooked — лови рыбу вместе со мной!';
      const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
      if (tg && tg.openTelegramLink && tg.initData) tg.openTelegramLink(share);
      else if (navigator.share) navigator.share({ text, url: link }).catch(() => {});
      else this.copy(link, 'Ссылка скопирована');
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
          el.innerHTML = rooms.length ? rooms.map(r => `<div class="panel room-card">
              <div><div class="nm">${esc(r.name)}</div><div class="host">Хозяин: ${esc(r.host)}</div><div class="faces">${r.looks.map(l => `<span>${A.avatar(l)}</span>`).join('')}</div></div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><div class="cnt">${r.players}/${r.max}</div>
              <button class="btn ${r.players >= r.max ? 'white' : ''} sm" data-join="${r.code}" ${r.players >= r.max ? 'disabled' : ''}>${r.players >= r.max ? 'Полная' : 'Войти'}</button></div></div>`).join('')
            : `<div class="empty"><div class="big">🎣</div>Публичных комнат пока нет.<br>Создай свою и позови друзей!</div>`;
          el.querySelectorAll('[data-join]').forEach(b => b.onclick = () => { S.play('click'); this.joinRoom(b.dataset.join); });
        } catch (e) { el.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      };
      bg.querySelector('#rooms-refresh').onclick = () => { S.play('click'); load(); };
      bg.querySelector('#rooms-create').onclick = () => { S.play('click'); this.closeModal(bg); this.createRoomModal(); };
      load();
    },
    createRoomModal() {
      let pub = true;
      const bg = this.modal(`<h2>Новая комната</h2>
        <div class="field"><label>Название</label><input class="input" id="room-name" maxlength="28" placeholder="Рыбалка у ${esc(this.profile.name)}"></div>
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
      bg.querySelector('#room-go').onclick = () => {
        S.unlock(); S.play('click');
        N.send({ t: 'create', name: bg.querySelector('#room-name').value.trim(), isPublic: pub });
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
      const bg = this.modal(`<h2>${esc(room.name)}</h2>
        <div style="text-align:center;font-size:13px;color:var(--ink-soft)">${room.isPublic ? 'Публичная комната' : 'Приватная комната'} · ${room.players.length}/${room.max}</div>
        <div class="input code" style="display:grid;place-items:center;margin:12px 0 14px">${room.code}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <button class="btn white sm" id="ri-copy">${A.icon('copy', '#9fd2ff', 20)} Код</button>
          <button class="btn sm" id="ri-share">${A.icon('share', '#d6ffd0', 20)} Позвать</button>
        </div>`);
      bg.querySelector('#ri-copy').onclick = () => this.copy(room.code, 'Код скопирован');
      bg.querySelector('#ri-share').onclick = () => this.invite(room);
    },
    buyItemModal(slot, it, after) {
      const can = this.profile.coins >= it.price;
      const look = Object.assign({}, this.draftLook || this.profile.look, { [slot]: it.id });
      const bg = this.modal(`<h2>${it.name}</h2>
        <div style="width:150px;height:150px;margin:0 auto 10px;border-radius:24px;border:3px solid var(--ink);overflow:hidden;background:radial-gradient(circle,#e9f8ff,#a8dcf7)">${slot === 'top' || slot === 'bottom' ? A.character(look).replace('viewBox="0 0 200 260"', 'viewBox="20 40 160 220"') : A.avatar(look)}</div>
        <div style="text-align:center;margin-bottom:14px;font-size:14px">${D.SLOT_NAMES[slot]} из магазина</div>
        <button class="btn yellow xl block" id="bi-go" ${can ? '' : 'disabled'}>${coin(26)} Купить за ${fmt(it.price)}</button>
        ${can ? '' : '<div style="text-align:center;margin-top:10px;font-size:13px;color:#e03a3a">Не хватает монет — налови и продай рыбу!</div>'}`);
      bg.querySelector('#bi-go').onclick = () => { this.closeModal(bg); this.buy(slot + ':' + it.id, after); };
    },
    fishModal(id) {
      const f = D.FISH_BY_ID[id], r = D.RARITY[f.rarity], c = this.profile.collection[id];
      const time = f.time === 'day' ? '☀️ Днём' : f.time === 'night' ? '🌙 Ночью' : '🌗 Всегда';
      const dep = `${Math.round(f.depth[0] * 12)}–${Math.round(f.depth[1] * 12)} м`;
      this.modal(`<div class="catch" style="--rc:${r.color};padding-top:4px">
        <div class="burst" style="height:160px"><div class="fish" style="${c ? '' : 'filter:brightness(0) opacity(.35)'}">${A.fishSvg(id).svg}</div></div>
        <div class="name outline">${c ? f.name : '???'}</div><span class="rar" style="--rc:${r.color}">${r.name}</span>
        <div class="facts"><div><b>${dep}</b><small>глубина</small></div><div><b>${time}</b><small>клюёт</small></div><div><b>${f.minW}–${f.maxW}</b><small>кг</small></div></div>
        <div class="desc">${c ? f.desc : 'Эту рыбу ты ещё не ловил. Попробуй забросить на нужную глубину!'}</div>
        ${c ? `<div class="facts" style="margin-top:0"><div><b>×${c.count}</b><small>поймано</small></div><div><b>${c.best.toFixed(2)}</b><small>рекорд, кг</small></div><div><b>${fmt(D.fishPrice(id, c.best))}</b><small>цена рекорда</small></div></div>` : ''}
      </div>`);
    },

    showCatch(res, profile) {
      if (profile) this.setProfile(profile, true);
      const f = D.FISH_BY_ID[res.species], r = D.RARITY[f.rarity];
      const tier = D.RARITY_ORDER.indexOf(f.rarity);
      S.play('catch', tier);
      const title = tier >= 4 ? 'ЛЕГЕНДА!' : tier >= 3 ? 'Невероятно!' : tier >= 2 ? 'Отличный улов!' : 'Улов!';
      const bg = this.modal(`<div class="ribbon outline-sm" style="background:linear-gradient(180deg,${A.shade(r.color, 0.15)},${A.shade(r.color, -0.15)})">${title}</div>
        <div class="burst"><div class="fish">${A.fishSvg(res.species).svg}</div></div>
        <div><span class="name outline" style="display:inline-block">${f.name}</span></div>
        <div style="margin-top:4px"><span class="rar" style="--rc:${r.color}">${r.name}</span>${res.isNew ? '<span class="newb">НОВЫЙ ВИД!</span>' : ''}</div>
        <div class="facts"><div><b>${res.weight.toFixed(2)}</b><small>кг</small></div><div><b style="color:#c27c00">+${fmt(res.price)}</b><small>цена</small></div><div><b style="color:#5c7cfa">+${res.xp || 0}</b><small>опыт</small></div></div>
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
        }
      };
    },

    /* =================== fx =================== */
    toast(msg, kind) {
      const t = document.createElement('div');
      t.className = 'toast ' + (kind || '');
      t.textContent = msg;
      $('#toasts').appendChild(t);
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2400);
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
              Game.startFight({ strength: 0.6, stamina: 99, rushiness: 0.5 }, 'pike');
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
      name: 'Алекс', coins: 4820, xp: 1830, customized: true, rod: 'carbon',
      look: { skin: 1, hair: 'messy', hairColor: 1, top: 'vest', topColor: 3, bottom: 'jeans', bottomColor: 11, hat: 'bucket', hatColor: 2, acc: 'none' },
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
