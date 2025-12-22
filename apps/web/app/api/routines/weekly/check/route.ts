import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  ensureWeeklyRoutine,
  recordWeeklyCheck,
  toWeeklyPayload,
} from "@/lib/routines";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing Supabase configuration" }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const routineRow = await ensureWeeklyRoutine(supabase, userId);
    const progress = await recordWeeklyCheck(
      supabase,
      routineRow.id,
      routineRow.week_start,
      routineRow.week_end
    );
    const payload = toWeeklyPayload(routineRow, progress.count, progress.daysChecked);
    return NextResponse.json({ routine: payload });
  } catch (error) {
    console.error("weekly routine check error", error);
    const message = error instanceof Error ? error.message : "체크를 기록하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
