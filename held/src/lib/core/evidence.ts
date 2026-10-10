import type { EvidenceClaim, SprintQuestion } from "./types";

/**
 * Evidence Graph — claims with provenance linked to sprint questions.
 * Turns Friday into a ledger instead of vibes.
 */

export function claimsForQuestion(
  evidence: EvidenceClaim[],
  questionId: string,
): EvidenceClaim[] {
  return evidence.filter((e) => e.supportsQuestionIds.includes(questionId));
}

export function questionCoverage(
  questions: SprintQuestion[],
  evidence: EvidenceClaim[],
): { covered: number; total: number; gaps: string[] } {
  const gaps: string[] = [];
  let covered = 0;
  for (const q of questions) {
    const hits = claimsForQuestion(evidence, q.id);
    if (hits.length > 0) covered++;
    else gaps.push(q.id);
  }
  return { covered, total: questions.length, gaps };
}

export function resolveQuestionsFromPatterns(
  questions: SprintQuestion[],
  patterns: { questionId: string; yes: number; no: number; n: number }[],
): SprintQuestion[] {
  return questions.map((q) => {
    const p = patterns.find((x) => x.questionId === q.id);
    if (!p || p.n < 3) return { ...q, status: "open" as const };
    if (p.yes / p.n >= 0.6) return { ...q, status: "resolved_yes" as const };
    if (p.no / p.n >= 0.6) return { ...q, status: "resolved_no" as const };
    return { ...q, status: "inconclusive" as const };
  });
}
