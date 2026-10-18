import { createHeldSprintZero } from "../src/lib/dogfood/held-sprint-0";
import { runSprintZeroToPrototype } from "../src/lib/dogfood/run-sprint-zero";
import { scoreDiversity } from "../src/lib/core/diversity";
import { canAdvance, appendGate } from "../src/lib/core/graph";
import { evaluateSprint } from "../src/lib/core/verdict-eval";
import { compileFacade } from "../src/lib/core/facade-compiler";
import {
  createLocalRegistry,
  describeAdapters,
  apifyMapResearchStub,
  openRouterLlmStub,
} from "../src/lib/adapters";
import { saveSprint, getSprint, listSprints } from "../src/lib/db/repository";

async function main() {
  const g0 = createHeldSprintZero();
  const d = scoreDiversity(g0.sketches);
  if (!d.passesFloor) {
    console.error("FAIL diversity floor", d);
    process.exit(1);
  }
  if (g0.sketches.some((s) => s.id === "sk_clone")) {
    console.error("FAIL near-duplicate sk_clone should be filtered");
    process.exit(1);
  }
  if (!canAdvance(g0, "approve_hypothesis")) {
    console.error("FAIL should approve hypothesis");
    process.exit(1);
  }
  const g1 = appendGate(g0, "approve_hypothesis", "Decider", {});
  if (g1.phase !== "map" || g1.gates.length !== 1) {
    console.error("FAIL gate advance", g1.phase, g1.gates.length);
    process.exit(1);
  }

  const dog = runSprintZeroToPrototype();
  if (dog.graph.phase !== "test") {
    console.error("FAIL dogfood should stop at test", dog.graph.phase);
    process.exit(1);
  }
  if (!dog.graph.prototypeBrief || dog.graph.interviewScript.length < 3) {
    console.error("FAIL façade not compiled");
    process.exit(1);
  }
  const compiled = compileFacade(dog.graph);
  if (compiled.tasks.length < 5 || compiled.states.length < 1) {
    console.error(
      "FAIL façade tasks/states",
      compiled.tasks.length,
      compiled.states.length,
    );
    process.exit(1);
  }
  const ev = evaluateSprint(dog.graph);
  if (!ev.checks.find((c) => c.id === "diversity_floor")?.passed) {
    console.error("FAIL eval diversity");
    process.exit(1);
  }
  if (dog.graph.verdict !== null) {
    console.error("FAIL dogfood must not auto-verdict without Friday");
    process.exit(1);
  }

  const reg = createLocalRegistry();
  const lines = describeAdapters(reg);
  if (lines.length !== 4) {
    console.error("FAIL adapters");
    process.exit(1);
  }
  if (
    apifyMapResearchStub.id !== "map.apify" ||
    openRouterLlmStub.id !== "llm.openrouter"
  ) {
    console.error("FAIL stub adapter ids");
    process.exit(1);
  }

  const persisted = await saveSprint({
    ...dog.graph,
    id: "sprint_verify_core",
  });
  const loaded = await getSprint("sprint_verify_core");
  if (!loaded || loaded.phase !== "test") {
    console.error("FAIL repository roundtrip");
    process.exit(1);
  }
  const listed = await listSprints();
  if (!listed.some((s) => s.id === "sprint_verify_core")) {
    console.error("FAIL list sprints");
    process.exit(1);
  }

  console.log(
    "OK diversity niches",
    d.uniqueNiches,
    "minDist",
    d.minDistance.toFixed(3),
  );
  console.log("OK gate runtime foundation→map");
  console.log("OK dogfood → test", dog.phasesCompleted.join(", "));
  console.log("OK façade tasks", compiled.tasks.length, "eval", ev.grade);
  console.log("OK adapters", lines.join(" | "));
  console.log("OK product deliverable = Verdict Packet (pending Friday)");
  console.log("OK durable repository", persisted.id, "listed", listed.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
