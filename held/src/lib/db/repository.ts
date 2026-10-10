import { promises as fs } from "fs";
import path from "path";
import type { GateEvent, SprintGraph } from "@/lib/core/types";

/**
 * Sprint repository — durable system of record.
 * File-backed locally; swap to Postgres using schema.sql when DATABASE_URL is set.
 */

const DATA_DIR = path.join(process.cwd(), ".data", "sprints");

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function sprintPath(id: string): string {
  return path.join(DATA_DIR, `${id}.json`);
}

export async function saveSprint(graph: SprintGraph): Promise<SprintGraph> {
  await ensureDir();
  const record = {
    ...graph,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(sprintPath(graph.id), JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function getSprint(id: string): Promise<SprintGraph | null> {
  try {
    const raw = await fs.readFile(sprintPath(id), "utf8");
    return JSON.parse(raw) as SprintGraph;
  } catch {
    return null;
  }
}

export async function listSprints(): Promise<
  { id: string; title: string; phase: string; updatedAt?: string }[]
> {
  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  const out: { id: string; title: string; phase: string; updatedAt?: string }[] =
    [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const g = await getSprint(file.replace(/\.json$/, ""));
    if (!g) continue;
    out.push({
      id: g.id,
      title: g.title,
      phase: g.phase,
      updatedAt: (g as SprintGraph & { updatedAt?: string }).updatedAt,
    });
  }
  return out.sort((a, b) =>
    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
  );
}

export async function appendGateEvent(
  sprintId: string,
  event: GateEvent,
  nextGraph: SprintGraph,
): Promise<SprintGraph> {
  // File store embeds gates inside graph; Postgres would also insert gate_events row.
  if (nextGraph.id !== sprintId) {
    throw new Error("Sprint id mismatch");
  }
  const last = nextGraph.gates[nextGraph.gates.length - 1];
  if (!last || last.id !== event.id) {
    nextGraph = {
      ...nextGraph,
      gates: [...nextGraph.gates.filter((g) => g.id !== event.id), event],
    };
  }
  return saveSprint(nextGraph);
}

export function storageMode(): "file" | "postgres" {
  return process.env.DATABASE_URL ? "postgres" : "file";
}
