/** Held sprint domain types — the system of record for product decisions. */

export type PhaseId =
  | "foundation"
  | "map"
  | "sketch"
  | "decide"
  | "prototype"
  | "test"
  | "verdict";

export type GateKind =
  | "approve_hypothesis"
  | "approve_map"
  | "open_sketch_gallery"
  | "supervote"
  | "lock_storyboard"
  | "accept_prototype"
  | "record_verdict";

export type Verdict = "ship" | "loop" | "kill";

export type BehavioralNiche = {
  /** Interaction pattern: rail, canvas, chat, cards, timeline */
  interaction: string;
  /** Information density: sparse | medium | dense */
  density: "sparse" | "medium" | "dense";
  /** Trust mechanic: receipts, scores, humans-only, replay */
  trust: string;
  /** Primary CTA posture: single | dual | progressive */
  cta: "single" | "dual" | "progressive";
  /** Emotional tone */
  tone: string;
};

export type SketchCandidate = {
  id: string;
  title: string;
  thesis: string;
  panels: [string, string, string];
  niche: BehavioralNiche;
  /** Embedding-like fingerprint for diversity math (deterministic demo vector). */
  vector: number[];
  diversityScore?: number;
  heatVotes: number;
  strawVotes: number;
};

export type EvidenceClaim = {
  id: string;
  text: string;
  sourceKind: "url" | "actor_run" | "transcript" | "human_note" | "hypothesis";
  sourceRef: string;
  supportsQuestionIds: string[];
  polarity: "support" | "refute" | "neutral";
};

export type SprintQuestion = {
  id: string;
  text: string;
  status: "open" | "resolved_yes" | "resolved_no" | "inconclusive";
};

export type GateEvent = {
  id: string;
  at: string;
  kind: GateKind;
  actor: "decider" | "facilitator" | "system";
  actorName: string;
  payload: Record<string, unknown>;
};

export type ArtifactNode = {
  id: string;
  kind:
    | "hypothesis"
    | "map"
    | "sketch"
    | "storyboard"
    | "prototype"
    | "interview"
    | "verdict";
  label: string;
  data: Record<string, unknown>;
  derivedFrom: string[];
};

export type SprintGraph = {
  id: string;
  title: string;
  createdAt: string;
  phase: PhaseId;
  hypothesis: string;
  differentiators: string[];
  targetUser: string;
  targetMoment: string;
  sprintQuestions: SprintQuestion[];
  artifacts: ArtifactNode[];
  gates: GateEvent[];
  sketches: SketchCandidate[];
  winnerSketchId: string | null;
  storyboard: string[];
  prototypeBrief: string | null;
  interviewScript: string[];
  evidence: EvidenceClaim[];
  verdict: Verdict | null;
  verdictRationale: string | null;
};

export const PHASE_ORDER: PhaseId[] = [
  "foundation",
  "map",
  "sketch",
  "decide",
  "prototype",
  "test",
  "verdict",
];

export const PHASE_META: Record<
  PhaseId,
  { label: string; day: string; humanGate: string }
> = {
  foundation: {
    label: "Foundation",
    day: "0",
    humanGate: "Lock the Founding Hypothesis. AI drafts; Decider owns the sentence.",
  },
  map: {
    label: "Map",
    day: "1",
    humanGate: "Approve target user, moment, and sprint questions.",
  },
  sketch: {
    label: "Sketch",
    day: "2",
    humanGate: "Heat-map and keep a diverse set alive — do not collapse to one.",
  },
  decide: {
    label: "Decide",
    day: "3",
    humanGate: "Supervote is human-only. Agents never cast it.",
  },
  prototype: {
    label: "Prototype",
    day: "4",
    humanGate: "Accept façade fidelity + Five-Act interview script.",
  },
  test: {
    label: "Test",
    day: "5",
    humanGate: "Five real users. Pattern board. No synthetic-only verdict.",
  },
  verdict: {
    label: "Verdict",
    day: "5+",
    humanGate: "Ship / Loop / Kill with evidence receipts.",
  },
};
