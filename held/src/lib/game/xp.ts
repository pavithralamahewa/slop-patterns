import { PHASE_ORDER, type PhaseId } from "@/lib/core/types";

/** XP awarded when you clear each phase gate — Duolingo-style chunky rewards. */
export const PHASE_XP: Record<PhaseId, number> = {
  foundation: 20,
  map: 25,
  sketch: 30,
  decide: 35,
  prototype: 30,
  test: 40,
  verdict: 50,
};

export function xpForClearedPhases(phase: PhaseId): number {
  const idx = PHASE_ORDER.indexOf(phase);
  let total = 0;
  for (let i = 0; i < idx; i++) {
    total += PHASE_XP[PHASE_ORDER[i]];
  }
  return total;
}

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  const need = 100;
  const level = Math.floor(xp / need) + 1;
  const into = xp % need;
  return { level, into, need };
}
