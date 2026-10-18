import type { SketchCandidate, SprintGraph } from "../core/types";
import { selectDiverseSet, withDiversityScores } from "../core/diversity";

/**
 * Sprint Zero — dogfood Foundation + Design Sprint ON Held itself.
 * Facilitator: Cursor agent + Decider (founder). Encoded as the seed graph.
 */

export const FOUNDING_HYPOTHESIS =
  "If we help early-stage product teams answer one risky product question with AI drafts, a human final decision, and five real user interviews, they will choose Held over sticky-note boards and vibe-check mockups — because Held forces real options and ends with a written Ship / Loop / Kill verdict.";

export const DIFFERENTIATORS = [
  "Several genuinely different solution ideas — not eight near-copies of one AI default",
  "Human decisions are locked in a permanent log — AI cannot cast the final vote",
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
    title: "Demo: Held deciding about Held",
    createdAt,
    phase: "foundation",
    hypothesis: FOUNDING_HYPOTHESIS,
    differentiators: DIFFERENTIATORS,
    targetUser:
      "A product manager or designer at an early-stage startup who wants to decide what to build before writing lots of code",
    targetMoment:
      "The first time they open Held and need to go from a fuzzy idea to a clear bet, options, and a written verdict",
    sprintQuestions: [
      {
        id: "q1",
        text: "Can someone new follow the step-by-step week without a human coach in the room?",
        status: "open",
      },
      {
        id: "q2",
        text: "Will they pick among several different ideas — instead of asking AI for one “best” mockup?",
        status: "open",
      },
      {
        id: "q3",
        text: "Would they share the written verdict with their team as the outcome of the week?",
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
        text: "As AI makes building cheaper, choosing what to build matters more. Structured “decide first” weeks are the method many top teams still use.",
        sourceKind: "url",
        sourceRef: "https://www.character.vc/guide/foundation-sprint",
        supportsQuestionIds: ["q2", "q3"],
        polarity: "support",
      },
      {
        id: "ev_gv",
        text: "A classic design sprint learns fast with a realistic fake product and five real customers — before a costly build.",
        sourceKind: "url",
        sourceRef: "https://www.gv.com/sprint",
        supportsQuestionIds: ["q1", "q3"],
        polarity: "support",
      },
      {
        id: "ev_market",
        text: "Lots of tools generate pretty UIs in minutes. Few help a team diverge, decide, and leave with evidence they can share.",
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
  { id: "a1", question: "Right customer?", note: "Early-stage PMs/designers — confirm in real interviews" },
  { id: "a2", question: "Right problem?", note: "Shipping the wrong thing is costlier than a slow design week" },
  { id: "a3", question: "Right approach?", note: "A decision system — not another UI generator" },
  { id: "a4", question: "Choose over alternatives?", note: "Boards + AI mockups + calendar invites vs Held" },
  { id: "a5", question: "Do the differentiators land?", note: "Real option variety + locked human decisions" },
  { id: "a6", question: "Does the product click?", note: "Five real people must try the fake product" },
];
