"use client";

import { WELCOME } from "@/lib/guide/copy";

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
      {/* Notion single-step continue
          https://mobbin.com/screens/3d65078b-6aef-48ac-bea8-db17660ec401 */}
      <div className="w-full max-w-[400px] rounded-[12px] bg-white px-7 py-8 shadow-[0_12px_40px_rgba(0,0,0,0.16)] sm:px-8">
        <h1
          id="held-welcome-title"
          className="text-center text-[22px] font-semibold tracking-[-0.02em] text-[#1a1a1a]"
        >
          {WELCOME.title}
        </h1>
        <p className="mt-3 text-center text-[14px] leading-relaxed text-[#6b6b6b]">
          {WELCOME.subtitle}
        </p>
        <button
          type="button"
          autoFocus
          data-testid="welcome-start"
          onClick={onStart}
          className="btn-signal mt-7 w-full rounded-[8px] py-2.5 text-center text-[14px] font-medium"
        >
          {WELCOME.cta}
        </button>
      </div>
    </div>
  );
}
