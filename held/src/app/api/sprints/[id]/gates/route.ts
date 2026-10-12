import { NextResponse } from "next/server";
import { appendGate, canAdvance } from "@/lib/core/graph";
import { applyFacadeToGraph, compileFacade } from "@/lib/core/facade-compiler";
import { getSprint, appendGateEvent, storageMode } from "@/lib/db/repository";
import type { GateKind } from "@/lib/core/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const sprint = await getSprint(id);
  if (!sprint) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    kind: GateKind;
    actorName?: string;
    payload?: Record<string, unknown>;
  };

  if (!body.kind) {
    return NextResponse.json({ error: "kind_required" }, { status: 400 });
  }

  let working = sprint;
  if (body.kind === "supervote" && typeof body.payload?.sketchId === "string") {
    working = {
      ...working,
      winnerSketchId: body.payload.sketchId,
    };
    const compiled = compileFacade(working);
    working = applyFacadeToGraph(working, compiled);
  }

  if (!canAdvance(working, body.kind) && body.kind !== "record_verdict") {
    return NextResponse.json(
      { error: "illegal_gate", phase: working.phase, kind: body.kind },
      { status: 409 },
    );
  }

  try {
    const next = appendGate(
      working,
      body.kind,
      body.actorName ?? "Founder (Decider)",
      body.payload ?? {},
    );
    const event = next.gates[next.gates.length - 1]!;
    const saved = await appendGateEvent(id, event, next);
    return NextResponse.json({ storage: storageMode(), sprint: saved, gate: event });
  } catch (e) {
    return NextResponse.json(
      { error: "gate_failed", message: e instanceof Error ? e.message : "unknown" },
      { status: 409 },
    );
  }
}
