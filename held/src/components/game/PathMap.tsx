import { PHASE_ORDER, type PhaseId } from "@/lib/core/types";
import { PHASE_GUIDE } from "@/lib/guide/copy";
import { PHASE_XP } from "@/lib/game/xp";
import { Mascot } from "@/components/game/Mascot";

type Props = {
  phase: PhaseId;
  compact?: boolean;
};

const ICONS = ["★", "◎", "◇", "◆", "▣", "◉", "⚑"];

export function PathMap({ phase, compact = false }: Props) {
  const idx = PHASE_ORDER.indexOf(phase);

  if (compact) {
    return (
      <ol
        data-testid="game-path"
        className="flex items-center justify-between gap-1"
        aria-label="Week path"
      >
        {PHASE_ORDER.map((p, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={p} className="flex flex-1 flex-col items-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-[3px] text-[12px] font-bold ${
                  done || active
                    ? "border-[#58A700] bg-[#58CC02] text-white shadow-[0_3px_0_#58A700]"
                    : "border-[#E5E5E5] bg-[#F0F0F0] text-[#AFAFAF]"
                }`}
                title={`${PHASE_GUIDE[p].plainName} · +${PHASE_XP[p]} XP`}
              >
                {done ? "✓" : ICONS[i]}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <aside
      data-testid="game-path"
      className="flex w-full flex-col items-center md:w-[200px]"
    >
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#AFAFAF]">
        Your week path
      </p>
      <ol className="relative flex w-full flex-col items-center gap-0">
        <span
          aria-hidden
          className="absolute top-4 bottom-4 left-1/2 w-1 -translate-x-1/2 rounded-full bg-[#E5E5E5]"
        />
        {PHASE_ORDER.map((p, i) => {
          const done = i < idx;
          const active = i === idx;
          const locked = i > idx;
          const g = PHASE_GUIDE[p];
          return (
            <li
              key={p}
              className="relative z-[1] flex w-full flex-col items-center py-2"
            >
              {active && (
                <span className="held-start-bubble mb-1 rounded-xl bg-[#58CC02] px-2.5 py-0.5 text-[11px] font-bold uppercase text-white">
                  Start
                </span>
              )}
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full border-[3px] text-[18px] font-bold ${
                  done
                    ? "border-[#58A700] bg-[#58CC02] text-white held-node-pop"
                    : active
                      ? "border-[#58A700] bg-[#58CC02] text-white shadow-[0_4px_0_#58A700] held-node-pulse"
                      : "border-[#E5E5E5] bg-[#F0F0F0] text-[#AFAFAF]"
                }`}
                title={`${g.plainName} · +${PHASE_XP[p]} XP`}
              >
                {done ? "✓" : locked ? "🔒" : ICONS[i]}
              </div>
              <p
                className={`mt-1 max-w-[9rem] text-center text-[12px] font-bold leading-tight ${
                  locked ? "text-[#AFAFAF]" : "text-[#4B4B4B]"
                }`}
              >
                {g.plainName}
              </p>
              {!locked && (
                <p className="text-[10px] font-bold text-[#FFC800]">
                  +{PHASE_XP[p]} XP
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-4">
        <Mascot mood={idx >= 6 ? "cheer" : idx >= 3 ? "think" : "idle"} size={72} />
      </div>
    </aside>
  );
}
