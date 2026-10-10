import type { SketchCandidate, SprintGraph, SprintQuestion } from "./types";

/**
 * Façade Compiler — storyboard + sprint questions → interview task graph.
 * Held owns proto brief → tasks → instrumented façade states.
 * Codegen tools are adapters that may render these states later.
 */

export type FacadeTask = {
  id: string;
  act: 1 | 2 | 3 | 4 | 5;
  label: string;
  instruction: string;
  successSignal: string;
  questionIds: string[];
};

export type FacadeState = {
  id: string;
  name: string;
  copy: string;
  cta: string;
  taskIds: string[];
};

export type FacadeCompileResult = {
  brief: string;
  storyboard: string[];
  interviewScript: string[];
  tasks: FacadeTask[];
  states: FacadeState[];
  happyPath: string[];
};

const ACTS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Welcome",
  2: "Context",
  3: "Intro",
  4: "Tasks",
  5: "Debrief",
};

export function compileFacade(graph: SprintGraph): FacadeCompileResult {
  const winner =
    graph.sketches.find((s) => s.id === graph.winnerSketchId) ??
    graph.sketches[0];

  if (!winner) {
    return {
      brief: "No sketch selected — cannot compile façade.",
      storyboard: [],
      interviewScript: [],
      tasks: [],
      states: [],
      happyPath: [],
    };
  }

  const storyboard =
    graph.storyboard.length > 0 ? graph.storyboard : [...winner.panels];

  const brief =
    graph.prototypeBrief ??
    defaultBrief(graph, winner);

  const interviewScript =
    graph.interviewScript.length > 0
      ? graph.interviewScript
      : defaultInterviewScript(graph);

  const tasks = buildTasks(graph.sprintQuestions, winner);
  const states = buildStates(winner, storyboard, tasks);
  const happyPath = states.map((s) => s.id);

  return {
    brief,
    storyboard,
    interviewScript,
    tasks,
    states,
    happyPath,
  };
}

function defaultBrief(graph: SprintGraph, winner: SketchCandidate): string {
  return `Façade of ${graph.title}: ${winner.title}. Happy path only — optimize for answering sprint questions, not production completeness. Niche: ${winner.niche.interaction}/${winner.niche.trust}.`;
}

function defaultInterviewScript(graph: SprintGraph): string[] {
  return [
    `${ACTS[1]} — set context; no product pitch yet`,
    `${ACTS[2]} — ask how they decide what to build today`,
    `${ACTS[3]} — introduce Held as a decision OS, not a generator`,
    `${ACTS[4]} — run tasks tied to: ${graph.sprintQuestions.map((q) => q.id).join(", ")}`,
    `${ACTS[5]} — would they take a Verdict Packet to their team?`,
  ];
}

function buildTasks(
  questions: SprintQuestion[],
  winner: SketchCandidate,
): FacadeTask[] {
  const tasks: FacadeTask[] = [
    {
      id: "task_welcome",
      act: 1,
      label: "Settle in",
      instruction: "Confirm role (PM/design/founder) and last product bet.",
      successSignal: "Role stated",
      questionIds: [],
    },
    {
      id: "task_context",
      act: 2,
      label: "Current ritual",
      instruction:
        "Describe how you would run a design sprint or AI MVP decision this month.",
      successSignal: "Baseline ritual named",
      questionIds: [],
    },
    {
      id: "task_intro",
      act: 3,
      label: "Meet the façade",
      instruction: `Open the ${winner.title} first-run. Do not guide unless stuck 60s.`,
      successSignal: "User orients without facilitator",
      questionIds: questions[0] ? [questions[0].id] : [],
    },
  ];

  questions.forEach((q, i) => {
    tasks.push({
      id: `task_q_${q.id}`,
      act: 4,
      label: `Probe ${q.id}`,
      instruction: q.text,
      successSignal: "Verbal yes/no + why",
      questionIds: [q.id],
    });
    if (i === 0) {
      tasks.push({
        id: "task_gate",
        act: 4,
        label: "Approve Map gate",
        instruction: "Complete Approve Map without help.",
        successSignal: "Gate clicked unaided",
        questionIds: [q.id],
      });
    }
    if (i === 1) {
      tasks.push({
        id: "task_supervote",
        act: 4,
        label: "Supervote",
        instruction: "Pick one sketch via supervote. Note hesitation.",
        successSignal: "Supervote cast",
        questionIds: [q.id],
      });
    }
  });

  tasks.push({
    id: "task_debrief",
    act: 5,
    label: "Verdict Packet value",
    instruction:
      "Would you bring this Verdict Packet to your team? What is missing?",
    successSignal: "Ship/loop intent stated",
    questionIds: questions.map((q) => q.id),
  });

  return tasks;
}

function buildStates(
  winner: SketchCandidate,
  storyboard: string[],
  tasks: FacadeTask[],
): FacadeState[] {
  return storyboard.map((panel, i) => ({
    id: `state_${i + 1}`,
    name: `${winner.title} · panel ${i + 1}`,
    copy: panel,
    cta: i < storyboard.length - 1 ? "Continue" : "Finish tasks",
    taskIds: tasks.filter((t) => t.act === 4).map((t) => t.id).slice(0, 2),
  }));
}

/** Apply compile result onto the sprint graph (façade artifacts). */
export function applyFacadeToGraph(
  graph: SprintGraph,
  compiled: FacadeCompileResult,
): SprintGraph {
  const facadeArtifact = {
    id: "art_facade",
    kind: "prototype" as const,
    label: "Compiled façade",
    data: {
      brief: compiled.brief,
      states: compiled.states,
      tasks: compiled.tasks,
      happyPath: compiled.happyPath,
    },
    derivedFrom: graph.winnerSketchId ? [graph.winnerSketchId] : [],
  };

  const withoutOld = graph.artifacts.filter((a) => a.id !== "art_facade");

  return {
    ...graph,
    prototypeBrief: compiled.brief,
    storyboard: compiled.storyboard,
    interviewScript: compiled.interviewScript,
    artifacts: [...withoutOld, facadeArtifact],
  };
}
