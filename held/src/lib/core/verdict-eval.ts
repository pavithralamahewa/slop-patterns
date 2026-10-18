import { scoreDiversity, type DiversityReport } from "./diversity";
import { questionCoverage } from "./evidence";
import type { SprintGraph } from "./types";

/**
 * Verdict Eval Harness — scores sprint quality for the ledger and enterprise later.
 * Offline-capable: no network. Online hooks can wrap adapter runs later.
 */

export type EvalCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  weight: number;
};

export type VerdictEvalReport = {
  score: number;
  maxScore: number;
  grade: "A" | "B" | "C" | "F";
  checks: EvalCheck[];
  diversity: DiversityReport;
  evidenceCoverage: { covered: number; total: number; gaps: string[] };
};

export function evaluateSprint(graph: SprintGraph): VerdictEvalReport {
  const diversity = scoreDiversity(graph.sketches);
  const evidenceCoverage = questionCoverage(
    graph.sprintQuestions,
    graph.evidence,
  );

  const mapClaimsCited = graph.evidence.every(
    (e) => e.sourceRef.trim().length > 0 && e.sourceKind !== undefined,
  );
  const mapHasUrls = graph.evidence.some(
    (e) => e.sourceKind === "url" && e.sourceRef.startsWith("http"),
  );

  const supervoteGate = graph.gates.find((g) => g.kind === "supervote");
  const supervoteHuman =
    !!supervoteGate &&
    (supervoteGate.actor === "decider" || supervoteGate.actor === "facilitator");

  const rejected =
    supervoteGate && Array.isArray(supervoteGate.payload.rejected)
      ? (supervoteGate.payload.rejected as string[])
      : [];

  const fridayPrimary =
    graph.phase === "verdict"
      ? !String(graph.verdictRationale ?? "")
          .toLowerCase()
          .includes("synthetic only as primary")
      : true;

  const questionsResolved =
    graph.sprintQuestions.filter((q) => q.status !== "open").length;

  const checks: EvalCheck[] = [
    {
      id: "map_citations",
      label: "Map claims have provenance",
      passed: mapClaimsCited && graph.evidence.length >= 2,
      detail: `${graph.evidence.length} claims; all cited=${mapClaimsCited}`,
      weight: 2,
    },
    {
      id: "map_urls",
      label: "Map includes at least one URL source",
      passed: mapHasUrls,
      detail: mapHasUrls ? "URL evidence present" : "No http(s) sources",
      weight: 1,
    },
    {
      id: "diversity_floor",
      label: "Sketch set meets diversity floors",
      passed: diversity.passesFloor,
      detail: `niches ${diversity.uniqueNiches}/${diversity.nicheCount}, minDist ${diversity.minDistance.toFixed(2)}`,
      weight: 3,
    },
    {
      id: "evidence_questions",
      label: "Sprint questions have linked evidence",
      passed:
        evidenceCoverage.total > 0 &&
        evidenceCoverage.covered === evidenceCoverage.total,
      detail: `${evidenceCoverage.covered}/${evidenceCoverage.total} covered`,
      weight: 2,
    },
    {
      id: "human_supervote",
      label: "Supervote cast by human Decider",
      passed: graph.phase === "foundation" || graph.phase === "map" || graph.phase === "sketch"
        ? true
        : supervoteHuman,
      detail: supervoteGate
        ? `${supervoteGate.actorName} rejected ${rejected.length}`
        : "Supervote not yet cast",
      weight: 3,
    },
    {
      id: "facade_brief",
      label: "Prototype has façade brief + interview script",
      passed:
        graph.phase === "foundation" ||
        graph.phase === "map" ||
        graph.phase === "sketch" ||
        graph.phase === "decide"
          ? true
          : Boolean(graph.prototypeBrief) && graph.interviewScript.length >= 3,
      detail: graph.prototypeBrief
        ? `script steps=${graph.interviewScript.length}`
        : "No brief yet",
      weight: 2,
    },
    {
      id: "friday_primary",
      label: "Verdict not based on synthetic-only primary evidence",
      passed: fridayPrimary,
      detail:
        graph.verdict == null
          ? "No verdict yet"
          : fridayPrimary
            ? "Rationale does not claim synthetic-only primary"
            : "Blocked: synthetic-only primary",
      weight: 3,
    },
    {
      id: "questions_resolved",
      label: "Friday resolved sprint questions",
      passed:
        graph.verdict == null
          ? true
          : questionsResolved >= Math.ceil(graph.sprintQuestions.length * 0.5),
      detail: `${questionsResolved}/${graph.sprintQuestions.length} resolved`,
      weight: 2,
    },
  ];

  const maxScore = checks.reduce((s, c) => s + c.weight, 0);
  const score = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
  const ratio = maxScore === 0 ? 0 : score / maxScore;
  const grade: VerdictEvalReport["grade"] =
    ratio >= 0.9 ? "A" : ratio >= 0.75 ? "B" : ratio >= 0.5 ? "C" : "F";

  return { score, maxScore, grade, checks, diversity, evidenceCoverage };
}

/** Predict which question types historically struggle for this ICP (heuristic v0). */
export function predictFragileQuestions(graph: SprintGraph): string[] {
  return graph.sprintQuestions
    .filter((q) => {
      const text = q.text.toLowerCase();
      return (
        text.includes("without a") ||
        text.includes("facilitator") ||
        text.includes("trust")
      );
    })
    .map((q) => q.id);
}
