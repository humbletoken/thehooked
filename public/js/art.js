/* Hooked — vector art: characters, fish, rods, furniture, icons (SVG strings) */
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

  // arm paths per pose: l/r — full arm, ls/rs — short sleeve part
  const POSE_ARMS = {
    idle:    { l: 'M71,152 Q58,172 58,196', r: 'M129,152 Q142,172 142,196', ls: 'M71,152 Q63,162 61,172', rs: 'M129,152 Q137,162 139,172', hands: [[58, 198], [142, 198]] },
    fish:    { l: 'M71,152 Q60,182 98,186', r: 'M129,152 Q144,172 118,178', ls: 'M71,152 Q66,166 68,174', rs: 'M129,152 Q136,162 137,168', hands: [] },
    gloom:   { l: 'M71,152 Q60,186 118,180', r: 'M129,152 Q142,180 84,174', ls: 'M71,152 Q65,166 66,176', rs: 'M129,152 Q136,164 137,174', hands: [[120, 180], [82, 174]] },
    horns:   { l: 'M71,152 Q58,172 58,196', r: 'M129,152 Q158,140 152,102', ls: 'M71,152 Q63,162 61,172', rs: 'M129,152 Q143,147 147,136', hands: [[58, 198], [152, 98]], horns: [152, 98] },
    vampire: { l: 'M71,152 Q46,152 34,124', r: 'M129,152 Q154,152 166,124', ls: 'M71,152 Q58,153 52,146', rs: 'M129,152 Q142,153 148,146', hands: [[33, 121], [167, 121]] },
  };

  const TATTOOS = {
    web:     { arm: [['#26262e', 10, '1.6 3.2', 0.55]], neck: `<path d="M92,133 L100,145 M100,133 L100,145 M108,133 L100,145 M94,138 Q100,136 106,138 M96,142 Q100,141 104,142" fill="none" stroke="#26262e" stroke-width="1.2" opacity=".85"/>` },
    roses:   { arm: [['#2a2630', 11, '6 7', 0.45], ['#c62828', 6, '3 10', 0.85]] },
    crosses: { face: `<path d="M76,101 L76,109 M73,104 L79,104" stroke="#26262e" stroke-width="1.8" stroke-linecap="round"/>`, neck: `<path d="M104,133 L104,143 M100.5,136.5 L107.5,136.5" stroke="#26262e" stroke-width="1.8" stroke-linecap="round"/>` },
    bat:     { neck: `<path d="M93,139 Q96.5,134 100,137.5 Q103.5,134 107,139 Q103.5,137.5 100,141 Q96.5,137.5 93,139 Z" fill="#26262e"/>` },
    tear:    { face: `<path d="M124,102 Q127.5,107.5 124,110.5 Q120.5,107.5 124,102 Z" fill="#26262e"/>` },
    kai:     { arm: [['#30303a', 12, '10 3', 0.5], ['#1d1d24', 5, '2 4', 0.65]], face: `<path d="M127,100 L129,104" stroke="#26262e" stroke-width="1.5" stroke-linecap="round"/>` },
    mice9:   { neck: `<text x="100" y="142.5" text-anchor="middle" font-family="'Old English Text MT','UnifrakturMaguntia',Georgia,serif" font-style="italic" font-weight="700" font-size="8.5" fill="#26262e">Angel</text>` },
  };

  function hairBack(style, c, cd) {
    switch (style) {
      case 'long':
        return `<path d="M52,74 C40,104 40,146 50,166 C60,174 140,174 150,166 C160,146 160,104 148,74 Z" fill="${c}" ${ST()}/>` +
          `<path d="M58,120 C58,140 62,154 66,162" fill="none" stroke="${cd}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
      case 'pony':
        return `<path d="M136,54 C178,44 190,96 170,132 C166,118 160,100 146,84 Z" fill="${c}" ${ST()}/>` +
          `<path d="M150,66 C168,72 174,96 168,116" fill="none" stroke="${cd}" stroke-width="3" stroke-linecap="round" opacity=".6"/>` +
          `<circle cx="141" cy="60" r="7" fill="#ff5c8a" ${ST(3)}/>`;
      case 'curly':
        return `<path d="M50,96 C38,98 34,82 44,76 C40,64 50,58 56,62 L146,62 C152,58 162,64 156,76 C166,82 162,98 150,96 Z" fill="${c}" ${ST()}/>`;
      case 'bob':
        return `<path d="M50,80 C44,100 46,118 52,124 L148,124 C154,118 156,100 150,80 Z" fill="${c}" ${ST()}/>`;
      case 'emo':
        return `<path d="M52,80 C46,104 50,122 60,130 L140,130 C150,122 154,104 148,80 Z" fill="${c}" ${ST()}/>`;
      case 'gothlong':
        return `<path d="M50,70 C42,112 42,172 46,206 L76,206 L76,150 L124,150 L124,206 L154,206 C158,172 158,112 150,70 Z" fill="${c}" ${ST()}/>` +
          `<path d="M54,120 C52,150 54,180 56,200 M146,120 C148,150 146,180 144,200" fill="none" stroke="${shade(c, 0.25)}" stroke-width="3" stroke-linecap="round" opacity=".5"/>`;
      case 'kai':
        return `<path d="M48,72 C36,102 38,142 48,164 L56,152 L62,170 L72,154 L128,154 L138,170 L144,152 L152,164 C162,142 164,102 152,72 Z" fill="${c}" ${ST()}/>`;
      case 'mice9':
        return `<path d="M50,76 C44,98 46,120 54,128 L146,128 C154,120 156,98 150,76 Z" fill="${c}" ${ST()}/>`;
    }
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
      case 'bob':
        return `<path d="M48,120 C40,60 60,22 100,22 C140,22 160,60 152,120 C148,121 144,119 142,114 C142,92 138,74 128,64 C112,72 88,72 72,64 C62,74 58,92 58,114 C56,119 52,121 48,120 Z" fill="${c}" ${ST()}/>` + shine;
      case 'emo':
        return `<path d="M48,88 C40,48 66,22 102,22 C138,22 160,46 154,86 L157,114 L146,102 L140,116 L132,100 L124,112 L116,98 L110,104 C100,88 88,74 76,62 C68,68 56,76 48,88 Z" fill="${c}" ${ST()}/>` +
          `<path d="M84,34 C104,40 124,60 136,92" fill="none" stroke="${cl}" stroke-width="3.5" stroke-linecap="round" opacity=".6"/>`;
      case 'gothlong':
        return `<path d="M48,150 C42,90 44,40 70,28 C82,22 118,22 130,28 C156,40 158,90 152,150 L142,150 C142,120 140,96 138,80 L62,80 C60,96 58,120 58,150 Z" fill="${c}" ${ST()}/>` +
          `<path d="M70,40 C84,32 100,30 116,32" fill="none" stroke="${shade(c, 0.3)}" stroke-width="3.5" stroke-linecap="round" opacity=".6"/>`;
      case 'kai':
        return `<path d="M46,104 C36,60 60,20 102,20 C144,20 166,60 154,104 L148,96 L146,112 L138,92 L132,104 L124,88 L118,100 L110,86 L102,98 L94,86 L88,100 L80,88 L72,102 L66,90 L58,106 L54,94 Z" fill="${c}" ${ST()}/>` +
          `<path d="M120,24 C134,40 140,62 138,92 L132,104 L130,82 C128,62 124,46 114,28 Z" fill="#c62828" ${ST(2.5)}/>` +
          `<path d="M70,36 C80,30 92,28 100,28" fill="none" stroke="${shade(c, 0.35)}" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
      case 'mice9':
        return `<path d="M46,98 C40,50 62,22 100,22 C138,22 160,50 154,98 L146,98 C146,92 145,88 142,86 L134,90 L126,85 L118,90 L110,85 L102,90 L94,85 L86,90 L78,85 L70,90 L62,86 C56,88 54,92 54,98 Z" fill="${c}" ${ST()}/>` +
          `<path d="M70,38 C82,30 96,28 110,30" fill="none" stroke="${shade(c, 0.35)}" stroke-width="3" stroke-linecap="round" opacity=".55"/>`;
    }
    return '';
  }

  function hat(type, c) {
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
      case 'witch':
        return `<ellipse cx="100" cy="66" rx="76" ry="15" fill="${cd}" ${ST()}/>` +
          `<path d="M60,66 C70,44 84,18 116,6 C108,24 112,42 140,66 C120,72 80,72 60,66 Z" fill="${c}" ${ST()}/>` +
          `<path d="M62,56 C80,62 120,62 138,56 L139,64 C120,70 80,70 61,64 Z" fill="#6a1b9a" ${ST(2.5)}/>` +
          `<rect x="92" y="54" width="14" height="12" rx="2" fill="#ffca28" ${ST(2)}/><rect x="96" y="57" width="6" height="6" fill="#6a1b9a"/>` +
          `<path d="M82,46 C86,36 92,26 102,18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".25"/>`;
      case 'tophat': {
        let veil = '';
        for (let x = 64; x <= 140; x += 7) veil += `M${x},66 L${x - 4},98 `;
        for (const y of [74, 82, 90]) veil += `M62,${y} L138,${y} `;
        return `<ellipse cx="100" cy="64" rx="58" ry="11" fill="#1a1820" ${ST()}/>` +
          `<path d="M66,62 L70,12 C86,8 114,8 130,12 L134,62 C114,68 86,68 66,62 Z" fill="#26232c" ${ST()}/>` +
          `<path d="M68,48 C88,52 112,52 132,48 L133,58 C112,63 88,63 67,58 Z" fill="${c}" ${ST(2.5)}/>` +
          `<path d="M78,20 L80,44" stroke="#fff" stroke-width="3.5" stroke-linecap="round" opacity=".18"/>` +
          `<path d="${veil}" stroke="#140f18" stroke-width="0.9" opacity=".55" fill="none"/>` +
          `<path d="M62,98 Q100,107 138,98" fill="none" stroke="#140f18" stroke-width="1.6" opacity=".7"/>`;
      }
    }
    return '';
  }

  function accessory(acc, hairC) {
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
      case 'bow':
        return `<g transform="translate(68 42) rotate(-18)"><path d="M0,0 L-17,-11 L-17,11 Z" fill="#ff5c8a" ${ST(2.5)}/><path d="M0,0 L17,-11 L17,11 Z" fill="#ff5c8a" ${ST(2.5)}/>` +
          `<path d="M-13,-5 L-6,-2 M13,-5 L6,-2" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/><circle r="5" fill="#ff86a8" ${ST(2.5)}/></g>`;
      case 'choker':
        return `<path d="M86,132 Q100,140 114,132 L114,138 Q100,146 86,138 Z" fill="#1b1a20" ${ST(2)}/>` +
          [90, 95, 100, 105, 110].map(x => `<path d="M${x - 2.2},${x === 100 ? 142 : 140.5} L${x},${x === 100 ? 148 : 146} L${x + 2.2},${x === 100 ? 142 : 140.5} Z" fill="#cfd8dc" stroke="${OL}" stroke-width="1"/>`).join('');
      case 'cross':
        return `<path d="M90,138 L100,158 L110,138" fill="none" stroke="#b0b7bd" stroke-width="1.8"/>` +
          `<path d="M100,156 L100,178 M93,163 L107,163" stroke="${OL}" stroke-width="6.5" stroke-linecap="round"/><path d="M100,156 L100,178 M93,163 L107,163" stroke="#dfe5ea" stroke-width="3" stroke-linecap="round"/>`;
      case 'piercing':
        return `<circle cx="104" cy="102" r="2.6" fill="none" stroke="#cfd8dc" stroke-width="1.8"/>` +
          `<circle cx="125" cy="74" r="2.4" fill="none" stroke="#cfd8dc" stroke-width="1.8"/>` +
          `<circle cx="96" cy="115" r="2.4" fill="none" stroke="#cfd8dc" stroke-width="1.8"/>`;
    }
    return '';
  }

  // 9mice reflective cross mask
  function mask9(id) {
    const bars = `<rect x="92" y="26" width="16" height="122" rx="3"/><rect x="38" y="78" width="124" height="17" rx="4"/><rect x="56" y="100" width="88" height="13" rx="4"/><rect x="48" y="116" width="104" height="15" rx="4"/>`;
    return `<defs><filter id="${id}k" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4"/></filter></defs>` +
      `<path d="M46,88 L54,90 M154,88 L146,90" stroke="#111" stroke-width="3"/>` +
      `<g fill="#dff6ff" opacity=".9" filter="url(#${id}k)">${bars}</g>` +
      `<g fill="#ffffff" stroke="#9fb3bf" stroke-width="1.2">${bars}</g>`;
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

  function outfit(look, top, id) {
    const c = top, cd = shade(c, -0.22), cl = shade(c, 0.22);
    const parts = { defs: '', torso: '', behindHead: '', sleeve: c, shortSleeve: false, sleeveless: false, meshSleeves: false, cuff: cd };
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
      case 'skulltee':
        parts.shortSleeve = true;
        parts.torso = base(grad) + `<path d="M86,138 Q100,150 114,138" fill="none" ${ST(3)}/>` +
          `<path d="M88,170 C88,157 112,157 112,170 C112,177 108,180 106,181 L106,187 L94,187 L94,181 C92,180 88,177 88,170 Z" fill="#f4f1ea" ${ST(2.5)}/>` +
          `<circle cx="95" cy="170" r="3.5" fill="${OL}"/><circle cx="105" cy="170" r="3.5" fill="${OL}"/><path d="M100,174 L98.4,177.5 L101.6,177.5 Z" fill="${OL}"/>` +
          `<path d="M97,183 L97,187 M100,183 L100,187 M103,183 L103,187" stroke="${OL}" stroke-width="1.4"/>`;
        break;
      case 'mesh':
        parts.sleeve = shade(c, -0.05); parts.meshSleeves = true;
        parts.defs += `<pattern id="${id}m" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0 L0,6 M0,0 L6,0" stroke="#000" stroke-width="1.3" opacity=".5"/></pattern>`;
        parts.torso = base(grad) + clip(`<rect x="55" y="130" width="90" height="90" fill="url(#${id}m)"/>`) +
          `<path d="${TORSO}" fill="none" ${ST()}/>` + `<path d="M84,137 Q100,152 116,137" fill="none" ${ST(3)}/>`;
        break;
      case 'spiked':
        parts.torso = base(grad) +
          `<path d="M100,140 L106,212" stroke="${OL}" stroke-width="2.5"/><path d="M105,150 L112,150" ${ST(2.5)}/>` +
          `<path d="M84,136 L95,168 L100,141 Z" fill="${cl}" ${ST(3)}/><path d="M116,136 L105,168 L100,141 Z" fill="${cl}" ${ST(3)}/>` +
          [[72, 147], [80, 142], [120, 142], [128, 147]].map(([x, y]) => `<path d="M${x - 3},${y + 2} L${x},${y - 4.5} L${x + 3},${y + 2} Z" fill="#cfd8dc" stroke="${OL}" stroke-width="1.5"/>`).join('') +
          `<path d="M72,190 L88,190 M112,190 L128,190" stroke="${OL}" stroke-width="2"/>` +
          `<path d="M70,152 C68,168 68,182 70,196" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".25"/>`;
        break;
      case 'gothcoat':
        parts.behindHead = `<path d="M62,148 C56,120 66,102 82,108 L100,124 L118,108 C134,102 144,120 138,148 Z" fill="${cd}" ${ST()}/>` +
          `<path d="M68,142 C66,124 72,112 82,114 L96,127 Z M132,142 C134,124 128,112 118,114 L104,127 Z" fill="#8e1b33"/>`;
        parts.torso = `<path d="M61,194 L139,194 L148,240 C120,245 80,245 52,240 Z" fill="${grad}" ${ST()}/>` +
          `<path d="M96,198 L104,198 L108,241 L92,241 Z" fill="#8e1b33" ${ST(2)}/>` +
          base(grad) + `<path d="M100,138 L100,212" stroke="${OL}" stroke-width="2.5"/>` +
          [152, 168, 184, 200].map(y => `<circle cx="92" cy="${y}" r="2.6" fill="#dfe5ea" ${ST(1.4)}/><circle cx="108" cy="${y}" r="2.6" fill="#dfe5ea" ${ST(1.4)}/>`).join('');
        break;
      case 'kai':
        parts.sleeveless = true;
        parts.torso = `<path d="M74,146 C76,140 84,138 88,138 Q100,150 112,138 C116,138 124,140 126,146 L136,199 C136,209 126,213 100,213 C74,213 64,209 64,199 Z" fill="${grad}" ${ST()}/>` +
          `<path d="M80,166 C90,156 100,176 112,160 C118,172 124,166 128,178 L127,196 C114,188 104,200 92,190 C86,196 80,190 75,196 Z" fill="#c62828" opacity=".9"/>` +
          `<path d="M86,176 L96,170 L104,182 L114,172" fill="none" stroke="#f4f1ea" stroke-width="2.2" stroke-linecap="round"/>` +
          `<circle cx="100" cy="187" r="4" fill="#f4f1ea" ${ST(1.5)}/>`;
        break;
      case 'mice9':
        parts.cuff = shade(c, 0.12);
        parts.torso = base(grad) +
          `<path d="M84,136 Q100,147 116,136 L118,143 Q100,154 82,143 Z" fill="${shade(c, 0.12)}" ${ST(2.5)}/>` +
          `<path d="M88,139 L89,144 M94,141 L94,147 M100,142 L100,148 M106,141 L106,147 M112,139 L111,144" stroke="${OL}" stroke-width="1.2" opacity=".6"/>` +
          `<path d="M100,148 L100,206" stroke="#b0b7bd" stroke-width="2.5"/>` +
          `<rect x="97" y="152" width="6" height="10" rx="2" fill="#cfd8dc" ${ST(1.5)}/>` +
          `<path d="M74,170 L90,168 M110,168 L126,170" stroke="${OL}" stroke-width="2" opacity=".7"/>` +
          `<path d="M62,200 C80,206 120,206 138,200 L139,207 C120,214 80,214 61,207 Z" fill="${shade(c, 0.12)}" ${ST(2)}/>`;
        break;
    }
    return parts;
  }

  // eyes, brows, nose and mouth for the chosen gender & face
  function faceParts(look, skinFill, hcd, browsHidden) {
    const female = look.gender === 'f';
    const list = D.FACES[look.gender] || D.FACES.m;
    const fid = (list[look.face] || list[0]).id;
    const eyeType = { kind: 'open', sly: 'lid', brave: 'open', calm: 'closed', cute: 'big', bold: 'lid', dreamy: 'dreamy', happy: 'closed' }[fid] || 'open';
    const browType = { kind: 'n', sly: 'n', brave: 'a', calm: 's', cute: 's', bold: 'a', dreamy: 's', happy: 'n' }[fid] || 'n';
    const mouthType = { kind: 'open', sly: 'smirk', brave: 'grin', calm: 'small', cute: 'open', bold: 'smirk', dreamy: 'small', happy: 'big' }[fid] || 'open';
    const mk = look.makeup, acc = look.acc;
    const dark = mk === 'darklips' || mk === 'kai';
    const out = [];
    if (mk === 'smoky' || mk === 'kai') {
      const o = mk === 'kai' ? 0.35 : 0.5;
      out.push(`<ellipse cx="83" cy="90" rx="12.5" ry="11.5" fill="#3a2448" opacity="${o}"/><ellipse cx="117" cy="90" rx="12.5" ry="11.5" fill="#3a2448" opacity="${o}"/>`);
    }
    const open = (x, rx, ry, g1, g2) => `<ellipse cx="${x}" cy="90" rx="${rx}" ry="${ry}" fill="${OL}"/><circle cx="${x + 2.4}" cy="86.4" r="${g1}" fill="#fff"/><circle cx="${x - 2.2}" cy="93" r="${g2}" fill="#fff"/>`;
    const eye = x => {
      switch (eyeType) {
        case 'big': return open(x, 7.8, 10, 3.2, 1.6);
        case 'lid': return open(x, 7, 9, 2.6, 1.2) + `<path d="M${x - 8.5},89 Q${x},70 ${x + 8.5},89 Z" fill="${skinFill}"/><path d="M${x - 8.5},89 Q${x},84 ${x + 8.5},89" fill="none" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`;
        case 'dreamy': return open(x, 7, 9, 2.2, 1.1) + `<path d="M${x - 8.5},91 Q${x},68 ${x + 8.5},91 Z" fill="${skinFill}"/><path d="M${x - 8.5},91 Q${x},86 ${x + 8.5},91" fill="none" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`;
        case 'closed': return `<path d="M${x - 7},92 Q${x},84 ${x + 7},92" fill="none" stroke="${OL}" stroke-width="4" stroke-linecap="round"/>`;
        default: return open(x, 7, 9, 2.8, 1.3);
      }
    };
    const showL = acc !== 'sunglasses', showR = acc !== 'sunglasses' && acc !== 'eyepatch';
    if (showL) out.push(eye(83));
    if (showR) out.push(eye(117));
    if (female) {
      const lash = eyeType === 'closed'
        ? [`M76,92 L72,94.5`, `M124,92 L128,94.5`]
        : [`M77,84 L73,80 M80,82 L78,77`, `M123,84 L127,80 M120,82 L122,77`];
      if (showL) out.push(`<path d="${lash[0]}" fill="none" stroke="${OL}" stroke-width="2.5" stroke-linecap="round"/>`);
      if (showR) out.push(`<path d="${lash[1]}" fill="none" stroke="${OL}" stroke-width="2.5" stroke-linecap="round"/>`);
    }
    if ((mk === 'eyeliner' || mk === 'kai') && eyeType !== 'closed') {
      if (showL) out.push(`<path d="M76,88 L68.5,83.5" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`);
      if (showR) out.push(`<path d="M124,88 L131.5,83.5" stroke="${OL}" stroke-width="3" stroke-linecap="round"/>`);
    }
    if (!browsHidden) {
      const bp = { n: 'M75,75 Q83,70 91,74 M109,74 Q117,70 125,75', a: 'M74,71 L91,77 M109,77 L126,71', s: 'M76,73 Q83,69 90,72 M110,72 Q117,69 124,73' }[browType];
      out.push(`<path d="${bp}" fill="none" stroke="${hcd}" stroke-width="${female ? 3 : 4.2}" stroke-linecap="round"/>`);
    }
    out.push(female
      ? `<path d="M99,98 Q101,100 99,101.5" fill="none" stroke="${OL}" stroke-width="2.2" stroke-linecap="round" opacity=".45"/>`
      : `<path d="M98,97 Q101,100 98,102" fill="none" stroke="${OL}" stroke-width="2.6" stroke-linecap="round" opacity=".4"/>`);
    const lipFill = dark ? '#2b0d1c' : female ? '#b33a55' : '#8e3b3b';
    const lineCol = dark ? '#2b0d1c' : female ? '#b8405e' : OL;
    const tongue = `<path d="M95,114 Q100,118 105,114 Q100,112 95,114 Z" fill="#ff7b7b"/>`;
    switch (mouthType) {
      case 'big':
        out.push(`<path d="M87,106 Q100,124 113,106 Q100,109 87,106 Z" fill="${lipFill}" ${ST(3)}/>` + (dark ? '' : `<path d="M94,114 Q100,119 106,114 Q100,112 94,114 Z" fill="#ff7b7b"/>`));
        break;
      case 'grin':
        out.push(`<path d="M88,107 Q100,123 112,107 Q100,110 88,107 Z" fill="#fff" stroke="${dark ? '#2b0d1c' : OL}" stroke-width="3" stroke-linejoin="round"/><path d="M91,111 L109,111" stroke="${OL}" stroke-width="1.5" opacity=".5"/>`);
        break;
      case 'smirk':
        out.push(`<path d="M90,110 Q101,115 112,106" fill="none" stroke="${lineCol}" stroke-width="${dark ? 5.5 : female ? 4.2 : 3.5}" stroke-linecap="round"/>`);
        break;
      case 'small':
        out.push(`<path d="M94,109 Q100,113 106,109" fill="none" stroke="${lineCol}" stroke-width="${dark ? 5 : female ? 4 : 3.2}" stroke-linecap="round"/>`);
        break;
      default:
        out.push(`<path d="M89,108 Q100,121 111,108 Q100,111 89,108 Z" fill="${lipFill}" ${ST(3)}/>` + (dark ? '' : tongue));
    }
    return out.join('');
  }

  function character(lookIn, opts = {}) {
    const look = D.sanitizeLook(lookIn);
    const pose = POSE_ARMS[opts.pose] ? opts.pose : 'idle';
    const id = uid();
    const pale = look.makeup === 'pale' || look.makeup === 'kai';
    const skin = D.SKINS[look.skin];
    const face = pale ? mix(skin, '#f7f2ee', 0.78) : skin;
    const faceD = shade(face, -0.16), faceL = shade(face, 0.16);
    const hc = D.HAIR_COLORS[look.hairColor], hcd = shade(hc, -0.3), hcl = shade(hc, 0.3);
    const top = D.CLOTH_COLORS[look.topColor];
    let bot = D.CLOTH_COLORS[look.bottomColor];
    const hatC = D.CLOTH_COLORS[look.hatColor];
    const fit = outfit(look, top, id);
    if (look.top === 'overalls') bot = '#3f6fb5';
    if (look.bottom === 'leather') bot = '#1f1c22';
    const botD = shade(bot, -0.22);
    const hasHat = look.hat !== 'none';
    const tat = TATTOOS[look.tattoo] || null;

    let defs = fit.defs +
      `<radialGradient id="${id}s" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="${faceL}"/><stop offset=".7" stop-color="${face}"/><stop offset="1" stop-color="${faceD}"/></radialGradient>`;

    const out = [];
    out.push(`<ellipse cx="100" cy="253" rx="50" ry="7" fill="#000" opacity=".18"/>`);
    if (pose === 'vampire') {
      out.push(`<path d="M70,146 L34,122 C24,168 28,212 42,248 C80,238 120,238 158,248 C172,212 176,168 166,122 L130,146 Z" fill="#1b1020" ${ST()}/>` +
        `<path d="M74,150 L42,132 C36,170 40,206 50,238 C84,230 116,230 150,238 C160,206 164,170 158,132 L126,150 Z" fill="#8e1b33"/>`);
    }
    out.push(hairBack(look.hair, hc, hcd));

    // legs & shoes
    if (look.bottom === 'shorts' || look.bottom === 'skirt') {
      out.push(`<rect x="75" y="206" width="20" height="36" rx="8" fill="${skin}" ${ST()}/><rect x="105" y="206" width="20" height="36" rx="8" fill="${skin}" ${ST()}/>`);
      if (look.bottom === 'shorts') {
        out.push(`<path d="M66,196 L134,196 L136,222 C136,226 104,226 102,222 L100,212 L98,222 C96,226 64,226 64,222 Z" fill="${bot}" ${ST()}/>`);
        out.push(`<path d="M100,204 L100,214" ${ST(3)}/>`);
      } else {
        out.push(`<path d="M66,194 L134,194 L144,228 C122,235 78,235 56,228 Z" fill="${bot}" ${ST()}/>` +
          `<path d="M84,198 L80,231 M100,198 L100,233 M116,198 L120,231" stroke="${botD}" stroke-width="2.5" stroke-linecap="round"/>`);
      }
    } else if (look.bottom === 'waders') {
      out.push(`<rect x="70" y="196" width="28" height="46" rx="9" fill="#5d7f3a" ${ST()}/><rect x="102" y="196" width="28" height="46" rx="9" fill="#4f6e30" ${ST()}/>`);
      out.push(`<path d="M70,222 L98,222 M102,222 L130,222" stroke="${OL}" stroke-width="3"/>`);
    } else {
      out.push(`<rect x="70" y="196" width="28" height="46" rx="9" fill="${bot}" ${ST()}/><rect x="102" y="196" width="28" height="46" rx="9" fill="${botD}" ${ST()}/>`);
      out.push(`<path d="M80,206 L80,236" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="${look.bottom === 'leather' ? 0.45 : 0.25}"/>`);
      if (look.bottom === 'leather') out.push(`<path d="M114,206 L114,234" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".25"/>`);
    }
    const shoe = look.bottom === 'waders' ? '#33502a' : look.bottom === 'leather' ? '#121014' : '#6d4c41';
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

    // arms (+ arm tattoos on bare skin)
    const arms = POSE_ARMS[pose];
    const bare = fit.shortSleeve || fit.sleeveless;
    const tatArm = d => tat && tat.arm ? tat.arm.map(([col, w, da, op]) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="${da}" opacity="${op}"/>`).join('') : '';
    const drawArm = (d, sd) => {
      if (bare) return limb(d, skin, 13) + tatArm(d) + (fit.shortSleeve ? limb(sd, fit.sleeve, 17) : '');
      return limb(d, fit.sleeve, 14) + (fit.meshSleeves ? `<path d="${d}" fill="none" stroke="url(#${id}m)" stroke-width="14" stroke-linecap="round"/>` : '');
    };
    out.push(drawArm(arms.l, arms.ls), drawArm(arms.r, arms.rs));
    for (const [x, y] of arms.hands) out.push(`<circle cx="${x}" cy="${y}" r="9" fill="${skin}" ${ST()}/>`);
    if (arms.horns) {
      const [x, y] = arms.horns;
      out.push(limb(`M${x - 5},${y - 4} L${x - 8},${y - 17}`, skin, 5, 3) + limb(`M${x + 5},${y - 4} L${x + 8},${y - 17}`, skin, 5, 3));
    }

    // neck, hood, scarf
    out.push(`<path d="M88,118 L88,140 Q100,147 112,140 L112,118 Z" fill="${faceD}" ${ST()}/>`);
    if (tat && tat.neck) out.push(tat.neck);
    out.push(fit.behindHead);
    const sc = look.acc === 'scarf' ? scarf(hatC) : null;
    if (sc) out.push(sc.wrap);

    // head & face
    out.push(`<circle cx="52" cy="90" r="11" fill="${face}" ${ST()}/><circle cx="148" cy="90" r="11" fill="${face}" ${ST()}/>`);
    out.push(`<path d="M50,86 Q54,92 51,96 M150,86 Q146,92 149,96" fill="none" stroke="${faceD}" stroke-width="3" stroke-linecap="round"/>`);
    out.push(`<path d="${HEAD}" fill="url(#${id}s)" ${ST()}/>`);
    out.push(`<ellipse cx="74" cy="104" rx="8" ry="4.5" fill="#ff8a80" opacity="${pale ? 0.22 : 0.45}"/><ellipse cx="126" cy="104" rx="8" ry="4.5" fill="#ff8a80" opacity="${pale ? 0.22 : 0.45}"/>`);
    const browsHidden = hasHat && ['bucket', 'cowboy', 'witch'].includes(look.hat);
    out.push(faceParts(look, `url(#${id}s)`, hcd, browsHidden));
    if (tat && tat.face) out.push(tat.face);

    // under a hat only the hair below the brim line is visible
    if (hasHat && look.hat !== 'crown') {
      defs += `<clipPath id="${id}h"><rect x="0" y="56" width="200" height="204"/></clipPath>`;
      out.push(`<g clip-path="url(#${id}h)">${hairFront(look.hair, hc, hcd, hcl)}</g>`);
    } else out.push(hairFront(look.hair, hc, hcd, hcl));
    if (look.acc === 'mice9') out.push(mask9(id));
    else out.push(accessory(look.acc, hc));
    if (hasHat) out.push(hat(look.hat, hatC));
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
  // character crop helpers for item thumbnails
  function torsoCrop(look, pose) { return character(look, { pose }).replace('viewBox="0 0 200 260"', 'viewBox="20 40 160 220"'); }

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
    chub:     { L: 180, hT: 40, hB: 34, st: 13, tail: 'fork', dorsal: 'normal', c: ['#3c4c58', '#a8b6c0', '#f1f4f6', '#e07a3c'], pat: 'bigscales', head: 0.8 },
    grayling: { L: 185, hT: 36, hB: 30, st: 12, tail: 'fork', dorsal: 'tall', c: ['#4c5968', '#b6c0cb', '#eef1f5', '#8b6fc0'], pat: 'spots', head: 0.55 },
    asp:      { L: 215, hT: 36, hB: 32, st: 13, tail: 'fork', dorsal: 'normal', c: ['#40556a', '#b8c6d2', '#f3f6f9', '#9fb0bf'], pat: 'scales', mood: 'angry', head: 0.45 },
    taimen:   { L: 250, hT: 38, hB: 34, st: 15, tail: 'fork', dorsal: 'normal', adipose: true, c: ['#5a3a2a', '#c98a64', '#f6e2d0', '#b6533a'], band: '#e0764f', pat: 'smallspots', mood: 'angry', head: 0.4 },
    rotan:    { L: 140, hT: 38, hB: 34, st: 12, tail: 'round', dorsal: 'spiky2', c: ['#3b3824', '#7a734c', '#d0c89c', '#5c5636'], pat: 'mottle', mood: 'grumpy', head: 0.95, peak: 0.32 },
    loach:    { L: 200, hT: 16, hB: 15, st: 2, tail: 'eel', dorsal: 'eel', c: ['#4c3a20', '#a3864d', '#efe0b3', '#6a5530'], pat: 'speckles', barbels: 'short', head: 0.8, peak: 0.3 },
    tench:    { L: 175, hT: 44, hB: 38, st: 15, tail: 'round', dorsal: 'normal', c: ['#2c4520', '#6c8c38', '#d8cb7c', '#3c5828'], pat: 'none', iris: '#e53935', barbels: 'short', head: 0.8 },
    snakehead:{ L: 250, hT: 30, hB: 28, st: 14, tail: 'round', dorsal: 'long', c: ['#2a3223', '#6a7951', '#dbd6b0', '#495535'], pat: 'mottle', mood: 'angry', head: 0.6, peak: 0.4 },
    mackerel: { L: 190, hT: 32, hB: 28, st: 8, tail: 'fork', dorsal: 'spiky2', finlets: true, c: ['#1d6a5d', '#86cabb', '#f4fbfa', '#3d7f74'], pat: 'waves', head: 0.5 },
    flounder: { L: 165, hT: 56, hB: 56, st: 12, tail: 'round', dorsal: 'long', c: ['#76603f', '#b39770', '#e9ddc6', '#8d7450'], pat: 'speckles', twoEyes: true, head: 0.9, peak: 0.5 },
    seabass:  { L: 200, hT: 44, hB: 36, st: 13, tail: 'fork', dorsal: 'spiky2', c: ['#8a2c28', '#e46f5e', '#fde3dc', '#c9473b'], pat: 'scales', bigEye: true, head: 0.55 },
    tuna:     { L: 235, hT: 48, hB: 44, st: 6, tail: 'fork', dorsal: 'normal', finlets: true, c: ['#1a2e58', '#7f9dc8', '#eef3fb', '#f2c94c'], pat: 'none', head: 0.5, peak: 0.45 },
    swordfish:{ L: 240, hT: 36, hB: 32, st: 7, tail: 'fork', dorsal: 'tall', bill: true, c: ['#26385a', '#7c94be', '#e7eef9', '#3e5581'], pat: 'none', head: 0.35 },
    sunfish:  { L: 150, hT: 70, hB: 70, st: 30, tail: 'clavus', dorsal: 'mola', c: ['#7b8898', '#c5cdd7', '#eef1f4', '#a1abb8'], pat: 'speckles', head: 0.95, peak: 0.45 },
    bonefish: { L: 180, hT: 40, hB: 34, st: 10, tail: 'fork', dorsal: 'normal', c: ['#22222b', '#45455a', '#6a6a7e', '#5a5a6e'], pat: 'bones', iris: '#7cff6b', head: 0.7 },
    vampfish: { L: 170, hT: 46, hB: 44, st: 12, tail: 'fork', dorsal: 'spiky', c: ['#3a0b18', '#8f1a32', '#e7a0a9', '#5c0f22'], pat: 'none', fangs: 'big', mood: 'angry', iris: '#ff1744', head: 0.85 },
    ghostpike:{ L: 245, hT: 30, hB: 28, st: 13, tail: 'fork', dorsal: 'rear', c: ['#7a69b3', '#d8d2f5', '#ffffff', '#b4a7ea'], pat: 'pikespots', mood: 'angry', snout: 'long', head: 0.25, peak: 0.55, glow: '#c9b8ff', ghost: true },
  };

  function fishSvg(species, opts = {}) {
    const a = FISH_ART[species] || FISH_ART.crucian;
    const id = uid();
    const R = rng(species);
    const [cBack, cMid, cBelly, cFin] = a.c;
    const tailLen = a.tail === 'flow' ? 84 : a.tail === 'eel' ? 6 : a.tail === 'shark' ? 58 : a.tail === 'clavus' ? 26 : 50;
    const dorsalH = a.dorsal === 'tall' ? 40 : a.dorsal === 'mola' ? 56 : a.dorsal === 'eel' ? 12 : 28;
    const billLen = a.bill ? 66 : 0;
    const xt = 14 + tailLen;
    const xn = xt + a.L;
    const snoutX = a.snout === 'long' ? 10 : a.snout === 'pointy' ? 14 : 0;
    const cy = 16 + dorsalH + a.hT + (a.crown ? 22 : 0);
    const W = xn + snoutX + billLen + (a.whiskers ? 40 : 16);
    const H = cy + a.hB + 30 + (a.whiskers ? 20 : 0) + (a.dorsal === 'mola' ? 48 : 0);
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
    } else if (a.tail === 'clavus') {
      tail = `M${xt + 10},${cy - hT * 0.82} C${xt - 22},${cy - hT * 0.72} ${xt - 26},${cy + hT * 0.72} ${xt + 10},${cy + hT * 0.82} Z`;
    }
    if (tail) {
      parts.push(`<path d="${tail}" fill="${cFin}" ${finStroke}/>`);
      if (a.tail !== 'clavus') {
        const rays = [];
        for (let i = -2; i <= 2; i++) rays.push(`M${xt},${cy + i * st * 0.4} L${xt - (a.tail === 'flow' ? 62 : a.tail === 'fork' && i === 0 ? 16 : 34)},${cy + i * th * 0.32}`);
        parts.push(`<path d="${rays.join(' ')}" stroke="${ray}" stroke-width="2.2" stroke-linecap="round" opacity=".45" fill="none"/>`);
      }
    }

    // dorsal fin(s)
    const topAt = f => cy - hT * (1 - Math.pow((f - pk) / (f < pk ? pk : 1 - pk), 2) * 0.55);
    const bAt = f => cy + hB * (1 - Math.pow((f - pk) / (f < pk ? pk : 1 - pk), 2) * 0.55);
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
      case 'mola': {
        const x1 = xAt(0.5), x2 = xAt(0.74);
        parts.push(`<path d="M${x1},${topAt(0.5) + 10} C${x1 - 4},${cy - hT - 46} ${x2 + 10},${cy - hT - 56} ${x2},${topAt(0.74) + 10} Z" fill="${cFin}" ${finStroke}/>`);
        parts.push(`<path d="M${x1},${bAt(0.5) - 10} C${x1 - 4},${cy + hB + 46} ${x2 + 10},${cy + hB + 56} ${x2},${bAt(0.74) - 10} Z" fill="${cFin}" ${finStroke}/>`);
        break;
      }
      case 'eel':
        parts.push(`<path d="M${xAt(0.4)},${cy - hT + 4} C${xAt(0.6)},${cy - hT - 12} ${xAt(0.9)},${cy - 16} ${xt - 4},${cy + 2} L${xt + 30},${cy} Z" fill="${cFin}" ${finStroke}/>`);
        parts.push(`<path d="M${xAt(0.55)},${cy + hB - 4} C${xAt(0.75)},${cy + hB + 10} ${xAt(0.92)},${cy + 16} ${xt - 4},${cy + 2} L${xt + 30},${cy + 4} Z" fill="${cFin}" ${finStroke}/>`);
        break;
    }
    if (a.adipose) parts.push(`<path d="M${xAt(0.8)},${topAt(0.8) + 6} Q${xAt(0.83)},${topAt(0.8) - 10} ${xAt(0.87)},${topAt(0.87) + 6} Z" fill="${cFin}" ${finStroke}/>`);
    if (a.finlets) {
      for (let i = 0; i < 5; i++) {
        const x = xt + len * (0.05 + i * 0.045);
        parts.push(`<path d="M${x},${cy - st - 1 - i * 1.8} l4,-7 l3,7 Z M${x},${cy + st + 1 + i * 1.7} l4,7 l3,-7 Z" fill="${cFin}" stroke="${OL}" stroke-width="1.5" stroke-linejoin="round"/>`);
      }
    }

    // belly fins
    if (a.tail !== 'eel') {
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
      case 'waves':
        for (let i = 0; i < 9; i++) {
          const x = xn - len * (0.26 + i * 0.075);
          pat.push(`<path d="M${x},${cy - hT - 2} Q${x + 7},${cy - hT * 0.6} ${x - 1},${cy - hT * 0.3} Q${x - 7},${cy - hT * 0.1} ${x + 1},${cy + 2}" fill="none" stroke="${shade(cBack, -0.35)}" stroke-width="3" stroke-linecap="round" opacity=".8"/>`);
        }
        break;
      case 'bones':
        pat.push(`<path d="M${xt + 6},${cy} L${xn - len * 0.24},${cy}" stroke="#e8e2d0" stroke-width="3.5" stroke-linecap="round"/>`);
        for (let i = 0; i < 8; i++) {
          const x = xn - len * (0.3 + i * 0.075);
          pat.push(`<path d="M${x},${cy - hT * 0.72} Q${x - 7},${cy} ${x},${cy + hB * 0.66}" fill="none" stroke="#e8e2d0" stroke-width="3" stroke-linecap="round"/>`);
        }
        pat.push(`<ellipse cx="${xn - len * 0.12}" cy="${cy - 2}" rx="${len * 0.11}" ry="${hT * 0.6}" fill="#e8e2d0" opacity=".85"/>`);
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
    if (a.tail !== 'eel' && a.pat !== 'bones') pat.push(`<path d="M${xn - len * 0.24},${cy - hT * 0.35} C${xn - len * 0.5},${cy - hT * 0.15} ${xt + len * 0.2},${cy - 2} ${xt},${cy}" fill="none" stroke="${shade(cMid, -0.3)}" stroke-width="1.6" opacity=".5"/>`);
    parts.push(clipG(pat.join('')));
    parts.push(`<path d="${body}" fill="none" ${ST(3.5)}/>`);
    if (a.bill) parts.push(`<path d="M${nx - 4},${ny - 4} L${nx + billLen},${ny} L${nx - 4},${ny + 4} Z" fill="${cMid}" ${ST(3)}/>`);

    // gill
    const gx = xn - len * (a.tail === 'eel' ? 0.12 : 0.25);
    parts.push(`<path d="M${gx},${cy - hT * 0.6} Q${gx - 12},${cy} ${gx},${cy + hB * 0.6}" fill="none" stroke="${a.pat === 'bones' ? '#e8e2d0' : OL}" stroke-width="2.8" stroke-linecap="round" opacity=".75"/>`);
    // pectoral fin
    const px = gx - 8, py = cy + hB * 0.25;
    parts.push(`<path d="M${px},${py} C${px - 20},${py - 6} ${px - 30},${py + 8} ${px - 24},${py + 16} C${px - 14},${py + 14} ${px - 4},${py + 8} ${px},${py} Z" fill="${shade(cFin, 0.1)}" ${finStroke}/>`);

    // eye(s)
    const er = Math.max(7, Math.min(12, hT * 0.22)) * (a.bigEye ? 1.3 : 1);
    const ex = xn - len * (a.tail === 'eel' ? 0.06 : a.snout === 'long' ? 0.11 : 0.13), ey = cy - hT * (a.tail === 'eel' ? 0.15 : 0.22);
    const eye = (x, y) => {
      let s = `<circle cx="${x}" cy="${y}" r="${er}" fill="#fff" ${ST(3)}/>`;
      if (a.iris) s += `<circle cx="${x + er * 0.15}" cy="${y}" r="${er * 0.72}" fill="${a.iris}"/>`;
      s += `<circle cx="${x + er * 0.22}" cy="${y + er * 0.05}" r="${er * (a.iris ? 0.42 : 0.58)}" fill="${OL}"/>`;
      s += `<circle cx="${x + er * 0.42}" cy="${y - er * 0.28}" r="${er * 0.25}" fill="#fff"/>`;
      return s;
    };
    if (a.twoEyes) parts.push(eye(ex - er * 2.3, ey - er * 0.5));
    parts.push(eye(ex, ey));
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
    if (a.fangs === 'big') parts.push(`<path d="M${nx - 8},${ny + 2} l3,10 l3,-10 Z M${nx - 17},${ny + 3} l3,9 l3,-9 Z" fill="#fff" stroke="${OL}" stroke-width="1.4"/>`);
    else if (a.fangs) parts.push(`<path d="M${nx - 6},${ny + 3} l2,5 l2,-5 M${nx - 11},${ny + 4} l2,4 l2,-4" fill="#fff" stroke="${OL}" stroke-width="1.2"/>`);
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

    const content = a.ghost ? `<g opacity=".84">${parts.join('')}</g>` : parts.join('');
    const size = opts.width ? ` width="${opts.width}"` : '';
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}"${size}><defs>${defs}</defs>${content}</svg>`, w: W, h: H, mouth: { x: nx / W, y: ny / H } };
  }

  /* =====================================================================
     RODS
     ===================================================================== */
  function rodColors(rodId, skinId) {
    const skin = D.ROD_SKINS.find(s => s.id === skinId);
    const rod = D.ROD_BY_ID[rodId] || D.RODS[0];
    return skin && skin.colors ? skin.colors : rod.colors;
  }
  function rodSvg(rodId, size, skinId) {
    const rod = D.ROD_BY_ID[rodId] || D.RODS[0];
    const skinned = !!(skinId && skinId !== 'none' && D.ROD_SKINS.find(s => s.id === skinId && s.colors));
    const [c1, c2, c3] = rodColors(rod.id, skinId);
    const p = [];
    p.push(`<path d="M108,14 Q120,46 104,76" fill="none" stroke="#fff" stroke-width="2" opacity=".9"/>`);
    p.push(`<path d="M104,72 L104,82" ${ST(2.5)}/>`);
    p.push(`<path d="M98,80 a6,6 0 0 1 12,0 Z" fill="#ef5350" ${ST(2.5)}/><path d="M98,80 a6,6 0 0 0 12,0 Z" fill="#fff" ${ST(2.5)}/>`);
    p.push(`<path d="M22,104 L108,14" stroke="${OL}" stroke-width="10" stroke-linecap="round"/>`);
    p.push(`<path d="M22,104 L108,14" stroke="${c1}" stroke-width="5.5" stroke-linecap="round"/>`);
    p.push(`<path d="M26,98 L100,21" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>`);
    if (rod.id === 'bamboo' && !skinned) for (const t of [0.3, 0.48, 0.66, 0.82]) {
      const x = 22 + 86 * t, y = 104 - 90 * t;
      p.push(`<path d="M${x - 4},${y - 4} L${x + 4},${y + 4}" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>`);
    }
    for (const t of [0.46, 0.64, 0.8, 0.93]) {
      const x = 22 + 86 * t, y = 104 - 90 * t;
      p.push(`<circle cx="${x + 4}" cy="${y + 4}" r="3" fill="none" stroke="${OL}" stroke-width="2"/>`);
    }
    if (rod.id === 'storm' && !skinned) p.push(`<path d="M62,58 L70,52 L67,61 L76,56" fill="none" stroke="${c3}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (skinned) p.push(`<path d="M50,74 l4,-4 l4,4 l-4,4 Z M74,50 l3,-3 l3,3 l-3,3 Z" fill="${c3}" stroke="${OL}" stroke-width="1.5"/>`);
    p.push(`<path d="M14,112 L36,89" stroke="${OL}" stroke-width="16" stroke-linecap="round"/>`);
    p.push(`<path d="M14,112 L36,89" stroke="${rod.id === 'bamboo' && !skinned ? '#b9874a' : c2}" stroke-width="10" stroke-linecap="round"/>`);
    p.push(`<path d="M20,100 L25,105 M26,94 L31,99" stroke="${OL}" stroke-width="2" opacity=".5"/>`);
    p.push(`<circle cx="44" cy="90" r="11" fill="#d7dee2" ${ST(3)}/><circle cx="44" cy="90" r="5.5" fill="${c3}" ${ST(2)}/>`);
    p.push(`<path d="M44,90 L56,98" ${ST(3)}/><circle cx="57" cy="99" r="3.5" fill="${c3}" ${ST(2)}/>`);
    if (rod.id === 'poseidon') {
      p.push(`<path d="M108,14 L104,4 M108,14 L116,8 M108,14 L118,16" stroke="${OL}" stroke-width="5" stroke-linecap="round"/><path d="M108,14 L104,4 M108,14 L116,8 M108,14 L118,16" stroke="${c1}" stroke-width="2.5" stroke-linecap="round"/>`);
      p.push(`<path d="M30,60 l3,-7 l3,7 l-3,7 Z M84,92 l2,-5 l2,5 l-2,5 Z" fill="#fff59d" stroke="#c68a00" stroke-width="1.5"/>`);
    }
    const s = size ? ` width="${size}" height="${size}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 124 124"${s}>${p.join('')}</svg>`;
  }

  /* =====================================================================
     BAITS & TACKLE (48 x 48)
     ===================================================================== */
  const BAIT_ART = {
    worm: () => `<path d="M8,30 C12,18 20,36 26,24 C32,12 40,30 42,20" fill="none" stroke="${OL}" stroke-width="9" stroke-linecap="round"/><path d="M8,30 C12,18 20,36 26,24 C32,12 40,30 42,20" fill="none" stroke="#ff8fa6" stroke-width="5" stroke-linecap="round"/><circle cx="42" cy="19" r="1.4" fill="${OL}"/>`,
    bloodworm: () => [[10, 16], [18, 30], [28, 14], [34, 30]].map(([x, y]) => `<path d="M${x},${y} q4,-6 8,0 q4,6 8,0" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/><path d="M${x},${y} q4,-6 8,0 q4,6 8,0" fill="none" stroke="#e53935" stroke-width="3" stroke-linecap="round"/>`).join(''),
    corn: () => `<path d="M14,40 C8,30 14,10 26,8 C38,8 40,26 32,38 C28,44 18,46 14,40 Z" fill="#ffd54f" ${ST(3)}/>` + [[20, 16], [28, 14], [18, 24], [26, 22], [34, 22], [20, 32], [28, 30]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#ffeb8a" stroke="#e0a800" stroke-width="1.5"/>`).join('') + `<path d="M12,40 C4,34 4,24 10,20 C12,30 16,36 22,42 Z" fill="#7cb342" ${ST(2.5)}/>`,
    spoon: () => `<path d="M24,6 C34,10 36,26 30,36 C26,42 18,40 16,32 C14,22 16,10 24,6 Z" fill="#dfe5ea" ${ST(3)}/><path d="M22,12 C26,16 26,26 22,32" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/><circle cx="24" cy="24" r="3.5" fill="#e53935" ${ST(1.5)}/><path d="M26,38 L26,44 Q26,47 23,47 Q20,47 20,44" fill="none" ${ST(2.5)}/>`,
    livebait: () => `<path d="M6,24 C12,14 30,14 36,24 C30,34 12,34 6,24 Z" fill="#b0bec5" ${ST(3)}/><path d="M36,24 L44,16 L44,32 Z" fill="#90a4ae" ${ST(3)}/><circle cx="13" cy="22" r="2.4" fill="${OL}"/><path d="M14,28 C22,30 28,29 34,25" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>`,
    shrimp: () => `<path d="M34,10 C44,18 42,34 30,40 C22,44 12,40 10,32 C16,34 22,32 24,26 C26,20 30,14 34,10 Z" fill="#ff8a65" ${ST(3)}/><path d="M24,26 L32,30 M26,20 L34,24 M30,14 L37,18" stroke="${OL}" stroke-width="1.6" opacity=".6"/><path d="M34,10 L40,4 M36,12 L44,8" ${ST(2)}/><circle cx="32" cy="14" r="1.6" fill="${OL}"/>`,
    glowbait: () => `<circle cx="24" cy="24" r="16" fill="#eaff7a" opacity=".35"/><circle cx="24" cy="24" r="10" fill="#d4ff3a" ${ST(3)}/><circle cx="20" cy="20" r="3" fill="#fff"/><path d="M8,10 l2,4 l4,2 l-4,2 l-2,4 l-2,-4 l-4,-2 l4,-2 Z M40,34 l1.5,3 l3,1.5 l-3,1.5 l-1.5,3 l-1.5,-3 l-3,-1.5 l3,-1.5 Z" fill="#fff59d" stroke="#c0b000" stroke-width="1"/>`,
  };
  function baitSvg(id, size = 40) {
    const f = BAIT_ART[id] || BAIT_ART.worm;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" class="ico">${f()}</svg>`;
  }
  function tackleSvg(kind, id, size = 40) {
    let s;
    if (kind === 'line') {
      const col = { mono: '#e0f7fa', braid: '#81c784', fluoro: '#b39ddb' }[id] || '#e0f7fa';
      s = `<circle cx="24" cy="24" r="17" fill="#90a4ae" ${ST(3)}/><circle cx="24" cy="24" r="12" fill="${col}" ${ST(2)}/>` +
        `<path d="M14,20 Q24,16 34,20 M13,26 Q24,22 35,26 M15,31 Q24,28 33,31" fill="none" stroke="${shade(col, -0.35)}" stroke-width="1.6"/><circle cx="24" cy="24" r="3.5" fill="#546e7a" ${ST(1.5)}/>` +
        (id === 'fluoro' ? `<path d="M36,8 l2,4 l4,2 l-4,2 l-2,4 l-2,-4 l-4,-2 l4,-2 Z" fill="#fff" stroke="#7e57c2" stroke-width="1.2"/>` : '');
    } else {
      const shank = `M28,6 L28,28 Q28,40 19,40 Q10,40 10,31 L10,26 L15,31`;
      s = `<path d="${shank}" fill="none" stroke="${OL}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="${shank}" fill="none" stroke="#cfd8dc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="28" cy="6" r="3.5" fill="none" stroke="${OL}" stroke-width="2.5"/>` +
        (id === 'treble' ? `<path d="M28,28 Q30,40 38,40 Q44,40 44,32 L44,28 L39,32" fill="none" stroke="${OL}" stroke-width="6" stroke-linecap="round"/><path d="M28,28 Q30,40 38,40 Q44,40 44,32 L44,28 L39,32" fill="none" stroke="#cfd8dc" stroke-width="3" stroke-linecap="round"/>` : '') +
        (id === 'sharp' ? `<path d="M6,10 l6,2 M8,16 l5,0" stroke="#ffd23f" stroke-width="2.5" stroke-linecap="round"/>` : '');
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}" class="ico">${s}</svg>`;
  }

  /* =====================================================================
     FURNITURE & FISHER'S HOUSE (room 360 x 300)
     ===================================================================== */
  const HOUSE_BOX = {
    window: [140, 16, 80, 82], wall: [28, 30, 76, 62], shelf: [256, 26, 82, 78], hearth: [14, 108, 96, 110],
    tank: [250, 132, 98, 104], light: [112, 140, 36, 96], seat: [158, 152, 88, 92], floor: [62, 236, 236, 54],
  };
  const TROPHY_POS = [[118, 104], [168, 104], [218, 104]];

  function furnArt(id, w, h, hour) {
    const night = hour != null && (hour >= 21 || hour < 6);
    switch (id) {
      case 'window': {
        const sky = night ? '#1b2559' : '#8fd6ff';
        return `<rect x="4" y="4" width="${w - 8}" height="${h - 14}" rx="6" fill="${sky}" ${ST(3)}/>` +
          (night ? `<circle cx="${w * 0.68}" cy="${h * 0.3}" r="8" fill="#fff6d6"/><circle cx="${w * 0.3}" cy="${h * 0.22}" r="1.5" fill="#fff"/><circle cx="${w * 0.45}" cy="${h * 0.5}" r="1.2" fill="#fff"/>`
            : `<circle cx="${w * 0.7}" cy="${h * 0.3}" r="9" fill="#fff2a8"/><path d="M12,${h * 0.62} q10,-8 20,0 q10,-8 20,0" fill="#fff" opacity=".9"/>`) +
          `<path d="M${w / 2},4 L${w / 2},${h - 10} M4,${(h - 10) / 2} L${w - 4},${(h - 10) / 2}" stroke="#8d5a2b" stroke-width="5"/>` +
          `<rect x="4" y="4" width="${w - 8}" height="${h - 14}" rx="6" fill="none" stroke="#8d5a2b" stroke-width="5"/><rect x="0" y="${h - 12}" width="${w}" height="8" rx="3" fill="#a56a35" ${ST(2.5)}/>`;
      }
      case 'stainedglass':
        return `<path d="M6,${h - 8} L6,${h * 0.42} Q6,6 ${w / 2},6 Q${w - 6},6 ${w - 6},${h * 0.42} L${w - 6},${h - 8} Z" fill="#2a1d3a" ${ST(3)}/>` +
          `<path d="M12,${h - 12} L12,${h * 0.45} Q12,14 ${w / 2},12 L${w / 2},${h - 12} Z" fill="#7e3fd6" opacity=".85"/>` +
          `<path d="M${w - 12},${h - 12} L${w - 12},${h * 0.45} Q${w - 12},14 ${w / 2},12 L${w / 2},${h - 12} Z" fill="#c62858" opacity=".85"/>` +
          `<circle cx="${w / 2}" cy="${h * 0.38}" r="12" fill="#ffca28" ${ST(2.5)}/><path d="M${w / 2},${h * 0.38 - 12} L${w / 2},${h - 10} M12,${h * 0.62} L${w - 12},${h * 0.62}" stroke="${OL}" stroke-width="3"/>` +
          `<path d="M${w / 2 - 6},${h * 0.38} L${w / 2 + 6},${h * 0.38} M${w / 2},${h * 0.38 - 6} L${w / 2},${h * 0.38 + 6}" stroke="${OL}" stroke-width="2"/>`;
      case 'painting':
        return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="4" fill="#c99a3b" ${ST(3)}/><rect x="9" y="9" width="${w - 18}" height="${h - 18}" fill="#ffb07a"/>` +
          `<circle cx="${w / 2}" cy="${h * 0.55}" r="9" fill="#fff2a8"/><path d="M9,${h * 0.62} Q${w * 0.3},${h * 0.45} ${w / 2},${h * 0.62} T${w - 9},${h * 0.58} L${w - 9},${h - 9} L9,${h - 9} Z" fill="#3f8f4f"/>` +
          `<path d="M9,${h * 0.78} L${w - 9},${h * 0.78} L${w - 9},${h - 9} L9,${h - 9} Z" fill="#3fa9e0"/><rect x="9" y="9" width="${w - 18}" height="${h - 18}" fill="none" ${ST(2)}/>`;
      case 'map':
        return `<path d="M4,6 L${w - 4},4 L${w - 6},${h - 4} L6,${h - 6} Z" fill="#f3e2b8" ${ST(3)}/>` +
          `<path d="M14,${h * 0.35} q10,-10 20,0 q-4,10 -20,0 Z" fill="#7fd4f5" ${ST(1.5)}/><path d="M${w * 0.55},${h * 0.6} q12,-6 18,4 q-8,8 -18,-4 Z" fill="#7fd4f5" ${ST(1.5)}/>` +
          `<path d="M20,${h * 0.7} Q${w * 0.4},${h * 0.4} ${w * 0.7},${h * 0.3}" fill="none" stroke="#c62828" stroke-width="2" stroke-dasharray="4 3"/><path d="M${w * 0.7 - 5},${h * 0.3 - 5} l10,10 M${w * 0.7 + 5},${h * 0.3 - 5} l-10,10" stroke="#c62828" stroke-width="3" stroke-linecap="round"/>`;
      case 'clock':
        return `<path d="M${w / 2},2 L${w - 6},${h * 0.32} L${w - 10},${h * 0.32} L${w - 10},${h * 0.78} L10,${h * 0.78} L10,${h * 0.32} L6,${h * 0.32} Z" fill="#8d5a2b" ${ST(3)}/>` +
          `<circle cx="${w / 2}" cy="${h * 0.52}" r="${h * 0.16}" fill="#fff8e8" ${ST(2.5)}/><path d="M${w / 2},${h * 0.52} L${w / 2},${h * 0.42} M${w / 2},${h * 0.52} L${w / 2 + 6},${h * 0.55}" ${ST(2)}/>` +
          `<path d="M${w / 2},${h * 0.78} L${w / 2},${h - 6}" stroke="${OL}" stroke-width="2"/><circle cx="${w / 2}" cy="${h - 6}" r="4" fill="#ffca28" ${ST(2)}/><rect x="${w / 2 - 5}" y="${h * 0.22}" width="10" height="7" fill="#3b2a1f"/>`;
      case 'bookshelf': {
        const cols = ['#e53935', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc', '#ff7043'];
        let books = '';
        for (const row of [0, 1]) for (let i = 0; i < 6; i++) {
          const bx = 8 + i * ((w - 16) / 6), by = 8 + row * (h / 2 - 2), bh = h / 2 - 12 - (i % 3) * 3;
          books += `<rect x="${bx.toFixed(1)}" y="${(by + (h / 2 - 12 - bh)).toFixed(1)}" width="${((w - 16) / 6 - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${cols[(i + row * 2) % 6]}" stroke="${OL}" stroke-width="1.5"/>`;
        }
        return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="4" fill="#8d5a2b" ${ST(3)}/>${books}<path d="M4,${h / 2} L${w - 4},${h / 2}" stroke="${OL}" stroke-width="3"/>`;
      }
      case 'skullshelf':
        return `<rect x="2" y="${h * 0.62}" width="${w - 4}" height="8" rx="3" fill="#3a2b2b" ${ST(2.5)}/>` +
          `<path d="M14,${h * 0.62} C14,${h * 0.36} 42,${h * 0.36} 42,${h * 0.62} Z" fill="#f4f1ea" ${ST(2.5)}/><circle cx="23" cy="${h * 0.5}" r="3.5" fill="${OL}"/><circle cx="33" cy="${h * 0.5}" r="3.5" fill="${OL}"/>` +
          `<rect x="52" y="${h * 0.4}" width="7" height="${h * 0.22}" fill="#efe3c8" ${ST(1.5)}/><path d="M55.5,${h * 0.4} q-3,-6 0,-10 q3,4 0,10" fill="#ffb300"/>` +
          `<path d="M64,${h * 0.62} L64,${h * 0.48} L68,${h * 0.44} L72,${h * 0.48} L72,${h * 0.62} Z" fill="#7e3fd6" ${ST(1.5)}/>`;
      case 'stove':
        return `<rect x="${w * 0.2}" y="${h * 0.3}" width="${w * 0.6}" height="${h * 0.6}" rx="10" fill="#37474f" ${ST(3)}/>` +
          `<rect x="${w * 0.42}" y="0" width="${w * 0.14}" height="${h * 0.32}" fill="#455a64" ${ST(2.5)}/>` +
          `<rect x="${w * 0.32}" y="${h * 0.5}" width="${w * 0.36}" height="${h * 0.22}" rx="5" fill="#ff7043" ${ST(2.5)}/><path class="flame" d="M${w * 0.42},${h * 0.7} q4,-12 8,-4 q4,-10 8,4 Z" fill="#ffd23f"/>` +
          `<path d="M${w * 0.25},${h * 0.9} L${w * 0.25},${h} M${w * 0.75},${h * 0.9} L${w * 0.75},${h}" ${ST(4)}/>`;
      case 'fireplace':
        return `<rect x="2" y="${h * 0.12}" width="${w - 4}" height="${h * 0.86}" rx="4" fill="#b85c3c" ${ST(3)}/>` +
          `<path d="M8,${h * 0.3} L${w - 8},${h * 0.3} M8,${h * 0.5} L${w - 8},${h * 0.5} M8,${h * 0.7} L${w - 8},${h * 0.7} M30,${h * 0.12} L30,${h * 0.3} M60,${h * 0.3} L60,${h * 0.5}" stroke="#7a3824" stroke-width="2"/>` +
          `<rect x="0" y="${h * 0.06}" width="${w}" height="10" rx="3" fill="#8d5a2b" ${ST(2.5)}/>` +
          `<path d="M${w * 0.2},${h - 2} L${w * 0.2},${h * 0.55} Q${w / 2},${h * 0.32} ${w * 0.8},${h * 0.55} L${w * 0.8},${h - 2} Z" fill="#2b1d16"/>` +
          `<path class="flame" d="M${w * 0.32},${h - 6} q6,-22 12,-8 q6,-20 12,0 q6,-16 10,8 Z" fill="#ff7043"/><path class="flame" d="M${w * 0.4},${h - 6} q5,-12 9,-2 q5,-12 9,2 Z" fill="#ffd23f"/>`;
      case 'tank':
      case 'darktank': {
        const dark = id === 'darktank';
        return `<path d="M10,${h * 0.78} L10,${h} M${w - 10},${h * 0.78} L${w - 10},${h}" ${ST(4)}/><rect x="2" y="${h * 0.74}" width="${w - 4}" height="8" rx="3" fill="${dark ? '#2a1d3a' : '#8d5a2b'}" ${ST(2.5)}/>` +
          `<rect x="4" y="4" width="${w - 8}" height="${h * 0.7}" rx="6" fill="${dark ? '#3a1f5c' : '#7fd4f5'}" opacity=".85" ${ST(3)}/>` +
          `<path d="M6,${h * 0.62} Q${w * 0.3},${h * 0.56} ${w / 2},${h * 0.62} T${w - 6},${h * 0.6} L${w - 6},${h * 0.72} L6,${h * 0.72} Z" fill="${dark ? '#1b1020' : '#e4c98f'}"/>` +
          `<path d="M18,${h * 0.62} C14,${h * 0.48} 22,${h * 0.4} 18,${h * 0.28} M26,${h * 0.62} C30,${h * 0.5} 24,${h * 0.42} 28,${h * 0.34}" fill="none" stroke="${dark ? '#9b5cff' : '#3f9e4a'}" stroke-width="3" stroke-linecap="round"/>` +
          (dark ? `<path d="M${w - 30},${h * 0.62} C${w - 30},${h * 0.5} ${w - 14},${h * 0.5} ${w - 14},${h * 0.62} Z" fill="#f4f1ea" ${ST(1.5)}/><circle cx="${w - 25}" cy="${h * 0.57}" r="2" fill="${OL}"/><circle cx="${w - 19}" cy="${h * 0.57}" r="2" fill="${OL}"/>` : '') +
          `<path d="M10,10 L10,${h * 0.4}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".4"/>`;
      }
      case 'plant':
        return `<path d="M${w * 0.2},${h * 0.72} L${w * 0.8},${h * 0.72} L${w * 0.7},${h} L${w * 0.3},${h} Z" fill="#c96f3c" ${ST(2.5)}/>` +
          `<path d="M${w / 2},${h * 0.72} C${w / 2},${h * 0.5} ${w / 2},${h * 0.3} ${w / 2},${h * 0.18}" stroke="#4e7d33" stroke-width="3" fill="none"/>` +
          [[0.2, 0.34, -1], [0.8, 0.28, 1], [0.15, 0.56, -1], [0.85, 0.5, 1], [0.5, 0.08, 0]].map(([fx, fy, d]) => `<ellipse cx="${w * fx}" cy="${h * fy}" rx="${w * 0.24}" ry="${h * 0.07}" fill="#5cb85c" transform="rotate(${d * 30} ${w * fx} ${h * fy})" ${ST(2)}/>`).join('');
      case 'lamp':
        return `<path d="M${w / 2},${h * 0.3} L${w / 2},${h - 4}" ${ST(4)}/><ellipse cx="${w / 2}" cy="${h - 4}" rx="${w * 0.4}" ry="4" fill="#5d4037" ${ST(2.5)}/>` +
          `<path d="M${w * 0.1},${h * 0.32} L${w * 0.25},${h * 0.04} L${w * 0.75},${h * 0.04} L${w * 0.9},${h * 0.32} Z" fill="#ffcc80" ${ST(2.5)}/>` +
          (night ? `<ellipse cx="${w / 2}" cy="${h * 0.4}" rx="${w * 0.9}" ry="${h * 0.16}" fill="#ffe08a" opacity=".35"/>` : '');
      case 'candelabra': {
        const cand = (x, hh) => `<rect x="${x - 3}" y="${h * 0.28 - hh}" width="6" height="${hh}" fill="#efe3c8" stroke="${OL}" stroke-width="1.5"/><path class="flame" d="M${x},${h * 0.28 - hh - 1} q-4,-7 0,-12 q4,5 0,12 Z" fill="#ffb300"/>`;
        return `<path d="M${w / 2},${h * 0.28} L${w / 2},${h - 6} M${w * 0.15},${h * 0.28} Q${w * 0.15},${h * 0.45} ${w / 2},${h * 0.45} Q${w * 0.85},${h * 0.45} ${w * 0.85},${h * 0.28}" fill="none" stroke="#b0b7bd" stroke-width="3.5"/>` +
          `<ellipse cx="${w / 2}" cy="${h - 5}" rx="${w * 0.4}" ry="4" fill="#78909c" ${ST(2)}/>` + cand(w * 0.15, 14) + cand(w / 2, 20) + cand(w * 0.85, 14) +
          (night ? `<ellipse cx="${w / 2}" cy="${h * 0.15}" rx="${w}" ry="${h * 0.14}" fill="#ffd27a" opacity=".3"/>` : '');
      }
      case 'stool':
        return `<ellipse cx="${w / 2}" cy="${h * 0.56}" rx="${w * 0.3}" ry="7" fill="#c98a4a" ${ST(3)}/>` +
          `<path d="M${w * 0.28},${h * 0.6} L${w * 0.22},${h - 4} M${w * 0.72},${h * 0.6} L${w * 0.78},${h - 4} M${w / 2},${h * 0.62} L${w / 2},${h - 4}" ${ST(4)}/>`;
      case 'armchair':
        return `<path d="M${w * 0.12},${h * 0.2} Q${w / 2},${h * 0.06} ${w * 0.88},${h * 0.2} L${w * 0.88},${h * 0.62} L${w * 0.12},${h * 0.62} Z" fill="#c0392b" ${ST(3)}/>` +
          `<rect x="${w * 0.04}" y="${h * 0.46}" width="${w * 0.2}" height="${h * 0.34}" rx="8" fill="#a93226" ${ST(3)}/><rect x="${w * 0.76}" y="${h * 0.46}" width="${w * 0.2}" height="${h * 0.34}" rx="8" fill="#a93226" ${ST(3)}/>` +
          `<rect x="${w * 0.2}" y="${h * 0.58}" width="${w * 0.6}" height="${h * 0.2}" rx="6" fill="#e74c3c" ${ST(3)}/><path d="M${w * 0.16},${h * 0.8} L${w * 0.16},${h - 2} M${w * 0.84},${h * 0.8} L${w * 0.84},${h - 2}" ${ST(4)}/>`;
      case 'gothchair':
        return `<path d="M${w * 0.2},${h * 0.6} L${w * 0.2},${h * 0.16} L${w * 0.3},${h * 0.02} L${w / 2},${h * 0.12} L${w * 0.7},${h * 0.02} L${w * 0.8},${h * 0.16} L${w * 0.8},${h * 0.6} Z" fill="#26162e" ${ST(3)}/>` +
          `<path d="M${w * 0.3},${h * 0.56} L${w * 0.3},${h * 0.22} Q${w / 2},${h * 0.12} ${w * 0.7},${h * 0.22} L${w * 0.7},${h * 0.56} Z" fill="#6a1b4d"/>` +
          `<rect x="${w * 0.1}" y="${h * 0.56}" width="${w * 0.8}" height="${h * 0.2}" rx="6" fill="#3b2149" ${ST(3)}/><path d="M${w * 0.16},${h * 0.76} L${w * 0.16},${h - 2} M${w * 0.84},${h * 0.76} L${w * 0.84},${h - 2}" ${ST(4)}/>` +
          `<circle cx="${w / 2}" cy="${h * 0.3}" r="4" fill="#ffca28" ${ST(1.5)}/>`;
      case 'coffin':
        return `<path d="M${w * 0.3},${h * 0.1} L${w * 0.7},${h * 0.1} L${w * 0.86},${h * 0.32} L${w * 0.78},${h * 0.86} L${w * 0.22},${h * 0.86} L${w * 0.14},${h * 0.32} Z" fill="#3a2418" ${ST(3)}/>` +
          `<path d="M${w * 0.32},${h * 0.18} L${w * 0.68},${h * 0.18} L${w * 0.78},${h * 0.34} L${w * 0.72},${h * 0.8} L${w * 0.28},${h * 0.8} L${w * 0.22},${h * 0.34} Z" fill="#8e1b33"/>` +
          `<rect x="${w * 0.3}" y="${h * 0.56}" width="${w * 0.4}" height="${h * 0.16}" rx="6" fill="#b0273e" ${ST(2)}/><path d="M${w / 2},${h * 0.26} L${w / 2},${h * 0.46} M${w * 0.44},${h * 0.32} L${w * 0.56},${h * 0.32}" stroke="#ffca28" stroke-width="3" stroke-linecap="round"/>`;
      case 'rug':
        return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 4}" ry="${h / 2 - 4}" fill="#e57373" ${ST(3)}/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2 - 18}" ry="${h / 2 - 12}" fill="none" stroke="#fff3c9" stroke-width="3" stroke-dasharray="8 6"/><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.18}" ry="${h * 0.18}" fill="#ffd54f" ${ST(2)}/>`;
      case 'fishrug':
        return `<path d="M${w * 0.14},${h / 2} C${w * 0.3},4 ${w * 0.7},4 ${w * 0.84},${h / 2} C${w * 0.7},${h - 4} ${w * 0.3},${h - 4} ${w * 0.14},${h / 2} Z" fill="#4fc3f7" ${ST(3)}/>` +
          `<path d="M${w * 0.84},${h / 2} L${w - 4},6 L${w - 4},${h - 6} Z" fill="#29b6f6" ${ST(3)}/><circle cx="${w * 0.26}" cy="${h * 0.42}" r="5" fill="#fff" ${ST(2)}/><circle cx="${w * 0.26}" cy="${h * 0.42}" r="2" fill="${OL}"/>` +
          `<path d="M${w * 0.4},${h * 0.3} Q${w * 0.46},${h / 2} ${w * 0.4},${h * 0.7} M${w * 0.55},${h * 0.28} Q${w * 0.61},${h / 2} ${w * 0.55},${h * 0.72}" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/>`;
    }
    return '';
  }
  function furnSvg(id, size = 64, hour) {
    const f = D.FURN_BY_ID[id];
    if (!f) return '';
    const [, , w, h] = HOUSE_BOX[f.slot];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${w + 8} ${h + 8}" width="${size}" height="${size}" class="ico">${furnArt(id, w, h, hour)}</svg>`;
  }
  const nest = (svg, x, y, w, h, extra = '') => svg.replace('<svg xmlns="http://www.w3.org/2000/svg"', `<svg xmlns="http://www.w3.org/2000/svg" x="${x}" y="${y}" width="${w}" height="${h}" ${extra}`);

  // house: { slots:{slot:id}, tank:[species], trophies:[species] }; opts: { look, pose, editable, hour, collection, owner }
  function houseSvg(house, opts = {}) {
    house = house || {};
    const slots = Object.assign({ window: 'window', seat: 'stool' }, house.slots || {});
    const out = [];
    out.push(`<defs><linearGradient id="hwall" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e9c48f"/><stop offset="1" stop-color="#d4a66a"/></linearGradient>` +
      `<linearGradient id="hfloor" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b9824a"/><stop offset="1" stop-color="#94612f"/></linearGradient></defs>`);
    out.push(`<rect x="0" y="0" width="360" height="226" fill="url(#hwall)"/>`);
    for (let x = 0; x < 360; x += 36) out.push(`<path d="M${x},0 L${x},226" stroke="#b98a52" stroke-width="2" opacity=".5"/>`);
    out.push(`<rect x="0" y="226" width="360" height="74" fill="url(#hfloor)"/>`);
    for (let y = 240; y < 300; y += 16) out.push(`<path d="M0,${y} L360,${y}" stroke="#7a4b24" stroke-width="2" opacity=".45"/>`);
    out.push(`<rect x="0" y="218" width="360" height="10" fill="#8d5a2b" stroke="${OL}" stroke-width="2.5"/>`);
    const order = ['window', 'wall', 'shelf', 'hearth', 'floor', 'tank', 'light', 'seat'];
    for (const slot of order) {
      const [x, y, w, h] = HOUSE_BOX[slot];
      const id = slots[slot];
      const cls = opts.editable ? ' class="hslot" data-slot="' + slot + '"' : '';
      if (id && D.FURN_BY_ID[id]) {
        let inner = furnArt(id, w, h, opts.hour);
        if (slot === 'tank') {
          const fish = (house.tank || []).slice(0, 3);
          fish.forEach((sp, i) => {
            if (!D.FISH_BY_ID[sp]) return;
            const f = fishSvg(sp);
            const fw = w * 0.42, fh = fw * f.h / f.w;
            inner += `<g class="aq-fish" style="animation-delay:${-i * 2.3}s">${nest(f.svg, 10 + i * 14, 10 + i * (h * 0.16), fw, fh)}</g>`;
          });
        }
        out.push(`<g transform="translate(${x} ${y})"${cls}>${inner}${opts.editable ? `<rect x="0" y="0" width="${w}" height="${h}" fill="transparent"/>` : ''}</g>`);
      } else if (opts.editable) {
        out.push(`<g transform="translate(${x} ${y})"${cls}><rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="10" fill="rgba(255,255,255,.28)" stroke="rgba(43,29,22,.45)" stroke-width="2.5" stroke-dasharray="7 6"/>` +
          `<path d="M${w / 2},${h / 2 - 10} L${w / 2},${h / 2 + 10} M${w / 2 - 10},${h / 2} L${w / 2 + 10},${h / 2}" stroke="rgba(43,29,22,.55)" stroke-width="5" stroke-linecap="round"/></g>`);
      }
    }
    // trophies
    const col = opts.collection || {};
    (house.trophies || []).slice(0, 3).forEach((sp, i) => {
      if (!D.FISH_BY_ID[sp]) return;
      const [x, y] = TROPHY_POS[i];
      const f = fishSvg(sp);
      const best = col[sp] ? col[sp].best : 0;
      out.push(`<g transform="translate(${x} ${y})"${opts.editable ? ' class="hslot" data-slot="trophy"' : ''}><path d="M0,4 Q0,0 4,0 L40,0 Q44,0 44,4 L44,26 Q22,34 0,26 Z" fill="#8d5a2b" ${ST(2.5)}/>` +
        nest(f.svg, 4, 3, 36, 18) + (best ? `<text x="22" y="29" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="6.5" fill="#fff3c9">${best.toFixed(1)} кг</text>` : '') + `</g>`);
    });
    if (opts.editable && (house.trophies || []).length < 3) {
      const [x, y] = TROPHY_POS[(house.trophies || []).length];
      out.push(`<g transform="translate(${x} ${y})" class="hslot" data-slot="trophy"><rect x="1" y="1" width="42" height="28" rx="6" fill="rgba(255,255,255,.28)" stroke="rgba(43,29,22,.45)" stroke-width="2" stroke-dasharray="5 4"/><text x="22" y="20" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="9" fill="rgba(43,29,22,.6)">🏆+</text></g>`);
    }
    if (opts.look) out.push(nest(character(opts.look, { pose: opts.pose || 'idle' }), 104, 194, 74, 96));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 300" class="house-svg">${out.join('')}</svg>`;
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
    ticket: c => `<path d="M6,14 Q6,10 10,10 L38,10 Q42,10 42,14 L42,19 Q37,19 37,24 Q37,29 42,29 L42,34 Q42,38 38,38 L10,38 Q6,38 6,34 L6,29 Q11,29 11,24 Q11,19 6,19 Z" fill="${c}" ${ST(3.5)}/><path d="M18,12 L18,36" stroke="${OL}" stroke-width="2" stroke-dasharray="3 3"/><path d="M29,17 L31,21.5 L35.5,22 L32,25 L33,29.5 L29,27.2 L25,29.5 L26,25 L22.5,22 L27,21.5 Z" fill="#fff" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/>`,
    scroll: c => `<path d="M12,8 L34,8 Q40,8 40,14 L40,38 Q40,42 36,42 L14,42 Q8,42 8,36 L8,12 Q8,8 12,8 Z" fill="${c}" ${ST(3.5)}/><path d="M15,18 L33,18 M15,25 L29,25 M15,32 L25,32" stroke="${OL}" stroke-width="3" stroke-linecap="round" opacity=".7"/><circle cx="34" cy="34" r="7" fill="#5ccf5c" ${ST(2.5)}/><path d="M31,34 L33.5,36.5 L37.5,31.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    calendar: c => `<rect x="7" y="10" width="34" height="31" rx="6" fill="${c}" ${ST(3.5)}/><path d="M7,19 L41,19" ${ST(3)}/><path d="M15,6 L15,13 M33,6 L33,13" ${ST(3.5)}/><path d="M24,24 L26,28 L30.5,28.5 L27,31.5 L28,36 L24,33.5 L20,36 L21,31.5 L17.5,28.5 L22,28 Z" fill="#fff" stroke="${OL}" stroke-width="1.6" stroke-linejoin="round"/>`,
    house: c => `<path d="M11,22 L11,41 L37,41 L37,22" fill="${c}" ${ST(3.5)}/><path d="M5,24 L24,8 L43,24" fill="none" stroke="${OL}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M5,24 L24,8 L43,24" fill="none" stroke="#e57373" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="20" y="28" width="9" height="13" rx="1.5" fill="#fff" ${ST(2.5)}/>`,
    gift: c => `<rect x="7" y="18" width="34" height="10" rx="2" fill="${shade(c, 0.2)}" ${ST(3)}/><rect x="10" y="28" width="28" height="14" rx="2" fill="${c}" ${ST(3)}/><path d="M24,18 L24,42" stroke="#ffd23f" stroke-width="5"/><path d="M24,18 C18,6 8,10 14,16 Z M24,18 C30,6 40,10 34,16 Z" fill="#ffd23f" ${ST(2.5)}/>`,
    swap: c => `<path d="M8,16 L34,16 M28,9 L36,16 L28,23 M40,32 L14,32 M20,25 L12,32 L20,39" fill="none" stroke="${OL}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8,16 L34,16 M28,9 L36,16 L28,23 M40,32 L14,32 M20,25 L12,32 L20,39" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    pin: c => `<path d="M24,44 C24,44 9,28 9,18 C9,9 16,4 24,4 C32,4 39,9 39,18 C39,28 24,44 24,44 Z" fill="${c}" ${ST(3.5)}/><circle cx="24" cy="18" r="6" fill="#fff" ${ST(2.5)}/>`,
    medal: c => `<path d="M14,4 L20,20 M34,4 L28,20" stroke="${OL}" stroke-width="7" stroke-linecap="round"/><path d="M14,4 L20,20 M34,4 L28,20" stroke="#5c7cfa" stroke-width="3.5" stroke-linecap="round"/><circle cx="24" cy="30" r="13" fill="${c}" ${ST(3.5)}/><path d="M24,23 L26,27.5 L30.5,28 L27,31 L28,35.5 L24,33 L20,35.5 L21,31 L17.5,28 L22,27.5 Z" fill="#fff" stroke="${OL}" stroke-width="1.4" stroke-linejoin="round"/>`,
    palette: c => `<path d="M24,6 C12,6 4,14 4,24 C4,34 12,42 22,42 C26,42 27,39 25,36 C23,33 25,30 29,30 L34,30 C40,30 44,26 44,20 C44,12 35,6 24,6 Z" fill="${c}" ${ST(3.5)}/><circle cx="14" cy="22" r="3.5" fill="#ef5350" ${ST(1.5)}/><circle cx="20" cy="14" r="3.5" fill="#ffd23f" ${ST(1.5)}/><circle cx="30" cy="13" r="3.5" fill="#5ccf5c" ${ST(1.5)}/><circle cx="36" cy="20" r="3.5" fill="#42a5f5" ${ST(1.5)}/>`,
    bolt: c => `<path d="M27,4 L10,27 L22,27 L19,44 L38,19 L26,19 Z" fill="${c}" ${ST(3.5)}/>`,
    archive: c => `<rect x="6" y="8" width="36" height="10" rx="3" fill="${shade(c, 0.2)}" ${ST(3)}/><path d="M9,18 L9,38 Q9,41 12,41 L36,41 Q39,41 39,38 L39,18" fill="${c}" ${ST(3)}/><path d="M19,26 L29,26" stroke="${OL}" stroke-width="4" stroke-linecap="round"/>`,
    sofa: c => `<path d="M8,22 Q8,14 16,14 L32,14 Q40,14 40,22 L40,30 L8,30 Z" fill="${c}" ${ST(3)}/><rect x="4" y="24" width="10" height="14" rx="4" fill="${shade(c, -0.15)}" ${ST(3)}/><rect x="34" y="24" width="10" height="14" rx="4" fill="${shade(c, -0.15)}" ${ST(3)}/><rect x="12" y="28" width="24" height="10" rx="3" fill="${shade(c, 0.15)}" ${ST(3)}/>`,
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
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(typeof svg === 'function' ? svg() : svg);
    imgCache.set(key, entry);
    return entry;
  }
  function fishImage(species) {
    const key = 'fish:' + species;
    if (imgCache.has(key)) return imgCache.get(key);
    const f = fishSvg(species);
    const e = svgImage(key, f.svg, f.w, f.h);
    e.mouth = f.mouth;
    return e;
  }
  function charImage(look, pose) {
    const key = 'char:' + pose + ':' + JSON.stringify(look);
    return svgImage(key, () => character(look, { pose }), 200, 260);
  }
  function preload(list) {
    return Promise.all(list.map(e => e.ready ? Promise.resolve() : new Promise(res => {
      if (e.img.complete && e.img.naturalWidth) { e.ready = true; return res(); }
      e.img.addEventListener('load', () => { e.ready = true; res(); }, { once: true });
      e.img.addEventListener('error', res, { once: true });
    })));
  }

  window.HArt = {
    OL, shade, mix, hex2rgb, character, avatar, torsoCrop, fishSvg, FISH_ART, rodSvg, rodColors, baitSvg, tackleSvg,
    furnSvg, houseSvg, HOUSE_BOX, icon, bobberSvg, HAND, svgImage, fishImage, charImage, preload, uid,
  };
})();
