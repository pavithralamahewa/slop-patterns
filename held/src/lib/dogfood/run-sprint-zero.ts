import { appendGate, heatVote, setWinner } from "../core/graph";
import { applyFacadeToGraph, compileFacade } from "../core/facade-compiler";
import {
  buildVerdictPacket,
  packetToMarkdown,
} from "../core/verdict-packet";
import { evaluateSprint } from "../core/verdict-eval";
import { createHeldSprintZero } from "./held-sprint-0";
import type { SprintGraph } from "../core/types";

/**
 * Programmatic dogfood: Foundation → Map → Sketch → Decide → Proto → Test ready.
 * Does NOT invent Friday user quotes or auto-Ship.
 */

export type DogfoodRunResult = {
  graph: SprintGraph;
  evalGrade: string;
  packetMarkdown: string;
  phasesCompleted: string[];
};

export function runSprintZeroToPrototype(): DogfoodRunResult {
  const phasesCompleted: string[] = [];
  let g = createHeldSprintZero();
  phasesCompleted.push("foundation:seed");

  g = appendGate(g, "approve_hypothesis", "Founder (Decider)", {
    hypothesis: g.hypothesis,
  });
  phasesCompleted.push("foundation→map");

  g = appendGate(g, "approve_map", "Founder (Decider)", {
    questions: g.sprintQuestions.map((q) => q.id),
  });
  phasesCompleted.push("map→sketch");

  for (const s of g.sketches) {
    g = heatVote(g, s.id);
  }

  g = appendGate(g, "open_sketch_gallery", "Founder (Decider)", {
    sketchIds: g.sketches.map((s) => s.id),
  });
  phasesCompleted.push("sketch→decide");

  const rail = g.sketches.find((s) => s.id === "sk_rail") ?? g.sketches[0]!;
  g = setWinner(g, rail.id);
  g = { ...g, storyboard: [...rail.panels] };

  const compiled = compileFacade(g);
  g = applyFacadeToGraph(g, compiled);

  g = appendGate(g, "supervote", "Founder (Decider)", {
    sketchId: rail.id,
    rejected: g.sketches.filter((s) => s.id !== rail.id).map((s) => s.id),
  });
  phasesCompleted.push("decide→prototype");

  g = appendGate(g, "accept_prototype", "Founder (Decider)", {
    brief: g.prototypeBrief,
  });
  phasesCompleted.push("prototype→test");

  const evalReport = evaluateSprint(g);
  const packet = buildVerdictPacket(g);

  return {
    graph: g,
    evalGrade: evalReport.grade,
    packetMarkdown: packetToMarkdown(packet),
    phasesCompleted,
  };
}
