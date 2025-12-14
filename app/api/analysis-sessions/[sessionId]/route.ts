import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_STATUSES = new Set([
  "capturing",
  "awaiting_ox",
  "ox_collected",
  "analyzing",
  "report_ready",
  "failed",
]);

export async function PATCH(
  req: Request,
  { params }: { params: { sessionId?: string } }
) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    const sessionId = params.sessionId || body?.session_id;
    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "Session id is required" }, { status: 400 });
    }
    const status = typeof body?.status === "string" ? body.status : null;

    if (!status || !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("analysis_sessions")
      .update({ status })
      .eq("id", sessionId)
      .select("id, status")
      .single();

    if (error) {
      console.error("analysis_sessions update error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId: data.id, status: data.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
