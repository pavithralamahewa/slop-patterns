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
    <div className="rounded-xl border border-[var(--signal)]/30 bg-[var(--signal)]/8 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--signal)]">
          Step {stepIndex + 1} of {stepTotal} · {g.plainName}
        </p>
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full rounded-full bg-[var(--signal)] transition-all duration-500"
            style={{ width: `${((stepIndex + 1) / stepTotal) * 100}%` }}
          />
        </div>
      </div>
      <p className="mt-3 text-base font-medium text-[var(--ink)]">
        {g.inOneSentence}
      </p>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
            Why this step exists
          </dt>
          <dd className="mt-1 text-[var(--ink-dim)]">{g.whyItExists}</dd>
        </div>
        <div>
          <dt className="mono text-[10px] uppercase tracking-wider text-[var(--ink-mute)]">
            Your job (human)
          </dt>
          <dd className="mt-1 text-[var(--warm)]">{g.whatYouDo}</dd>
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
      </dl>
      <p className="mt-4 text-xs text-[var(--ink-mute)]">{g.nextHint}</p>
    </div>
  );
}
