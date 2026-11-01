let context: AudioContext | null = null,
  enabled = false;
export function enableSound(value: boolean) {
  enabled = value;
  if (value) {
    try {
      context ??= new AudioContext();
      void context.resume();
    } catch {
      enabled = false;
    }
  }
  return enabled;
}
export function sound(
  kind:
    "shoot" | "hit" | "explosion" | "hack" | "heal" | "dash" | "win" | "click",
) {
  if (!enabled || !context) return;
  const ctx = context,
    now = ctx.currentTime;
  const frequencies =
    kind === "win"
      ? [330, 440, 554, 660]
      : kind === "hack"
        ? [300, 450, 600]
        : [
            kind === "shoot"
              ? 180
              : kind === "explosion"
                ? 64
                : kind === "hit"
                  ? 95
                  : kind === "dash"
                    ? 400
                    : kind === "heal"
                      ? 530
                      : 700,
          ];
  frequencies.forEach((frequency, i) => {
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain(),
      start = now + i * 0.09;
    oscillator.type =
      kind === "shoot" || kind === "explosion" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * (kind === "shoot" ? 0.35 : 0.9),
      start + 0.1,
    );
    gain.gain.setValueAtTime(kind === "shoot" ? 0.035 : 0.055, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
  });
}
