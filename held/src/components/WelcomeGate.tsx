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
      <div className="max-h-[90svh] w-full max-w-[520px] overflow-y-auto rounded-[10px] border border-[#ebebeb] bg-white p-7 shadow-[0_12px_40px_rgba(0,0,0,0.12)] sm:p-8">
        <h1
          id="held-welcome-title"
          className="text-[26px] font-semibold tracking-[-0.02em] text-[#1a1a1a]"
        >
          {WELCOME.title}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6b6b6b]">
          {WELCOME.subtitle}
        </p>

        <div className="mt-5 rounded-[8px] bg-[#f4f4f5] px-4 py-3 text-[13px] leading-relaxed text-[#1a1a1a]">
          {WELCOME.roles}
        </div>

        <ul className="mt-6 space-y-4">
          {WELCOME.bullets.map((b) => (
            <li key={b.title} className="flex gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border border-[#d4d4d4] bg-white"
              />
              <div>
                <p className="text-[14px] font-medium text-[#1a1a1a]">
                  {b.title}
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-[#6b6b6b]">
                  {b.body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          autoFocus
          data-testid="welcome-start"
          onClick={onStart}
          className="btn-signal mt-7 w-full py-2.5 text-center text-[14px] font-medium"
        >
          {WELCOME.cta}
        </button>
        <p className="mt-3 text-center text-[12px] text-[#8a8a8a]">
          About 15–20 minutes. You can pause — progress is saved.
        </p>
      </div>
    </div>
  );
}
