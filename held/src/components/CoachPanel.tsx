"use client";

import { PHASE_GUIDE } from "@/lib/guide/copy";
import type { PhaseId } from "@/lib/core/types";

type Props = {
  phase: PhaseId;
  stepIndex: number;
  stepTotal: number;
};

export function CoachPanel({ phase, stepIndex, stepTotal }: Props) {
  const g = PHASE_GUIDE[phase];

  return (
    <div
      data-testid="coach-panel"
      className="rounded-xl border border-[var(--signal)]/30 bg-[var(--signal)]/8 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--signal)]">
          Step {stepIndex + 1} of {stepTotal} · {g.plainName}
        </p>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--line)] sm:w-28">
          <div
            className="h-full rounded-full bg-[var(--signal)] transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / stepTotal) * 100}%` }}
          />
        </div>
      </div>
      <p className="mt-3 text-sm font-medium leading-snug text-[var(--ink)] sm:text-base">
        {g.inOneSentence}
      </p>
      <p className="mt-3 text-sm text-[var(--warm)]">
        <span className="mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
          Your job ·{" "}
        </span>
        {g.whatYouDo}
      </p>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-[var(--ink-dim)] hover:text-[var(--ink)]">
          Why this step, what AI does, and what not to skip
        </summary>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
              Why this step exists
            </dt>
            <dd className="mt-1 text-[var(--ink-dim)]">{g.whyItExists}</dd>
          </div>
          <div>
            <dt className="mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
              AI&apos;s job
            </dt>
            <dd className="mt-1 text-[var(--ink-dim)]">{g.whatAiDoes}</dd>
          </div>
          <div>
            <dt className="mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
              Do not skip
            </dt>
            <dd className="mt-1 text-[var(--ink-dim)]">{g.dontSkip}</dd>
          </div>
          <div>
            <dt className="mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
              After this
            </dt>
            <dd className="mt-1 text-[var(--ink-dim)]">{g.nextHint}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
