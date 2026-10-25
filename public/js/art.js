/* Hooked — vector art: characters, fish, rods, icons (SVG strings) */
(function () {
  'use strict';
  const D = window.HData;
  const OL = '#2b1d16';
  let uidN = 0;
  const uid = () => 'h' + (++uidN).toString(36) + Math.random().toString(36).slice(2, 5);

  /* ---------- color helpers ---------- */
  function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function shade(h, amt) {
    const [r, g, b] = hex2rgb(h);
    if (amt < 0) return rgb2hex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
    return rgb2hex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  }
  function mix(a, b, t) {
    const x = hex2rgb(a), y = hex2rgb(b);
    return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }
  const ST = (w = 4) => `stroke="${OL}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  // limb drawn as an outlined thick stroke
  const limb = (d, color, w = 13, ol = 4) =>
    `<path d="${d}" fill="none" stroke="${OL}" stroke-width="${w + ol * 2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  // seeded rng so patterns stay the same for a species
  function rng(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* =====================================================================
     CHARACTER  — chibi, 200 x 260 units, faces the viewer
     ===================================================================== */
  const HAND = { x: 109, y: 181 }; // where the rod is gripped in the "fish" pose

  const HEAD = 'M52,84 C52,46 72,28 100,28 C128,28 148,46 148,84 C148,114 128,131 100,131 C72,131 52,114 52,84 Z';
  const TORSO = 'M66,148 C68,138 84,134 100,134 C116,134 132,138 134,148 L139,199 C139,209 128,213 100,213 C72,213 61,209 61,199 Z';

  function hairBack(style, c, cd) {
    if (style === 'long') return `<path d="M52,74 C40,104 40,146 50,166 C60,174 140,174 150,166 C160,146 160,104 148,74 Z" fill="${c}" ${ST()}/>` +
      `<path d="M58,120 C58,140 62,154 66,162" fill="none" stroke="${cd}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
    if (style === 'pony') return `<path d="M136,54 C178,44 190,96 170,132 C166,118 160,100 146,84 Z" fill="${c}" ${ST()}/>` +
      `<path d="M150,66 C168,72 174,96 168,116" fill="none" stroke="${cd}" stroke-width="3" stroke-linecap="round" opacity=".6"/>` +
      `<circle cx="141" cy="60" r="7" fill="#ff5c8a" ${ST(3)}/>`;
    if (style === 'curly') return `<path d="M50,96 C38,98 34,82 44,76 C40,64 50,58 56,62 L146,62 C152,58 162,64 156,76 C166,82 162,98 150,96 Z" fill="${c}" ${ST()}/>`;
    return '';
  }

  function hairFront(style, c, cd, cl) {
    const shine = `<path d="M72,40 C80,34 90,31 100,31" fill="none" stroke="${cl}" stroke-width="4" stroke-linecap="round" opacity=".7"/>`;
    switch (style) {
      case 'short':
        return `<path d="M50,88 C44,46 66,22 100,22 C134,22 156,46 150,88 C147,76 142,67 136,60 C127,67 116,65 108,58 C100,67 82,69 70,62 C62,69 54,77 50,88 Z" fill="${c}" ${ST()}/>` + shine;
      case 'messy':
        return `<path d="M48,90 C40,62 48,38 64,30 L60,15 L79,25 C86,16 97,12 105,19 L114,6 L119,23 C137,24 154,40 153,68 L163,70 L151,86 C147,75 141,67 133,61 L128,71 C118,67 110,61 104,56 C95,67 82,71 70,65 L66,75 C58,76 52,82 48,90 Z" fill="${c}" ${ST()}/>` + shine;
      case 'long':
        return `<path d="M50,96 C42,48 66,22 100,22 C136,22 158,48 150,96 C146,82 140,70 128,60 C112,72 84,73 62,60 C56,70 52,82 50,96 Z" fill="${c}" ${ST()}/>` + shine;
      case 'pony':
        return `<path d="M50,90 C44,46 66,22 100,22 C134,22 156,46 150,84 C144,72 132,62 118,58 C104,66 80,70 64,62 C58,70 52,80 50,90 Z" fill="${c}" ${ST()}/>` + shine;
      case 'curly':
        return `<path d="M48,90 C34,78 38,56 52,50 C48,32 64,20 80,26 C86,12 106,10 114,22 C128,12 148,22 146,38 C160,42 164,64 152,74 C156,82 154,88 150,92 C146,80 138,70 126,66 C114,72 92,72 74,66 C62,72 52,80 48,90 Z" fill="${c}" ${ST()}/>` +
          `<path d="M66,46 a6,6 0 0 1 10,-4 M92,34 a6,6 0 0 1 11,0 M120,42 a6,6 0 0 1 10,4" fill="none" stroke="${cd}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
      case 'buzz':
        return `<path d="M53,80 C50,44 70,27 100,27 C130,27 150,44 147,80 C140,62 124,50 100,50 C76,50 60,62 53,80 Z" fill="${c}" stroke="${OL}" stroke-width="3" stroke-linejoin="round" opacity=".92"/>`;
    }
    return '';
  }

  function hat(type, c, id) {
    const cd = shade(c, -0.22), cl = shade(c, 0.25);
    switch (type) {
      case 'cap':
        return `<path d="M50,72 C46,22 154,22 150,72 Z" fill="${c}" ${ST()}/>` +
          `<path d="M100,30 L100,68" stroke="${cd}" stroke-width="3"/>` +
          `<path d="M64,56 C66,42 80,32 94,30" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>` +
          `<circle cx="100" cy="27" r="5" fill="${cd}" ${ST(3)}/>` +
          `<circle cx="100" cy="54" r="10" fill="#fff" ${ST(3)}/>` +
          `<path d="M93,54 C96,49 103,49 106,53 L110,50 L110,58 L106,55 C103,59 96,59 93,54 Z" fill="${c}"/>` +
          `<path d="M42,72 C68,61 132,61 158,72 C165,76 162,85 153,84 C130,77 70,77 47,84 C38,85 35,76 42,72 Z" fill="${cd}" ${ST()}/>`;
      case 'bucket':
        return `<path d="M60,64 C60,24 140,24 140,64 Z" fill="${c}" ${ST()}/>` +
          `<path d="M60,52 C80,47 120,47 140,52 L140,63 C120,58 80,58 60,63 Z" fill="${cd}"/>` +
          `<path d="M72,46 C74,36 84,30 96,29" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>` +
          `<path d="M32,76 C38,58 162,58 168,76 C170,84 160,88 152,84 C122,73 78,73 48,84 C40,88 30,84 32,76 Z" fill="${cl}" ${ST()}/>` +
          `<path d="M46,76 C80,66 120,66 154,76" fill="none" stroke="${cd}" stroke-width="2.5" stroke-dasharray="5 5" stroke-linecap="round"/>`;
      case 'beanie':
        return `<circle cx="100" cy="18" r="13" fill="${cl}" ${ST()}/>` +
          `<path d="M48,74 C42,14 158,14 152,74 Z" fill="${c}" ${ST()}/>` +
          `<path d="M74,30 L70,58 M100,24 L100,58 M126,30 L130,58" stroke="${cd}" stroke-width="3" stroke-linecap="round" opacity=".7"/>` +
          `<path d="M45,60 C80,51 120,51 155,60 L155,78 C120,69 80,69 45,78 Z" fill="${cd}" ${ST()}/>` +
          [56, 68, 80, 92, 104, 116, 128, 140].map(x => `<path d="M${x},${57 + Math.abs(100 - x) * 0.05} L${x},${72 + Math.abs(100 - x) * 0.05}" stroke="${shade(c, -0.4)}" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>`).join('');
      case 'straw':
        return `<ellipse cx="100" cy="66" rx="76" ry="17" fill="#f2c46d" ${ST()}/>` +
          `<path d="M36,64 C60,74 140,74 164,64" fill="none" stroke="#c9973f" stroke-width="2.5" opacity=".8"/>` +
          `<path d="M62,66 C58,22 142,22 138,66 C120,72 80,72 62,66 Z" fill="#f7d38a" ${ST()}/>` +
          `<path d="M62,52 C80,58 120,58 138,52 L138,63 C120,69 80,69 62,63 Z" fill="#e53935" ${ST(3)}/>` +
          `<path d="M74,36 C86,40 114,40 126,36 M68,46 C86,50 114,50 132,46" fill="none" stroke="#c9973f" stroke-width="2.5" stroke-linecap="round"/>` +
          `<path d="M128,58 L144,52 L142,66 Z" fill="#ff7043" ${ST(2.5)}/>`;
      case 'captain':
        return `<path d="M42,52 C38,28 162,28 158,52 C150,64 50,64 42,52 Z" fill="#fafafa" ${ST()}/>` +
          `<path d="M56,56 L144,56 L142,74 C120,78 80,78 58,74 Z" fill="#1f2a6b" ${ST()}/>` +
          `<path d="M58,64 C80,68 120,68 142,64" fill="none" stroke="#ffca28" stroke-width="3"/>` +
          `<path d="M54,72 C80,80 120,80 146,72 C150,82 140,88 100,88 C60,88 50,82 54,72 Z" fill="#1b1b1b" ${ST()}/>` +
          `<path d="M66,80 C84,84 104,84 120,82" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".3"/>` +
          `<circle cx="100" cy="50" r="9" fill="#ffca28" ${ST(3)}/>` +
          `<path d="M100,44 L100,56 M95,47 L105,47 M95,53 Q100,58 105,53" fill="none" stroke="${OL}" stroke-width="2" stroke-linecap="round"/>`;
      case 'cowboy':
        return `<path d="M20,62 C26,82 62,76 100,76 C138,76 174,82 180,62 C184,54 172,52 166,60 C150,70 50,70 34,60 C28,52 16,54 20,62 Z" fill="#8d5a2b" ${ST()}/>` +
          `<path d="M62,68 C56,42 62,20 80,22 C90,24 92,32 100,32 C108,32 110,24 120,22 C138,20 144,42 138,68 C120,72 80,72 62,68 Z" fill="#a8703a" ${ST()}/>` +
          `<path d="M61,56 C80,61 120,61 139,56 L139,66 C120,71 80,71 61,66 Z" fill="#4e2c12"/>` +
          `<path d="M100,52 L103,58 L109,58 L104,62 L106,68 L100,64 L94,68 L96,62 L91,58 L97,58 Z" fill="#ffd54f" ${ST(2)}/>` +
          `<path d="M72,40 C74,32 80,28 86,28" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".3"/>`;
      case 'fishhat':
        return `<path d="M52,44 L20,22 Q32,44 20,68 Z" fill="#ff7043" ${ST()}/>` +
          `<path d="M86,18 Q102,-2 124,14 L120,22 Z" fill="#ff7043" ${ST()}/>` +
          `<path d="M44,64 C40,20 120,4 160,30 C172,40 170,56 158,64 C128,74 70,74 44,64 Z" fill="#ff8a3d" ${ST()}/>` +
          `<path d="M60,62 C90,70 130,68 156,60 C150,52 120,56 100,56 C80,56 66,54 60,62 Z" fill="#ffd08a"/>` +
          `<path d="M78,34 a8,8 0 0 1 12,0 M94,28 a8,8 0 0 1 12,0 M90,44 a8,8 0 0 1 12,0 M74,48 a8,8 0 0 1 12,0" fill="none" stroke="#e0602a" stroke-width="2.5" stroke-linecap="round"/>` +
          `<circle cx="138" cy="34" r="10" fill="#fff" ${ST(3)}/><circle cx="141" cy="35" r="5" fill="${OL}"/><circle cx="143" cy="32" r="1.8" fill="#fff"/>` +
          `<path d="M163,46 Q156,50 163,55" fill="none" ${ST(3)}/>`;
      case 'pirate':
        return `<path d="M28,60 C46,18 80,40 100,16 C120,40 154,18 172,60 C140,76 60,76 28,60 Z" fill="#263238" ${ST()}/>` +
          `<path d="M34,60 C62,72 138,72 166,60" fill="none" stroke="#ffca28" stroke-width="4" stroke-linecap="round"/>` +
          `<circle cx="100" cy="44" r="9" fill="#fff" ${ST(2.5)}/>` +
          `<circle cx="96.5" cy="43" r="2.2" fill="${OL}"/><circle cx="103.5" cy="43" r="2.2" fill="${OL}"/>` +
          `<path d="M86,58 L114,48 M86,48 L114,58" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`;
      case 'crown':
        return `<path d="M56,66 L50,26 L74,44 L88,16 L100,40 L112,16 L126,44 L150,26 L144,66 C120,72 80,72 56,66 Z" fill="#ffd54f" ${ST()}/>` +
          `<path d="M58,56 C80,62 120,62 142,56" fill="none" stroke="#e0a800" stroke-width="3"/>` +
          `<path d="M62,36 L66,58" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".55"/>` +
          [[50, 26], [88, 16], [112, 16], [150, 26]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#fff59d" ${ST(2.5)}/>`).join('') +
          `<circle cx="78" cy="58" r="5.5" fill="#e53935" ${ST(2.5)}/><circle cx="100" cy="60" r="6.5" fill="#29b6f6" ${ST(2.5)}/><circle cx="122" cy="58" r="5.5" fill="#66bb6a" ${ST(2.5)}/>`;
    }
    return '';
  }

  function eyes(acc) {
    const eye = (x) => `<ellipse cx="${x}" cy="90" rx="7" ry="9" fill="${OL}"/><circle cx="${x + 2.4}" cy="86.6" r="2.8" fill="#fff"/><circle cx="${x - 2.2}" cy="93" r="1.3" fill="#fff"/>`;
    if (acc === 'sunglasses') return '';
    return eye(83) + (acc === 'eyepatch' ? '' : eye(117));
  }

  function accessory(acc, hairC, scarfC) {
    switch (acc) {
      case 'glasses':
        return `<path d="M71,88 L54,85 M129,88 L146,85" ${ST(3)}/>` +
          `<circle cx="83" cy="90" r="13" fill="#fff" fill-opacity=".22" ${ST(3.5)}/><circle cx="117" cy="90" r="13" fill="#fff" fill-opacity=".22" ${ST(3.5)}/>` +
          `<path d="M96,89 Q100,85 104,89" fill="none" ${ST(3)}/>` +
          `<path d="M76,84 L80,80 M110,84 L114,80" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`;
      case 'sunglasses':
        return `<path d="M68,86 L54,84 M132,86 L146,84" ${ST(3)}/>` +
          `<path d="M66,83 L97,83 Q99,99 86,102 Q70,102 66,90 Z" fill="#1d1f33" ${ST(3.5)}/>` +
          `<path d="M134,83 L103,83 Q101,99 114,102 Q130,102 134,90 Z" fill="#1d1f33" ${ST(3.5)}/>` +
          `<path d="M96,85 L104,85" ${ST(3.5)}/>` +
          `<path d="M73,88 L80,95 M78,86 L86,94 M108,88 L115,95 M113,86 L121,94" stroke="#7fd1ff" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>`;
      case 'eyepatch':
        return `<path d="M54,70 Q100,74 148,98" fill="none" ${ST(3.5)}/>` +
          `<ellipse cx="117" cy="91" rx="13" ry="11" fill="#212121" ${ST(3)}/>` +
          `<path d="M110,86 Q114,83 119,84" fill="none" stroke="#fff" stroke-width="2" opacity=".35" stroke-linecap="round"/>`;
      case 'mustache':
        return `<path d="M78,106 C84,96 96,98 100,103 C104,98 116,96 122,106 C116,108 106,110 100,106 C94,110 84,108 78,106 Z" fill="${hairC}" ${ST(3)}/>`;
      case 'beard':
        return `<path d="M54,92 C54,122 74,144 100,144 C126,144 146,122 146,92 C140,106 132,113 122,115 C116,110 84,110 78,115 C68,113 60,106 54,92 Z" fill="${hairC}" ${ST()}/>` +
          `<path d="M80,106 C86,98 96,100 100,104 C104,100 114,98 120,106 C114,108 106,110 100,107 C94,110 86,108 80,106 Z" fill="${hairC}" ${ST(3)}/>` +
          `<path d="M92,116 Q100,122 108,116" fill="none" ${ST(3)}/>` +
          `<path d="M76,128 Q84,134 90,132 M112,132 Q118,134 124,128" fill="none" stroke="${shade(hairC, -0.3)}" stroke-width="2.5" stroke-linecap="round"/>`;
      case 'blush':
        return `<ellipse cx="72" cy="104" rx="9" ry="5.5" fill="#ff6f80" opacity=".7"/><ellipse cx="128" cy="104" rx="9" ry="5.5" fill="#ff6f80" opacity=".7"/>` +
          `<path d="M66,104 L69,100 M71,105 L74,101 M76,106 L79,102 M122,104 L125,100 M127,105 L130,101 M132,106 L135,102" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>`;
      case 'headphones':
        return `<path d="M48,90 C40,24 160,24 152,90" fill="none" stroke="${OL}" stroke-width="13" stroke-linecap="round"/>` +
          `<path d="M48,90 C40,24 160,24 152,90" fill="none" stroke="#546e7a" stroke-width="6" stroke-linecap="round"/>` +
          `<rect x="36" y="76" width="22" height="32" rx="10" fill="#ef5350" ${ST()}/><rect x="142" y="76" width="22" height="32" rx="10" fill="#ef5350" ${ST()}/>` +
          `<path d="M42,84 L42,98 M158,84 L158,98" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".5"/>`;
      case 'flower':
        return `<g transform="translate(140 52)">` +
          [0, 72, 144, 216, 288].map(a => `<circle cx="${(Math.cos(a * Math.PI / 180) * 8).toFixed(1)}" cy="${(Math.sin(a * Math.PI / 180) * 8).toFixed(1)}" r="7.5" fill="#ff80ab" ${ST(2.5)}/>`).join('') +
          `<circle r="5.5" fill="#ffd54f" ${ST(2.5)}/></g>`;
      case 'scarf':
        return '';
    }
    return '';
  }

  function scarf(c) {
    const cd = shade(c, -0.25);
    return {
      wrap: `<path d="M68,134 C80,146 120,146 132,134 L135,148 C122,160 78,160 65,148 Z" fill="${c}" ${ST()}/>` +
        `<path d="M70,142 C84,151 116,151 130,142" fill="none" stroke="#fff" stroke-width="3.5" opacity=".7"/>`,
      tail: `<path d="M108,150 L122,190 L106,193 L98,153 Z" fill="${c}" ${ST()}/>` +
        `<path d="M104,170 L119,167 M106,180 L121,177" stroke="#fff" stroke-width="3" opacity=".7"/>` +
        `<path d="M108,194 L107,200 M113,193 L113,199 M118,192 L119,198" stroke="${cd}" stroke-width="3" stroke-linecap="round"/>`,
    };
  }

  function outfit(look, top, id, pose) {
    const c = top, cd = shade(c, -0.22), cl = shade(c, 0.22);
    const parts = { defs: '', torso: '', front: '', behindHead: '', sleeve: c, shortSleeve: false, cuff: cd };
    const grad = `url(#${id}t)`;
    parts.defs = `<linearGradient id="${id}t" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="${cl}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${cd}"/></linearGradient>` +
      `<clipPath id="${id}c"><path d="${TORSO}"/></clipPath>`;
    const base = (fill) => `<path d="${TORSO}" fill="${fill}" ${ST()}/>`;
    const clip = (inner) => `<g clip-path="url(#${id}c)">${inner}</g>`;
    switch (look.top) {
      case 'tee':
        parts.shortSleeve = true;
        parts.torso = base(grad) +
          `<path d="M86,138 Q100,150 114,138" fill="none" ${ST(3)}/>` +
          `<path d="M86,176 C92,166 108,166 114,174 L122,168 L122,184 L114,178 C108,186 92,186 86,176 Z" fill="#fff" opacity=".9"/>` +
          `<circle cx="92" cy="175" r="1.8" fill="${c}"/>`;
        break;
      case 'hoodie':
        parts.behindHead = `<path d="M58,146 C52,118 72,108 100,110 C128,108 148,118 142,146 C130,136 70,136 58,146 Z" fill="${cd}" ${ST()}/>`;
        parts.torso = base(grad) +
          `<path d="M74,184 L126,184 L131,207 C110,212 90,212 69,207 Z" fill="${cd}" ${ST(3)}/>` +
          `<path d="M92,142 L90,166 M108,142 L110,166" ${ST(3)}/>` +
          `<circle cx="90" cy="168" r="3" fill="#fff" ${ST(2)}/><circle cx="110" cy="168" r="3" fill="#fff" ${ST(2)}/>`;
        break;
      case 'flannel': {
        const dark = shade(c, -0.38);
        parts.torso = base(c) + clip(
          [70, 88, 106, 124].map(x => `<rect x="${x}" y="130" width="9" height="90" fill="${dark}" opacity=".45"/>`).join('') +
          [148, 168, 188].map(y => `<rect x="55" y="${y}" width="90" height="9" fill="${dark}" opacity=".45"/>`).join('') +
          [79, 97, 115, 133].map(x => `<rect x="${x}" y="130" width="2" height="90" fill="#fff" opacity=".35"/>`).join('') +
          `<rect x="118" y="130" width="30" height="90" fill="#000" opacity=".1"/>`
        ) + `<path d="${TORSO}" fill="none" ${ST()}/>` +
          `<path d="M84,136 L100,152 L116,136 L110,134 L100,144 L90,134 Z" fill="${cl}" ${ST(3)}/>` +
          `<path d="M100,152 L100,210" stroke="${OL}" stroke-width="2.5" opacity=".6"/>` +
          [164, 182, 200].map(y => `<circle cx="104" cy="${y}" r="2.6" fill="#fff" ${ST(1.5)}/>`).join('');
        parts.sleeve = c;
        break;
      }
      case 'vest':
        parts.sleeve = '#eceff1'; parts.cuff = '#cfd8dc';
        parts.torso = base('#eceff1') +
          `<path d="M66,148 C68,138 80,135 90,136 L96,212 C80,212 63,208 61,199 Z" fill="${grad}" ${ST()}/>` +
          `<path d="M134,148 C132,138 120,135 110,136 L104,212 C120,212 137,208 139,199 Z" fill="${cd}" ${ST()}/>` +
          `<rect x="68" y="168" width="20" height="16" rx="3" fill="${cl}" ${ST(3)}/><path d="M68,172 L88,172" ${ST(2.5)}/>` +
          `<rect x="112" y="168" width="20" height="16" rx="3" fill="${c}" ${ST(3)}/><path d="M112,172 L132,172" ${ST(2.5)}/>` +
          `<rect x="70" y="190" width="18" height="13" rx="3" fill="${cl}" ${ST(3)}/><rect x="112" y="190" width="18" height="13" rx="3" fill="${c}" ${ST(3)}/>` +
          `<circle cx="80" cy="150" r="4" fill="#ffca28" ${ST(2)}/>`;
        break;
      case 'sailor':
        parts.shortSleeve = true; parts.sleeve = '#fafafa'; parts.cuff = c;
        parts.torso = base('#fafafa') + clip(
          [146, 160, 174, 188, 202].map(y => `<rect x="55" y="${y}" width="90" height="6" fill="${c}"/>`).join('') +
          `<rect x="120" y="130" width="30" height="90" fill="#000" opacity=".07"/>`
        ) + `<path d="${TORSO}" fill="none" ${ST()}/>` +
          `<path d="M84,137 L100,160 L116,137" fill="#fafafa" ${ST(3)}/>`;
        break;
      case 'raincoat':
        parts.behindHead = `<path d="M58,146 C52,116 72,106 100,108 C128,106 148,116 142,146 C130,136 70,136 58,146 Z" fill="${cd}" ${ST()}/>`;
        parts.torso = base(grad) +
          `<path d="M100,138 L100,212" stroke="${OL}" stroke-width="3"/>` +
          [158, 178, 198].map(y => `<rect x="93" y="${y - 3}" width="14" height="6" rx="3" fill="#8d6e63" ${ST(2)}/>`).join('') +
          `<path d="M72,150 C70,166 70,182 72,196" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45"/>` +
          `<path d="M118,184 L132,184 L133,196 L118,196 Z" fill="${cd}" ${ST(2.5)}/>`;
        break;
      case 'overalls': {
        const den = '#3f6fb5', denD = '#2d528a';
        parts.torso = base(grad) +
          `<path d="M76,166 L124,166 L126,212 C108,214 92,214 74,212 Z" fill="${den}" ${ST()}/>` +
          `<path d="M76,168 L68,140 M124,168 L132,140" stroke="${OL}" stroke-width="10" stroke-linecap="round"/>` +
          `<path d="M76,168 L68,140 M124,168 L132,140" stroke="${den}" stroke-width="5" stroke-linecap="round"/>` +
          `<rect x="88" y="174" width="24" height="16" rx="3" fill="${denD}" ${ST(2.5)}/>` +
          `<circle cx="79" cy="170" r="4" fill="#ffca28" ${ST(2)}/><circle cx="121" cy="170" r="4" fill="#ffca28" ${ST(2)}/>`;
        break;
      }
    }
    return parts;
  }

  function character(lookIn, opts = {}) {
    const look = D.sanitizeLook(lookIn);
    const pose = opts.pose || 'idle';
    const id = uid();
    const skin = D.SKINS[look.skin], skinD = shade(skin, -0.16), skinL = shade(skin, 0.16);
    const hc = D.HAIR_COLORS[look.hairColor], hcd = shade(hc, -0.3), hcl = shade(hc, 0.3);
    const top = D.CLOTH_COLORS[look.topColor];
    let bot = D.CLOTH_COLORS[look.bottomColor];
    const hatC = D.CLOTH_COLORS[look.hatColor];
    const fit = outfit(look, top, id, pose);
    if (look.top === 'overalls') bot = '#3f6fb5';
    const botD = shade(bot, -0.22);
    const hasHat = look.hat !== 'none';

    let defs = fit.defs +
      `<radialGradient id="${id}s" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${skinL}"/><stop offset=".7" stop-color="${skin}"/><stop offset="1" stop-color="${skinD}"/></radialGradient>`;

    const out = [];
    out.push(`<ellipse cx="100" cy="253" rx="50" ry="7" fill="#000" opacity=".18"/>`);
    out.push(hairBack(look.hair, hc, hcd));

    // legs & shoes
    if (look.bottom === 'shorts') {
      out.push(`<rect x="75" y="206" width="20" height="36" rx="8" fill="${skin}" ${ST()}/><rect x="105" y="206" width="20" height="36" rx="8" fill="${skin}" ${ST()}/>`);
      out.push(`<path d="M66,196 L134,196 L136,222 C136,226 104,226 102,222 L100,212 L98,222 C96,226 64,226 64,222 Z" fill="${bot}" ${ST()}/>`);
      out.push(`<path d="M100,204 L100,214" ${ST(3)}/>`);
    } else if (look.bottom === 'waders') {
      out.push(`<rect x="70" y="196" width="28" height="46" rx="9" fill="#5d7f3a" ${ST()}/><rect x="102" y="196" width="28" height="46" rx="9" fill="#4f6e30" ${ST()}/>`);
      out.push(`<path d="M70,222 L98,222 M102,222 L130,222" stroke="${OL}" stroke-width="3"/>`);
    } else {
      out.push(`<rect x="70" y="196" width="28" height="46" rx="9" fill="${bot}" ${ST()}/><rect x="102" y="196" width="28" height="46" rx="9" fill="${botD}" ${ST()}/>`);
      out.push(`<path d="M80,206 L80,236" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".25"/>`);
    }
    const shoe = look.bottom === 'waders' ? '#33502a' : '#6d4c41';
    out.push(`<path d="M64,242 C64,232 74,229 84,229 C95,229 100,234 100,243 C100,251 92,253 82,253 C70,253 64,250 64,242 Z" fill="${shoe}" ${ST()}/>`);
    out.push(`<path d="M136,242 C136,232 126,229 116,229 C105,229 100,234 100,243 C100,251 108,253 118,253 C130,253 136,250 136,242 Z" fill="${shade(shoe, -0.12)}" ${ST()}/>`);
    out.push(`<path d="M70,240 C72,235 78,233 84,233" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".35"/>`);

    // torso
    out.push(fit.torso);
    if (look.bottom === 'waders' && look.top !== 'overalls') {
      out.push(`<path d="M74,176 L126,176 L128,212 C108,214 92,214 72,212 Z" fill="#5d7f3a" ${ST()}/>` +
        `<path d="M76,178 L70,142 M124,178 L130,142" stroke="${OL}" stroke-width="9" stroke-linecap="round"/>` +
        `<path d="M76,178 L70,142 M124,178 L130,142" stroke="#5d7f3a" stroke-width="4" stroke-linecap="round"/>`);
    }

    // arms
    const arms = pose === 'fish'
      ? { l: 'M71,152 Q60,182 98,186', r: 'M129,152 Q144,172 118,178', ls: 'M71,152 Q66,166 68,174', rs: 'M129,152 Q136,162 137,168', hands: [] }
      : { l: 'M71,152 Q58,172 58,196', r: 'M129,152 Q142,172 142,196', ls: 'M71,152 Q63,162 61,172', rs: 'M129,152 Q137,162 139,172', hands: [[58, 198], [142, 198]] };
    if (fit.shortSleeve) {
      out.push(limb(arms.l, skin, 13), limb(arms.r, skin, 13));
      out.push(limb(arms.ls, fit.sleeve, 17), limb(arms.rs, fit.sleeve, 17));
    } else {
      out.push(limb(arms.l, fit.sleeve, 14), limb(arms.r, fit.sleeve, 14));
    }
    for (const [x, y] of arms.hands) out.push(`<circle cx="${x}" cy="${y}" r="9" fill="${skin}" ${ST()}/>`);

    // neck, hood, scarf
    out.push(`<path d="M88,118 L88,140 Q100,147 112,140 L112,118 Z" fill="${skinD}" ${ST()}/>`);
    out.push(fit.behindHead);
    const sc = look.acc === 'scarf' ? scarf(hatC) : null;
    if (sc) out.push(sc.wrap);

    // head
    out.push(`<circle cx="52" cy="90" r="11" fill="${skin}" ${ST()}/><circle cx="148" cy="90" r="11" fill="${skin}" ${ST()}/>`);
    out.push(`<path d="M50,86 Q54,92 51,96 M150,86 Q146,92 149,96" fill="none" stroke="${skinD}" stroke-width="3" stroke-linecap="round"/>`);
    out.push(`<path d="${HEAD}" fill="url(#${id}s)" ${ST()}/>`);
    out.push(`<ellipse cx="74" cy="104" rx="8" ry="4.5" fill="#ff8a80" opacity=".45"/><ellipse cx="126" cy="104" rx="8" ry="4.5" fill="#ff8a80" opacity=".45"/>`);
    out.push(eyes(look.acc));
    if (!(hasHat && ['bucket', 'cowboy'].includes(look.hat))) {
      out.push(`<path d="M75,75 Q83,70 91,74 M109,74 Q117,70 125,75" fill="none" stroke="${hcd}" stroke-width="4" stroke-linecap="round"/>`);
    }
    out.push(`<path d="M98,97 Q101,100 98,102" fill="none" stroke="${skinD}" stroke-width="3" stroke-linecap="round"/>`);
    out.push(`<path d="M89,108 Q100,121 111,108 Q100,111 89,108 Z" fill="#8e3b3b" ${ST(3)}/><path d="M95,114 Q100,118 105,114 Q100,112 95,114 Z" fill="#ff7b7b"/>`);

    // under a hat only the hair below the brim line is visible
    if (hasHat && look.hat !== 'crown') {
      defs += `<clipPath id="${id}h"><rect x="0" y="56" width="200" height="204"/></clipPath>`;
      out.push(`<g clip-path="url(#${id}h)">${hairFront(look.hair, hc, hcd, hcl)}</g>`);
    } else out.push(hairFront(look.hair, hc, hcd, hcl));
    out.push(accessory(look.acc, hc, hatC));
    if (hasHat) out.push(hat(look.hat, hatC, id));
    if (sc) out.push(sc.tail);

    const w = opts.width ? ` width="${opts.width}"` : '';
    const h = opts.height ? ` height="${opts.height}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"${w}${h}><defs>${defs}</defs>${out.join('')}</svg>`;
  }

  // small round avatar (head only)
  function avatar(look, size) {
    const svg = character(look, {});
    return svg.replace('viewBox="0 0 200 260"', `viewBox="34 4 132 132"${size ? ` width="${size}" height="${size}"` : ''}`);
  }

  /* =====================================================================
     FISH — side view, facing right
     ===================================================================== */
  const FISH_ART = {
    crucian:  { L: 165, hT: 52, hB: 44, st: 14, tail: 'fork', dorsal: 'long', c: ['#8f6f22', '#e1b443', '#fbe8a6', '#c98a2a'], pat: 'scales', head: 0.8 },
    roach:    { L: 175, hT: 38, hB: 33, st: 11, tail: 'fork', dorsal: 'normal', c: ['#3f6787', '#b9cfe2', '#f4f8fc', '#e5533d'], pat: 'scales', iris: '#e53935', head: 0.7 },
    perch:    { L: 172, hT: 46, hB: 36, st: 12, tail: 'fork', dorsal: 'spiky2', c: ['#456f22', '#a5c64a', '#f5f0b5', '#ff6a35'], pat: 'stripes', head: 0.65 },
    ruffe:    { L: 150, hT: 38, hB: 31, st: 11, tail: 'fork', dorsal: 'spiky', c: ['#5f4f31', '#a99566', '#ecdeb6', '#8f7a4f'], pat: 'speckles', mood: 'grumpy', head: 0.6 },
    bream:    { L: 165, hT: 64, hB: 56, st: 11, tail: 'fork', dorsal: 'tall', c: ['#55523f', '#b8aa7c', '#efe5c3', '#6e6a58'], pat: 'scales', head: 0.55, peak: 0.5 },
    carp:     { L: 200, hT: 52, hB: 42, st: 16, tail: 'fork', dorsal: 'long', c: ['#6a4f1d', '#c99a3b', '#f7de99', '#b5652a'], pat: 'bigscales', barbels: 'short', head: 0.8 },
    trout:    { L: 200, hT: 40, hB: 36, st: 14, tail: 'fork', dorsal: 'normal', adipose: true, c: ['#56763f', '#b6c78b', '#fff6e4', '#9db07a'], band: '#ff8fa3', pat: 'spots', head: 0.6 },
    pike:     { L: 245, hT: 30, hB: 28, st: 13, tail: 'fork', dorsal: 'rear', c: ['#38561f', '#86a84a', '#efeac2', '#c46a3a'], pat: 'pikespots', mood: 'angry', snout: 'long', head: 0.25, peak: 0.55 },
    zander:   { L: 210, hT: 38, hB: 32, st: 13, tail: 'fork', dorsal: 'spiky2', c: ['#4a5853', '#a9b7a8', '#eff3ea', '#7d8b84'], pat: 'bands', bigEye: true, fangs: true, head: 0.45 },
    salmon:   { L: 220, hT: 44, hB: 38, st: 14, tail: 'fork', dorsal: 'normal', adipose: true, c: ['#3a566f', '#e7a3a0', '#fff0ec', '#7c8ea0'], band: '#ff7d7d', pat: 'smallspots', head: 0.5 },
    catfish:  { L: 240, hT: 36, hB: 34, st: 15, tail: 'round', dorsal: 'small', c: ['#36352f', '#6e6a5c', '#dcd2b6', '#4a4840'], pat: 'mottle', whiskers: true, mood: 'sleepy', head: 0.95, peak: 0.3 },
    koi:      { L: 200, hT: 46, hB: 40, st: 14, tail: 'flow', dorsal: 'long', c: ['#f5efe6', '#fffaf2', '#ffffff', '#ffe6d0'], pat: 'koi', barbels: 'short', head: 0.75 },
    eel:      { L: 280, hT: 17, hB: 17, st: 2, tail: 'eel', dorsal: 'eel', c: ['#123848', '#257686', '#8fe8e2', '#1b5c69'], pat: 'glow', glow: '#62f6ff', head: 0.7, peak: 0.25 },
    sturgeon: { L: 265, hT: 30, hB: 24, st: 11, tail: 'shark', dorsal: 'rear', c: ['#465665', '#9aa9b5', '#e9edf0', '#5f7080'], pat: 'scutes', barbels: 'under', snout: 'pointy', head: 0.2, peak: 0.45 },
    goldfish: { L: 150, hT: 48, hB: 44, st: 12, tail: 'flow', dorsal: 'tall', c: ['#ff8a00', '#ffc21a', '#fff59d', '#ffb300'], pat: 'scales', crown: true, sparkles: true, head: 0.85 },
  };

  function fishSvg(species, opts = {}) {
    const a = FISH_ART[species] || FISH_ART.crucian;
    const id = uid();
    const R = rng(species);
    const [cBack, cMid, cBelly, cFin] = a.c;
    const tailLen = a.tail === 'flow' ? 84 : a.tail === 'eel' ? 6 : a.tail === 'shark' ? 58 : 50;
    const dorsalH = a.dorsal === 'tall' ? 40 : a.dorsal === 'eel' ? 12 : 28;
    const xt = 14 + tailLen;
    const xn = xt + a.L;
    const snoutX = a.snout === 'long' ? 10 : a.snout === 'pointy' ? 14 : 0;
    const cy = 16 + dorsalH + a.hT + (a.crown ? 22 : 0);
    const W = xn + snoutX + (a.whiskers ? 40 : 16);
    const H = cy + a.hB + 30 + (a.whiskers ? 20 : 0);
    const len = xn - xt;
    const pk = a.peak || 0.42;
    const hT = a.hT, hB = a.hB, st = a.st;
    const nx = xn + snoutX;
    const ny = cy + (a.snout ? 2 : 4);

    const body = a.tail === 'eel'
      ? `M${nx},${ny} C${nx},${cy - hT * 0.9} ${xn - len * 0.12},${cy - hT} ${xn - len * 0.25},${cy - hT} ` +
        `C${xn - len * 0.6},${cy - hT * 0.9} ${xt + len * 0.15},${cy - 7} ${xt - 4},${cy + 2} ` +
        `C${xt + len * 0.15},${cy + 9} ${xn - len * 0.6},${cy + hB * 0.95} ${xn - len * 0.25},${cy + hB} ` +
        `C${xn - len * 0.12},${cy + hB} ${nx},${cy + hB * 0.8} ${nx},${ny} Z`
      : `M${nx},${ny} C${nx - snoutX * 0.5},${cy - hT * a.head} ${xn - len * 0.18},${cy - hT} ${xn - len * pk},${cy - hT} ` +
        `C${xn - len * 0.72},${cy - hT} ${xt + len * 0.14},${cy - st * 1.6} ${xt},${cy - st} ` +
        `L${xt},${cy + st} ` +
        `C${xt + len * 0.14},${cy + st * 1.6} ${xn - len * 0.72},${cy + hB} ${xn - len * pk},${cy + hB} ` +
        `C${xn - len * 0.18},${cy + hB} ${nx - snoutX * 0.3},${cy + hB * Math.min(0.8, a.head + 0.1)} ${nx},${ny} Z`;

    const finStroke = `stroke="${OL}" stroke-width="3" stroke-linejoin="round"`;
    const ray = shade(cFin, -0.3);
    const parts = [];
    let defs = `<linearGradient id="${id}b" x1="0" x2="0" y1="0" y2="1">` +
      `<stop offset="0" stop-color="${cBack}"/><stop offset=".45" stop-color="${cMid}"/><stop offset="1" stop-color="${cBelly}"/></linearGradient>` +
      `<clipPath id="${id}c"><path d="${body}"/></clipPath>`;

    if (a.glow) {
      defs += `<filter id="${id}g" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="7"/></filter>`;
      parts.push(`<path d="${body}" fill="${a.glow}" opacity=".55" filter="url(#${id}g)"/>`);
    }

    // tail
    const th = Math.max(hT, hB) * (a.tail === 'flow' ? 1.05 : 0.95);
    let tail = '';
    if (a.tail === 'fork') {
      tail = `M${xt + 6},${cy - st} C${xt - 12},${cy - st - 10} ${xt - 32},${cy - th} ${xt - 46},${cy - th - 4} ` +
        `C${xt - 40},${cy - th * 0.4} ${xt - 32},${cy - 6} ${xt - 24},${cy} C${xt - 32},${cy + 6} ${xt - 40},${cy + th * 0.4} ${xt - 46},${cy + th + 4} ` +
        `C${xt - 32},${cy + th} ${xt - 12},${cy + st + 10} ${xt + 6},${cy + st} Z`;
    } else if (a.tail === 'round') {
      tail = `M${xt + 6},${cy - st} C${xt - 20},${cy - th} ${xt - 48},${cy - th * 0.8} ${xt - 48},${cy} C${xt - 48},${cy + th * 0.8} ${xt - 20},${cy + th} ${xt + 6},${cy + st} Z`;
    } else if (a.tail === 'flow') {
      tail = `M${xt + 6},${cy - st} C${xt - 30},${cy - th * 1.5} ${xt - 74},${cy - th * 1.3} ${xt - 82},${cy - th * 0.45} ` +
        `C${xt - 66},${cy - th * 0.35} ${xt - 60},${cy - 4} ${xt - 76},${cy + th * 0.15} ` +
        `C${xt - 86},${cy + th * 0.9} ${xt - 44},${cy + th * 1.6} ${xt + 6},${cy + st} Z`;
    } else if (a.tail === 'shark') {
      tail = `M${xt + 6},${cy - st} C${xt - 18},${cy - st - 12} ${xt - 40},${cy - th * 1.3} ${xt - 56},${cy - th * 1.45} ` +
        `C${xt - 42},${cy - th * 0.4} ${xt - 30},${cy} ${xt - 24},${cy + 4} C${xt - 30},${cy + th * 0.5} ${xt - 34},${cy + th * 0.62} ${xt - 30},${cy + th * 0.72} ` +
        `C${xt - 14},${cy + st + 6} ${xt},${cy + st} ${xt + 6},${cy + st} Z`;
    }
    if (tail) {
      parts.push(`<path d="${tail}" fill="${cFin}" ${finStroke}/>`);
      const rays = [];
      for (let i = -2; i <= 2; i++) rays.push(`M${xt},${cy + i * st * 0.4} L${xt - (a.tail === 'flow' ? 62 : a.tail === 'fork' && i === 0 ? 16 : 34)},${cy + i * th * 0.32}`);
      parts.push(`<path d="${rays.join(' ')}" stroke="${ray}" stroke-width="2.2" stroke-linecap="round" opacity=".45" fill="none"/>`);
    }

    // dorsal fin(s)
    const topAt = f => cy - hT * (1 - Math.pow((f - pk) / (f < pk ? pk : 1 - pk), 2) * 0.55);
    const xAt = f => xn - len * f;
    const fin = (f1, f2, h, spiky) => {
      const x1 = xAt(f1), x2 = xAt(f2), y1 = topAt(f1) + 6, y2 = topAt(f2) + 6;
      if (spiky) {
        const n = 6; let d = `M${x1},${y1}`;
        for (let i = 0; i <= n; i++) {
          const t = i / n, x = x1 + (x2 - x1) * t, base = y1 + (y2 - y1) * t;
          const hh = h * (1 - t * 0.55);
          d += ` L${x + (x2 - x1) / n * 0.25},${base - hh} L${x + (x2 - x1) / n * 0.5},${base - hh * 0.55}`;
        }
        return `<path d="${d} L${x2},${y2} Z" fill="${cFin}" ${finStroke}/>`;
      }
      return `<path d="M${x1},${y1} C${x1 - 4},${y1 - h * 1.1} ${x1 + (x2 - x1) * 0.45},${Math.min(y1, y2) - h * 1.15} ${x2},${y2 - h * 0.15} Q${x2 + 6},${y2} ${x2},${y2} Z" fill="${cFin}" ${finStroke}/>` +
        `<path d="M${x1 + (x2 - x1) * 0.3},${y1 - 2} L${x1 + (x2 - x1) * 0.25},${y1 - h * 0.7} M${x1 + (x2 - x1) * 0.6},${y2 - 2} L${x1 + (x2 - x1) * 0.6},${y2 - h * 0.6}" stroke="${ray}" stroke-width="2" opacity=".45" stroke-linecap="round"/>`;
    };
    switch (a.dorsal) {
      case 'normal': parts.push(fin(0.36, 0.6, 22)); break;
      case 'long': parts.push(fin(0.3, 0.74, 22)); break;
      case 'tall': parts.push(fin(0.36, 0.66, 40)); break;
      case 'spiky': parts.push(fin(0.3, 0.72, 26, true)); break;
      case 'spiky2': parts.push(fin(0.56, 0.78, 18), fin(0.28, 0.54, 26, true)); break;
      case 'rear': parts.push(fin(0.66, 0.84, 22)); break;
      case 'small': parts.push(fin(0.4, 0.52, 18)); break;
      case 'eel':
        parts.push(`<path d="M${xAt(0.4)},${cy - hT + 4} C${xAt(0.6)},${cy - hT - 12} ${xAt(0.9)},${cy - 16} ${xt - 4},${cy + 2} L${xt + 30},${cy} Z" fill="${cFin}" ${finStroke}/>`);
        parts.push(`<path d="M${xAt(0.55)},${cy + hB - 4} C${xAt(0.75)},${cy + hB + 10} ${xAt(0.92)},${cy + 16} ${xt - 4},${cy + 2} L${xt + 30},${cy + 4} Z" fill="${cFin}" ${finStroke}/>`);
        break;
    }
    if (a.adipose) parts.push(`<path d="M${xAt(0.8)},${topAt(0.8) + 6} Q${xAt(0.83)},${topAt(0.8) - 10} ${xAt(0.87)},${topAt(0.87) + 6} Z" fill="${cFin}" ${finStroke}/>`);

    // belly fins
    if (a.tail !== 'eel') {
      const bAt = f => cy + hB * (1 - Math.pow((f - pk) / (f < pk ? pk : 1 - pk), 2) * 0.55);
      const lf = (f, w, h) => { const x = xAt(f), y = bAt(f) - 6; return `<path d="M${x},${y} C${x - 4},${y + h} ${x - w * 0.6},${y + h * 1.1} ${x - w},${y + h * 0.9} C${x - w * 0.8},${y + 4} ${x - w * 0.6},${y} ${x - w * 0.5},${y - 2} Z" fill="${cFin}" ${finStroke}/>`; };
      parts.push(lf(0.42, 22, 20), lf(0.7, 20, 18));
    }

    // body + patterns
    parts.push(`<path d="${body}" fill="url(#${id}b)"/>`);
    const pat = [];
    const clipG = s => `<g clip-path="url(#${id}c)">${s}</g>`;
    if (a.band) pat.push(`<path d="M${xt},${cy + 2} C${xt + len * 0.3},${cy - 6} ${xn - len * 0.3},${cy - 4} ${xn - 10},${cy + 2} L${xn - 10},${cy + 14} C${xn - len * 0.3},${cy + 10} ${xt + len * 0.3},${cy + 8} ${xt},${cy + 12} Z" fill="${a.band}" opacity=".7"/>`);
    switch (a.pat) {
      case 'scales':
      case 'bigscales': {
        const s = a.pat === 'bigscales' ? 18 : 12;
        defs += `<pattern id="${id}p" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><path d="M0,${s / 2} a${s / 2},${s / 2} 0 0 0 ${s},0 M${-s / 2},${s} a${s / 2},${s / 2} 0 0 0 ${s},0 M${s / 2},${s} a${s / 2},${s / 2} 0 0 0 ${s},0" fill="none" stroke="${shade(cBack, -0.2)}" stroke-width="1.8" opacity=".55"/></pattern>`;
        pat.push(`<rect x="${xt}" y="${cy - hT}" width="${len * 0.78}" height="${hT + hB}" fill="url(#${id}p)" opacity=".8"/>`);
        break;
      }
      case 'stripes':
        for (let i = 0; i < 6; i++) {
          const x = xn - len * (0.3 + i * 0.105);
          pat.push(`<path d="M${x - 2},${cy - hT - 4} Q${x - 9},${cy} ${x - 2},${cy + hB * 0.55} L${x + 9},${cy + hB * 0.5} Q${x + 2},${cy} ${x + 11},${cy - hT - 4} Z" fill="${shade(cBack, -0.25)}" opacity=".7"/>`);
        }
        break;
      case 'bands':
        for (let i = 0; i < 6; i++) {
          const x = xn - len * (0.3 + i * 0.1);
          pat.push(`<path d="M${x},${cy - hT - 4} Q${x - 6},${cy} ${x},${cy + hB * 0.3} L${x + 9},${cy + hB * 0.3} Q${x + 3},${cy} ${x + 9},${cy - hT - 4} Z" fill="${shade(cBack, -0.2)}" opacity=".45"/>`);
        }
        break;
      case 'spots':
      case 'smallspots':
        for (let i = 0; i < (a.pat === 'spots' ? 34 : 26); i++) {
          const x = xt + 10 + R() * len * 0.78, y = cy - hT * 0.9 + R() * (hT + (a.pat === 'spots' ? hB * 0.6 : 0));
          pat.push(a.pat === 'spots'
            ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1.8 + R() * 2.2).toFixed(1)}" fill="#2c2620" opacity=".85"/>`
            : `<path d="M${x - 2.5},${y - 2.5} L${x + 2.5},${y + 2.5} M${x + 2.5},${y - 2.5} L${x - 2.5},${y + 2.5}" stroke="#1f2a33" stroke-width="2" stroke-linecap="round" opacity=".75"/>`);
        }
        break;
      case 'pikespots':
        for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
          const x = xt + 18 + i * len * 0.085 + (row % 2) * 9, y = cy - hT * 0.55 + row * hT * 0.5;
          pat.push(`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="6" ry="3.2" fill="#f3eba6" opacity=".7" transform="rotate(${-10 + R() * 20} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
        }
        break;
      case 'speckles':
        for (let i = 0; i < 50; i++) pat.push(`<circle cx="${(xt + R() * len * 0.9).toFixed(1)}" cy="${(cy - hT + R() * (hT + hB * 0.7)).toFixed(1)}" r="${(1 + R() * 2).toFixed(1)}" fill="#3a2e1c" opacity=".7"/>`);
        break;
      case 'mottle':
        for (let i = 0; i < 16; i++) pat.push(`<ellipse cx="${(xt + R() * len).toFixed(1)}" cy="${(cy - hT * 0.8 + R() * hT).toFixed(1)}" rx="${(6 + R() * 10).toFixed(1)}" ry="${(3 + R() * 5).toFixed(1)}" fill="#1f1e1a" opacity=".45"/>`);
        break;
      case 'koi':
        pat.push(`<path d="M${xn - len * 0.12},${cy - hT} C${xn - len * 0.2},${cy - 6} ${xn - len * 0.36},${cy + 4} ${xn - len * 0.46},${cy - 10} C${xn - len * 0.5},${cy - hT * 0.8} ${xn - len * 0.3},${cy - hT * 1.2} ${xn - len * 0.12},${cy - hT} Z" fill="#ff5722"/>`);
        pat.push(`<path d="M${xn - len * 0.56},${cy - hT} C${xn - len * 0.58},${cy + 10} ${xn - len * 0.78},${cy + 16} ${xn - len * 0.84},${cy - 4} C${xn - len * 0.84},${cy - hT} ${xn - len * 0.66},${cy - hT * 1.2} ${xn - len * 0.56},${cy - hT} Z" fill="#ff5722"/>`);
        pat.push(`<ellipse cx="${xn - len * 0.66}" cy="${cy - hT * 0.55}" rx="12" ry="7" fill="#222"/><ellipse cx="${xn - len * 0.4}" cy="${cy + 8}" rx="7" ry="5" fill="#222"/>`);
        break;
      case 'glow':
        for (let i = 0; i < 9; i++) {
          const x = xn - len * (0.2 + i * 0.075), y = cy - 2 + Math.sin(i) * 3;
          pat.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${a.glow}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#fff"/>`);
        }
        break;
      case 'scutes':
        for (let i = 0; i < 10; i++) {
          const x = xn - len * (0.18 + i * 0.07);
          const yt = topAt(Math.min(0.95, 0.18 + i * 0.07)) + 4;
          pat.push(`<path d="M${x},${yt - 5} L${x + 6},${yt + 1} L${x},${yt + 7} L${x - 6},${yt + 1} Z" fill="#e7edf1" stroke="${OL}" stroke-width="1.5"/>`);
          pat.push(`<path d="M${x},${cy - 2} L${x + 5},${cy + 3} L${x},${cy + 8} L${x - 5},${cy + 3} Z" fill="#d5dde3" stroke="${OL}" stroke-width="1.2" opacity=".85"/>`);
        }
        break;
    }
    // soft highlight, belly shade & lateral line
    pat.push(`<ellipse cx="${xn - len * 0.42}" cy="${cy - hT * 0.55}" rx="${len * 0.26}" ry="${hT * 0.17}" fill="#fff" opacity=".35"/>`);
    pat.push(`<path d="M${xt},${cy + hB} L${xn},${cy + hB} L${xn},${cy + hB * 1.3} L${xt},${cy + hB * 1.3} Z" fill="#000" opacity=".08"/>`);
    if (a.tail !== 'eel') pat.push(`<path d="M${xn - len * 0.24},${cy - hT * 0.35} C${xn - len * 0.5},${cy - hT * 0.15} ${xt + len * 0.2},${cy - 2} ${xt},${cy}" fill="none" stroke="${shade(cMid, -0.3)}" stroke-width="1.6" opacity=".5"/>`);
    parts.push(clipG(pat.join('')));
    parts.push(`<path d="${body}" fill="none" ${ST(3.5)}/>`);

    // gill
    const gx = xn - len * (a.tail === 'eel' ? 0.12 : 0.25);
    parts.push(`<path d="M${gx},${cy - hT * 0.6} Q${gx - 12},${cy} ${gx},${cy + hB * 0.6}" fill="none" stroke="${OL}" stroke-width="2.8" stroke-linecap="round" opacity=".75"/>`);
    // pectoral fin
    const px = gx - 8, py = cy + hB * 0.25;
    parts.push(`<path d="M${px},${py} C${px - 20},${py - 6} ${px - 30},${py + 8} ${px - 24},${py + 16} C${px - 14},${py + 14} ${px - 4},${py + 8} ${px},${py} Z" fill="${shade(cFin, 0.1)}" ${finStroke}/>`);

    // eye
    const er = Math.max(7, Math.min(12, hT * 0.22)) * (a.bigEye ? 1.3 : 1);
    const ex = xn - len * (a.tail === 'eel' ? 0.06 : a.snout === 'long' ? 0.11 : 0.13), ey = cy - hT * (a.tail === 'eel' ? 0.15 : 0.22);
    parts.push(`<circle cx="${ex}" cy="${ey}" r="${er}" fill="#fff" ${ST(3)}/>`);
    if (a.iris) parts.push(`<circle cx="${ex + er * 0.15}" cy="${ey}" r="${er * 0.72}" fill="${a.iris}"/>`);
    parts.push(`<circle cx="${ex + er * 0.22}" cy="${ey + er * 0.05}" r="${er * (a.iris ? 0.42 : 0.58)}" fill="${OL}"/>`);
    parts.push(`<circle cx="${ex + er * 0.42}" cy="${ey - er * 0.28}" r="${er * 0.25}" fill="#fff"/>`);
    if (a.mood === 'angry') parts.push(`<path d="M${ex - er * 1.2},${ey - er * 1.5} L${ex + er * 1.1},${ey - er * 0.8}" ${ST(4)}/>`);
    if (a.mood === 'grumpy' || a.mood === 'sleepy') parts.push(`<path d="M${ex - er - 1},${ey - 1} A${er + 1},${er + 1} 0 0 1 ${ex + er + 1},${ey - 1} Z" fill="${cMid}" ${ST(3)}/>`);

    // mouth & extras
    if (a.snout === 'long') {
      parts.push(`<path d="M${nx - 2},${ny + 1} L${xn - len * 0.16},${ny + 5}" ${ST(3)}/>`);
      if (a.mood === 'angry') for (let i = 0; i < 4; i++) parts.push(`<path d="M${nx - 6 - i * 7},${ny + 1.5 + i * 0.6} l2.5,4 l2.5,-4 Z" fill="#fff" stroke="${OL}" stroke-width="1.2"/>`);
    } else if (a.whiskers) {
      parts.push(`<path d="M${nx},${ny + 2} Q${nx - 14},${ny + 10} ${nx - 26},${ny + 5}" fill="none" ${ST(3.5)}/>`);
      parts.push(`<path d="M${nx - 6},${ny + 4} C${nx + 22},${ny + 4} ${nx + 34},${ny + 22} ${nx + 26},${ny + 40} M${nx - 10},${ny + 8} C${nx + 6},${ny + 18} ${nx + 4},${ny + 36} ${nx - 6},${ny + 48} M${nx - 4},${ny - 4} C${nx + 20},${ny - 12} ${nx + 36},${ny - 4} ${nx + 38},${ny + 10}" fill="none" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`);
    } else {
      parts.push(`<path d="M${nx - 1},${ny + 1} Q${nx - 8},${ny + 6} ${nx - 14},${ny + 3}" fill="none" ${ST(3)}/>`);
    }
    if (a.fangs) parts.push(`<path d="M${nx - 6},${ny + 3} l2,5 l2,-5 M${nx - 11},${ny + 4} l2,4 l2,-4" fill="#fff" stroke="${OL}" stroke-width="1.2"/>`);
    if (a.barbels === 'short') parts.push(`<path d="M${nx - 6},${ny + 4} Q${nx - 2},${ny + 14} ${nx - 10},${ny + 18}" fill="none" ${ST(2.5)}/>`);
    if (a.barbels === 'under') parts.push(`<path d="M${nx - 14},${ny + 6} l-2,9 M${nx - 20},${ny + 7} l-2,9 M${nx - 26},${ny + 8} l-2,8" ${ST(2.2)}/>`);
    if (a.crown) {
      const cx0 = xn - len * 0.34, cyy = cy - hT - 2;
      parts.push(`<path d="M${cx0 - 16},${cyy + 4} L${cx0 - 18},${cyy - 16} L${cx0 - 8},${cyy - 7} L${cx0},${cyy - 22} L${cx0 + 8},${cyy - 7} L${cx0 + 18},${cyy - 16} L${cx0 + 16},${cyy + 4} Z" fill="#ffe066" ${ST(3)}/>` +
        `<circle cx="${cx0}" cy="${cyy - 3}" r="3.5" fill="#e53935" stroke="${OL}" stroke-width="1.5"/>`);
    }
    if (a.sparkles) {
      const star = (x, y, r) => `<path d="M${x},${y - r} Q${x + r * 0.2},${y - r * 0.2} ${x + r},${y} Q${x + r * 0.2},${y + r * 0.2} ${x},${y + r} Q${x - r * 0.2},${y + r * 0.2} ${x - r},${y} Q${x - r * 0.2},${y - r * 0.2} ${x},${y - r} Z" fill="#fffbe0" stroke="#e0a800" stroke-width="1.5"/>`;
      parts.push(star(xn - len * 0.6, cy - 6, 8), star(xn - len * 0.85, cy - hT * 0.6, 6), star(xn - len * 0.3, cy + hB * 0.45, 5));
    }

    const size = opts.width ? ` width="${opts.width}"` : '';
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}"${size}><defs>${defs}</defs>${parts.join('')}</svg>`, w: W, h: H, mouth: { x: nx / W, y: ny / H } };
  }

  /* =====================================================================
     RODS
     ===================================================================== */
  function rodSvg(rodId, size) {
    const rod = D.ROD_BY_ID[rodId] || D.RODS[0];
    const [c1, c2, c3] = rod.colors;
    const p = [];
    p.push(`<path d="M108,14 Q120,46 104,76" fill="none" stroke="#fff" stroke-width="2" opacity=".9"/>`);
    p.push(`<path d="M104,72 L104,82" ${ST(2.5)}/>`);
    p.push(`<path d="M98,80 a6,6 0 0 1 12,0 Z" fill="#ef5350" ${ST(2.5)}/><path d="M98,80 a6,6 0 0 0 12,0 Z" fill="#fff" ${ST(2.5)}/>`);
    p.push(`<path d="M22,104 L108,14" stroke="${OL}" stroke-width="10" stroke-linecap="round"/>`);
    p.push(`<path d="M22,104 L108,14" stroke="${c1}" stroke-width="5.5" stroke-linecap="round"/>`);
    p.push(`<path d="M26,98 L100,21" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>`);
    if (rodId === 'bamboo') for (const t of [0.3, 0.48, 0.66, 0.82]) {
      const x = 22 + 86 * t, y = 104 - 90 * t;
      p.push(`<path d="M${x - 4},${y - 4} L${x + 4},${y + 4}" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>`);
    }
    for (const t of [0.46, 0.64, 0.8, 0.93]) {
      const x = 22 + 86 * t, y = 104 - 90 * t;
      p.push(`<circle cx="${x + 4}" cy="${y + 4}" r="3" fill="none" stroke="${OL}" stroke-width="2"/>`);
    }
    if (rodId === 'storm') p.push(`<path d="M62,58 L70,52 L67,61 L76,56" fill="none" stroke="${c3}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
    p.push(`<path d="M14,112 L36,89" stroke="${OL}" stroke-width="16" stroke-linecap="round"/>`);
    p.push(`<path d="M14,112 L36,89" stroke="${rodId === 'bamboo' ? '#b9874a' : c2}" stroke-width="10" stroke-linecap="round"/>`);
    p.push(`<path d="M20,100 L25,105 M26,94 L31,99" stroke="${OL}" stroke-width="2" opacity=".5"/>`);
    p.push(`<circle cx="44" cy="90" r="11" fill="#d7dee2" ${ST(3)}/><circle cx="44" cy="90" r="5.5" fill="${c3}" ${ST(2)}/>`);
    p.push(`<path d="M44,90 L56,98" ${ST(3)}/><circle cx="57" cy="99" r="3.5" fill="${c3}" ${ST(2)}/>`);
    if (rodId === 'poseidon') {
      p.push(`<path d="M108,14 L104,4 M108,14 L116,8 M108,14 L118,16" stroke="${OL}" stroke-width="5" stroke-linecap="round"/><path d="M108,14 L104,4 M108,14 L116,8 M108,14 L118,16" stroke="${c1}" stroke-width="2.5" stroke-linecap="round"/>`);
      p.push(`<path d="M30,60 l3,-7 l3,7 l-3,7 Z M84,92 l2,-5 l2,5 l-2,5 Z" fill="#fff59d" stroke="#c68a00" stroke-width="1.5"/>`);
    }
    const s = size ? ` width="${size}" height="${size}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 124"${s}>${p.join('')}</svg>`;
  }

  /* =====================================================================
     UI ICONS (48 x 48)
     ===================================================================== */
  const ICONS = {
    bag: c => `<path d="M10,18 L38,18 L36,40 Q36,43 33,43 L15,43 Q12,43 12,40 Z" fill="${c}" ${ST(3.5)}/><path d="M17,22 L17,14 Q17,7 24,7 Q31,7 31,14 L31,22" fill="none" ${ST(3.5)}/><circle cx="17" cy="23" r="2.4" fill="${OL}"/><circle cx="31" cy="23" r="2.4" fill="${OL}"/><path d="M16,28 L16,37" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/>`,
    fish: c => `<path d="M6,24 C12,12 30,11 37,22 L44,15 L43,33 L37,26 C30,37 12,36 6,24 Z" fill="${c}" ${ST(3.5)}/><circle cx="15" cy="22" r="2.6" fill="${OL}"/><path d="M22,17 Q26,24 22,31" fill="none" stroke="${OL}" stroke-width="2.5" stroke-linecap="round" opacity=".6"/><path d="M11,18 Q14,15 18,15" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".7"/>`,
    box: c => `<path d="M9,17 L39,17 L37,40 Q37,42 35,42 L13,42 Q11,42 11,40 Z" fill="${c}" ${ST(3.5)}/><path d="M6,10 Q6,7 9,7 L39,7 Q42,7 42,10 L42,17 L6,17 Z" fill="${shade(c, 0.25)}" ${ST(3.5)}/><path d="M18,27 L22,31 L30,23" fill="none" ${ST(3.5)}/>`,
    info: c => `<circle cx="24" cy="24" r="18" fill="${c}" ${ST(3.5)}/><circle cx="24" cy="14.5" r="3" fill="#fff" stroke="${OL}" stroke-width="2"/><path d="M24,21 L24,34" stroke="${OL}" stroke-width="8" stroke-linecap="round"/><path d="M24,21 L24,34" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
    user: c => `<circle cx="24" cy="16" r="8.5" fill="${c}" ${ST(3.5)}/><path d="M8,42 Q8,27 24,27 Q40,27 40,42 Z" fill="${c}" ${ST(3.5)}/>`,
    coin: () => `<circle cx="24" cy="25" r="17" fill="#e0a100" ${ST(3.5)}/><circle cx="24" cy="23" r="17" fill="#ffd23f" ${ST(3.5)}/><circle cx="24" cy="23" r="11" fill="none" stroke="#e0a100" stroke-width="3"/><path d="M20,17 L20,29 M24,17 L28,23 L24,29" fill="none" stroke="#c98600" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M13,17 Q16,11 22,10" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>`,
    star: () => `<path d="M24,5 L29.5,17.5 L43,18.5 L32.5,27.5 L36,41 L24,33.5 L12,41 L15.5,27.5 L5,18.5 L18.5,17.5 Z" fill="#ffd23f" ${ST(3.5)}/><path d="M16,22 L21,21" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`,
    play: c => `<path d="M14,8 L40,24 L14,40 Z" fill="${c}" ${ST(4)}/>`,
    users: c => `<circle cx="17" cy="17" r="7" fill="${c}" ${ST(3)}/><path d="M4,40 Q4,27 17,27 Q30,27 30,40 Z" fill="${c}" ${ST(3)}/><circle cx="32" cy="15" r="6" fill="${shade(c, 0.3)}" ${ST(3)}/><path d="M26,26 Q30,23 34,23 Q45,23 45,36 L31,36" fill="${shade(c, 0.3)}" ${ST(3)}/>`,
    lock: c => `<path d="M15,21 L15,15 Q15,6 24,6 Q33,6 33,15 L33,21" fill="none" ${ST(4)}/><rect x="9" y="20" width="30" height="22" rx="6" fill="${c}" ${ST(3.5)}/><circle cx="24" cy="30" r="3" fill="${OL}"/><path d="M24,31 L24,36" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`,
    globe: c => `<circle cx="24" cy="24" r="18" fill="${c}" ${ST(3.5)}/><path d="M6,24 L42,24 M24,6 C14,16 14,32 24,42 C34,32 34,16 24,6" fill="none" stroke="${OL}" stroke-width="2.6"/>`,
    key: c => `<circle cx="16" cy="18" r="9" fill="${c}" ${ST(3.5)}/><circle cx="16" cy="18" r="3" fill="#fff" ${ST(2)}/><path d="M22,24 L40,42 M32,34 L36,30 M36,38 L40,34" fill="none" ${ST(4)}/>`,
    sound: c => `<path d="M8,18 L16,18 L26,9 L26,39 L16,30 L8,30 Z" fill="${c}" ${ST(3.5)}/><path d="M32,17 Q37,24 32,31 M36,12 Q45,24 36,36" fill="none" ${ST(3.5)}/>`,
    mute: c => `<path d="M8,18 L16,18 L26,9 L26,39 L16,30 L8,30 Z" fill="${c}" ${ST(3.5)}/><path d="M32,18 L42,30 M42,18 L32,30" fill="none" ${ST(3.5)}/>`,
    music: c => `<path d="M18,34 L18,10 L38,6 L38,30" fill="none" ${ST(3.5)}/><circle cx="13" cy="35" r="6" fill="${c}" ${ST(3.5)}/><circle cx="33" cy="31" r="6" fill="${c}" ${ST(3.5)}/>`,
    share: c => `<circle cx="12" cy="24" r="6" fill="${c}" ${ST(3)}/><circle cx="36" cy="12" r="6" fill="${c}" ${ST(3)}/><circle cx="36" cy="36" r="6" fill="${c}" ${ST(3)}/><path d="M17,21 L31,14 M17,27 L31,34" ${ST(3)}/>`,
    copy: c => `<rect x="15" y="15" width="24" height="26" rx="5" fill="${c}" ${ST(3.5)}/><path d="M11,33 Q8,33 8,30 L8,10 Q8,7 11,7 L28,7 Q31,7 31,10" fill="none" ${ST(3.5)}/>`,
    back: c => `<path d="M30,8 L14,24 L30,40" fill="none" stroke="${OL}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M30,8 L14,24 L30,40" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    close: c => `<path d="M12,12 L36,36 M36,12 L12,36" stroke="${OL}" stroke-width="10" stroke-linecap="round"/><path d="M12,12 L36,36 M36,12 L12,36" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`,
    check: c => `<path d="M10,25 L20,35 L38,13" fill="none" stroke="${OL}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M10,25 L20,35 L38,13" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
    trophy: c => `<path d="M14,8 L34,8 L33,22 Q31,31 24,31 Q17,31 15,22 Z" fill="${c}" ${ST(3.5)}/><path d="M14,12 Q5,12 7,20 Q9,25 15,24 M34,12 Q43,12 41,20 Q39,25 33,24" fill="none" ${ST(3.5)}/><path d="M24,31 L24,36 M16,41 L32,41 L30,36 L18,36 Z" fill="${shade(c, -0.15)}" ${ST(3.5)}/>`,
    hook: c => `<path d="M28,8 L28,30 Q28,41 19,41 Q10,41 10,32 L10,27 L16,32" fill="none" stroke="${OL}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M28,8 L28,30 Q28,41 19,41 Q10,41 10,32 L10,27 L16,32" fill="none" stroke="${c}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="28" cy="7" r="4" fill="none" stroke="${OL}" stroke-width="3"/>`,
    plus: c => `<path d="M24,10 L24,38 M10,24 L38,24" stroke="${OL}" stroke-width="11" stroke-linecap="round"/><path d="M24,10 L24,38 M10,24 L38,24" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`,
    door: c => `<path d="M12,42 L12,8 Q12,6 14,6 L34,6 Q36,6 36,8 L36,42 Z" fill="${c}" ${ST(3.5)}/><circle cx="30" cy="25" r="2.5" fill="${OL}"/><path d="M6,42 L42,42" ${ST(3.5)}/>`,
    shirt: c => `<path d="M16,7 L6,14 L10,22 L15,20 L15,41 L33,41 L33,20 L38,22 L42,14 L32,7 Q24,13 16,7 Z" fill="${c}" ${ST(3.5)}/>`,
    rod: c => `<path d="M8,42 L40,8" stroke="${OL}" stroke-width="7" stroke-linecap="round"/><path d="M8,42 L40,8" stroke="${c}" stroke-width="3" stroke-linecap="round"/><circle cx="15" cy="34" r="5" fill="#cfd8dc" ${ST(2.5)}/><path d="M40,8 Q44,22 38,32" fill="none" stroke="${OL}" stroke-width="2"/><circle cx="38" cy="35" r="3.5" fill="#ef5350" ${ST(2)}/>`,
    sell: c => `<path d="M8,10 L24,10 L42,28 L28,42 L10,24 Z" fill="${c}" ${ST(3.5)}/><circle cx="17" cy="18" r="3.5" fill="#fff" ${ST(2.5)}/>`,
  };
  function icon(name, color = '#fff', size = 24) {
    const f = ICONS[name];
    if (!f) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" class="ico">${f(color)}</svg>`;
  }

  // bobber used as the "O" in the logo and the loading screen
  function bobberSvg(size) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80" width="${size}" height="${size * 80 / 60}">` +
      `<path d="M30,2 L30,16" ${ST(4)}/>` +
      `<path d="M8,42 a22,22 0 0 1 44,0 Z" fill="#ff4d4d" ${ST(4)}/><path d="M8,42 a22,22 0 0 0 44,0 Z" fill="#fff8ef" ${ST(4)}/>` +
      `<path d="M8,42 L52,42" ${ST(4)}/><path d="M17,30 Q20,24 27,22" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>` +
      `<path d="M30,64 L30,76" ${ST(4)}/></svg>`;
  }

  /* =====================================================================
     rasterize helpers (for canvas)
     ===================================================================== */
  const imgCache = new Map();
  function svgImage(key, svg, w, h) {
    if (imgCache.has(key)) return imgCache.get(key);
    const img = new Image();
    img.decoding = 'async';
    const entry = { img, ready: false, w, h };
    img.onload = () => { entry.ready = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    imgCache.set(key, entry);
    return entry;
  }
  function fishImage(species) {
    const f = fishSvg(species);
    const e = svgImage('fish:' + species, f.svg, f.w, f.h);
    e.mouth = f.mouth;
    return e;
  }
  function charImage(look, pose) {
    const key = 'char:' + pose + ':' + JSON.stringify(look);
    return svgImage(key, character(look, { pose }), 200, 260);
  }
  function preload(list) {
    return Promise.all(list.map(e => e.ready ? Promise.resolve() : new Promise(res => {
      if (e.img.complete && e.img.naturalWidth) { e.ready = true; return res(); }
      e.img.addEventListener('load', () => { e.ready = true; res(); }, { once: true });
      e.img.addEventListener('error', res, { once: true });
    })));
  }

  window.HArt = { OL, shade, mix, hex2rgb, character, avatar, fishSvg, FISH_ART, rodSvg, icon, bobberSvg, HAND, svgImage, fishImage, charImage, preload, uid };
})();
