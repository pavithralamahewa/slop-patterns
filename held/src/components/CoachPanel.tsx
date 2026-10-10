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
      className="rounded-[8px] bg-[#f7f6f3] px-4 py-3.5"
    >
      {/* Notion getting-started callout
          https://mobbin.com/screens/0d0a0279-39dc-44c9-bae7-f4cd616336d0 */}
      <p className="text-[12px] text-[#8a8a8a]">
        Step {stepIndex + 1} of {stepTotal}
      </p>
      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[#ebebeb]">
        <span
          className="block h-full rounded-full bg-[#5e6ad2]"
          style={{ width: `${((stepIndex + 1) / stepTotal) * 100}%` }}
        />
      </span>
      <p className="mt-2 text-[14px] font-medium leading-snug text-[#1a1a1a]">
        {g.inOneSentence}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#6b6b6b]">
        Your job: {g.whatYouDo}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-[12px] text-[#6b6b6b] hover:text-[#1a1a1a]">
          Why this step, what AI does, and what not to skip
        </summary>
        <dl className="mt-3 grid gap-3 text-[13px] leading-relaxed sm:grid-cols-2">
          <div>
            <dt className="text-[#8a8a8a]">Why this step exists</dt>
            <dd className="mt-0.5 text-[#6b6b6b]">{g.whyItExists}</dd>
          </div>
          <div>
            <dt className="text-[#8a8a8a]">AI&apos;s job</dt>
            <dd className="mt-0.5 text-[#6b6b6b]">{g.whatAiDoes}</dd>
          </div>
          <div>
            <dt className="text-[#8a8a8a]">Do not skip</dt>
            <dd className="mt-0.5 text-[#6b6b6b]">{g.dontSkip}</dd>
          </div>
          <div>
            <dt className="text-[#8a8a8a]">After this</dt>
            <dd className="mt-0.5 text-[#6b6b6b]">{g.nextHint}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}
