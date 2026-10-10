"use client";

import { useState } from "react";
import { WELCOME } from "@/lib/guide/copy";

type Props = {
  open: boolean;
  onStart: () => void;
};

export function WelcomeGate({ open, onStart }: Props) {
  const [picked, setPicked] = useState(0);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="held-welcome-title"
    >
      {/* Notion “What is this space for?” dialog
          https://mobbin.com/screens/cc865690-f319-4b7b-ba18-ea37ac09e40e */}
      <div className="max-h-[90svh] w-full max-w-[480px] overflow-y-auto rounded-[12px] bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.18)] sm:p-8">
        <h1
          id="held-welcome-title"
          className="text-center text-[22px] font-semibold tracking-[-0.02em] text-[#1a1a1a]"
        >
          {WELCOME.title}
        </h1>
        <p className="mt-2 text-center text-[14px] leading-relaxed text-[#6b6b6b]">
          {WELCOME.subtitle}
        </p>

        <div className="mt-6 space-y-2">
          {WELCOME.bullets.map((b, i) => {
            const active = i === picked;
            return (
              <button
                key={b.title}
                type="button"
                onClick={() => setPicked(i)}
                className={`flex w-full items-start gap-3 rounded-[10px] border px-3.5 py-3 text-left ${
                  active
                    ? "border-[#5e6ad2] bg-white"
                    : "border-[#ebebeb] bg-white hover:border-[#d4d4d4]"
                }`}
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#ebebeb] text-[13px] text-[#1a1a1a]"
                >
                  {i + 1}
                </span>
                <span>
                  <span className="block text-[14px] font-medium text-[#1a1a1a]">
                    {b.title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-[#6b6b6b]">
                    {b.body}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-5 rounded-[8px] bg-[#f7f6f3] px-3.5 py-3 text-[13px] leading-relaxed text-[#1a1a1a]">
          {WELCOME.roles}
        </p>

        <button
          type="button"
          autoFocus
          data-testid="welcome-start"
          onClick={onStart}
          className="btn-signal mt-5 w-full rounded-[8px] py-2.5 text-center text-[14px] font-medium"
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
