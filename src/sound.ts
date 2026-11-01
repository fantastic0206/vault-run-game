let context: AudioContext | null = null;
let enabled = false;
export function soundEnabled() {
  return enabled;
}
export function setSoundEnabled(next: boolean) {
  enabled = next;
  if (next) {
    try {
      context ??= new AudioContext();
      void context.resume();
    } catch {
      enabled = false;
    }
  }
  return enabled;
}
export function playSound(
  kind: "select" | "lock" | "reveal" | "win" | "start",
) {
  if (!enabled || !context) return;
  try {
    const notes =
      kind === "win"
        ? [392, 494, 587, 784]
        : kind === "reveal"
          ? [196, 294, 392]
          : kind === "lock"
            ? [294, 440]
            : kind === "start"
              ? [220, 330]
              : [660];
    notes.forEach((frequency, i) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      const start = context!.currentTime + i * 0.09;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.045, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  } catch {
    /* Audio is decorative; a blocked audio context never interrupts a game. */
  }
}
