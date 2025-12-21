import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  ensureWeeklyRoutine,
  getWeeklyProgressCount,
  toWeeklyPayload,
  updateWeeklyRoutine,
} from "@/lib/routines";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
  }

  const url = new URL(req.url ?? "http://localhost");
  const userId = url.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const row = await ensureWeeklyRoutine(supabase, userId);
    const progress = await getWeeklyProgressCount(supabase, row.id);
    return NextResponse.json({ routine: toWeeklyPayload(row, progress) });
  } catch (error) {
    console.error("weekly routine error", error);
    const message = error instanceof Error ? error.message : "주간 루틴을 생성하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const recommendedDays =
    Array.isArray(body?.recommendedDays) && body.recommendedDays.length
      ? body.recommendedDays.map((day: unknown) => `${day}`.trim()).filter(Boolean)
      : undefined;
  const intensity =
    typeof body?.intensity === "string" ? body.intensity.toLowerCase() : undefined;
  const optionalSteps = Array.isArray(body?.optionalSteps) ? body.optionalSteps : undefined;

  if (!recommendedDays && !intensity && !optionalSteps) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const row = await updateWeeklyRoutine(supabase, userId, {
      recommendedDays,
      intensity,
      optionalSteps,
    });
    const progress = await getWeeklyProgressCount(supabase, row.id);
    return NextResponse.json({ routine: toWeeklyPayload(row, progress) });
  } catch (error) {
    console.error("weekly routine update error", error);
    const message = error instanceof Error ? error.message : "루틴을 수정하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
