import type { GateKind, SprintGraph } from "@/lib/core/types";

/** Browser client for Held sprint API. Falls back to null on network failure. */

export async function apiCreateSprint(): Promise<SprintGraph | null> {
  try {
    const res = await fetch("/api/sprints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dogfood: true }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sprint: SprintGraph };
    return data.sprint;
  } catch {
    return null;
  }
}

export async function apiGetSprint(id: string): Promise<SprintGraph | null> {
  try {
    const res = await fetch(`/api/sprints/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { sprint: SprintGraph };
    return data.sprint;
  } catch {
    return null;
  }
}

export async function apiSaveSprint(graph: SprintGraph): Promise<SprintGraph | null> {
  try {
    const res = await fetch(`/api/sprints/${graph.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(graph),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sprint: SprintGraph };
    return data.sprint;
  } catch {
    return null;
  }
}

export async function apiAppendGate(
  sprintId: string,
  kind: GateKind,
  payload: Record<string, unknown> = {},
  actorName = "Founder (Decider)",
): Promise<SprintGraph | null> {
  try {
    const res = await fetch(`/api/sprints/${sprintId}/gates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, payload, actorName }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sprint: SprintGraph };
    return data.sprint;
  } catch {
    return null;
  }
}

const ACTIVE_KEY = "held.sprint.activeId";

export function getActiveSprintId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function setActiveSprintId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
}

export function clearActiveSprintId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_KEY);
}
