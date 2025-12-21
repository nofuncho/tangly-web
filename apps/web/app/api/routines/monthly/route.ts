import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { ensureMonthlyRoutine } from "@/lib/routines";

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
    const routine = await ensureMonthlyRoutine(supabase, userId);
    return NextResponse.json({ routine });
  } catch (error) {
    console.error("monthly routine error", error);
    const message = error instanceof Error ? error.message : "루틴을 생성하지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
