"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  preferenceSummary,
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
import { evaluateSprint } from "@/lib/core/verdict-eval";
import {
  createLocalRegistry,
  describeAdapters,
} from "@/lib/adapters";
import {
  ASSUMPTION_SCORECARD,
  createHeldSprintZero,
} from "@/lib/dogfood/held-sprint-0";
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
  const [coachOpen, setCoachOpen] = useState(true);
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

  const evalReport = useMemo(
    () => (graph ? evaluateSprint(graph) : null),
    [graph],
  );

  const adapterLines = useMemo(() => describeAdapters(adapters), []);

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
      <div className="relative min-h-screen bg-[var(--ground)]">
        <WelcomeGate open={showWelcome} onStart={dismissWelcome} />
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[22px] font-semibold">Held</p>
          <p className="text-[var(--ink-dim)]">
            Preparing your guided demo…
          </p>
        </div>
      </div>
    );
  }

  const idx = PHASE_ORDER.indexOf(graph.phase);
  const guide = PHASE_GUIDE[graph.phase];
  const nextAction = nextActionFor(graph, lookDone, diversity?.passesFloor);

  return (
    <div className="min-h-screen bg-white text-[var(--ink)]">
      <WelcomeGate open={showWelcome} onStart={dismissWelcome} />

      <header className="border-b border-[var(--line)] bg-white px-5 py-2.5 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[14px] font-semibold">
              Held
            </Link>
            <span className="hidden text-[12px] text-[var(--ink-mute)] sm:inline">
              Guided demo · {storageLabel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {busy && (
              <span className="mono text-xs text-[#5e6ad2]">
                AI drafting…
              </span>
            )}
            <button
              type="button"
              data-testid="toggle-coach"
              className="text-[12px] text-[var(--ink-mute)] hover:text-[var(--ink)]"
              onClick={() => setCoachOpen((v) => !v)}
            >
              {coachOpen ? "Hide coach" : "Show coach"}
            </button>
            <button
              type="button"
              data-testid="start-over"
              className="text-[12px] text-[var(--ink-mute)] hover:text-[var(--ink)]"
              onClick={() => {
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
              }}
            >
              Start over
            </button>
            <Link
              href="/"
              className="text-sm text-[var(--ink-dim)] hover:text-[var(--ink)]"
            >
              Home
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 md:grid-cols-[220px_1fr] lg:grid-cols-[220px_1fr_280px] md:px-8 md:py-8">
        {/* Phase checklist rail — compact on mobile, full on desktop */}
        <aside className="md:sticky md:top-3 md:self-start md:rounded-[8px] md:bg-[var(--ground-2)] md:p-3">
          <div className="md:hidden">
            <p className="text-[12px] text-[var(--ink-mute)]">
              Your week · {idx + 1} of {PHASE_ORDER.length}
            </p>
            <ol className="mt-2 flex gap-1" aria-label="Sprint progress">
              {PHASE_ORDER.map((p, i) => {
                const active = p === graph.phase;
                const done = i < idx;
                return (
                  <li key={p} className="flex-1">
                    <span
                      title={PHASE_GUIDE[p].plainName}
                      className={`block h-1.5 rounded-full ${
                        active
                          ? "bg-[var(--signal)]"
                          : done
                            ? "bg-[var(--signal)]/50"
                            : "bg-[var(--line)]"
                      }`}
                    />
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 text-sm font-medium">{guide.plainName}</p>
          </div>
          <div className="hidden md:block">
          <p className="mb-1 text-[12px] text-[var(--ink-mute)]">
            Your week
          </p>
          <p className="mb-4 text-xs text-[var(--ink-mute)]">
            {idx + 1} of {PHASE_ORDER.length} steps · check them off as you go
          </p>
          <ol className="space-y-1">
            {PHASE_ORDER.map((p, i) => {
              const active = p === graph.phase;
              const done = i < idx;
              const g = PHASE_GUIDE[p];
              return (
                <li key={p}>
                  <div
                    className={`flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${
                      active
                        ? "bg-[var(--selected)] text-[var(--ink)]"
                        : done
                          ? "text-[var(--ink)]"
                          : "text-[var(--ink-mute)]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                        active
                          ? "border-[#cfcfcf]"
                          : done
                            ? "border-[#5e6ad2] bg-[#5e6ad2] text-white"
                            : "border-[#d4d4d4]"
                      }`}
                      aria-hidden
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <span>
                      <span className="block font-medium leading-tight">
                        {g.plainName}
                      </span>
                      {active && (
                        <span
                          className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-mute)]"
                        >
                          You are here
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          {!coachOpen && (
            <div className="mt-6 rounded-[8px] border border-[var(--line)] p-4">
              <p className="text-[12px] text-[var(--ink-mute)]">
                Your job right now
              </p>
              <p className="mt-2 text-sm text-[var(--warm)]">{guide.whatYouDo}</p>
            </div>
          )}
          </div>
        </aside>

        {/* Main desk */}
        <section className="min-w-0">
          {coachOpen && (
            <div className="mb-6">
              <CoachPanel
                phase={graph.phase}
                stepIndex={idx}
                stepTotal={PHASE_ORDER.length}
              />
            </div>
          )}

          <div className="rounded-[8px] border border-[var(--line)] bg-[var(--callout)] px-4 py-3">
            <p className="text-[12px] text-[var(--ink-mute)]">Next action</p>
            <p className="mt-1 text-sm text-[var(--ink)]">{nextAction}</p>
          </div>

          <p className="mt-8 text-[12px] text-[var(--ink-mute)]">
            Demo sprint · {graph.title}
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em] md:text-[32px]">
            {guide.plainName}
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--ink-dim)]">
            {guide.inOneSentence}
          </p>

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

        {/* Status rail — plain language */}
        <aside className="space-y-4 lg:block">
          <details className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-4 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">
              Sprint status (variety, evidence, log)
            </summary>
            <p className="mt-2 text-xs text-[var(--ink-mute)]">
              Open the cards below on a larger screen, or scroll this section.
            </p>
          </details>
          <StatusCard
            title="Idea variety check"
            tip="We force different solution shapes so you are not voting on the same idea eight times."
          >
            {diversity ? (
              <ul className="mt-3 space-y-2 text-sm text-[var(--ink-dim)]">
                <li>
                  Distinct approaches{" "}
                  <strong className="text-[var(--ink)]">
                    {diversity.uniqueNiches}/{diversity.nicheCount}
                  </strong>
                </li>
                <li>
                  Spread score{" "}
                  <strong className="text-[var(--ink)]">
                    {diversity.minDistance.toFixed(2)}
                  </strong>
                </li>
                <li>
                  Status{" "}
                  <strong
                    className={
                      diversity.passesFloor
                        ? "text-[#5e6ad2]"
                        : "text-[var(--danger)]"
                    }
                  >
                    {diversity.passesFloor
                      ? "Good enough variety"
                      : "Too similar — need more options"}
                  </strong>
                </li>
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--ink-mute)]">
                Appears when you reach Explore options.
              </p>
            )}
          </StatusCard>

          <StatusCard
            title="Evidence linked"
            tip="Every claim should point to a source — a URL, note, or interview — not a vibe."
          >
            <p className="mt-3 text-sm text-[var(--ink-dim)]">
              {coverage
                ? `${coverage.covered} of ${coverage.total} week questions have at least one cited source`
                : "—"}
            </p>
          </StatusCard>

          <StatusCard
            title="Your taste (learning)"
            tip="When you supervote, Held remembers what you preferred for future drafts. You stay in charge."
          >
            <p className="mt-3 text-sm text-[var(--ink-dim)]">
              {preferenceSummary(prefs)}
            </p>
          </StatusCard>

          <StatusCard
            title="Sprint quality score"
            tip="A checklist grade: did humans decide? Were sources cited? Were five real users required?"
          >
            {evalReport ? (
              <ul className="mt-3 space-y-1 text-sm text-[var(--ink-dim)]">
                <li>
                  Grade{" "}
                  <strong className="text-[#5e6ad2]">
                    {evalReport.grade}
                  </strong>{" "}
                  ({evalReport.score}/{evalReport.maxScore})
                </li>
                {evalReport.checks.slice(0, 4).map((c) => (
                  <li key={c.id} className="text-xs">
                    {c.passed ? "✓" : "·"} {c.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--ink-mute)]">—</p>
            )}
          </StatusCard>

          <StatusCard
            title="Decision log"
            tip="Append-only record of every human gate. You cannot quietly rewrite history."
          >
            <ol className="mt-3 max-h-48 space-y-2 overflow-y-auto text-xs text-[var(--ink-dim)]">
              {graph.gates.length === 0 && (
                <li>Nothing locked yet — your first approval will appear here.</li>
              )}
              {[...graph.gates].reverse().map((g) => (
                <li key={g.id}>
                  <span className="text-[#5e6ad2]">
                    {gateLabel(g.kind)}
                  </span>
                  <br />
                  <span className="text-[var(--ink-mute)]">
                    {g.actorName} · {new Date(g.at).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ol>
          </StatusCard>

          <details className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-4">
            <summary className="cursor-pointer text-[12px] text-[var(--ink-mute)]">
              Words you might see
            </summary>
            <dl className="mt-3 space-y-3 text-xs text-[var(--ink-dim)]">
              {Object.entries(GLOSSARY).map(([k, v]) => (
                <div key={k}>
                  <dt className="font-medium text-[var(--ink)]">{k}</dt>
                  <dd className="mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mono mt-4 text-[10px] text-[var(--ink-mute)]">
              Plugs: {adapterLines.join(" · ")}
            </p>
          </details>
        </aside>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  tip,
  children,
}: {
  title: string;
  tip: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-4">
      <p className="text-[12px] text-[var(--ink-mute)]">
        {title}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-[var(--ink-mute)]">
        {tip}
      </p>
      {children}
    </div>
  );
}

/** Primary gate actions — kept in document flow (no sticky overlay). */
function GateAction({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mt-8 border-t border-[var(--line)] pt-6">
      {children}
      {hint && (
        <p className="mt-2 text-xs text-[var(--ink-mute)]">{hint}</p>
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
    <div className="mt-8 space-y-6">
      <p className="max-w-2xl text-[var(--ink-dim)]">
        This demo already drafted a bet for <strong className="text-[var(--ink)]">Held itself</strong>{" "}
        — so you can feel the product by using it. Read it like a stranger would.
        Change nothing in this demo; in a real sprint you would edit freely.
      </p>
      <blockquote className="rounded-[8px] bg-[var(--callout)] px-4 py-3 text-[15px] leading-relaxed">
        {graph.hypothesis}
      </blockquote>
      <GateAction hint="Approving records a permanent decision. You are the Decider.">
        <button
          type="button"
          data-testid="gate-approve-hypothesis"
          disabled={busy || !canAdvance(graph, "approve_hypothesis")}
          onClick={onApprove}
          className="btn-signal w-full rounded-md px-5 py-3.5 font-medium disabled:opacity-40 md:w-auto"
        >
          Approve this bet → Focus the week
        </button>
      </GateAction>
      <div>
        <p className="text-[12px] text-[var(--ink-mute)]">
          Why this might win (differentiators)
        </p>
        <ul className="mt-2 space-y-1 text-sm text-[var(--ink-dim)]">
          {graph.differentiators.map((d) => (
            <li key={d}>— {d}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[12px] text-[var(--ink-mute)]">
          Risky assumptions to test later
        </p>
        <p className="mt-1 text-xs text-[var(--ink-mute)]">
          These are guesses that could kill the idea if wrong. Friday interviews
          are for these — not for polish feedback.
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          {ASSUMPTION_SCORECARD.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap gap-2 border-b border-[var(--line)] py-2"
            >
              <span className="font-medium">{a.question}</span>
              <span className="text-[var(--ink-mute)]">{a.note}</span>
            </li>
          ))}
        </ul>
      </div>
      <GateAction hint="Same action as above — use whichever is in view.">
        <button
          type="button"
          data-testid="gate-approve-hypothesis-footer"
          disabled={busy || !canAdvance(graph, "approve_hypothesis")}
          onClick={onApprove}
          className="btn-signal w-full rounded-md px-5 py-3.5 font-medium disabled:opacity-40 md:w-auto"
        >
          Approve this bet → Focus the week
        </button>
      </GateAction>
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
      <p className="max-w-2xl text-sm text-[var(--ink-dim)]">
        You cannot answer every product question in one week. Pick{" "}
        <strong className="text-[var(--ink)]">one type of person</strong>,{" "}
        <strong className="text-[var(--ink)]">one moment</strong> in their journey,
        and a few yes/no questions that real interviews can settle.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-5">
          <p className="mono text-xs text-[var(--ink-mute)]">
            Who we are focusing on
          </p>
          <p className="mt-2 text-sm">{graph.targetUser}</p>
        </div>
        <div className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-5">
          <p className="mono text-xs text-[var(--ink-mute)]">
            The moment that matters
          </p>
          <p className="mt-2 text-sm">{graph.targetMoment}</p>
        </div>
      </div>
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] text-[var(--ink-mute)]">
              <Term term="Sprint questions" />
            </p>
            <p className="mt-1 text-xs text-[var(--ink-mute)]">
              Each should be answerable by watching someone use a fake product.
            </p>
          </div>
          <button
            type="button"
            data-testid="pull-research"
            disabled={busy}
            onClick={onRefreshResearch}
            className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--signal)]"
          >
            {busy ? "Pulling sources…" : "Pull more research sources"}
          </button>
        </div>
        <ol className="mt-3 space-y-3">
          {graph.sprintQuestions.map((q, i) => (
            <li
              key={q.id}
              className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-4 text-sm"
            >
              <span className="mono text-[#5e6ad2]">Q{i + 1}</span>
              <p className="mt-1">{q.text}</p>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="text-[12px] text-[var(--ink-mute)]">
          Evidence pack ({coverage?.covered}/{coverage?.total} questions linked)
        </p>
        <p className="mt-1 text-xs text-[var(--ink-mute)]">
          Sources AI found so claims are not invented. Click through later if you
          want to verify.
        </p>
        {graph.evidence.length === 0 ? (
          <p className="mt-3 rounded-[8px] border border-dashed border-[var(--line)] px-4 py-6 text-sm text-[var(--ink-mute)]">
            No sources yet. Pull research, or approve with the starter pack if
            you already trust the questions.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {graph.evidence.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-[var(--line)] px-4 py-3 text-sm text-[var(--ink-dim)]"
              >
                <span className="text-[11px] text-[var(--ink-mute)]">
                  {e.sourceKind}
                </span>
                <p className="mt-1">{e.text}</p>
                <p className="mt-1 truncate text-xs text-[var(--ink-mute)]">
                  {e.sourceRef}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <GateAction>
        <button
          type="button"
          data-testid="gate-approve-map"
          disabled={busy || !canAdvance(graph, "approve_map")}
          onClick={onApprove}
          className="btn-signal w-full rounded-md px-5 py-3.5 font-medium disabled:opacity-40 md:w-auto"
        >
          Approve this focus → Explore options
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
    <div className="mt-8 space-y-6">
      <p className="max-w-2xl text-sm text-[var(--ink-dim)]">
        AI often gives one pretty default. Held forces several{" "}
        <strong className="text-[var(--ink)]">genuinely different</strong>{" "}
        approaches. First look without clicking (silent look) — then mark ideas
        worth debating. You are <em>not</em> picking a winner yet.
      </p>
      {!lookDone && (
        <p className="text-[12px] text-[var(--ink-dim)]">
          Silent look in progress · Dot buttons unlock in a few seconds…
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {graph.sketches.map((s) => (
          <article
            key={s.id}
            className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-[18px] font-semibold">{s.title}</h2>
              <span className="mono text-[10px] text-[var(--ink-mute)]">
                variety {s.diversityScore?.toFixed(2) ?? "—"}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-dim)]">{s.thesis}</p>
            <p className="mono mt-3 text-[10px] text-[var(--ink-mute)]">
              Shape: {s.niche.interaction} · {s.niche.density} · {s.niche.trust}
            </p>
            {lookDone && (
              <div className="mt-4 flex items-center justify-between">
                <span className="mono text-xs">
                  {s.heatVotes} {s.heatVotes === 1 ? "dot" : "dots"}
                </span>
                <button
                  type="button"
                  data-testid={`heat-${s.id}`}
                  onClick={() => onHeat(s.id)}
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:border-[var(--signal)]"
                >
                  Place a Dot
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <GateAction hint="Need at least one Dot, and the variety check must pass, before you can continue.">
        <button
          type="button"
          data-testid="gate-open-decide"
          disabled={
            !lookDone ||
            !diversity?.passesFloor ||
            graph.sketches.every((s) => s.heatVotes === 0)
          }
          onClick={onOpenDecide}
          className="btn-signal w-full rounded-md px-5 py-3.5 font-medium disabled:opacity-40 md:w-auto"
        >
          Open Choose a direction
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
    <div className="mt-8 space-y-6">
      <p className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--warm)]">
        AI may draft notes. It may <strong>not</strong> cast the{" "}
        <Term term="Supervote" />. That final pick is you — the{" "}
        <Term term="Decider" />. This rule is the product.
      </p>
      <p className="text-sm text-[var(--ink-dim)]">
        Optional: use Straw poll to see leanings. Then <strong>Select</strong>{" "}
        one idea and cast the Supervote to lock it.
      </p>
      <ol className="space-y-3">
        {ranked.map((s, i) => (
          <li
            key={s.id}
            className={`flex flex-wrap items-center gap-3 rounded-[8px] border p-4 ${
              graph.winnerSketchId === s.id
                ? "border-[var(--signal)] bg-[var(--signal)]/10"
                : "border-[var(--line)] bg-[var(--ground-2)]"
            }`}
          >
            <span className="mono text-[var(--ink-mute)]">#{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-[var(--ink-dim)]">{s.thesis}</p>
            </div>
            <button
              type="button"
              onClick={() => onStraw(s.id)}
              className="rounded-md border border-[var(--line)] px-2 py-1 text-xs"
            >
              Straw poll ({s.strawVotes})
            </button>
            <button
              type="button"
              data-testid={`select-${s.id}`}
              onClick={() => onPick(s.id)}
              className="rounded-md bg-[var(--ink)] px-3 py-2 text-sm font-medium text-[var(--ground)]"
            >
              Select
            </button>
          </li>
        ))}
      </ol>
      <GateAction
        hint={
          graph.winnerSketchId
            ? undefined
            : "Select an idea first — then this button unlocks."
        }
      >
        <button
          type="button"
          data-testid="gate-supervote"
          disabled={!graph.winnerSketchId}
          onClick={onSupervote}
          className="btn-signal w-full rounded-md px-5 py-3.5 font-medium disabled:opacity-40 md:w-auto"
        >
          Cast supervote → Fake the product
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
      <p className="max-w-2xl text-sm text-[var(--ink-dim)]">
        You are not building the real product. You are building a{" "}
        <Term term="Façade" /> — enough screens that a stranger treats it as
        real during an interview tomorrow.
      </p>
      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-6">
        <p className="mono text-xs text-[var(--ink-mute)]">
          Winning direction
        </p>
        <h2 className="mt-2 text-[22px] font-semibold">{winner?.title}</h2>
        <p className="mt-3 text-[var(--ink-dim)]">{compiled.brief}</p>
        <ol className="mt-6 space-y-2 text-sm">
          {compiled.storyboard.map((panel, i) => (
            <li key={panel} className="flex gap-3">
              <span className="mono text-[#5e6ad2]">{i + 1}</span>
              {panel}
            </li>
          ))}
        </ol>
        <p className="mono mt-4 text-xs text-[var(--ink-mute)]">
          {compiled.tasks.length} interview tasks · {compiled.states.length}{" "}
          screens · path {compiled.happyPath.join(" → ")}
        </p>
      </div>
      <div className="rounded-[8px] border border-[var(--line)] p-5">
        <p className="mono text-xs text-[var(--ink-mute)]">
          Interview script (Five-Act)
        </p>
        <p className="mt-1 text-xs text-[var(--ink-mute)]">
          A standard way to run the conversation so you learn, not pitch.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--ink-dim)]">
          {compiled.interviewScript.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <GateAction>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="preview-facade"
            disabled={busy}
            onClick={onRender}
            className="rounded-md border border-[var(--line)] px-5 py-3 font-medium"
          >
            Preview the fake screens
          </button>
          <button
            type="button"
            data-testid="gate-accept-prototype"
            disabled={!canAdvance(graph, "accept_prototype")}
            onClick={onAccept}
            className="btn-signal w-full rounded-md px-5 py-3.5 font-medium disabled:opacity-40 md:w-auto"
          >
            Accept fake product → Watch real people
          </button>
        </div>
      </GateAction>
      {facadeHtml && (
        <div data-testid="facade-preview">
          <p className="mono mb-2 text-xs text-[var(--ink-mute)]">
            Click-through preview (demo façade — not the real product)
          </p>
          <iframe
            title="Façade preview"
            sandbox=""
            srcDoc={facadeHtml}
            className="h-64 w-full rounded-[8px] border border-[var(--line)] bg-white"
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
      <div className="rounded-[8px] border border-[var(--danger)]/50 bg-[var(--danger)]/10 p-5 text-sm">
        <strong className="text-[var(--warm)]">Primary evidence rule:</strong>{" "}
        five real people who match your target. Held never invents interview
        quotes. Chatbots and “synthetic users” are rehearsal only.
      </div>
      <p className="text-sm text-[var(--ink-dim)]">
        In a real week you book five interviews, run the script, and look for
        patterns. This demo lets you practice recording the call honestly.
      </p>
      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-5">
        <p className="mono text-xs text-[var(--ink-mute)]">
          Questions still open
        </p>
        <ul className="mt-3 space-y-2 text-sm">
          {graph.sprintQuestions.map((q) => (
            <li key={q.id}>
              <span className="mono text-[#5e6ad2]">{q.status}</span> —{" "}
              {q.text}
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        data-testid="draft-screener"
        onClick={onDraftScreener}
        className="rounded-md border border-[var(--line)] px-4 py-2 text-sm hover:border-[var(--signal)]"
      >
        Draft a recruiting screener
      </button>
      {screener && (
        <pre className="whitespace-pre-wrap rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-4 text-xs text-[var(--ink-dim)]">
          {screener}
        </pre>
      )}
      <label className="block">
        <span className="text-[12px] text-[var(--ink-mute)]">
          Your notes (why you chose Ship / Loop / Kill)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-[8px] border border-[var(--line)] bg-[var(--ground-2)] p-4 outline-none focus:border-[var(--signal)]"
        />
      </label>
      <div>
        <p className="mb-3 text-sm text-[var(--ink-dim)]">
          <strong className="text-[var(--ink)]">Ship</strong> = build it.{" "}
          <strong className="text-[var(--ink)]">Loop</strong> = change the bet
          and sprint again.{" "}
          <strong className="text-[var(--ink)]">Kill</strong> = stop spending on
          this idea.
        </p>
        <div className="flex flex-wrap gap-3">
          {(["ship", "loop", "kill"] as Verdict[]).map((v) => (
            <button
              key={v}
              type="button"
              data-testid={`verdict-${v}`}
              onClick={() => onVerdict(v, note)}
              className="rounded-md border border-[var(--line)] px-5 py-3 font-medium capitalize hover:border-[var(--signal)]"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
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
      <p className="max-w-2xl text-sm text-[var(--ink-dim)]">
        This is the product of the week: a written{" "}
        <Term term="Verdict Packet" /> you can hand to anyone who will build
        next — not a pile of sticky notes.
      </p>
      <div className="rounded-[8px] border border-[var(--line)] bg-[var(--callout)] p-6">
        <p className="text-[12px] text-[var(--ink-mute)]">
          Verdict Packet
        </p>
        <p className="mt-2 text-[28px] font-semibold capitalize">{graph.verdict}</p>
        <p className="mt-4 text-[var(--ink-dim)]">{graph.verdictRationale}</p>
        <p className="mono mt-4 text-xs text-[var(--ink-mute)]">
          Quality grade {packet.eval.grade} · {packet.eval.score}/
          {packet.eval.maxScore}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[8px] border border-[var(--line)] p-4 text-sm">
          <p className="mono text-xs text-[var(--ink-mute)]">
            Decisions recorded
          </p>
          <p className="mt-2 text-2xl font-medium">{graph.gates.length}</p>
        </div>
        <div className="rounded-[8px] border border-[var(--line)] p-4 text-sm">
          <p className="mono text-xs text-[var(--ink-mute)]">
            Preference pairs learned
          </p>
          <p className="mt-2 text-2xl font-medium">{prefs.pairs.length}</p>
        </div>
      </div>
      <div>
        <p className="text-[12px] text-[var(--ink-mute)]">
          What to build next
        </p>
        <ul className="mt-2 space-y-1 text-sm text-[var(--ink-dim)]">
          {packet.nextBuild.map((n) => (
            <li key={n}>— {n}</li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-[var(--ink-dim)]">
        Idea variety:{" "}
        {diversity?.passesFloor ? "passed" : "failed"} · Winner:{" "}
        {packet.winner?.title ?? "—"}
      </p>
      <button
        type="button"
        data-testid="download-packet"
        onClick={download}
        className="rounded-md bg-[var(--ink)] px-5 py-3 font-medium text-[var(--ground)]"
      >
        Download Verdict Packet (.md)
      </button>
      <p className="text-xs text-[var(--ink-mute)]">
        Share the file with your team. Or hit Start over to run the demo again.
      </p>
    </div>
  );
}
