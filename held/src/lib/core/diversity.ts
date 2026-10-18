import type { BehavioralNiche, SketchCandidate } from "./types";

/**
 * Diversity Engine — quality-diversity for sprint sketches.
 * Not "N parallel chat completions." Enforces niche coverage + vector distance
 * so the gallery is measurably divergent (hard to fake with a prompt pack).
 */

const NICHE_AXES: (keyof BehavioralNiche)[] = [
  "interaction",
  "density",
  "trust",
  "cta",
  "tone",
];

export function nicheKey(niche: BehavioralNiche): string {
  return NICHE_AXES.map((k) => String(niche[k])).join("|");
}

export function cosineDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function minPairwiseDistance(vectors: number[][]): number {
  if (vectors.length < 2) return 1;
  let min = Infinity;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      min = Math.min(min, cosineDistance(vectors[i]!, vectors[j]!));
    }
  }
  return min;
}

export type DiversityReport = {
  nicheCount: number;
  uniqueNiches: number;
  nicheCoverage: number;
  minDistance: number;
  meanDistance: number;
  passesFloor: boolean;
  rejectedDuplicateIds: string[];
};

/** Floors that make sameness visible in the UI — moat surface, not vibes. */
export const DIVERSITY_FLOORS = {
  minUniqueNiches: 4,
  minPairwiseDistance: 0.2,
};

export function scoreDiversity(
  sketches: SketchCandidate[],
  floors = DIVERSITY_FLOORS,
): DiversityReport {
  const keys = sketches.map((s) => nicheKey(s.niche));
  const unique = new Set(keys);
  const vectors = sketches.map((s) => s.vector);
  const minD = minPairwiseDistance(vectors);

  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      sum += cosineDistance(vectors[i]!, vectors[j]!);
      pairs++;
    }
  }

  const rejected: string[] = [];
  const seen = new Map<string, string>();
  for (const s of sketches) {
    const k = nicheKey(s.niche);
    const prev = seen.get(k);
    if (prev) {
      // Same niche — also check near-duplicate vectors
      const other = sketches.find((x) => x.id === prev)!;
      if (cosineDistance(s.vector, other.vector) < floors.minPairwiseDistance) {
        rejected.push(s.id);
      }
    } else {
      seen.set(k, s.id);
    }
  }

  return {
    nicheCount: sketches.length,
    uniqueNiches: unique.size,
    nicheCoverage: sketches.length === 0 ? 0 : unique.size / sketches.length,
    minDistance: minD === Infinity ? 0 : minD,
    meanDistance: pairs === 0 ? 0 : sum / pairs,
    passesFloor:
      unique.size >= floors.minUniqueNiches &&
      (vectors.length < 2 || minD >= floors.minPairwiseDistance),
    rejectedDuplicateIds: rejected,
  };
}

/**
 * Filter a candidate pool to maximize niche coverage under distance floor.
 * Greedy: keep highest "utility" that improves coverage without collapsing distance.
 */
export function selectDiverseSet(
  pool: SketchCandidate[],
  k: number,
  floors = DIVERSITY_FLOORS,
): SketchCandidate[] {
  if (pool.length <= k) return pool.map(annotate);

  const selected: SketchCandidate[] = [];
  const remaining = [...pool];

  // Seed with farthest-from-centroid for spread
  const centroid = meanVector(pool.map((p) => p.vector));
  remaining.sort(
    (a, b) =>
      cosineDistance(b.vector, centroid) - cosineDistance(a.vector, centroid),
  );
  selected.push(remaining.shift()!);

  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const nicheNew = !selected.some(
        (s) => nicheKey(s.niche) === nicheKey(cand.niche),
      );
      const minToSel = Math.min(
        ...selected.map((s) => cosineDistance(s.vector, cand.vector)),
      );
      if (minToSel < floors.minPairwiseDistance * 0.5) continue;
      const score = (nicheNew ? 2 : 0) + minToSel;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]!);
  }

  return selected.map(annotate);
}

function annotate(s: SketchCandidate): SketchCandidate {
  return { ...s, diversityScore: undefined };
}

function meanVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0]!.length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i]!;
  }
  return out.map((x) => x / vectors.length);
}

/** Attach per-sketch contribution (min distance to others) for UI receipts. */
export function withDiversityScores(
  sketches: SketchCandidate[],
): SketchCandidate[] {
  return sketches.map((s) => {
    const others = sketches.filter((o) => o.id !== s.id);
    const minD =
      others.length === 0
        ? 1
        : Math.min(...others.map((o) => cosineDistance(s.vector, o.vector)));
    return { ...s, diversityScore: Math.round(minD * 100) / 100 };
  });
}
