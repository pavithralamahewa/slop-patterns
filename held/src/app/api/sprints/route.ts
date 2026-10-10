import { NextResponse } from "next/server";
import { createHeldSprintZero } from "@/lib/dogfood/held-sprint-0";
import { listSprints, saveSprint, storageMode } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const sprints = await listSprints();
  return NextResponse.json({ storage: storageMode(), sprints });
}

export async function POST() {
  const graph = createHeldSprintZero();
  const created = {
    ...graph,
    id: `sprint_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };
  const saved = await saveSprint(created);
  return NextResponse.json(
    { storage: storageMode(), sprint: saved },
    { status: 201 },
  );
}
