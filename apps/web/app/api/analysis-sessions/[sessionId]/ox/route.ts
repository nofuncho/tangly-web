import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(
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
    const responses = Array.isArray(body?.responses) ? body.responses : null;
    if (!responses || responses.length === 0) {
      return NextResponse.json({ error: "responses array is required" }, { status: 400 });
    }

    const rows = [] as { id: string; session_id: string; question_key: string; answer: string }[];

    for (const item of responses) {
      const questionKey = typeof item?.question_key === "string" ? item.question_key : null;
      const rawAnswer = typeof item?.answer === "string" ? item.answer.toUpperCase() : null;
      if (!questionKey || !rawAnswer || (rawAnswer !== "O" && rawAnswer !== "X")) {
        return NextResponse.json({ error: "Invalid question_key or answer" }, { status: 400 });
      }
      rows.push({
        id: randomUUID(),
        session_id: sessionId,
        question_key: questionKey,
        answer: rawAnswer,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("ox_responses")
      .insert(rows)
      .select("id");

    if (error) {
      console.error("ox_responses insert error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark analysis session as having collected OX responses
    await supabase
      .from("analysis_sessions")
      .update({ status: "ox_collected" })
      .eq("id", sessionId);

    return NextResponse.json({ success: true, count: data?.length ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
