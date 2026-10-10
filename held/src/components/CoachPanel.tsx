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
    <details
      data-testid="coach-panel"
      className="text-[13px] text-[#6b6b6b]"
    >
      {/* Optional help — closed by default so the task stays primary */}
      <summary className="cursor-pointer text-[13px] text-[#8a8a8a] hover:text-[#1a1a1a]">
        Why this step ({stepIndex + 1}/{stepTotal})
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed">
        <p>{g.whyItExists}</p>
        <p>
          <span className="text-[#8a8a8a]">Your job · </span>
          {g.whatYouDo}
        </p>
        <p>
          <span className="text-[#8a8a8a]">Do not skip · </span>
          {g.dontSkip}
        </p>
      </div>
    </details>
  );
}
