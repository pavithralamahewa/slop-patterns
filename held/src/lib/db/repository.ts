import { promises as fs } from "fs";
import path from "path";
import type { GateEvent, SprintGraph } from "@/lib/core/types";

/**
 * Sprint repository — durable system of record.
 * File-backed locally; on Vercel uses /tmp (writable). Swap to Postgres via DATABASE_URL.
 */

const memory = new Map<string, SprintGraph & { updatedAt?: string }>();

function dataDir(): string {
  if (process.env.VERCEL || process.env.HELD_DATA_DIR === "tmp") {
    return path.join("/tmp", "held-sprints");
  }
  return path.join(process.cwd(), ".data", "sprints");
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
}

function sprintPath(id: string): string {
  return path.join(dataDir(), `${id}.json`);
}

export async function saveSprint(graph: SprintGraph): Promise<SprintGraph> {
  const record = {
    ...graph,
    updatedAt: new Date().toISOString(),
  };
  memory.set(record.id, record);
  try {
    await ensureDir();
    await fs.writeFile(sprintPath(graph.id), JSON.stringify(record, null, 2), "utf8");
  } catch {
    /* memory is enough on constrained hosts */
  }
  return record;
}

export async function getSprint(id: string): Promise<SprintGraph | null> {
  const cached = memory.get(id);
  if (cached) return cached;
  try {
    const raw = await fs.readFile(sprintPath(id), "utf8");
    const parsed = JSON.parse(raw) as SprintGraph & { updatedAt?: string };
    memory.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function listSprints(): Promise<
  { id: string; title: string; phase: string; updatedAt?: string }[]
> {
  const byId = new Map<string, { id: string; title: string; phase: string; updatedAt?: string }>();
  for (const g of memory.values()) {
    byId.set(g.id, {
      id: g.id,
      title: g.title,
      phase: g.phase,
      updatedAt: g.updatedAt,
    });
  }
  try {
    await ensureDir();
    const files = await fs.readdir(dataDir());
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const g = await getSprint(file.replace(/\.json$/, ""));
      if (!g) continue;
      byId.set(g.id, {
        id: g.id,
        title: g.title,
        phase: g.phase,
        updatedAt: (g as SprintGraph & { updatedAt?: string }).updatedAt,
      });
    }
  } catch {
    /* memory-only */
  }
  return [...byId.values()].sort((a, b) =>
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
