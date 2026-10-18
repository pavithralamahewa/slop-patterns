/** Flat 2D Held companion — Duolingo-adjacent vector style (not a copy). */
export function Mascot({
  mood = "idle",
  size = 88,
}: {
  mood?: "idle" | "cheer" | "think";
  size?: number;
}) {
  const eyeY = mood === "think" ? 38 : 36;
  const mouth =
    mood === "cheer"
      ? "M36 52 Q48 62 60 52"
      : mood === "think"
        ? "M40 54 H56"
        : "M38 54 Q48 58 58 54";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-hidden
      className="held-mascot"
    >
      <ellipse cx="48" cy="86" rx="28" ry="6" fill="#00000014" />
      <rect x="18" y="16" width="60" height="60" rx="18" fill="#58CC02" />
      <rect x="22" y="20" width="52" height="48" rx="14" fill="#89E219" />
      <circle cx="36" cy={eyeY} r="5" fill="#1a1a1a" />
      <circle cx="60" cy={eyeY} r="5" fill="#1a1a1a" />
      <circle cx="37.5" cy={eyeY - 1.5} r="1.5" fill="#fff" />
      <circle cx="61.5" cy={eyeY - 1.5} r="1.5" fill="#fff" />
      <path d={mouth} stroke="#1a1a1a" strokeWidth="3" fill="none" strokeLinecap="round" />
      {mood === "cheer" && (
        <>
          <circle cx="14" cy="28" r="4" fill="#FFC800" />
          <circle cx="82" cy="34" r="3" fill="#1CB0F6" />
          <circle cx="78" cy="18" r="2.5" fill="#FF4B4B" />
        </>
      )}
    </svg>
  );
}
