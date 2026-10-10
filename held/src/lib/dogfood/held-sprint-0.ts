import type { SketchCandidate, SprintGraph } from "../core/types";
import { selectDiverseSet, withDiversityScores } from "../core/diversity";

/**
 * Sprint Zero — dogfood Foundation + Design Sprint ON Held itself.
 * Facilitator: Cursor agent + Decider (founder). Encoded as the seed graph.
 */

export const FOUNDING_HYPOTHESIS =
  "If we help seed/Series A product pods answer one risky UX question with agent drafts + human Decide + five real testers, they will choose Held over Miro + Lovable + calendar sprints because the sprint graph forces divergence and a recorded Verdict Packet.";

export const DIFFERENTIATORS = [
  "Measurable sketch diversity (not eight paraphrases)",
  "Append-only Decider gates as the product, not a prompt pack",
];

/** Candidate pool for Held first-run — intentionally spanning niches. */
const SKETCH_POOL: SketchCandidate[] = [
  {
    id: "sk_rail",
    title: "Phase Rail",
    thesis:
      "First-run is a vertical phase rail. Map gate blocks Sketch until the Decider approves questions. No blank canvas.",
    panels: [
      "Empty sprint with Foundation hypothesis prefilled for Held",
      "Map agents fill evidence; Approve Map unlocks Sketch",
      "Gallery shows diversity receipts; supervote advances",
    ],
    niche: {
      interaction: "rail",
      density: "medium",
      trust: "humans-only-gates",
      cta: "progressive",
      tone: "decisive",
    },
    vector: [1, 0, 0, 0.9, 0.1, 0.8, 0, 0.7],
    heatVotes: 0,
    strawVotes: 0,
  },
  {
    id: "sk_chat",
    title: "Coach Thread",
    thesis:
      "Sprint feels like a facilitated thread. Agents post turns; Decider reacts with gate chips inline.",
    panels: [
      "Thread opens with Founding Hypothesis draft",
      "Agent posts Map pack; Decider taps Approve",
      "Sketches arrive as cards inside the thread",
    ],
    niche: {
      interaction: "chat",
      density: "dense",
      trust: "conversation-log",
      cta: "single",
      tone: "coaching",
    },
    vector: [0, 1, 0.9, 0, 0.8, 0.1, 0.9, 0],
    heatVotes: 0,
    strawVotes: 0,
  },
  {
    id: "sk_canvas",
    title: "War Room Board",
    thesis:
      "Spatial Miro-like board with sticky HMWs. Agents place artifacts; humans drag into Decide zone.",
    panels: [
      "Board seeds with competitor columns from research",
      "Crazy 8s fan out as sticky clusters",
      "Supervote drops a stamp on one cluster",
    ],
    niche: {
      interaction: "canvas",
      density: "dense",
      trust: "spatial-memory",
      cta: "dual",
      tone: "workshop",
    },
    vector: [0.1, 0.2, 1, 0.3, 0, 0.9, 0, 1],
    heatVotes: 0,
    strawVotes: 0,
  },
  {
    id: "sk_receipt",
    title: "Receipt Desk",
    thesis:
      "Every claim and vote is a dated receipt. First-run teaches the ledger before the gallery.",
    panels: [
      "Hypothesis becomes Receipt #001",
      "Map evidence lists source URLs as receipts",
      "Supervote writes Receipt #Decide with rejected IDs",
    ],
    niche: {
      interaction: "timeline",
      density: "sparse",
      trust: "receipts",
      cta: "single",
      tone: "audit",
    },
    vector: [0, 0, 0.1, 1, 0.9, 0, 1, 0.2],
    heatVotes: 0,
    strawVotes: 0,
  },
  {
    id: "sk_score",
    title: "Diversity Arena",
    thesis:
      "Lead with the diversity meter. Sketches that fail the floor are auto-killed before humans see them.",
    panels: [
      "Meter shows niche coverage and min distance",
      "Gallery only opens when floors pass",
      "Heat map reveals after silent look timer",
    ],
    niche: {
      interaction: "cards",
      density: "medium",
      trust: "scores",
      cta: "progressive",
      tone: "competitive",
    },
    vector: [0.8, 0.5, 0, 0.1, 1, 0.4, 0.3, 0],
    heatVotes: 0,
    strawVotes: 0,
  },
  {
    id: "sk_clone",
    title: "Phase Rail Soft",
    thesis:
      "Near-duplicate of Phase Rail — should be filtered by Diversity Engine (same niche, close vector).",
    panels: [
      "Vertical phases again",
      "Map gate again",
      "Gallery again",
    ],
    niche: {
      interaction: "rail",
      density: "medium",
      trust: "humans-only-gates",
      cta: "progressive",
      tone: "decisive",
    },
    vector: [0.88, 0.22, 0.12, 0.78, 0.32, 0.68, 0.22, 0.58],
    heatVotes: 0,
    strawVotes: 0,
  },
];

export function buildDogfoodSketches(): SketchCandidate[] {
  const selected = selectDiverseSet(SKETCH_POOL, 5);
  return withDiversityScores(selected);
}

export function createHeldSprintZero(): SprintGraph {
  const sketches = buildDogfoodSketches();
  const createdAt = new Date().toISOString();

  return {
    id: "sprint_held_zero",
    title: "Held Sprint Zero — first-run of Held",
    createdAt,
    phase: "foundation",
    hypothesis: FOUNDING_HYPOTHESIS,
    differentiators: DIFFERENTIATORS,
    targetUser:
      "Seed/Series A PM or product designer who has run or wanted a design sprint",
    targetMoment:
      "First open of Held: Start sprint → Approve Map → see divergent sketches with diversity receipts",
    sprintQuestions: [
      {
        id: "q1",
        text: "Will a PM understand the phase rail and Map gate without a human facilitator?",
        status: "open",
      },
      {
        id: "q2",
        text: "Will they trust a divergent gallery enough to supervote — instead of asking for one AI best?",
        status: "open",
      },
      {
        id: "q3",
        text: "Does the Verdict Packet feel like a deliverable they would take to their team?",
        status: "open",
      },
    ],
    artifacts: [
      {
        id: "art_hyp",
        kind: "hypothesis",
        label: "Founding Hypothesis",
        data: { text: FOUNDING_HYPOTHESIS, differentiators: DIFFERENTIATORS },
        derivedFrom: [],
      },
    ],
    gates: [],
    sketches,
    winnerSketchId: null,
    storyboard: [],
    prototypeBrief: null,
    interviewScript: [],
    evidence: [
      {
        id: "ev_char_ai",
        text: "Character Capital: as AI makes building free, deciding what to build matters more — Foundation + Design Sprint are the method.",
        sourceKind: "url",
        sourceRef: "https://www.character.vc/guide/foundation-sprint",
        supportsQuestionIds: ["q2", "q3"],
        polarity: "support",
      },
      {
        id: "ev_gv",
        text: "GV Design Sprint: shortcut to learning via realistic façade + five real customers before expensive build.",
        sourceKind: "url",
        sourceRef: "https://www.gv.com/sprint",
        supportsQuestionIds: ["q1", "q3"],
        polarity: "support",
      },
      {
        id: "ev_market",
        text: "Market flooded with UI generators (Lovable, v0, Figma Make) — none own diverge→Decide→evidence as a system of record.",
        sourceKind: "human_note",
        sourceRef: "sprint-zero-foundation",
        supportsQuestionIds: ["q2"],
        polarity: "support",
      },
    ],
    verdict: null,
    verdictRationale: null,
  };
}

export const ASSUMPTION_SCORECARD = [
  { id: "a1", question: "Right customer?", note: "Seed/Series A product pods — test on Friday" },
  { id: "a2", question: "Right problem?", note: "Wrong-thing risk + sprint ops cost" },
  { id: "a3", question: "Right approach?", note: "Decision OS, not generator" },
  { id: "a4", question: "Choose over competitors?", note: "vs Miro+Lovable+calendar" },
  { id: "a5", question: "Differentiators click?", note: "Diversity + gate ledger" },
  { id: "a6", question: "Does it click?", note: "Sprint Zero Friday — five real PMs" },
];
