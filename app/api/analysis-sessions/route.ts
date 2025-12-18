import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const payload = (await req.json().catch(() => null)) ?? {};
    const source = typeof payload?.source === "string" ? payload.source : "expo_app";
    const status = typeof payload?.status === "string" ? payload.status : "capturing";
    const userId =
      typeof payload?.userId === "string" && payload.userId.trim().length > 0
        ? payload.userId.trim()
        : null;
    const sessionId =
      typeof payload?.sessionId === "string" && payload.sessionId
        ? payload.sessionId
        : randomUUID();

    const { data, error } = await supabase
      .from("analysis_sessions")
      .insert({
        id: sessionId,
        source,
        status,
        user_id: userId,
      })
      .select("id, status")
      .single();

    if (error) {
      console.error("analysis_sessions insert error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId: data.id, status: data.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
