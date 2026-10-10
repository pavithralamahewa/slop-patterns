import type { SketchCandidate } from "./types";

/**
 * Preference Model — learns from heat / straw / supervote pairs.
 * Improves future diverge proposals; never casts the supervote.
 * Bradley-Terry style scores over sketch niches.
 */

export type PreferencePair = {
  winnerId: string;
  loserId: string;
  weight: number;
  context: string;
};

export type PreferenceModel = {
  scores: Record<string, number>;
  pairs: PreferencePair[];
};

export function emptyModel(): PreferenceModel {
  return { scores: {}, pairs: [] };
}

export function observePair(
  model: PreferenceModel,
  winnerId: string,
  loserId: string,
  weight = 1,
  context = "decide",
): PreferenceModel {
  const pairs = [...model.pairs, { winnerId, loserId, weight, context }];
  const scores = { ...model.scores };
  scores[winnerId] = (scores[winnerId] ?? 0) + weight;
  scores[loserId] = (scores[loserId] ?? 0) - weight * 0.5;
  return { scores, pairs };
}

/** From a supervote + gallery, emit pairs (winner beats each other). */
export function observeSupervote(
  model: PreferenceModel,
  winnerId: string,
  sketches: SketchCandidate[],
): PreferenceModel {
  let next = model;
  for (const s of sketches) {
    if (s.id === winnerId) continue;
    next = observePair(next, winnerId, s.id, 2, "supervote");
  }
  return next;
}

/** Rank sketches by learned preference (proposal ranking only). */
export function rankByPreference(
  model: PreferenceModel,
  sketches: SketchCandidate[],
): SketchCandidate[] {
  return [...sketches].sort((a, b) => {
    const sa = model.scores[a.id] ?? 0;
    const sb = model.scores[b.id] ?? 0;
    if (sb !== sa) return sb - sa;
    return b.heatVotes + b.strawVotes - (a.heatVotes + a.strawVotes);
  });
}

export function preferenceSummary(model: PreferenceModel): string {
  const n = model.pairs.length;
  if (n === 0) return "No preference pairs yet — Decider still cold-starts.";
  const top = Object.entries(model.scores).sort((a, b) => b[1] - a[1])[0];
  return `${n} pairwise signals logged. Top affinity: ${top?.[0] ?? "—"}. Agents may propose; Decider still supervotes.`;
}
