/* Hooked — procedural sound: nature ambience, cozy music and game sfx (WebAudio, no files) */
(function () {
  'use strict';
  const store = {
    get(k, d) { try { const v = localStorage.getItem('hooked.' + k); return v == null ? d : v === '1'; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('hooked.' + k, v ? '1' : '0'); } catch { /* private mode */ } },
  };

  const S = {
    ctx: null,
    sfxOn: store.get('sfx', true),
    musicOn: store.get('music', true),
    night: false,

    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxOn ? 1 : 0; this.sfx.connect(this.master);
      this.amb = ctx.createGain(); this.amb.gain.value = this.sfxOn ? 1 : 0; this.amb.connect(this.master);
      this.mus = ctx.createGain(); this.mus.gain.value = this.musicOn ? 0.55 : 0; this.mus.connect(this.master);
      this.white = this.makeNoise('white');
      this.brown = this.makeNoise('brown');
      this.startAmbience();
      this.startMusic();
    },

    setSfx(on) { this.sfxOn = on; store.set('sfx', on); if (this.ctx) { this.fade(this.sfx.gain, on ? 1 : 0); this.fade(this.amb.gain, on ? 1 : 0); } },
    setMusic(on) { this.musicOn = on; store.set('music', on); if (this.ctx) this.fade(this.mus.gain, on ? 0.55 : 0); },
    setNight(n) { this.night = n; },
    fade(param, v, t = 0.4) { const now = this.ctx.currentTime; param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); param.linearRampToValueAtTime(v, now + t); },

    makeNoise(kind) {
      const ctx = this.ctx, len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
      }
      return buf;
    },
    noiseSrc(buf, loop = true) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; },

    env(g, t, a, peak, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    },
    tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.2, a = 0.01, when = 0, dest = null, filter = null }) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime + when;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      this.env(g, t, a, vol, dur);
      let node = o;
      if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; node.connect(f); node = f; }
      node.connect(g).connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    burst({ f = 1000, q = 1, dur = 0.3, vol = 0.3, type = 'bandpass', f1 = null, when = 0, dest = null }) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime + when;
      const s = this.noiseSrc(this.white, false), flt = ctx.createBiquadFilter(), g = ctx.createGain();
      flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f, t);
      if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
      this.env(g, t, 0.01, vol, dur);
      s.connect(flt).connect(g).connect(dest || this.sfx);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },

    /* ---------- sfx ---------- */
    play(name, arg) {
      if (!this.ctx || !this.sfxOn) return;
      switch (name) {
        case 'click': this.tone({ f0: 740, f1: 420, dur: 0.09, vol: 0.18, type: 'triangle' }); break;
        case 'tab': this.tone({ f0: 520, f1: 780, dur: 0.1, vol: 0.14, type: 'sine' }); this.tone({ f0: 1040, dur: 0.06, vol: 0.05, when: 0.04 }); break;
        case 'pop': this.tone({ f0: 300, f1: 900, dur: 0.12, vol: 0.2 }); break;
        case 'whoosh': this.burst({ f: 500, f1: 2600, q: 0.8, dur: 0.38, vol: 0.32 }); break;
        case 'plop':
          this.tone({ f0: 720, f1: 160, dur: 0.18, vol: 0.32 });
          this.burst({ f: 900, q: 0.7, dur: 0.22, vol: 0.18, type: 'lowpass' });
          break;
        case 'nibble': this.tone({ f0: 1100, f1: 520, dur: 0.08, vol: 0.16 }); break;
        case 'bite':
          this.tone({ f0: 500, f1: 120, dur: 0.25, vol: 0.38 });
          this.burst({ f: 700, q: 0.6, dur: 0.3, vol: 0.25, type: 'lowpass' });
          this.tone({ f0: 880, dur: 0.12, vol: 0.12, type: 'square', when: 0.02, filter: 2500 });
          break;
        case 'reel': this.burst({ f: 3200 + Math.random() * 800, q: 6, dur: 0.035, vol: 0.12 }); break;
        case 'warn': this.tone({ f0: 330, dur: 0.12, vol: 0.12, type: 'square', filter: 900 }); break;
        case 'snap':
          this.tone({ f0: 1400, f1: 90, dur: 0.35, vol: 0.3, type: 'sawtooth', filter: 3000 });
          this.burst({ f: 2000, q: 1, dur: 0.15, vol: 0.25 });
          break;
        case 'splash':
          this.burst({ f: 1400, f1: 400, q: 0.6, dur: 0.6, vol: 0.4 });
          this.tone({ f0: 400, f1: 120, dur: 0.25, vol: 0.25 });
          break;
        case 'catch': {
          const tier = arg || 0;
          const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
          const n = 4 + Math.min(2, tier);
          for (let i = 0; i < n; i++) this.tone({ f0: notes[i], dur: 0.32, vol: 0.16, type: 'triangle', when: i * 0.085 });
          this.tone({ f0: notes[n - 1] * 2, dur: 0.6, vol: 0.06, when: n * 0.085 });
          if (tier >= 2) for (let i = 0; i < 6; i++) this.tone({ f0: 2000 + Math.random() * 2000, dur: 0.12, vol: 0.05, when: 0.4 + i * 0.07 });
          break;
        }
        case 'coin':
          this.tone({ f0: 988, dur: 0.1, vol: 0.14, type: 'square', filter: 4000 });
          this.tone({ f0: 1319, dur: 0.35, vol: 0.14, type: 'square', filter: 4000, when: 0.08 });
          break;
        case 'buy': this.play('coin'); for (let i = 0; i < 4; i++) this.tone({ f0: 1500 + i * 300, dur: 0.1, vol: 0.06, when: 0.2 + i * 0.05 }); break;
        case 'level': [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone({ f0: f, dur: 0.22, vol: 0.15, type: 'triangle', when: i * 0.1 })); break;
        case 'miss': this.tone({ f0: 392, f1: 260, dur: 0.3, vol: 0.15, type: 'triangle' }); this.tone({ f0: 330, f1: 196, dur: 0.4, vol: 0.12, type: 'triangle', when: 0.15 }); break;
        case 'error': this.tone({ f0: 180, dur: 0.18, vol: 0.18, type: 'square', filter: 700 }); break;
        case 'emote': this.tone({ f0: 660, f1: 990, dur: 0.12, vol: 0.12 }); break;
        case 'join': this.tone({ f0: 587, dur: 0.12, vol: 0.12, type: 'triangle' }); this.tone({ f0: 880, dur: 0.18, vol: 0.12, type: 'triangle', when: 0.1 }); break;
      }
    },

    /* ---------- ambience: water, wind, birds / crickets ---------- */
    startAmbience() {
      const ctx = this.ctx;
      // gentle lapping water
      const water = this.noiseSrc(this.brown), wf = ctx.createBiquadFilter(), wg = ctx.createGain();
      wf.type = 'lowpass'; wf.frequency.value = 650; wg.gain.value = 0.16;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.17; lg.gain.value = 0.07; lfo.connect(lg).connect(wg.gain); lfo.start();
      water.connect(wf).connect(wg).connect(this.amb); water.start();
      // soft wind
      const wind = this.noiseSrc(this.white), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      nf.type = 'bandpass'; nf.frequency.value = 520; nf.Q.value = 0.5; ng.gain.value = 0.018;
      const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain();
      lfo2.frequency.value = 0.06; lg2.gain.value = 0.014; lfo2.connect(lg2).connect(ng.gain); lfo2.start();
      wind.connect(nf).connect(ng).connect(this.amb); wind.start();

      const loop = () => {
        if (this.night) this.crickets(); else this.bird();
        if (Math.random() < 0.35) this.lap();
        setTimeout(loop, 1800 + Math.random() * 4200);
      };
      setTimeout(loop, 1200);
    },
    lap() { this.burst({ f: 450, f1: 250, q: 0.8, dur: 0.5, vol: 0.06, type: 'lowpass', dest: this.amb }); },
    bird() {
      const ctx = this.ctx, base = 2200 + Math.random() * 2200, n = 2 + Math.floor(Math.random() * 4);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const out = ctx.createGain(); out.gain.value = 0.5;
      if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan).connect(this.amb); } else out.connect(this.amb);
      for (let i = 0; i < n; i++) {
        const t = ctx.currentTime + i * (0.11 + Math.random() * 0.06);
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(base, t);
        o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.4), t + 0.04);
        o.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.09);
        this.env(g, t, 0.01, 0.07, 0.1);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.12);
      }
    },
    crickets() {
      const ctx = this.ctx;
      for (let k = 0; k < 3; k++) {
        const t0 = ctx.currentTime + k * 0.32;
        for (let i = 0; i < 4; i++) {
          const t = t0 + i * 0.045;
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.frequency.value = 4400 + Math.random() * 200;
          this.env(g, t, 0.005, 0.025, 0.035);
          o.connect(g).connect(this.amb); o.start(t); o.stop(t + 0.05);
        }
      }
    },

    /* ---------- cozy procedural music ---------- */
    startMusic() {
      const ctx = this.ctx;
      const bpm = 76, beat = 60 / bpm;
      // Cmaj7 – Am7 – Fmaj7 – G6 (warm lakeside lo-fi)
      const chords = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]];
      const scale = [60, 62, 64, 67, 69, 72, 74, 76];
      const midi = n => 440 * Math.pow(2, (n - 69) / 12);
      const pluck = (f, t, vol, dur = 1.2) => {
        const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), flt = ctx.createBiquadFilter();
        o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.002;
        flt.type = 'lowpass'; flt.frequency.setValueAtTime(2400, t); flt.frequency.exponentialRampToValueAtTime(500, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const g2 = ctx.createGain(); g2.gain.value = 0.25;
        o.connect(flt); o2.connect(g2).connect(flt); flt.connect(g).connect(this.mus);
        o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
      };
      const pad = (notes, t, dur) => {
        for (const n of notes) {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = midi(n + 12);
          g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018, t + 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
          o.connect(g).connect(this.mus); o.start(t); o.stop(t + dur + 0.1);
        }
      };
      let bar = 0, next = ctx.currentTime + 0.3;
      const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
      const schedule = () => {
        while (next < ctx.currentTime + 1.5) {
          const ch = chords[bar % 4];
          pad(ch, next, beat * 4);
          pluck(midi(ch[0] - 12), next, 0.09, 2);
          for (let i = 0; i < 8; i++) pluck(midi(ch[pattern[i]] + 12), next + i * beat / 2, 0.05 + (i % 2 ? 0 : 0.015), 0.9);
          if (bar % 2 === 1 || Math.random() < 0.4) {
            for (let i = 0; i < 3; i++) if (Math.random() < 0.6) pluck(midi(scale[Math.floor(Math.random() * scale.length)] + 12), next + (1 + i) * beat + (Math.random() < 0.3 ? beat / 2 : 0), 0.045, 1.4);
          }
          next += beat * 4; bar++;
        }
        setTimeout(schedule, 500);
      };
      schedule();
    },
  };

  window.HAudio = S;
})();
