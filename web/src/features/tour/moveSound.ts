let audioContext: AudioContext | undefined;
let noiseBuffer: AudioBuffer | undefined;

export function playTourMoveSound() {
  if (typeof AudioContext === 'undefined') return;

  try {
    const context = audioContext ??= new AudioContext();
    if (context.state !== 'running') void context.resume().catch(() => {});

    const duration = 0.56;
    if (!noiseBuffer) {
      noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = noiseBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }

    const start = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(720, start);
    filter.frequency.exponentialRampToValueAtTime(1050, start + 0.14);
    filter.frequency.exponentialRampToValueAtTime(260, start + duration);

    const gain = context.createGain();
    gain.gain.setValueCurveAtTime(
      [0, 0.025, 0.10, 0.19, 0.21, 0.18, 0.13, 0.08, 0.035, 0.008, 0],
      start,
      duration,
    );
    source.connect(filter).connect(gain).connect(context.destination);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(start);
  } catch {
    // Audio availability must not prevent navigation.
  }
}
