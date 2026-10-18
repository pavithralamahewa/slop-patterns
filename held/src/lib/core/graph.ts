import type {
  GateEvent,
  GateKind,
  PhaseId,
  SprintGraph,
  Verdict,
} from "./types";
import { PHASE_ORDER } from "./types";

/**
 * Sprint Graph + Gate Runtime
 * Append-only gate events. Phase advances only through legal gates.
 * This is the system of record — harder to copy than prompts.
 */

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

const GATE_ADVANCES: Partial<Record<GateKind, PhaseId>> = {
  approve_hypothesis: "map",
  approve_map: "sketch",
  open_sketch_gallery: "decide",
  supervote: "prototype",
  lock_storyboard: "prototype",
  accept_prototype: "test",
  record_verdict: "verdict",
};

export function canAdvance(graph: SprintGraph, kind: GateKind): boolean {
  const target = GATE_ADVANCES[kind];
  if (!target) return false;

  switch (kind) {
    case "approve_hypothesis":
      return graph.phase === "foundation" && graph.hypothesis.length > 20;
    case "approve_map":
      return (
        graph.phase === "map" &&
        graph.sprintQuestions.length >= 2 &&
        Boolean(graph.targetUser && graph.targetMoment)
      );
    case "open_sketch_gallery":
      return graph.phase === "sketch" && graph.sketches.length >= 3;
    case "supervote":
      return graph.phase === "decide" && Boolean(graph.winnerSketchId);
    case "lock_storyboard":
      return graph.phase === "decide" || graph.phase === "prototype";
    case "accept_prototype":
      return (
        (graph.phase === "prototype" || graph.phase === "decide") &&
        Boolean(graph.prototypeBrief) &&
        graph.interviewScript.length >= 3
      );
    case "record_verdict":
      return graph.phase === "test" || graph.phase === "verdict";
    default:
      return false;
  }
}

export function appendGate(
  graph: SprintGraph,
  kind: GateKind,
  actorName: string,
  payload: Record<string, unknown> = {},
  actor: GateEvent["actor"] = "decider",
): SprintGraph {
  if (!canAdvance(graph, kind) && kind !== "lock_storyboard") {
    // Allow lock_storyboard more loosely; others must pass canAdvance
    if (kind !== "record_verdict" || !payload.verdict) {
      throw new Error(`Illegal gate ${kind} in phase ${graph.phase}`);
    }
  }

  const event: GateEvent = {
    id: id("gate"),
    at: now(),
    kind,
    actor,
    actorName,
    payload,
  };

  const nextPhase = GATE_ADVANCES[kind] ?? graph.phase;
  let next: SprintGraph = {
    ...graph,
    gates: [...graph.gates, event],
    phase: nextPhase,
  };

  if (kind === "supervote" && typeof payload.sketchId === "string") {
    next = { ...next, winnerSketchId: payload.sketchId };
  }
  if (kind === "record_verdict") {
    next = {
      ...next,
      verdict: payload.verdict as Verdict,
      verdictRationale: String(payload.rationale ?? ""),
      phase: "verdict",
    };
  }

  return next;
}

export function heatVote(
  graph: SprintGraph,
  sketchId: string,
): SprintGraph {
  return {
    ...graph,
    sketches: graph.sketches.map((s) =>
      s.id === sketchId ? { ...s, heatVotes: s.heatVotes + 1 } : s,
    ),
  };
}

export function strawVote(
  graph: SprintGraph,
  sketchId: string,
): SprintGraph {
  return {
    ...graph,
    sketches: graph.sketches.map((s) =>
      s.id === sketchId ? { ...s, strawVotes: s.strawVotes + 1 } : s,
    ),
  };
}

export function setWinner(
  graph: SprintGraph,
  sketchId: string,
): SprintGraph {
  return { ...graph, winnerSketchId: sketchId };
}

export function phaseIndex(phase: PhaseId): number {
  return PHASE_ORDER.indexOf(phase);
}

export function serializeGraph(graph: SprintGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function parseGraph(raw: string): SprintGraph {
  return JSON.parse(raw) as SprintGraph;
}

const STORAGE_KEY = "held.sprint.graph.v1";

export function loadGraph(): SprintGraph | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseGraph(raw) : null;
  } catch {
    return null;
  }
}

export function saveGraph(graph: SprintGraph): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializeGraph(graph));
}

export function clearGraph(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
