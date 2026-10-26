/* Hooked — extra screens: license, season pass, quests, events, house, trades, archive, style, achievements */
(function () {
  'use strict';
  const D = window.HData, A = window.HArt, S = window.HAudio, N = window.HNet, U = window.HUtil;
  const tg = window.Telegram && window.Telegram.WebApp;
  const $ = s => document.querySelector(s);
  const { esc, fmt, haptic } = U;
  const coin = (s = 22) => A.icon('coin', '', s);
  const check = (s = 18) => A.icon('check', '#5ccf5c', s);
  const LOC_COLORS = { lake: '#4fc3f7', river: '#26a69a', swamp: '#8d9a5b', sea: '#3f6fd8' };
  const MEDALS = ['🥇', '🥈', '🥉'];

  function left(ms) {
    ms = Math.max(0, ms);
    const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d >= 1) return `${d} д ${h % 24} ч`;
    if (h >= 1) return `${h} ч ${m % 60} мин`;
    return `${Math.max(1, m)} мин`;
  }
  const when = ts => new Date(ts).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const dateStr = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const emoji = e => `<span class="th-emoji">${e}</span>`;
  const fishName = id => (D.FISH_BY_ID[id] || { name: id }).name;

  /* sub-screens: rendered into #screens instead of a tab, nav hidden, Telegram back button returns */
  const SUBS = {
    pass: { title: () => '🎟 Пропуск', cls: 'season-screen' },
    quests: { title: () => '🎯 Задания' },
    events: { title: () => '📅 События' },
    house: { title: () => '🏠 Мой домик' },
    visit: { title: () => '🏠 В гостях' },
    trade: { title: () => '🎁 Обмен и подарки' },
    archive: { title: () => '📚 Архив сезонов' },
    style: { title: () => '✨ Стиль' },
    ach: { title: () => '🏅 Достижения' },
  };

  const X = {
    /* =================== sub-screen framework =================== */
    openSub(name, data) {
      if (!SUBS[name]) return;
      this.sub = name; this.subData = data || null;
      this.closeAllModals();
      $('#nav').hidden = true;
      S.play('tab');
      this.renderSub();
      this.updateBackButton();
    },
    renderSub(keepScroll) {
      const def = SUBS[this.sub];
      if (!def) return;
      const sc0 = $('.screen'), st = keepScroll && sc0 ? sc0.scrollTop : 0;
      $('#screens').innerHTML = `<section class="screen scroll dim full sub ${def.cls || ''}">
        <div class="topbar"><button class="icon-btn" id="sub-back" aria-label="Назад">${A.icon('back', '#ffb84d', 26)}</button>
          <div class="sub-title outline-sm">${def.title.call(this)}</div><div class="spacer"></div>
          <div class="chip coins" id="coins-chip">${coin(28)}<span class="num">${fmt(this.profile.coins)}</span></div></div>
        ${this['sub_' + this.sub]()}
      </section>`;
      const sc = $('.screen');
      if (keepScroll && sc) { sc.style.animation = 'none'; sc.scrollTop = st; }
      $('#sub-back').onclick = () => { S.play('click'); this.closeSub(); };
      document.querySelectorAll('#screens [data-open]').forEach(b => b.onclick = () => { S.play('click'); this.openSub(b.dataset.open); });
      const bind = this['bindSub_' + this.sub];
      if (bind) bind.call(this, sc);
    },
    closeSub() { this.setTab(this.tab); },

    /* =================== shared thumbnails =================== */
    // preview of an ownable item 'kind:id'
    thumb(key, size) {
      const info = D.itemInfo(key);
      if (!info) return '';
      const look = Object.assign({}, this.profile.look);
      if (info.g) look.gender = info.g;
      switch (info.kind) {
        case 'hair': return A.avatar(Object.assign(look, { hair: info.id, hat: 'none' }), size);
        case 'hat': case 'acc': case 'makeup': return A.avatar(Object.assign(look, { [info.kind]: info.id }), size);
        case 'top': case 'bottom': case 'tattoo': return A.torsoCrop(Object.assign(look, { [info.kind]: info.id }));
        case 'emote': return emoji(D.EMOTE_BY_ID[info.id].e);
        case 'effect': return emoji(D.EFFECTS.find(e => e.id === info.id).e);
        case 'pose': return A.torsoCrop(look, info.id);
        case 'skin': return A.rodSvg(this.profile.rod, size || 64, info.id);
        case 'furn': return A.furnSvg(info.id, size || 64, this.scene && this.scene.hour);
        case 'title': return A.icon('medal', '#ffd23f', size || 44);
        case 'rod': return A.rodSvg(info.id, size || 64);
        case 'line': case 'hook': return A.tackleSvg(info.kind, info.id, size || 48);
      }
      return '';
    },
    rewardThumb(r) {
      if (!r) return '';
      if (r.coins) return `<span class="rw-coins">${coin(30)}<b>${fmt(r.coins)}</b></span>`;
      if (r.bait) return `<span class="rw-bait">${A.baitSvg(r.bait, 36)}<b>×${r.n}</b></span>`;
      if (r.set) return A.torsoCrop(Object.assign({}, this.profile.look, D.SETS[r.set].look));
      return this.thumb(r.item);
    },
    share(link, text) {
      const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
      if (tg && tg.openTelegramLink && tg.initData) tg.openTelegramLink(url);
      else if (navigator.share) navigator.share({ text, url: link }).catch(() => {});
      else this.copy(link, 'Ссылка скопирована');
    },

    /* =================== game / server hooks =================== */
    async setBait(id) {
      try {
        const r = await N.api('/api/bait', { bait: id });
        S.play('pop');
        this.setProfile(r.profile, true);
      } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
    },
    onBait(m) {
      const meta = this.profile.meta || (this.profile.meta = {});
      meta.bait = m.bait;
      meta.baits = Object.assign({}, m.baits);
    },
    // stepId: the step that just moved (catch/sell results arrive together with an already updated profile)
    onLicense(licIn, stepId) {
      const lic = Object.assign({}, licIn);
      const prev = this.profile.lic || {};
      this.profile.lic = lic;
      if (this.profile.meta) this.profile.meta.lic = lic;
      if (this.profile.customized) lic.look = 1;
      const step = D.licenseView(lic).find(s => (stepId ? s.id === stepId : (lic[s.id] || 0) !== (prev[s.id] || 0)));
      if (step) this.toast(`📜 Лицензия: ${step.name} — ${step.prog}/${step.goal}${step.done ? ' ✓' : ''}`, 'ok');
      const readyNow = D.licenseReadyForExam(lic) && (stepId ? !!(step && step.done) : !D.licenseReadyForExam(prev));
      if (readyNow) setTimeout(() => this.toast('🎓 Все задания выполнены! Сдай экзамен на главном экране', 'ok'), 700);
      if (!this.inGame) this.refresh();
    },
    onQuests(done, pass) { this.extras({ quests: done, pass }); },
    onBossReward(m) {
      if (m.profile) this.setProfile(m.profile, true);
      S.play('level');
      this.toast(`🏆 Босс повержен! +${fmt(m.coins)} монет`, 'ok');
      setTimeout(() => this.extras({ quests: m.quests, pass: m.pass, ach: m.ach }), 500);
    },
    eventsToast() {
      const now = Date.now();
      const act = D.eventSchedule(now).filter(e => e.active);
      const t = D.tournamentAt(now);
      const msgs = act.map(e => `${e.emoji} ${e.name} — ещё ${left(e.end - now)}. ${e.desc}`);
      if (t && t.active) msgs.push(`🏆 Турнир: кто поймает самую тяжёлую рыбу «${fishName(t.species)}»`);
      if (!msgs.length) return this.toast('Сейчас нет активных событий');
      msgs.forEach((m, i) => setTimeout(() => this.toast(m, 'ok'), i * 450));
    },
    // quest / pass / achievement / license extras that come with catches, sales, gifts…
    extras(res) {
      if (!res) return;
      const msgs = [];
      if (res.lic) this.onLicense(res.lic, res.licStep);
      (res.quests || []).forEach(q => msgs.push(`✅ Задание выполнено: ${q.name} · +${q.xp} XP пропуска`));
      if (res.pass) {
        const s = this.profile.season;
        if (s && res.pass.xp >= s.xp) { const lv = D.passLevel(res.pass.xp); Object.assign(s, { xp: res.pass.xp, level: lv.level, cur: lv.cur, need: lv.need }); }
        if (res.pass.levelUp) msgs.push(`🎟 Уровень пропуска ${res.pass.level}! Забери награду`);
      }
      (res.ach || []).forEach(a => msgs.push(`🏅 Достижение «${a.name}»${a.coins ? ` · +${fmt(a.coins)} монет` : ''}${a.title ? ` · титул «${a.title}»` : ''}`));
      if (res.tourney && res.tourney.first) msgs.push(`🏆 Ты участвуешь в турнире! Твой результат: ${res.tourney.weight.toFixed(2)} кг`);
      msgs.forEach((m, i) => setTimeout(() => this.toast(m, 'ok'), i * 450));
      if (msgs.some(m => m.startsWith('🏅') || m.startsWith('🎟'))) S.play('level');
    },
    showInbox() {
      const list = (this.profile && this.profile.inbox) || [];
      if (!list.length || this.sub === 'custom') return;
      const bg = this.modal(`<h2>Почта рыбака</h2><div class="list inbox">${list.map(x => `<div class="panel inbox-row"><div>${esc(x.text)}</div>${x.at ? `<small>${when(x.at)}</small>` : ''}</div>`).join('')}</div>
        <button class="btn block" data-close style="margin-top:14px">${A.icon('check', '#fff', 22)} Понятно</button>`, { bottom: true });
      bg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { S.play('click'); this.closeModal(bg); });
      S.play('pop');
      N.api('/api/inbox/read').then(r => this.setProfile(r.profile, true)).catch(() => {});
    },

    /* =================== license =================== */
    licenseCardHtml() {
      const p = this.profile;
      const lic = Object.assign({}, p.lic);
      if (p.customized) lic.look = 1;
      const steps = D.licenseView(lic), ready = D.licenseReadyForExam(lic), rw = D.LICENSE.reward;
      return `<div class="panel license-card">
        <div class="lc-head"><div class="lc-ic">${A.icon('scroll', '#ffe9a8', 44)}</div><div><b>Лицензия рыбака</b><small>Пока лицензии нет, можно рыбачить только на учебном озере. Выполни задания и сдай экзамен, чтобы открыть кооп-комнаты, магазин, локации, пропуск, задания и домик.</small></div></div>
        <div class="lc-steps">${steps.map((s, i) => `<div class="lc-step ${s.done ? 'done' : ''}"><span class="n">${s.done ? '✓' : i + 1}</span><span class="t">${esc(s.name)}</span><span class="p">${s.goal > 1 ? `${s.prog}/${s.goal}` : ''}</span></div>`).join('')}</div>
        ${ready ? `<button class="btn yellow xl block" id="lic-exam">${A.icon('scroll', '#fff', 28)} Сдать экзамен</button>` : ''}
        <button class="btn ${ready ? 'white sm' : 'xl'} block" id="play-solo">${ready ? '' : `<span class="badge-ico">${A.icon('play', '#fff', 26)}</span>`}<span class="stack">Учебная рыбалка${ready ? '' : '<span class="sub">Тихое озеро — забросы, улов и продажа</span>'}</span></button>
        <div class="lc-reward">Награда за лицензию: ${coin(18)} ${fmt(rw.coins)} и ${esc(D.BAIT_BY_ID[rw.bait].name)} ×${rw.n}</div>
      </div>`;
    },
    examModal() {
      const exam = D.LICENSE.exam;
      const answers = exam.map(() => -1);
      let wrong = [];
      const bg = this.modal(`<h2>Экзамен на лицензию</h2><div id="exam-box"></div>`, { cls: 'exam-modal' });
      const box = bg.querySelector('#exam-box');
      const render = () => {
        box.innerHTML = exam.map((q, i) => `<div class="ex-q ${wrong.includes(i) ? 'bad' : ''}"><b>${i + 1}. ${esc(q.q)}</b>${q.a.map((a, j) => `<button class="ex-a ${answers[i] === j ? 'on' : ''}" data-q="${i}" data-a="${j}">${esc(a)}</button>`).join('')}</div>`).join('') +
          `<button class="btn yellow xl block" id="ex-go">${A.icon('check', '#fff', 26)} Сдать</button>`;
        box.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { answers[+b.dataset.q] = +b.dataset.a; wrong = wrong.filter(i => i !== +b.dataset.q); S.play('pop'); haptic('select'); render(); });
        box.querySelector('#ex-go').onclick = async e => {
          if (answers.includes(-1)) { S.play('error'); return this.toast('Ответь на все вопросы', 'err'); }
          e.currentTarget.disabled = true;
          try {
            const r = await N.api('/api/license/exam', { answers });
            if (!r.ok) {
              wrong = r.wrong || [];
              S.play('error'); haptic('notify', 'error');
              this.toast(`Ошибок: ${wrong.length}. Подумай ещё раз!`, 'err');
              return render();
            }
            this.closeModal(bg);
            this.licenseDone(r);
          } catch (err) { S.play('error'); this.toast(err.message, 'err'); render(); }
        };
      };
      render();
    },
    licenseDone(r) {
      this.setProfile(r.profile);
      const p = this.profile, rw = r.reward || D.LICENSE.reward;
      S.play('level'); haptic('notify', 'success');
      this.confetti(90);
      const bg = this.modal(`<div class="ribbon outline-sm">Экзамен сдан!</div>
        <div class="lic-card"><div class="lic-ph">${A.avatar(p.look)}</div><div class="lic-tx"><small>ЛИЦЕНЗИЯ РЫБАКА</small><b>${esc(p.name)}</b><span>№ ${esc(p.licNo || '—')} · ${dateStr(Date.now())}</span></div></div>
        <div class="facts lic-facts"><div><b>${coin(20)} ${fmt(rw.coins)}</b><small>монет</small></div><div><b>${A.baitSvg(rw.bait, 24)} ×${rw.n}</b><small>${esc(D.BAIT_BY_ID[rw.bait].name)}</small></div></div>
        <div class="desc">Теперь тебе открыты кооп-комнаты, магазин, новые локации, рыболовный пропуск, задания, события, домик и обмен.</div>
        <button class="btn xl block" data-close>${A.icon('play', '#fff', 24)} Вперёд!</button>`, { cls: 'has-ribbon catch', noClose: true, sticky: true });
      bg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { S.play('click'); this.closeModal(bg); });
      bg._onClose = () => this.extras({ ach: r.ach });
    },

    /* =================== locations =================== */
    locModal(after) {
      const p = this.profile, lvl = p.level.level, cur = (p.meta && p.meta.loc) || 'lake';
      const season = D.seasonAt(Date.now());
      const bg = this.modal(`<h2>Куда поедем?</h2><div class="list">${D.LOCATIONS.map(l => {
        const open = D.locUnlocked(l.id, lvl);
        const fish = D.FISH.filter(f => f.loc.includes(l.id) && (!f.season || (season && season.id === f.season)));
        return `<button class="panel loc-card ${l.id === cur ? 'on' : ''} ${open ? '' : 'locked'}" data-loc="${l.id}" style="--lc:${LOC_COLORS[l.id]}">
          <div class="lc-em">${l.emoji}</div>
          <div class="lc-main"><b>${esc(l.name)}</b><small>${esc(l.desc)}</small>
            <div class="lc-fish">${fish.map(f => `<span class="${p.collection[f.id] ? '' : 'unk'}">${A.fishSvg(f.id).svg}</span>`).join('')}</div></div>
          ${open ? (l.id === cur ? '<span class="tag-on">ты здесь</span>' : '') : `<span class="tag-lock">🔒 ур. ${l.level}</span>`}
        </button>`;
      }).join('')}</div>`);
      bg.querySelectorAll('[data-loc]').forEach(b => b.onclick = async () => {
        const id = b.dataset.loc, l = D.LOC_BY_ID[id];
        if (!D.locUnlocked(id, lvl)) { S.play('error'); return this.toast(`${l.name} откроется на ${l.level} уровне`, 'err'); }
        if (id === cur) { this.closeModal(bg); if (after) after(id); return; }
        try {
          const r = await N.api('/api/loc', { loc: id });
          S.play('pop');
          this.closeModal(bg);
          this.setProfile(r.profile);
          this.toast(`${l.emoji} ${l.name}`, 'ok');
          if (after) after(id);
        } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
      });
    },

    /* =================== season pass =================== */
    passClaimable() {
      const s = this.profile.season;
      if (!s) return 0;
      const season = D.SEASON_BY_ID[s.id];
      let n = 0;
      for (let l = 1; l <= s.level; l++) {
        if (season.free[l] && !s.claimedFree.includes(l)) n++;
        if (s.premium && season.premium[l] && !s.claimedPrem.includes(l)) n++;
      }
      return n;
    },
    passBannerHtml() {
      const s = this.profile.season;
      if (!s) return '';
      const n = this.passClaimable();
      return `<button class="pass-banner" data-open="pass">
        <span class="pb-lv">${s.level}</span>
        <span class="pb-main"><b>${esc(s.title)}</b><span class="pb-bar"><i style="width:${s.level >= s.max ? 100 : (s.cur / s.need * 100).toFixed(0)}%"></i></span><small>${s.premium ? '🎟 Премиум' : 'Рыболовный пропуск'} · ещё ${left(s.end - Date.now())}</small></span>
        ${n ? `<span class="pb-n">${n}</span>` : `<span class="pb-go">${A.icon('ticket', '#ffd23f', 30)}</span>`}
      </button>`;
    },
    sub_pass() {
      const s = this.profile.season;
      if (!s) return `<div class="panel empty"><div class="big">🌙</div>Сейчас межсезонье — новый сезон скоро начнётся.<br><br><button class="btn white sm" data-open="archive">${A.icon('archive', '#9fd2ff', 20)} Архив сезонов</button></div>`;
      const season = D.SEASON_BY_ID[s.id];
      const claimable = this.passClaimable();
      const canBuy = N.online && N.config && N.config.stars && tg && tg.initData && tg.openInvoice;
      const sets = Object.keys(season.premium).map(Number).filter(l => season.premium[l].set).map(l => {
        const r = season.premium[l], set = D.SETS[r.set], got = s.claimedPrem.includes(l);
        return `<div class="set-card ${got ? 'got' : ''}"><div class="sc-art">${A.character(Object.assign({}, this.profile.look, set.look))}</div>
          <div class="sc-nm">${esc(set.name)}</div><div class="sc-lv">${got ? 'получен ✓' : `премиум · ур. ${l}`}</div></div>`;
      }).join('');
      let rows = '';
      for (let l = 1; l <= D.PASS_LEVELS; l++) {
        rows += `<div class="pass-row ${l <= s.level ? 'reached' : ''}"><div class="pl-n">${l}</div>${this.passCell('free', l, season.free[l])}${this.passCell('prem', l, season.premium[l])}</div>`;
      }
      return `<div class="panel pass-hero">
          <div class="ph-top"><div><div class="ph-title">${esc(season.title)}</div><div class="ph-sub">До конца сезона ${left(s.end - Date.now())}</div></div><div class="lvl-badge">${s.level}</div></div>
          <div class="ph-desc">${esc(season.desc)}</div>
          <div class="lvl-row"><div class="bar"><i style="width:${s.level >= s.max ? 100 : (s.cur / s.need * 100).toFixed(0)}%"></i><span>${s.level >= s.max ? 'Максимальный уровень!' : `${s.cur} / ${s.need} XP до уровня ${s.level + 1}`}</span></div></div>
          ${s.premium ? `<div class="prem-on">${check(20)} Премиум-пропуск активен</div>`
            : canBuy ? `<button class="btn purple block" id="pass-buy">${A.icon('ticket', '#fff2a8', 26)} Премиум за ${s.price} ⭐</button>`
              : `<div class="pass-note">Премиум-ветка покупается за ${s.price} ⭐ Telegram Stars — открой игру через бота в Telegram.</div>`}
          <div class="ph-acts"><button class="btn white sm" data-open="quests">${A.icon('scroll', '#5ccf5c', 20)} Задания</button>${claimable ? `<button class="btn yellow sm" id="pass-all">${A.icon('gift', '#fff', 20)} Забрать всё · ${claimable}</button>` : ''}</div>
          <div class="pass-how">Опыт пропуска дают пойманные рыбы (редкие — больше) и выполненные задания.</div>
        </div>
        ${sets ? `<div class="section-title outline-sm">Главные награды премиума</div><div class="sets-row">${sets}</div>` : ''}
        <div class="pass-head"><span></span><span>Бесплатно</span><span>${A.icon('ticket', '#ffd23f', 18)} Премиум</span></div>
        <div class="pass-track">${rows}</div>`;
    },
    passCell(track, l, r) {
      if (!r) return '<div class="pass-cell none"></div>';
      const s = this.profile.season;
      const claimed = (track === 'prem' ? s.claimedPrem : s.claimedFree).includes(l);
      const locked = track === 'prem' && !s.premium;
      const can = l <= s.level && !claimed && !locked;
      const st = claimed ? 'claimed' : can ? 'can' : locked ? 'locked' : 'future';
      return `<button class="pass-cell ${track} ${st} ${r.set ? 'set' : ''}" data-cell="${track}:${l}">
        <span class="pc-art">${this.rewardThumb(r)}</span><span class="pc-nm">${esc(D.rewardName(r))}</span>
        ${claimed ? `<span class="pc-st">${check(16)}</span>` : can ? '<span class="pc-st can">Забрать</span>' : locked ? `<span class="pc-st">${A.icon('lock', '#ffd23f', 16)}</span>` : ''}
      </button>`;
    },
    bindSub_pass(sc) {
      const s = this.profile.season;
      if (!s) return;
      const season = D.SEASON_BY_ID[s.id];
      sc.querySelectorAll('[data-cell]').forEach(b => b.onclick = () => {
        const [track, ls] = b.dataset.cell.split(':'), l = +ls;
        const r = (track === 'prem' ? season.premium : season.free)[l];
        if (b.classList.contains('can')) return this.passClaim({ track, level: l });
        S.play('pop');
        const why = b.classList.contains('claimed') ? 'уже получено' : b.classList.contains('locked') ? 'нужен премиум-пропуск' : `откроется на ${l} уровне пропуска`;
        this.toast(`${D.rewardName(r)} — ${why}`);
      });
      const all = sc.querySelector('#pass-all'); if (all) all.onclick = () => this.passClaim({ all: true });
      const buy = sc.querySelector('#pass-buy'); if (buy) buy.onclick = () => this.buyPremium();
    },
    async passClaim(body) {
      try {
        const r = await N.api('/api/pass/claim', body);
        S.play('buy'); haptic('notify', 'success');
        this.setProfile(r.profile, true);
        this.toast(r.got.length > 3 ? `Получено наград: ${r.got.length}` : `Получено: ${r.got.join(', ')}`, 'ok');
        if (r.got.length > 1 || r.got.some(n => n.startsWith('Сет'))) this.confetti(60);
        if (this.sub) this.renderSub(true); else this.refresh();
      } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
    },
    async buyPremium() {
      try {
        const { link } = await N.api('/api/pass/invoice');
        S.play('click');
        tg.openInvoice(link, status => {
          if (status === 'paid') { this.toast('Оплата прошла! Активируем пропуск…', 'ok'); this.waitPremium(0); }
          else if (status === 'failed') { S.play('error'); this.toast('Оплата не прошла', 'err'); }
        });
      } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
    },
    // the bot activates premium when Telegram delivers successful_payment — poll the profile until it shows up
    async waitPremium(n) {
      try {
        const r = await N.api('/api/me');
        if (r.profile.season && r.profile.season.premium) {
          this.setProfile(r.profile, true);
          S.play('level'); this.confetti(90);
          this.toast('🎟 Премиум-пропуск активирован!', 'ok');
          if (this.sub === 'pass') this.renderSub(true); else this.refresh();
          return;
        }
      } catch { /* retry */ }
      if (n < 10) setTimeout(() => this.waitPremium(n + 1), 1500);
      else this.toast('Пропуск активируется в течение минуты — загляни чуть позже', 'ok');
    },

    /* =================== quests =================== */
    sub_quests() {
      const q = this.profile.quests, s = this.profile.season;
      if (!q) return `<div class="panel empty"><div class="big">📜</div>Задания откроются после получения лицензии рыбака.</div>`;
      const now = Date.now();
      const row = x => {
        const pct = Math.min(100, x.prog / x.n * 100);
        return `<div class="q-row ${x.done ? 'done' : ''}"><div class="q-ic">${x.done ? check(26) : '🎯'}</div>
          <div class="q-main"><b>${esc(x.name)}</b><div class="q-bar"><i style="width:${pct.toFixed(0)}%"></i><span>${fmt(Math.floor(x.prog))} / ${fmt(x.n)}</span></div></div>
          <div class="q-xp">+${x.xp}<small>XP</small></div></div>`;
      };
      const sec = (title, list, ends, emptyText) => `<div class="section-title outline-sm">${title}${ends ? `<small>новые через ${left(ends - now)}</small>` : ''}</div>
        <div class="panel q-list">${list.length ? list.map(row).join('') : `<div class="empty">${emptyText}</div>`}</div>`;
      return (s ? `<button class="panel pass-mini" data-open="pass"><span class="lvl-badge">${s.level}</span><span><b>${esc(s.title)}</b><small>${s.level >= s.max ? 'максимальный уровень' : `${s.cur} / ${s.need} XP до уровня ${s.level + 1}`}</small></span>${A.icon('ticket', '#ffd23f', 30)}</button>` : '') +
        sec('Ежедневные', q.daily, q.dayEnds, 'Нет заданий') +
        sec('Еженедельные', q.weekly, q.weekEnds, 'Нет заданий') +
        sec('Особые задания сезона', q.special, null, 'Особые задания появятся в новом сезоне');
    },

    /* =================== events & tournaments =================== */
    sub_events() {
      const d = this.subData;
      if (!d) return '<div class="panel empty">Загружаем афишу…</div>';
      const now = Date.now();
      const evs = d.schedule.map(e => `<div class="ev-row ${e.active ? 'on' : ''}"><div class="ev-ic">${e.emoji}</div><div class="ev-main"><b>${esc(e.name)}</b><small>${esc(e.desc)}</small>
        <div class="ev-time">${e.active ? `Идёт сейчас · ещё ${left(e.end - now)}` : `Начнётся ${when(e.start)}`}</div></div></div>`).join('');
      const t = d.tourney;
      const prizes = D.TOURNEY.prizes.map((p, i) => `${MEDALS[i]} ${fmt(p.coins)}`).join(' · ');
      const topRows = list => list.map((r, i) => `<div class="top-row"><div class="pl">${MEDALS[i] || i + 1}</div><div class="ava">${r.look ? A.avatar(r.look) : A.icon('trophy', '#ffd23f', 30)}</div>
        <div><div class="nm">${esc(r.name)}</div>${r.title ? `<div class="sm">${esc(r.title)}</div>` : ''}</div><div class="price">${r.weight.toFixed(2)} кг</div></div>`).join('');
      const tour = t ? `<div class="panel tourney">
          <div class="tn-head"><div class="tn-fish">${A.fishSvg(t.species).svg}</div><div><b>Турнир выходного дня</b><small>Самая тяжёлая рыба: <b>${esc(fishName(t.species))}</b></small>
            <div class="ev-time">${t.active ? `Идёт · ещё ${left(t.end - now)}` : `Старт ${when(t.start)}`}</div></div></div>
          <div class="tn-rules">Призы: ${prizes} монет и опыт пропуска. За участие +${D.TOURNEY.joinXp} XP пропуска. Ловить можно на любой локации, где водится эта рыба.</div>
          ${t.active ? `<div class="tn-me">${t.me ? `Твой рекорд: <b>${t.me.toFixed(2)} кг</b>` : 'Ты ещё не участвуешь — поймай эту рыбу!'}${t.count ? ` · участников: ${t.count}` : ''}</div>` : ''}
          ${t.offline ? '<div class="empty">Таблица лидеров доступна в онлайн-игре</div>' : t.top.length ? topRows(t.top) : (t.active ? '<div class="empty">Пока никто не поймал — стань первым!</div>' : '')}
        </div>` : '';
      const last = d.last && d.last.results && d.last.results.length ? `<div class="section-title outline-sm">Итоги прошлого турнира</div>
        <div class="panel"><div class="tn-sub">${esc(fishName(d.last.species))} · ${dateStr(d.last.start + 3600e3)}</div>${topRows(d.last.results.slice(0, 3))}</div>` : '';
      return `<div class="section-title outline-sm">Расписание</div><div class="panel ev-list">${evs || '<div class="empty">Событий пока нет</div>'}</div>
        ${tour ? `<div class="section-title outline-sm">Турнир</div>${tour}` : ''}${last}
        <div class="section-title outline-sm">Босс сезона</div>
        <div class="panel boss-info"><div class="bi-ic">👹</div><div><b>${esc(d.boss)}</b><small>Всплывает в кооп-комнатах, где рыбачат двое и больше. Каждая пойманная рыба наносит ему урон — победите его вместе за ${Math.round(D.BOSS.duration / 60000)} минуты и получите по ${fmt(D.BOSS.reward.coins)} монет и опыт пропуска.</small></div></div>`;
    },
    async bindSub_events() {
      if (this.subData) return;
      try {
        const r = await N.api('/api/events');
        if (this.sub !== 'events') return;
        this.subData = r;
        this.renderSub(true);
      } catch (e) { this.toast(e.message, 'err'); }
    },

    /* =================== fisher's house =================== */
    housePose(pose) { return pose && pose !== 'none' ? pose : 'idle'; },
    sub_house() {
      const p = this.profile, m = p.meta;
      return `<div class="house-wrap">${A.houseSvg(m.house, { look: p.look, pose: this.housePose(m.pose), editable: true, hour: this.scene.hour, collection: p.collection })}</div>
        <div class="house-hint">Нажми на место в комнате, чтобы поставить мебель, выбрать рыбок для аквариума или трофеи на стену.</div>
        <div class="two-btns">${N.online ? `<button class="btn" id="house-invite">${A.icon('share', '#d6ffd0', 22)} Позвать в гости</button>` : ''}
          <button class="btn orange" id="house-shop">${A.icon('sofa', '#ffe0a8', 24)} Мебель</button></div>`;
    },
    bindSub_house(sc) {
      sc.querySelectorAll('.hslot').forEach(g => g.addEventListener('click', () => { S.play('pop'); this.houseSlot(g.dataset.slot); }));
      const inv = sc.querySelector('#house-invite');
      if (inv) inv.onclick = () => {
        S.play('click');
        const bot = (N.config && N.config.botUsername) || 'HookedGame';
        this.share(`https://t.me/${bot}?start=house_${this.profile.id}`, '🏠 Заходи в гости в мой домик рыбака в Hooked!');
      };
      sc.querySelector('#house-shop').onclick = () => { this.shopSub = 'furn'; this.setTab('shop'); };
    },
    houseSlot(slot) {
      if (slot === 'trophy') return this.pickFish('trophies', 'Трофеи на стене');
      const p = this.profile, owned = new Set(p.owned), house = p.meta.house;
      const cur = Object.assign({ window: 'window', seat: 'stool' }, house.slots)[slot];
      const season = D.seasonAt(Date.now());
      const rows = D.FURNITURE.filter(f => f.slot === slot).map(f => {
        const info = D.itemInfo('furn:' + f.id);
        const has = info.free || owned.has(info.key);
        if (!has && info.season && !info.pass && !(season && season.id === info.season)) return '';
        const act = cur === f.id ? '<span class="tag-on">стоит</span>'
          : has ? `<button class="btn blue sm" data-place="${f.id}">Поставить</button>`
            : info.pass ? '<span class="tag-lock">🎟 пропуск</span>'
              : `<button class="btn yellow sm" data-buyf="${f.id}" ${p.coins < info.price ? 'disabled' : ''}>${coin(18)}${fmt(info.price)}</button>`;
        return `<div class="pick-row"><span class="pr-art">${A.furnSvg(f.id, 54, this.scene.hour)}</span><span class="pr-nm">${esc(f.name)}</span>${act}</div>`;
      }).join('');
      const canClear = house.slots[slot] && slot !== 'window' && slot !== 'seat';
      const bg = this.modal(`<h2>${esc(D.HOUSE_SLOTS.find(s => s.id === slot).name)}</h2><div class="list pick-list">${rows}</div>
        ${slot === 'tank' && house.slots.tank ? `<button class="btn teal block" id="hs-fish" style="margin-top:14px">${A.icon('fish', '#d6fff9', 24)} Рыбки в аквариуме</button>` : ''}
        ${canClear ? '<button class="btn white sm block" id="hs-clear" style="margin-top:12px">Убрать</button>' : ''}`);
      bg.querySelectorAll('[data-place]').forEach(b => b.onclick = () => this.houseSave({ slot, item: b.dataset.place }, bg));
      bg.querySelectorAll('[data-buyf]').forEach(b => b.onclick = () => this.buy('furn:' + b.dataset.buyf, () => this.houseSave({ slot, item: b.dataset.buyf }, bg)));
      const fish = bg.querySelector('#hs-fish'); if (fish) fish.onclick = () => { this.closeModal(bg); this.pickFish('tank', 'Рыбки в аквариуме'); };
      const clr = bg.querySelector('#hs-clear'); if (clr) clr.onclick = () => this.houseSave({ slot, item: null }, bg);
    },
    pickFish(kind, title) {
      const p = this.profile, max = 3;
      const species = Object.keys(p.collection).filter(id => D.FISH_BY_ID[id]).sort((a, b) => p.collection[b].best - p.collection[a].best);
      if (!species.length) { S.play('error'); return this.toast('Сначала поймай рыбу — она появится в дневнике', 'err'); }
      const sel = (p.meta.house[kind] || []).filter(id => p.collection[id]);
      const bg = this.modal(`<h2>${title}</h2><div class="pick-hint">Выбери до ${max} рыб из дневника</div>
        <div class="grid fish-pick">${species.map(id => { const f = D.FISH_BY_ID[id]; return `<button class="fish-card ${sel.includes(id) ? 'on' : ''}" style="--rc:${D.RARITY[f.rarity].color}" data-sp="${id}"><div class="pic">${A.fishSvg(id).svg}</div><div class="nm">${f.name}</div><div class="meta">${p.collection[id].best.toFixed(2)} кг</div></button>`; }).join('')}</div>
        <button class="btn block" id="fp-save" style="margin-top:14px">${A.icon('check', '#fff', 22)} Сохранить</button>`);
      bg.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => {
        const id = b.dataset.sp, i = sel.indexOf(id);
        if (i >= 0) sel.splice(i, 1);
        else { if (sel.length >= max) { S.play('error'); return this.toast(`Не больше ${max} рыб`, 'err'); } sel.push(id); }
        S.play('pop');
        b.classList.toggle('on', sel.includes(id));
      });
      bg.querySelector('#fp-save').onclick = () => this.houseSave({ [kind]: sel }, bg);
    },
    async houseSave(body, bg) {
      try {
        const r = await N.api('/api/house', body);
        S.play('pop'); haptic('select');
        if (bg) this.closeModal(bg);
        this.setProfile(r.profile);
      } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
    },
    async visitHouse(id) {
      if (!id) return;
      if (this.profile && id === this.profile.id) { if (this.profile.license) this.openSub('house'); return; }
      try {
        const r = await N.api('/api/house/visit', { id });
        this.openSub('visit', r);
        this.extras(r);
      } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
    },
    sub_visit() {
      const d = this.subData, o = d.owner;
      return `<div class="panel visit-head"><span class="ava">${A.avatar(o.look)}</span><div><b>${esc(o.name)}</b>${o.title ? `<small>${esc(o.title)}</small>` : '<small>Домик рыбака</small>'}</div></div>
        <div class="house-wrap">${A.houseSvg(d.house, { look: o.look, pose: this.housePose(o.pose), hour: this.scene.hour, collection: d.collection })}</div>
        ${this.profile.license ? '<div class="two-btns"><button class="btn orange" data-open="house">🏠 Мой домик</button></div>' : ''}`;
    },

    /* =================== trades & gifts =================== */
    myTradables() {
      const p = this.profile, baits = (p.meta && p.meta.baits) || {};
      return [].concat(
        p.keepnet.map(k => ({ spec: 'fish:' + k.id, kind: 'fish', id: k.species, label: `${fishName(k.species)} · ${k.weight.toFixed(2)} кг` })),
        Object.keys(baits).filter(b => baits[b] > 0 && D.BAIT_BY_ID[b] && b !== 'worm').map(b => ({ kind: 'bait', id: b, max: baits[b], label: D.BAIT_BY_ID[b].name })),
        p.owned.map(k => D.itemInfo(k)).filter(i => i && i.tradable).map(i => ({ spec: i.key, kind: i.kind, id: i.id, label: i.name })),
      );
    },
    tradeThumb(e) {
      if (e.kind === 'fish') return A.fishSvg(e.id).svg;
      if (e.kind === 'bait') return A.baitSvg(e.id, 40);
      return this.thumb(e.spec, 48);
    },
    sub_trade() {
      const t = this.profile.trades || { incoming: [], outgoing: [] };
      const deal = x => `<div class="tr-deal"><span>${esc(x.give)}</span>${A.icon('swap', '#5c7cfa', 22)}<span>${esc(x.want)}</span></div>`;
      return `<div class="two-btns"><button class="btn pink" id="tr-gift">${A.icon('gift', '#fff', 24)} Подарить</button><button class="btn blue" id="tr-offer">${A.icon('swap', '#fff', 24)} Обменяться</button></div>
        <div class="trade-note">Дарить и менять можно рыбу из садка, наживку и предметы из магазина. Награды пропуска, удочки, снасти и титулы остаются у тебя.</div>
        <div class="section-title outline-sm">Тебе предлагают · ${t.incoming.length}</div>
        <div class="list">${t.incoming.length ? t.incoming.map(x => `<div class="panel trade-row"><div class="tr-who">${esc(x.other)} предлагает обмен</div>${deal(x)}
          <div class="tr-hint">Ты получишь «${esc(x.give)}» и отдашь «${esc(x.want)}»</div>
          <div class="tr-acts"><button class="btn sm" data-acc="${x.id}">${A.icon('check', '#fff', 18)} Принять</button><button class="btn red sm" data-dec="${x.id}">Отклонить</button></div></div>`).join('')
          : '<div class="panel empty">Новых предложений нет</div>'}</div>
        <div class="section-title outline-sm">Мои предложения · ${t.outgoing.length}</div>
        <div class="list">${t.outgoing.length ? t.outgoing.map(x => `<div class="panel trade-row"><div class="tr-who">Для: ${esc(x.other)}</div>${deal(x)}
          <div class="tr-acts"><button class="btn white sm" data-can="${x.id}">Отменить</button></div></div>`).join('')
          : '<div class="panel empty">Ты пока ничего не предлагал</div>'}</div>`;
    },
    bindSub_trade(sc) {
      sc.querySelector('#tr-gift').onclick = () => { S.play('click'); this.tradeFlow('gift'); };
      sc.querySelector('#tr-offer').onclick = () => { S.play('click'); this.tradeFlow('trade'); };
      const act = async (path, body, msg) => {
        try { const r = await N.api(path, body); S.play('pop'); this.setProfile(r.profile); if (msg) this.toast(msg, 'ok'); } catch (e) { S.play('error'); this.toast(e.message, 'err'); this.refreshProfile(); }
      };
      sc.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => { b.disabled = true; act('/api/trade/respond', { id: +b.dataset.acc, accept: true }, '✅ Обмен состоялся!'); });
      sc.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => act('/api/trade/respond', { id: +b.dataset.dec, accept: false }, 'Предложение отклонено'));
      sc.querySelectorAll('[data-can]').forEach(b => b.onclick = () => act('/api/trade/cancel', { id: +b.dataset.can }, 'Предложение отменено'));
    },
    tradeFlow(mode) {
      const bg = this.modal(`<h2>${mode === 'gift' ? 'Подарок' : 'Обмен'}</h2>
        <div class="field"><label>Кому</label><div class="inline"><input class="input" id="tr-to" maxlength="40" placeholder="@username или ID" autocomplete="off"><button class="btn blue sm" id="tr-find">Найти</button></div></div>
        <div id="tr-step"><div class="pick-hint">Получатель должен уже иметь лицензию рыбака. ID игрока есть у него в профиле.</div></div>`);
      const inp = bg.querySelector('#tr-to');
      const find = async () => {
        const to = inp.value.trim();
        if (!to) { S.play('error'); return this.toast('Укажи ник или ID рыбака', 'err'); }
        try {
          const r = await N.api('/api/trade/inventory', { to });
          S.play('pop');
          this.tradeStep(bg, mode, r);
        } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
      };
      bg.querySelector('#tr-find').onclick = find;
      inp.onkeydown = e => { if (e.key === 'Enter') find(); };
      setTimeout(() => inp.focus(), 100);
    },
    tradeStep(bg, mode, data) {
      const inv = data.items || { fish: [], baits: [], items: [] };
      const sides = { give: this.myTradables(), want: [].concat(inv.fish || [], inv.baits || [], inv.items || []) };
      const pick = { give: -1, want: -1 };
      const box = bg.querySelector('#tr-step');
      const list = side => sides[side].length
        ? `<div class="list pick-list tr-list">${sides[side].map((e, i) => `<button class="pick-row tr-pick" data-side="${side}" data-i="${i}"><span class="pr-art">${this.tradeThumb(e)}</span><span class="pr-nm">${esc(e.label)}${e.max ? ` <small>×${e.max}</small>` : ''}</span></button>`).join('')}</div>
           <div class="amt" data-amt="${side}" hidden>Сколько штук: <input class="input" type="number" min="1" value="1"></div>`
        : `<div class="empty">${side === 'give' ? 'У тебя нет предметов, которые можно передать' : 'У рыбака нет предметов для обмена'}</div>`;
      const u = data.user;
      box.innerHTML = `<div class="tr-user"><span class="ava">${A.avatar(u.look)}</span><div><b>${esc(u.name)}</b><small>${u.title ? esc(u.title) : (u.username ? '@' + esc(u.username) : 'ID ' + esc(u.id))}</small></div></div>
        <div class="pick-title">${mode === 'gift' ? 'Что подарить' : 'Ты отдаёшь'}</div>${list('give')}
        ${mode === 'trade' ? `<div class="pick-title">Ты получаешь</div>${list('want')}` : ''}
        <button class="btn ${mode === 'gift' ? 'pink' : 'blue'} xl block" id="tr-go" disabled style="margin-top:14px">${mode === 'gift' ? A.icon('gift', '#fff', 24) + ' Подарить' : A.icon('swap', '#fff', 24) + ' Предложить'}</button>`;
      const go = box.querySelector('#tr-go');
      const ready = () => { go.disabled = pick.give < 0 || (mode === 'trade' && pick.want < 0); };
      box.querySelectorAll('.tr-pick').forEach(b => b.onclick = () => {
        const side = b.dataset.side, i = +b.dataset.i, e = sides[side][i];
        pick[side] = i;
        box.querySelectorAll(`.tr-pick[data-side="${side}"]`).forEach(x => x.classList.toggle('on', x === b));
        const amt = box.querySelector(`[data-amt="${side}"]`);
        if (amt) { amt.hidden = e.kind !== 'bait'; const n = amt.querySelector('input'); n.max = e.max || 1; n.value = Math.min(+n.value || 1, e.max || 1); }
        S.play('pop'); ready();
      });
      const spec = side => {
        const e = sides[side][pick[side]];
        if (e.kind !== 'bait') return e.spec;
        const n = Math.max(1, Math.min(e.max, Math.floor(+box.querySelector(`[data-amt="${side}"] input`).value || 1)));
        return `bait:${e.id}:${n}`;
      };
      go.onclick = async () => {
        go.disabled = true;
        try {
          if (mode === 'gift') {
            const r = await N.api('/api/gift', { to: u.id, item: spec('give') });
            S.play('buy'); haptic('notify', 'success');
            this.closeModal(bg);
            this.setProfile(r.profile);
            this.toast(`🎁 Подарено: ${r.label}`, 'ok');
            this.extras(r);
          } else {
            const r = await N.api('/api/trade/offer', { to: u.id, give: spec('give'), want: spec('want') });
            S.play('pop');
            this.closeModal(bg);
            this.setProfile(r.profile);
            this.toast('🔄 Предложение отправлено', 'ok');
          }
        } catch (e) { S.play('error'); this.toast(e.message, 'err'); ready(); }
      };
    },
    async refreshProfile() {
      try { const r = await N.api('/api/me'); this.setProfile(r.profile); } catch { /* offline hiccup */ }
    },

    /* =================== archive =================== */
    sub_archive() {
      const d = this.subData;
      if (!d) return '<div class="panel empty">Листаем архив…</div>';
      const cur = d.current ? `<button class="panel arc-cur" data-open="pass"><span class="lvl-badge">${(this.profile.season && this.profile.season.level) || 0}</span><span><b>${esc(d.current.title)}</b><small>идёт сейчас · до ${dateStr(d.current.end)}</small></span>${A.icon('ticket', '#ffd23f', 30)}</button>` : '';
      const past = d.seasons.length ? d.seasons.slice().reverse().map(s => `<div class="panel arc-card">
          <div class="arc-head"><b>${esc(s.title)}</b>${s.premium ? '<span class="tag-on">премиум</span>' : ''}</div>
          <div class="arc-sub">${dateStr(s.start)} — ${dateStr(s.end)}</div>
          <div class="arc-stats"><div><b>${s.level}/${D.PASS_LEVELS}</b><small>уровень пропуска</small></div><div><b>${s.rewards.length}</b><small>наград</small></div><div><b>${s.podiums.length ? s.podiums.map(p => MEDALS[p - 1] || p).join('') : '—'}</b><small>турниры</small></div></div>
          ${s.rewards.length ? `<div class="arc-rw">${s.rewards.slice(0, 14).map(n => `<span>${esc(n)}</span>`).join('')}${s.rewards.length > 14 ? `<span>и ещё ${s.rewards.length - 14}</span>` : ''}</div>` : ''}
        </div>`).join('')
        : '<div class="panel empty"><div class="big">📚</div>Здесь появятся прошедшие сезоны: твой уровень пропуска, полученные награды и места в турнирах.</div>';
      return cur + `<div class="section-title outline-sm">Прошедшие сезоны</div><div class="list">${past}</div>`;
    },
    async bindSub_archive() {
      if (this.subData) return;
      try {
        const r = await N.api('/api/archive');
        if (this.sub !== 'archive') return;
        this.subData = r;
        this.renderSub(true);
      } catch (e) { this.toast(e.message, 'err'); }
    },

    /* =================== style: effects, poses, rod skins, titles =================== */
    sub_style() {
      const p = this.profile, owned = new Set(p.owned), m = p.meta;
      const season = D.seasonAt(Date.now());
      const opt = (kind, it, on, art) => {
        const has = it.id === 'none' || owned.has(kind + ':' + it.id);
        const info = it.id === 'none' ? null : D.itemInfo(kind + ':' + it.id);
        if (!has && info.season && !info.pass && !(season && season.id === info.season)) return '';
        const lock = has ? '' : info.pass ? '🎟 пропуск' : `🔒 ${fmt(info.price)}`;
        return `<button class="style-opt ${on ? 'on' : ''} ${has ? '' : 'locked'}" data-st="${kind}:${it.id}"><span class="so-art">${art}</span><span class="so-nm">${esc(it.name)}</span>${lock ? `<span class="lock">${lock}</span>` : ''}</button>`;
      };
      const titles = Object.keys(D.TITLES).filter(id => owned.has('title:' + id));
      return `<div class="section-title outline-sm">Титул</div>
        <div class="panel title-list"><button class="title-opt ${!p.title ? 'on' : ''}" data-title="">Без титула</button>${titles.map(id => `<button class="title-opt ${p.title === id ? 'on' : ''}" data-title="${id}">${A.icon('medal', '#ffd23f', 22)} ${esc(D.TITLES[id])}</button>`).join('')}
          <div class="pick-hint">${titles.length ? 'Титул виден над твоим рыбаком в комнатах и в таблице лидеров.' : 'Титулы дают достижения и рыболовный пропуск.'}</div></div>
        <div class="section-title outline-sm">Эффект заброса</div>
        <div class="style-grid">${D.EFFECTS.map(e => opt('effect', e, (m.effect || 'none') === e.id, emoji(e.e))).join('')}</div>
        <div class="section-title outline-sm">Поза у воды</div>
        <div class="style-grid">${D.POSES.map(x => opt('pose', x, (m.pose || 'none') === x.id, A.torsoCrop(p.look, this.housePose(x.id)))).join('')}</div>
        <div class="section-title outline-sm">Скин удочки</div>
        <div class="style-grid">${D.ROD_SKINS.map(x => opt('skin', x, (m.skin || 'none') === x.id, A.rodSvg(p.rod, 60, x.id))).join('')}</div>`;
    },
    bindSub_style(sc) {
      const save = async body => {
        try { const r = await N.api('/api/style', body); S.play('pop'); haptic('select'); this.setProfile(r.profile); } catch (e) { S.play('error'); this.toast(e.message, 'err'); }
      };
      sc.querySelectorAll('[data-title]').forEach(b => b.onclick = () => save({ title: b.dataset.title }));
      sc.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
        const [kind, id] = b.dataset.st.split(':');
        if (!b.classList.contains('locked')) return save({ [kind]: id });
        const info = D.itemInfo(kind + ':' + id);
        if (info.pass) { S.play('pop'); return this.toast(`«${info.name}» — награда рыболовного пропуска`); }
        this.buy(info.key, () => save({ [kind]: id }));
      });
    },

    /* =================== achievements =================== */
    sub_ach() {
      const got = (this.profile.meta && this.profile.meta.ach) || {};
      const n = D.ACHIEVEMENTS.filter(a => got[a.id]).length;
      return `<div class="panel progress-card"><div class="big">${n}/${D.ACHIEVEMENTS.length}</div><div style="flex:1"><div style="font-size:13px;margin-bottom:5px">Достижений получено</div><div class="pbar"><i style="width:${(n / D.ACHIEVEMENTS.length * 100).toFixed(0)}%"></i></div></div></div>
        <div class="panel ach-list">${D.ACHIEVEMENTS.map(a => `<div class="ach-row ${got[a.id] ? 'done' : ''}"><div class="ach-ic">${A.icon('medal', got[a.id] ? '#ffd23f' : '#d8ccb0', 38)}</div>
          <div class="ach-main"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${a.title ? `<div class="ach-title">Титул «${esc(a.title)}»</div>` : ''}</div>
          <div class="ach-rw">${got[a.id] ? check(22) : a.coins ? `<span class="price">${coin(18)}${fmt(a.coins)}</span>` : ''}</div></div>`).join('')}</div>`;
    },
  };

  window.HScreens = X;
})();
