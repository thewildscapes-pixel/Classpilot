// Web Audio API chime & school bell generator for class period alerts
let audioCtx: AudioContext | null = null;
let currentBellOscillators: { stop: () => void }[] = [];

function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (err) {
    console.warn('AudioContext initialization failed:', err);
    return null;
  }
}

export function playAlertChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // First tone (E5 ~ 659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Second higher chime (A5 ~ 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.15);
    gain2.gain.setValueAtTime(0.2, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.warn('Unable to play audio alert chime:', err);
  }
}

/**
 * Plays an authentic mechanical electric school bell sound (brass bell ring with clapper modulation)
 * @param durationSec Duration in seconds to ring the school bell
 */
export function playSchoolBellSound(durationSec = 4): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    // Stop any existing ringing bell first
    stopSchoolBellSound();

    const now = ctx.currentTime;
    const endTime = now + durationSec;

    // Master bell gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.35, now);
    masterGain.gain.exponentialRampToValueAtTime(0.001, endTime + 0.5);

    // LFO for clapper striking effect (18 Hz rapid hammer strike)
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(18, now); // 18 strikes per second
    lfoGain.gain.setValueAtTime(0.25, now);

    // Primary brass bell dome fundamental frequency (~1080 Hz)
    const bellMain = ctx.createOscillator();
    bellMain.type = 'sine';
    bellMain.frequency.setValueAtTime(1080, now);

    // Metallic overtone 1 (~1850 Hz)
    const bellHarmonic1 = ctx.createOscillator();
    bellHarmonic1.type = 'triangle';
    bellHarmonic1.frequency.setValueAtTime(1850, now);

    // High shimmer metallic overtone 2 (~2700 Hz)
    const bellHarmonic2 = ctx.createOscillator();
    bellHarmonic2.type = 'sine';
    bellHarmonic2.frequency.setValueAtTime(2700, now);

    // Connect LFO to modulate main gain for rapid ring ring ring
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.5, now);

    lfo.connect(ringGain.gain);
    bellMain.connect(ringGain);
    bellHarmonic1.connect(ringGain);
    bellHarmonic2.connect(ringGain);

    ringGain.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Start oscillators
    lfo.start(now);
    bellMain.start(now);
    bellHarmonic1.start(now);
    bellHarmonic2.start(now);

    // Stop oscillators
    lfo.stop(endTime);
    bellMain.stop(endTime + 0.5);
    bellHarmonic1.stop(endTime + 0.5);
    bellHarmonic2.stop(endTime + 0.5);

    currentBellOscillators = [
      { stop: () => { try { lfo.stop(); } catch (e) {} } },
      { stop: () => { try { bellMain.stop(); } catch (e) {} } },
      { stop: () => { try { bellHarmonic1.stop(); } catch (e) {} } },
      { stop: () => { try { bellHarmonic2.stop(); } catch (e) {} } },
    ];
  } catch (err) {
    console.warn('Unable to play school bell sound:', err);
  }
}

export function stopSchoolBellSound(): void {
  currentBellOscillators.forEach((osc) => {
    try {
      osc.stop();
    } catch (e) {
      // ignore if already stopped
    }
  });
  currentBellOscillators = [];
}

