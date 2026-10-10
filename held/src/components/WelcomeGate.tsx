"use client";

import { WELCOME } from "@/lib/guide/copy";
import { Mascot } from "@/components/game/Mascot";

type Props = {
  open: boolean;
  onStart: () => void;
};

export function WelcomeGate({ open, onStart }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="held-welcome-title"
    >
      {/* Duolingo lesson-start bubble energy
          https://mobbin.com/screens/fac0e197-2364-48f1-bc26-be8ddf392179 */}
      <div className="w-full max-w-[400px] rounded-[24px] bg-white px-7 py-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.18)] held-pop-in sm:px-8">
        <Mascot mood="idle" size={88} />
        <h1
          id="held-welcome-title"
          className="mt-3 text-[24px] font-extrabold tracking-[-0.02em] text-[#3C3C3C]"
        >
          {WELCOME.title}
        </h1>
        <p className="mt-3 text-[14px] font-semibold leading-relaxed text-[#777777]">
          {WELCOME.subtitle}
        </p>
        <p className="mt-4 text-[12px] font-extrabold uppercase tracking-wide text-[#FFC800]">
          Level 1 · +20 XP
        </p>
        <button
          type="button"
          autoFocus
          data-testid="welcome-start"
          onClick={onStart}
          className="btn-signal mt-5 w-full py-3.5 text-center text-[15px]"
        >
          {WELCOME.cta}
        </button>
      </div>
    </div>
  );
}
