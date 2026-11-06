let audioContext = null;

function getContext() {
  if (typeof window === 'undefined') return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  if (!audioContext) {
    try { audioContext = new Context(); } catch { return null; }
  }
  return audioContext;
}

export function primeNotificationSound() {
  const context = getContext();
  if (context?.state === 'suspended') context.resume().catch(() => {});
}

export function playNotificationChime() {
  const context = getContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume().catch(() => {});
  const start = context.currentTime + 0.01;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, start);
  master.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
  master.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
  master.connect(context.destination);

  const notes = [
    { frequency: 880, offset: 0, length: 0.42, type: 'triangle' },
    { frequency: 1174.66, offset: 0.15, length: 0.42, type: 'triangle' },
    { frequency: 1567.98, offset: 0.3, length: 0.5, type: 'sine' },
  ];

  notes.forEach((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = note.type;
    oscillator.frequency.setValueAtTime(note.frequency, start + note.offset);
    gain.gain.setValueAtTime(0.0001, start + note.offset);
    gain.gain.exponentialRampToValueAtTime(0.55, start + note.offset + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + note.offset + note.length);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start + note.offset);
    oscillator.stop(start + note.offset + note.length + 0.05);
  });

  window.setTimeout(() => {
    try { master.disconnect(); } catch { /* already disconnected */ }
  }, 1400);
}

export function unlockNotificationSoundOnGesture() {
  if (typeof window === 'undefined') return () => {};
  const unlock = () => {
    primeNotificationSound();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
  return () => {
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
}
