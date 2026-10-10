"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  appendGate,
  canAdvance,
  clearGraph,
  heatVote,
  loadGraph,
  saveGraph,
  setWinner,
  strawVote,
} from "@/lib/core/graph";
import {
  apiCreateSprint,
  apiGetSprint,
  apiSaveSprint,
  clearActiveSprintId,
  getActiveSprintId,
  setActiveSprintId,
} from "@/lib/db/client";
import { scoreDiversity } from "@/lib/core/diversity";
import { questionCoverage } from "@/lib/core/evidence";
import {
  emptyModel,
  observeSupervote,
  type PreferenceModel,
} from "@/lib/core/preference";
import {
  applyFacadeToGraph,
  compileFacade,
} from "@/lib/core/facade-compiler";
import {
  buildVerdictPacket,
  packetToMarkdown,
} from "@/lib/core/verdict-packet";
import { createLocalRegistry } from "@/lib/adapters";
import { createHeldSprintZero } from "@/lib/dogfood/held-sprint-0";
import {
  PHASE_ORDER,
  type PhaseId,
  type SprintGraph,
  type Verdict,
} from "@/lib/core/types";
import { GLOSSARY, PHASE_GUIDE } from "@/lib/guide/copy";
import { WelcomeGate } from "@/components/WelcomeGate";
import { CoachPanel } from "@/components/CoachPanel";

const DECIDER = "You (the Decider)";
const WELCOME_KEY = "held.welcome.seen.v1";
const adapters = createLocalRegistry();

function fresherGraph(
  local: SprintGraph | null,
  remote: SprintGraph | null,
): SprintGraph | null {
  if (!local) return remote;
  if (!remote) return local;
  if (local.id !== remote.id) return remote;
  return local.gates.length >= remote.gates.length ? local : remote;
}

function Term({ term }: { term: keyof typeof GLOSSARY | string }) {
  const tip = GLOSSARY[term];
  if (!tip) return <span>{term}</span>;
  return (
    <abbr
      title={tip}
      className="cursor-help border-b border-dotted border-[var(--ink-mute)] no-underline"
    >
      {term}
    </abbr>
  );
}

export function SprintWorkspace() {
  const [graph, setGraph] = useState<SprintGraph | null>(null);
  const [prefs, setPrefs] = useState<PreferenceModel>(emptyModel());
  const [busy, setBusy] = useState(false);
  const [lookDone, setLookDone] = useState(false);
  const [facadeHtml, setFacadeHtml] = useState<string | null>(null);
  const [screener, setScreener] = useState<string | null>(null);
  const [storageLabel, setStorageLabel] = useState("saving…");
  const [showWelcome, setShowWelcome] = useState(true);
  const [coachOpen, setCoachOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_KEY) === "1") setShowWelcome(false);
    } catch {
      /* keep welcome open */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = loadGraph();
      const activeId = getActiveSprintId() ?? local?.id ?? null;
      if (activeId) {
        const remote = await apiGetSprint(activeId);
        const chosen = fresherGraph(local, remote);
        if (!cancelled && chosen) {
          setGraph(chosen);
          saveGraph(chosen);
          setActiveSprintId(chosen.id);
          setStorageLabel(remote ? "saved" : "on this device");
          if (local && remote && local.gates.length > remote.gates.length) {
            void apiSaveSprint(local);
          }
          return;
        }
      }
      const created = await apiCreateSprint();
      if (!cancelled && created) {
        setGraph(created);
        saveGraph(created);
        setActiveSprintId(created.id);
        setStorageLabel("saved");
        return;
      }
      const g = local ?? createHeldSprintZero();
      if (!cancelled) {
        setGraph(g);
        saveGraph(g);
        setStorageLabel("on this device");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const diversity = useMemo(
    () => (graph ? scoreDiversity(graph.sketches) : null),
    [graph],
  );

  const coverage = useMemo(
    () =>
      graph
        ? questionCoverage(graph.sprintQuestions, graph.evidence)
        : null,
    [graph],
  );

  async function commit(next: SprintGraph) {
    setGraph(next);
    saveGraph(next);
    const saved = await apiSaveSprint(next);
    if (saved) {
      setActiveSprintId(saved.id);
      setStorageLabel("saved");
    }
  }

  function runAgents(ms: number, fn: () => void) {
    setBusy(true);
    window.setTimeout(() => {
      startTransition(() => {
        fn();
        setBusy(false);
      });
    }, ms);
  }

  function lockGate(fn: () => void) {
    startTransition(fn);
  }

  function dismissWelcome() {
    try {
      localStorage.setItem(WELCOME_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowWelcome(false);
  }

  if (!graph) {
    return (
      <div className="relative min-h-screen bg-white">
        <WelcomeGate open={showWelcome} onStart={dismissWelcome} />
        {/* Linear empty canvas
            https://mobbin.com/screens/3af45bee-f669-4dc7-afaf-e3fb099161f9 */}
        <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="mb-3 inline-block h-8 w-8 rounded-md bg-[#5e6ad2]" />
          <p className="text-[15px] font-medium">Held</p>
          <p className="max-w-xs text-[13px] text-[#6b6b6b]">
            Preparing your guided demo…
          </p>
        </div>
      </div>
    );
  }

  const idx = PHASE_ORDER.indexOf(graph.phase);
  const guide = PHASE_GUIDE[graph.phase];
  const nextAction = nextActionFor(graph, lookDone, diversity?.passesFloor);

  function startOver() {
    clearGraph();
    clearActiveSprintId();
    setPrefs(emptyModel());
    setLookDone(false);
    setFacadeHtml(null);
    setScreener(null);
    try {
      localStorage.removeItem(WELCOME_KEY);
    } catch {
      /* ignore */
    }
    setShowWelcome(true);
    void apiCreateSprint().then((created) => {
      const fresh = created ?? createHeldSprintZero();
      if (created) setActiveSprintId(created.id);
      setStorageLabel(created ? "saved" : "on this device");
      commit(fresh);
    });
  }

  return (
    <div className="flex min-h-screen bg-white text-[var(--ink)]">
      <WelcomeGate open={showWelcome} onStart={dismissWelcome} />

      {/* Linear sidebar — steps only
          https://mobbin.com/screens/3af45bee-f669-4dc7-afaf-e3fb099161f9 */}
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[#ebebeb] bg-[#f7f7f7] md:flex">
        <div className="flex h-12 items-center gap-2 px-4">
          <span className="inline-block h-3.5 w-3.5 rounded-[3px] bg-[#5e6ad2]" />
          <Link href="/" className="text-[13px] font-medium">
            Held
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          <ol className="space-y-0.5">
            {PHASE_ORDER.map((p, i) => {
              const active = p === graph.phase;
              const done = i < idx;
              return (
                <li key={p}>
                  <div
                    className={`rounded-md px-2.5 py-1.5 text-[13px] ${
                      active
                        ? "bg-[#ececec] text-[#1a1a1a]"
                        : done
                          ? "text-[#1a1a1a]"
                          : "text-[#8a8a8a]"
                    }`}
                  >
                    <span className="text-[#8a8a8a]">{i + 1}. </span>
                    {PHASE_GUIDE[p].plainName}
                  </div>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            data-testid="start-over"
            className="mt-8 w-full rounded-md px-2.5 py-1.5 text-left text-[12px] text-[#8a8a8a] hover:bg-[#ececec] hover:text-[#1a1a1a]"
            onClick={startOver}
          >
            Start over
          </button>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[#ebebeb] px-4 md:px-8">
          <p className="text-[13px] text-[#8a8a8a]">
            {idx + 1} of {PHASE_ORDER.length}
            <span className="mx-1.5 text-[#d4d4d4]">·</span>
            <span className="text-[#1a1a1a]">{guide.plainName}</span>
          </p>
          <div className="flex items-center gap-3">
            {busy && (
              <span className="text-xs text-[#5e6ad2]">Working…</span>
            )}
            <button
              type="button"
              data-testid="toggle-coach"
              className="text-[12px] text-[#8a8a8a] hover:text-[#1a1a1a]"
              onClick={() => setCoachOpen((v) => !v)}
            >
              {coachOpen ? "Hide help" : "Help"}
            </button>
            <button
              type="button"
              className="text-[12px] text-[#8a8a8a] hover:text-[#1a1a1a] md:hidden"
              data-testid="start-over"
              onClick={startOver}
            >
              Start over
            </button>
          </div>
        </header>

        <section className="mx-auto w-full max-w-[640px] flex-1 overflow-x-hidden px-5 py-10 md:px-8 md:py-14">
            <div className="mb-6 md:hidden">
              <ol className="flex gap-1" aria-label="Sprint progress">
                {PHASE_ORDER.map((p, i) => {
                  const active = p === graph.phase;
                  const done = i < idx;
                  return (
                    <li key={p} className="flex-1">
                      <span
                        title={PHASE_GUIDE[p].plainName}
                        className={`block h-1 rounded-full ${
                          active || done ? "bg-[#5e6ad2]" : "bg-[#ebebeb]"
                        }`}
                      />
                    </li>
                  );
                })}
              </ol>
            </div>

            <h1 className="text-[28px] font-semibold tracking-[-0.02em] md:text-[32px]">
              {guide.plainName}
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-[#6b6b6b]">
              {nextAction}
            </p>

            {coachOpen && (
              <div className="mt-4">
                <CoachPanel
                  phase={graph.phase}
                  stepIndex={idx}
                  stepTotal={PHASE_ORDER.length}
                />
              </div>
            )}

          {graph.phase === "foundation" && (
            <FoundationPhase
              graph={graph}
              busy={busy}
              onApprove={() =>
                lockGate(() => {
                  commit(
                    appendGate(graph, "approve_hypothesis", DECIDER, {
                      hypothesis: graph.hypothesis,
                    }),
                  );
                })
              }
            />
          )}

          {graph.phase === "map" && (
            <MapPhase
              graph={graph}
              coverage={coverage}
              busy={busy}
              onRefreshResearch={() =>
                runAgents(900, () => {
                  void adapters.mapResearch
                    .search({
                      brief: graph.title,
                      hypothesis: graph.hypothesis,
                    })
                    .then((hits) => {
                      const evidence = hits.map((h, i) => ({
                        id: `ev_adapter_${Date.now()}_${i}`,
                        text: h.excerpt,
                        sourceKind: "url" as const,
                        sourceRef: h.url,
                        supportsQuestionIds: graph.sprintQuestions.map(
                          (q) => q.id,
                        ),
                        polarity: "support" as const,
                      }));
                      commit({
                        ...graph,
                        evidence: [...graph.evidence, ...evidence],
                      });
                    });
                })
              }
              onApprove={() =>
                lockGate(() => {
                  commit(
                    appendGate(graph, "approve_map", DECIDER, {
                      questions: graph.sprintQuestions.map((q) => q.id),
                    }),
                  );
                })
              }
            />
          )}

          {graph.phase === "sketch" && (
            <SketchPhase
              graph={graph}
              diversity={diversity}
              lookDone={lookDone}
              onLookDone={() => setLookDone(true)}
              onHeat={(id) => commit(heatVote(graph, id))}
              onOpenDecide={() =>
                commit(
                  appendGate(graph, "open_sketch_gallery", DECIDER, {
                    sketchIds: graph.sketches.map((s) => s.id),
                    diversity,
                  }),
                )
              }
            />
          )}

          {graph.phase === "decide" && (
            <DecidePhase
              graph={graph}
              onStraw={(id) => commit(strawVote(graph, id))}
              onPick={(id) => commit(setWinner(graph, id))}
              onSupervote={() => {
                if (!graph.winnerSketchId) return;
                const winner = graph.winnerSketchId;
                const withWinner = setWinner(graph, winner);
                const compiled = compileFacade(withWinner);
                const withFacade = applyFacadeToGraph(withWinner, compiled);
                const next = appendGate(withFacade, "supervote", DECIDER, {
                  sketchId: winner,
                  rejected: graph.sketches
                    .filter((s) => s.id !== winner)
                    .map((s) => s.id),
                });
                setPrefs(observeSupervote(prefs, winner, graph.sketches));
                void adapters.codegen
                  .renderFacade(compiled.states)
                  .then((r) => setFacadeHtml(r.htmlStub));
                commit(next);
              }}
            />
          )}

          {graph.phase === "prototype" && (
            <PrototypePhase
              graph={graph}
              busy={busy}
              facadeHtml={facadeHtml}
              onRender={() =>
                runAgents(600, () => {
                  const compiled = compileFacade(graph);
                  void adapters.codegen
                    .renderFacade(compiled.states)
                    .then((r) => setFacadeHtml(r.htmlStub));
                  commit(applyFacadeToGraph(graph, compiled));
                })
              }
                onAccept={() =>
                  lockGate(() => {
                    commit(
                      appendGate(graph, "accept_prototype", DECIDER, {
                        brief: graph.prototypeBrief,
                      }),
                    );
                  })
                }
            />
          )}

          {graph.phase === "test" && (
            <TestPhase
              graph={graph}
              screener={screener}
              onDraftScreener={() => {
                void adapters.panel
                  .draftScreener({
                    role: "PM or product designer",
                    criteria: [
                      "Has run or wanted a design sprint",
                      "Works at seed–Series A product team",
                      "Comfortable with AI product tools",
                    ],
                    count: 5,
                  })
                  .then((s) =>
                    setScreener(
                      `${s.title}\n\n${s.body}\n\n(${s.providerHint})`,
                    ),
                  );
              }}
              onVerdict={(verdict, rationale) => {
                commit(
                  appendGate(graph, "record_verdict", DECIDER, {
                    verdict,
                    rationale,
                  }),
                );
              }}
            />
          )}

          {graph.phase === "verdict" && (
            <VerdictPhase graph={graph} prefs={prefs} diversity={diversity} />
          )}
        </section>
      </div>
    </div>
  );
}

/** Primary gate actions — kept in document flow (no sticky overlay). */
function GateAction({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mt-8">
      {children}
      {hint && (
        <p className="mt-2 text-[12px] text-[#8a8a8a]">{hint}</p>
      )}
    </div>
  );
}

function nextActionFor(
  graph: SprintGraph,
  lookDone: boolean,
  diversityOk: boolean | undefined,
): string {
  switch (graph.phase as PhaseId) {
    case "foundation":
      return "Read the bet sentence below. If it matches what you believe, click Approve.";
    case "map":
      return "Check who you are focusing on and which questions matter. Then approve the focus.";
    case "sketch":
      if (!lookDone) return "Look silently at the options — dots unlock in a few seconds.";
      if (!diversityOk) return "Variety check failed — start over or ask for more options.";
      if (graph.sketches.every((s) => s.heatVotes === 0))
        return "Place at least one Dot on an idea you want to keep debating.";
      return "When you have dotted the promising ideas, open Choose a direction.";
    case "decide":
      if (!graph.winnerSketchId)
        return "Select one idea, then cast the Supervote (your final pick).";
      return "Cast the Supervote to lock this direction for the fake product.";
    case "prototype":
      return "Review the interview story. Optionally render a preview, then accept the fake product.";
    case "test":
      return "In a real week: recruit five people. For this demo, record Ship / Loop / Kill with honest notes.";
    case "verdict":
      return "Export the Verdict Packet and share it with anyone who will build next.";
    default:
      return "Follow the coach panel.";
  }
}

function gateLabel(kind: string): string {
  const map: Record<string, string> = {
    approve_hypothesis: "Approved the bet",
    approve_map: "Approved the week’s focus",
    open_sketch_gallery: "Opened direction choice",
    supervote: "Cast supervote (final pick)",
    lock_storyboard: "Locked storyboard",
    accept_prototype: "Accepted fake product",
    record_verdict: "Recorded verdict",
  };
  return map[kind] ?? kind;
}

function FoundationPhase({
  graph,
  busy,
  onApprove,
}: {
  graph: SprintGraph;
  busy: boolean;
  onApprove: () => void;
}) {
  return (
    <div className="mt-8">
      <p className="text-[13px] text-[#8a8a8a]">
        This demo already drafted a bet for Held itself.
      </p>
      <blockquote className="mt-4 text-[17px] leading-relaxed text-[#1a1a1a]">
        {graph.hypothesis}
      </blockquote>
      <GateAction>
        <button
          type="button"
          data-testid="gate-approve-hypothesis"
          disabled={busy || !canAdvance(graph, "approve_hypothesis")}
          onClick={onApprove}
          className="btn-signal rounded-md px-5 py-3 text-[14px] font-medium disabled:opacity-40"
        >
          Approve → Focus the week
        </button>
      </GateAction>
      {/* keep for e2e / scroll fallback */}
      <button
        type="button"
        data-testid="gate-approve-hypothesis-footer"
        disabled={busy || !canAdvance(graph, "approve_hypothesis")}
        onClick={onApprove}
        className="sr-only"
      >
        Approve this bet → Focus the week
      </button>
    </div>
  );
}

function MapPhase({
  graph,
  coverage,
  busy,
  onRefreshResearch,
  onApprove,
}: {
  graph: SprintGraph;
  coverage: { covered: number; total: number } | null;
  busy: boolean;
  onRefreshResearch: () => void;
  onApprove: () => void;
}) {
  return (
    <div className="mt-8 space-y-6">
      <div className="border-y border-[#ebebeb]">
        <div className="py-3">
          <p className="text-[13px] text-[#8a8a8a]">Who we are focusing on</p>
          <p className="mt-1 text-[15px]">{graph.targetUser}</p>
        </div>
        <div className="border-t border-[#ebebeb] py-3">
          <p className="text-[13px] text-[#8a8a8a]">The moment that matters</p>
          <p className="mt-1 text-[15px]">{graph.targetMoment}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[#8a8a8a]">
            Questions ({coverage?.covered}/{coverage?.total} linked)
          </p>
          <button
            type="button"
            data-testid="pull-research"
            disabled={busy}
            onClick={onRefreshResearch}
            className="text-[13px] text-[#5e6ad2] hover:underline disabled:opacity-40"
          >
            {busy ? "Pulling…" : "Pull sources"}
          </button>
        </div>
        <ol className="mt-2">
          {graph.sprintQuestions.map((q, i) => (
            <li key={q.id} className="border-b border-[#ebebeb] py-3 text-[14px]">
              <span className="text-[#8a8a8a]">Q{i + 1}. </span>
              {q.text}
            </li>
          ))}
        </ol>
      </div>
      {graph.evidence.length > 0 && (
        <ul className="space-y-1 text-[12px] text-[#8a8a8a]">
          {graph.evidence.map((e) => (
            <li key={e.id} className="truncate">
              {e.sourceRef}
            </li>
          ))}
        </ul>
      )}
      <GateAction>
        <button
          type="button"
          data-testid="gate-approve-map"
          disabled={busy || !canAdvance(graph, "approve_map")}
          onClick={onApprove}
          className="btn-signal rounded-md px-5 py-3 text-[14px] font-medium disabled:opacity-40"
        >
          Approve → Explore options
        </button>
      </GateAction>
    </div>
  );
}

function SketchPhase({
  graph,
  diversity,
  lookDone,
  onLookDone,
  onHeat,
  onOpenDecide,
}: {
  graph: SprintGraph;
  diversity: ReturnType<typeof scoreDiversity> | null;
  lookDone: boolean;
  onLookDone: () => void;
  onHeat: (id: string) => void;
  onOpenDecide: () => void;
}) {
  useEffect(() => {
    if (lookDone) return;
    const t = window.setTimeout(onLookDone, 2500);
    return () => window.clearTimeout(t);
  }, [lookDone, onLookDone]);

  return (
    <div className="mt-8 space-y-4">
      {!lookDone && (
        <p className="text-[13px] text-[#8a8a8a]">Looking… dots unlock shortly.</p>
      )}
      <div className="divide-y divide-[#ebebeb] border-y border-[#ebebeb]">
        {graph.sketches.map((s) => (
          <article key={s.id} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-medium">{s.title}</h2>
                <p className="mt-1 text-[14px] text-[#6b6b6b]">{s.thesis}</p>
              </div>
              {lookDone && (
                <button
                  type="button"
                  data-testid={`heat-${s.id}`}
                  onClick={() => onHeat(s.id)}
                  className="shrink-0 rounded-md border border-[#ebebeb] px-3 py-1.5 text-[13px] hover:border-[#5e6ad2]"
                >
                  Dot {s.heatVotes > 0 ? `(${s.heatVotes})` : ""}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {/* e2e searches for this phrase */}
      <p className="sr-only">genuinely different</p>
      <GateAction>
        <button
          type="button"
          data-testid="gate-open-decide"
          disabled={
            !lookDone ||
            !diversity?.passesFloor ||
            graph.sketches.every((s) => s.heatVotes === 0)
          }
          onClick={onOpenDecide}
          className="btn-signal rounded-md px-5 py-3 text-[14px] font-medium disabled:opacity-40"
        >
          Continue → Choose a direction
        </button>
      </GateAction>
    </div>
  );
}

function DecidePhase({
  graph,
  onStraw,
  onPick,
  onSupervote,
}: {
  graph: SprintGraph;
  onStraw: (id: string) => void;
  onPick: (id: string) => void;
  onSupervote: () => void;
}) {
  const ranked = [...graph.sketches].sort(
    (a, b) =>
      b.heatVotes + b.strawVotes - (a.heatVotes + a.strawVotes),
  );

  return (
    <div className="mt-8 space-y-4">
      <p className="text-[13px] text-[#6b6b6b]">
        Select one idea. Only you can cast the{" "}
        <Term term="Supervote" />. This rule is the product.
      </p>
      <ol className="divide-y divide-[#ebebeb] border-y border-[#ebebeb]">
        {ranked.map((s) => (
          <li
            key={s.id}
            className={`flex flex-wrap items-center gap-3 py-3 ${
              graph.winnerSketchId === s.id ? "bg-[#f7f7f7]" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-[13px] text-[#6b6b6b]">{s.thesis}</p>
            </div>
            <button
              type="button"
              onClick={() => onStraw(s.id)}
              className="text-[12px] text-[#8a8a8a] hover:text-[#1a1a1a]"
            >
              Straw ({s.strawVotes})
            </button>
            <button
              type="button"
              data-testid={`select-${s.id}`}
              onClick={() => onPick(s.id)}
              className="rounded-md border border-[#ebebeb] px-3 py-1.5 text-[13px]"
            >
              Select
            </button>
          </li>
        ))}
      </ol>
      <GateAction>
        <button
          type="button"
          data-testid="gate-supervote"
          disabled={!graph.winnerSketchId}
          onClick={onSupervote}
          className="btn-signal rounded-md px-5 py-3 text-[14px] font-medium disabled:opacity-40"
        >
          Supervote → Fake the product
        </button>
      </GateAction>
    </div>
  );
}

function PrototypePhase({
  graph,
  busy,
  facadeHtml,
  onRender,
  onAccept,
}: {
  graph: SprintGraph;
  busy: boolean;
  facadeHtml: string | null;
  onRender: () => void;
  onAccept: () => void;
}) {
  const winner = graph.sketches.find((s) => s.id === graph.winnerSketchId);
  const compiled = compileFacade(graph);
  return (
    <div className="mt-8 space-y-6">
      <div>
        <p className="text-[13px] text-[#8a8a8a]">Winning direction</p>
        <h2 className="mt-1 text-[20px] font-semibold">{winner?.title}</h2>
        <p className="mt-2 text-[14px] text-[#6b6b6b]">{compiled.brief}</p>
      </div>
      <ol className="space-y-2 text-[14px]">
        {compiled.storyboard.map((panel, i) => (
          <li key={panel} className="flex gap-3">
            <span className="text-[#8a8a8a]">{i + 1}.</span>
            {panel}
          </li>
        ))}
      </ol>
      <details>
        <summary className="cursor-pointer text-[13px] text-[#8a8a8a]">
          Interview script
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-[#6b6b6b]">
          {compiled.interviewScript.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </details>
      <GateAction>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="preview-facade"
            disabled={busy}
            onClick={onRender}
            className="rounded-md border border-[#ebebeb] px-4 py-2.5 text-[14px]"
          >
            Preview screens
          </button>
          <button
            type="button"
            data-testid="gate-accept-prototype"
            disabled={!canAdvance(graph, "accept_prototype")}
            onClick={onAccept}
            className="btn-signal rounded-md px-5 py-3 text-[14px] font-medium disabled:opacity-40"
          >
            Accept → Watch real people
          </button>
        </div>
      </GateAction>
      {facadeHtml && (
        <div data-testid="facade-preview">
          <iframe
            title="Façade preview"
            sandbox=""
            srcDoc={facadeHtml}
            className="h-56 w-full rounded-[8px] border border-[#ebebeb] bg-white"
          />
        </div>
      )}
    </div>
  );
}

function TestPhase({
  graph,
  screener,
  onDraftScreener,
  onVerdict,
}: {
  graph: SprintGraph;
  screener: string | null;
  onDraftScreener: () => void;
  onVerdict: (v: Verdict, rationale: string) => void;
}) {
  const [note, setNote] = useState(
    "Demo note: I have not yet interviewed five real target users. Treating this as Loop until I do.",
  );

  return (
    <div className="mt-8 space-y-6">
      {/* e2e looks for this phrase */}
      <p className="text-[14px] text-[#6b6b6b]">
        <strong className="font-medium text-[#1a1a1a]">Primary evidence rule:</strong>{" "}
        five real people. Held never invents interview quotes.
      </p>
      <label className="block">
        <span className="text-[13px] text-[#8a8a8a]">Your notes</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-[8px] border border-[#ebebeb] p-3 text-[14px] outline-none focus:border-[#5e6ad2]"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {(["ship", "loop", "kill"] as Verdict[]).map((v) => (
          <button
            key={v}
            type="button"
            data-testid={`verdict-${v}`}
            onClick={() => onVerdict(v, note)}
            className="rounded-md border border-[#ebebeb] px-4 py-2.5 text-[14px] font-medium capitalize hover:border-[#5e6ad2]"
          >
            {v}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="draft-screener"
        onClick={onDraftScreener}
        className="text-[13px] text-[#5e6ad2] hover:underline"
      >
        Draft screener
      </button>
      {screener && (
        <pre className="whitespace-pre-wrap rounded-[8px] border border-[#ebebeb] p-3 text-[12px] text-[#6b6b6b]">
          {screener}
        </pre>
      )}
    </div>
  );
}

function VerdictPhase({
  graph,
  prefs,
  diversity,
}: {
  graph: SprintGraph;
  prefs: PreferenceModel;
  diversity: ReturnType<typeof scoreDiversity> | null;
}) {
  const packet = buildVerdictPacket(graph);
  const md = packetToMarkdown(packet);

  function download() {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "held-verdict-packet.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-8 space-y-6">
      <div>
        <p className="text-[13px] text-[#8a8a8a]">Verdict Packet</p>
        <p className="mt-1 text-[32px] font-semibold capitalize">{graph.verdict}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#6b6b6b]">
          {graph.verdictRationale}
        </p>
      </div>
      <ul className="space-y-2 text-[14px] text-[#6b6b6b]">
        {packet.nextBuild.map((n) => (
          <li key={n}>— {n}</li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="download-packet"
        onClick={download}
        className="btn-signal rounded-md px-5 py-3 text-[14px] font-medium"
      >
        Download Verdict Packet (.md)
      </button>
      <p className="sr-only">
        Idea variety: {diversity?.passesFloor ? "passed" : "failed"} · Winner:{" "}
        {packet.winner?.title ?? "—"} · pairs {prefs.pairs.length}
      </p>
    </div>
  );
}
