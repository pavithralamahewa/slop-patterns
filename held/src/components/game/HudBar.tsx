type Props = {
  xp: number;
  level: number;
  into: number;
  need: number;
  streak: number;
  gems: number;
};

export function HudBar({ xp, level, into, need, streak, gems }: Props) {
  const pct = Math.min(100, Math.round((into / need) * 100));
  return (
    <div
      data-testid="game-hud"
      className="flex flex-wrap items-center gap-3 text-[13px] font-bold"
    >
      <span className="rounded-xl bg-[#FFC800] px-2.5 py-1 text-[#914700]">
        LV {level}
      </span>
      <span className="flex min-w-[140px] flex-1 items-center gap-2 sm:min-w-[180px]">
        <span className="text-[#FFC800]">⚡ {xp} XP</span>
        <span className="h-3 flex-1 overflow-hidden rounded-full bg-[#E5E5E5]">
          <span
            className="block h-full rounded-full bg-[#FFC800] transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </span>
      </span>
      <span className="inline-flex items-center gap-1 text-[#FF9600]" title="Decision streak">
        <FlameIcon /> {streak}
      </span>
      <span className="inline-flex items-center gap-1 text-[#1CB0F6]" title="Verdict gems">
        <GemIcon /> {gems}
      </span>
    </div>
  );
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        fill="currentColor"
        d="M8 1c1.5 2.5.5 4 0 5 2-1 4 .5 4 3.5C12 12 10.2 14 8 14S4 12 4 9.5C4 7 5.5 5 7 4c0 1.5.2 2.5 1-3z"
      />
    </svg>
  );
}

function GemIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path fill="currentColor" d="M8 1 3 6l5 9 5-9-5-5Zm0 2.2L10.6 6H5.4L8 3.2Z" />
    </svg>
  );
}
