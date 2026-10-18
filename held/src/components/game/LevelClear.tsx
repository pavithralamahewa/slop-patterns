"use client";

import { Mascot } from "@/components/game/Mascot";

type Props = {
  open: boolean;
  title: string;
  xp: number;
  onContinue: () => void;
};

export function LevelClear({ open, title, xp, onContinue }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="held-level-clear"
    >
      {/* Duolingo lesson-complete celebration
          https://mobbin.com/screens/5c97a190-7800-4f7d-b672-c7259474a2b7 */}
      <div className="w-full max-w-[380px] rounded-[20px] bg-white px-6 py-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.18)] held-pop-in">
        <Mascot mood="cheer" size={96} />
        <h2
          id="held-level-clear"
          className="mt-3 text-[28px] font-extrabold text-[#FFC800]"
        >
          Level clear!
        </h2>
        <p className="mt-1 text-[15px] font-bold text-[#4B4B4B]">{title}</p>
        <div className="mx-auto mt-5 flex max-w-[200px] flex-col overflow-hidden rounded-2xl border-2 border-[#FFC800]">
          <p className="bg-[#FFC800] py-1 text-[12px] font-extrabold uppercase text-[#914700]">
            Total XP
          </p>
          <p className="py-3 text-[28px] font-extrabold text-[#FFC800]">⚡ {xp}</p>
        </div>
        <button
          type="button"
          data-testid="level-clear-continue"
          autoFocus
          onClick={onContinue}
          className="btn-signal mt-6 w-full py-3 text-[15px] font-extrabold uppercase tracking-wide"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
