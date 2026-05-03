/* =========================================================
   Retro Paint — Web Audio synth (Mario Paint notes, Kid Pix SFX)
   ========================================================= */
(function (global) {
  let audioCtx = null;
  function ctx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Pentatonic-friendly chromatic scale (C major, two octaves)
  const NOTES = [
    261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88,
    523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77,
    1046.50, 1174.66
  ];

  function envelope(gain, t0, attack, decay, peak) {
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone(freq, dur, type, peak) {
    const a = ctx(); if (!a) return;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    envelope(gain, a.currentTime, 0.005, dur, peak ?? 0.18);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + dur + 0.05);
  }

  function noiseBurst(dur, peak, filterFreq) {
    const a = ctx(); if (!a) return;
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const gain = a.createGain();
    envelope(gain, a.currentTime, 0.005, dur, peak ?? 0.2);
    if (filterFreq) {
      const filt = a.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = filterFreq;
      src.connect(filt).connect(gain).connect(a.destination);
    } else {
      src.connect(gain).connect(a.destination);
    }
    src.start();
    src.stop(a.currentTime + dur);
  }

  function sweep(fromFreq, toFreq, dur, type, peak) {
    const a = ctx(); if (!a) return;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type || 'sawtooth';
    osc.frequency.setValueAtTime(fromFreq, a.currentTime);
    osc.frequency.exponentialRampToValueAtTime(toFreq, a.currentTime + dur);
    envelope(gain, a.currentTime, 0.005, dur, peak ?? 0.18);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + dur + 0.05);
  }

  // ---- High-level effect API ----
  const Sounds = {
    enabled: true,
    setEnabled(b) { this.enabled = !!b; },
    init() { ctx(); },

    // Mario Paint: each color maps to a note
    noteForColor(index) {
      if (!this.enabled) return;
      const f = NOTES[index % NOTES.length];
      tone(f, 0.18, 'square', 0.16);
    },
    noteFreq(freq, dur) {
      if (!this.enabled) return;
      tone(freq, dur || 0.12, 'square', 0.14);
    },
    stampPlop() {
      if (!this.enabled) return;
      tone(880, 0.07, 'square', 0.18);
      setTimeout(() => tone(1320, 0.08, 'square', 0.16), 60);
    },
    eraseSwoosh() {
      if (!this.enabled) return;
      sweep(1200, 200, 0.18, 'sawtooth', 0.12);
    },

    // Kid Pix
    wackyBoing() {
      if (!this.enabled) return;
      sweep(200, 1200, 0.15, 'square', 0.16);
      setTimeout(() => sweep(1200, 600, 0.12, 'square', 0.14), 100);
    },
    sprayHiss() {
      if (!this.enabled) return;
      noiseBurst(0.18, 0.12, 4000);
    },
    pop() {
      if (!this.enabled) return;
      tone(660, 0.05, 'square', 0.18);
      setTimeout(() => tone(990, 0.05, 'square', 0.16), 30);
    },
    rainbow() {
      if (!this.enabled) return;
      [523, 587, 659, 783, 880, 987, 1046].forEach((f, i) => {
        setTimeout(() => tone(f, 0.07, 'triangle', 0.12), i * 35);
      });
    },
    explosion() {
      if (!this.enabled) return;
      sweep(800, 60, 0.4, 'sawtooth', 0.25);
      noiseBurst(0.5, 0.3, 2500);
    },
    ohNo() {
      if (!this.enabled) return;
      // descending "oh no" sweep
      sweep(660, 220, 0.4, 'square', 0.18);
    },
    click() {
      if (!this.enabled) return;
      tone(1200, 0.03, 'square', 0.1);
    },

    // ---- Mario stamp sounds ----
    marioCoin() {
      if (!this.enabled) return;
      tone(987.77, 0.08, 'square', 0.16);
      setTimeout(() => tone(1318.51, 0.18, 'square', 0.16), 80);
    },
    marioPowerUp() {
      if (!this.enabled) return;
      const notes = [392, 523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => tone(f, 0.06, 'square', 0.14), i * 40));
    },
    marioJump() {
      if (!this.enabled) return;
      sweep(440, 880, 0.16, 'square', 0.14);
    },
    marioStarHit() {
      if (!this.enabled) return;
      const notes = [880, 988, 1175, 1397, 1568];
      notes.forEach((f, i) => setTimeout(() => tone(f, 0.05, 'square', 0.13), i * 30));
    },
    marioFireball() {
      if (!this.enabled) return;
      sweep(1200, 200, 0.18, 'sawtooth', 0.18);
      noiseBurst(0.12, 0.1, 1500);
    },
    marioYoshiTongue() {
      if (!this.enabled) return;
      sweep(800, 1400, 0.08, 'square', 0.14);
      setTimeout(() => sweep(1400, 800, 0.08, 'square', 0.14), 80);
    },
    marioPipe() {
      if (!this.enabled) return;
      sweep(880, 220, 0.22, 'sawtooth', 0.18);
    },
    marioGhost() {
      if (!this.enabled) return;
      // Spooky descending tone
      sweep(660, 220, 0.5, 'sine', 0.16);
    },
    marioBowser() {
      if (!this.enabled) return;
      tone(110, 0.18, 'sawtooth', 0.22);
      setTimeout(() => tone(82, 0.22, 'sawtooth', 0.22), 120);
    },
    marioBobOmb() {
      if (!this.enabled) return;
      // Tick-tick then bang
      tone(800, 0.04, 'square', 0.12);
      setTimeout(() => tone(800, 0.04, 'square', 0.12), 120);
      setTimeout(() => { sweep(600, 60, 0.3, 'sawtooth', 0.22); noiseBurst(0.3, 0.18, 1800); }, 260);
    },

    // ---- Kid Pix extra SFX ----
    kpHonk() {
      if (!this.enabled) return;
      tone(220, 0.12, 'square', 0.2);
      setTimeout(() => tone(165, 0.18, 'square', 0.18), 90);
    },
    kpSparkle() {
      if (!this.enabled) return;
      const notes = [1568, 1760, 1976, 2349];
      notes.forEach((f, i) => setTimeout(() => tone(f, 0.04, 'triangle', 0.1), i * 25));
    },
    kpWhoosh() {
      if (!this.enabled) return;
      noiseBurst(0.28, 0.16, 2000);
      sweep(1200, 200, 0.28, 'sawtooth', 0.1);
    },
    kpFizz() {
      if (!this.enabled) return;
      noiseBurst(0.4, 0.12, 5000);
    },
    kpBoing() {
      if (!this.enabled) return;
      sweep(120, 720, 0.18, 'square', 0.18);
      setTimeout(() => sweep(720, 480, 0.16, 'square', 0.16), 100);
    },
    kpLaser() {
      if (!this.enabled) return;
      sweep(2000, 200, 0.2, 'sawtooth', 0.16);
    },
    kpQuack() {
      if (!this.enabled) return;
      sweep(900, 350, 0.15, 'sawtooth', 0.18);
    },
    kpBubble() {
      if (!this.enabled) return;
      tone(1500, 0.05, 'sine', 0.14);
      setTimeout(() => tone(900, 0.07, 'sine', 0.12), 50);
    },
    kpDing() {
      if (!this.enabled) return;
      tone(1760, 0.18, 'triangle', 0.12);
      setTimeout(() => tone(2349, 0.18, 'triangle', 0.1), 60);
    },

    // ---- Tux Paint sounds ----
    tpMeow() {
      if (!this.enabled) return;
      sweep(800, 1200, 0.18, 'sine', 0.16);
      setTimeout(() => sweep(1200, 600, 0.2, 'sine', 0.14), 120);
    },
    tpBark() {
      if (!this.enabled) return;
      tone(220, 0.06, 'sawtooth', 0.22);
      setTimeout(() => tone(180, 0.08, 'sawtooth', 0.2), 80);
    },
    tpQuack() {
      if (!this.enabled) return;
      sweep(900, 350, 0.15, 'sawtooth', 0.18);
    },
    tpMoo() {
      if (!this.enabled) return;
      sweep(180, 110, 0.4, 'sine', 0.22);
    },
    tpType() {
      if (!this.enabled) return;
      tone(1800 + Math.random() * 400, 0.02, 'square', 0.1);
    },
    tpBoom() {
      if (!this.enabled) return;
      noiseBurst(0.3, 0.22, 1500);
      sweep(400, 80, 0.3, 'sawtooth', 0.18);
    },
    tpYippee() {
      if (!this.enabled) return;
      [523, 659, 784, 1046].forEach((f, i) =>
        setTimeout(() => tone(f, 0.08, 'triangle', 0.14), i * 40));
    },
    tpWhoa() {
      if (!this.enabled) return;
      sweep(440, 220, 0.3, 'sine', 0.18);
    }
  };

  global.Sounds = Sounds;
})(window);
