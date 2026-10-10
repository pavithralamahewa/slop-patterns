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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="held-welcome-title"
    >
      <div className="max-h-[90svh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--ground-2)] p-6 shadow-2xl sm:p-8">
        <p className="mono text-[11px] uppercase tracking-[0.2em] text-[var(--signal)]">
          First time here
        </p>
        <h1
          id="held-welcome-title"
          className="display mt-3 text-4xl text-[var(--ink)] sm:text-5xl"
        >
          {WELCOME.title}
        </h1>
        <p className="mt-4 text-base text-[var(--ink-dim)] sm:text-lg">
          {WELCOME.subtitle}
        </p>

        <ol className="mt-8 space-y-5">
          {WELCOME.bullets.map((b, i) => (
            <li key={b.title} className="flex gap-4">
              <span className="mono mt-0.5 text-[var(--signal)]">
                0{i + 1}
              </span>
              <div>
                <p className="font-medium text-[var(--ink)]">{b.title}</p>
                <p className="mt-1 text-sm text-[var(--ink-dim)]">{b.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-8 rounded-xl border border-[var(--line)] bg-[var(--ground)]/60 px-4 py-3 text-sm text-[var(--warm)]">
          {WELCOME.roles}
        </p>

        <button
          type="button"
          onClick={onStart}
          className="mt-8 w-full rounded-md bg-[var(--signal)] px-5 py-3.5 text-center font-medium text-[var(--signal-ink)] transition hover:brightness-110"
        >
          {WELCOME.cta}
        </button>
        <p className="mt-3 text-center text-xs text-[var(--ink-mute)]">
          About 15–20 minutes for this guided demo. You can pause anytime —
          progress is saved.
        </p>
      </div>
    </div>
  );
}
