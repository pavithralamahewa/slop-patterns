import { NextResponse } from "next/server";
import { getSprint, saveSprint, storageMode } from "@/lib/db/repository";
import type { SprintGraph } from "@/lib/core/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const sprint = await getSprint(id);
  if (!sprint) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ storage: storageMode(), sprint });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await request.json()) as SprintGraph;
  if (!body?.id || body.id !== id) {
    return NextResponse.json({ error: "id_mismatch" }, { status: 400 });
  }
  const saved = await saveSprint(body);
  return NextResponse.json({ storage: storageMode(), sprint: saved });
}
