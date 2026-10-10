import { evaluateSprint, type VerdictEvalReport } from "./verdict-eval";
import { compileFacade, type FacadeCompileResult } from "./facade-compiler";
import type { SprintGraph, Verdict } from "./types";

/**
 * Verdict Packet — the product deliverable.
 * Hypothesis → evidence → Ship/Loop/Kill → what to build next.
 */

export type VerdictPacket = {
  title: string;
  generatedAt: string;
  hypothesis: string;
  differentiators: string[];
  targetUser: string;
  targetMoment: string;
  sprintQuestions: SprintGraph["sprintQuestions"];
  winner: { id: string; title: string; thesis: string } | null;
  evidence: SprintGraph["evidence"];
  gates: SprintGraph["gates"];
  verdict: Verdict | null;
  rationale: string | null;
  nextBuild: string[];
  eval: VerdictEvalReport;
  facade: FacadeCompileResult;
};

export function buildVerdictPacket(graph: SprintGraph): VerdictPacket {
  const winnerSketch = graph.sketches.find((s) => s.id === graph.winnerSketchId);
  const evalReport = evaluateSprint(graph);
  const facade = compileFacade(graph);

  const nextBuild =
    graph.verdict === "ship"
      ? [
          "Persist Sprint Graph + gates in Postgres",
          "Wire Map adapters (research) behind the interface",
          "Ship recruit + transcript pipeline for Friday",
        ]
      : graph.verdict === "loop"
        ? [
            "Revise storyboard from interview patterns",
            "Re-run Diversity Engine with new niches",
            "Book another five testers",
          ]
        : graph.verdict === "kill"
          ? [
              "Archive graph with kill rationale",
              "Return to Foundation Sprint on a new hypothesis",
            ]
          : [
              "Complete Five-Act interviews with five real users",
              "Record Ship / Loop / Kill with evidence",
            ];

  return {
    title: graph.title,
    generatedAt: new Date().toISOString(),
    hypothesis: graph.hypothesis,
    differentiators: graph.differentiators,
    targetUser: graph.targetUser,
    targetMoment: graph.targetMoment,
    sprintQuestions: graph.sprintQuestions,
    winner: winnerSketch
      ? {
          id: winnerSketch.id,
          title: winnerSketch.title,
          thesis: winnerSketch.thesis,
        }
      : null,
    evidence: graph.evidence,
    gates: graph.gates,
    verdict: graph.verdict,
    rationale: graph.verdictRationale,
    nextBuild,
    eval: evalReport,
    facade,
  };
}

export function packetToMarkdown(packet: VerdictPacket): string {
  const lines = [
    `# Verdict Packet — ${packet.title}`,
    ``,
    `Generated: ${packet.generatedAt}`,
    ``,
    `## Verdict`,
    packet.verdict
      ? `**${packet.verdict.toUpperCase()}** — ${packet.rationale ?? ""}`
      : `_Pending five real users_`,
    ``,
    `## Founding Hypothesis`,
    packet.hypothesis,
    ``,
    `## Differentiators`,
    ...packet.differentiators.map((d) => `- ${d}`),
    ``,
    `## Target`,
    `- User: ${packet.targetUser}`,
    `- Moment: ${packet.targetMoment}`,
    ``,
    `## Sprint questions`,
    ...packet.sprintQuestions.map((q) => `- [${q.status}] ${q.text}`),
    ``,
    `## Winner`,
    packet.winner
      ? `**${packet.winner.title}** — ${packet.winner.thesis}`
      : `_No supervote yet_`,
    ``,
    `## Evidence`,
    ...packet.evidence.map(
      (e) => `- (${e.sourceKind}) ${e.text} — ${e.sourceRef}`,
    ),
    ``,
    `## Eval grade: ${packet.eval.grade} (${packet.eval.score}/${packet.eval.maxScore})`,
    ...packet.eval.checks.map(
      (c) => `- [${c.passed ? "x" : " "}] ${c.label}: ${c.detail}`,
    ),
    ``,
    `## Gates (${packet.gates.length})`,
    ...packet.gates.map(
      (g) => `- ${g.at} · ${g.kind} · ${g.actorName}`,
    ),
    ``,
    `## What to build next`,
    ...packet.nextBuild.map((n) => `- ${n}`),
    ``,
  ];
  return lines.join("\n");
}
