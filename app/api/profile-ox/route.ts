import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { PROFILE_OX_TABLE } from "@/lib/ox-storage";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ensureSupabase = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase configuration");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
};

export async function GET(req: Request) {
  try {
    const supabase = ensureSupabase();
    const url = new URL(req.url ?? "http://localhost");
    const userId = url.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(PROFILE_OX_TABLE)
      .select("user_id, question_key, answer, updated_at")
      .eq("user_id", userId);

    if (error) {
      console.error("profile-ox list error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      answers: data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = ensureSupabase();
    const body = await req.json().catch(() => null);
    const userId =
      typeof body?.userId === "string" && body.userId.trim().length > 0
        ? body.userId.trim()
        : null;
    const questionKey =
      typeof body?.questionKey === "string" && body.questionKey.trim().length > 0
        ? body.questionKey.trim()
        : null;
    const answerRaw =
      typeof body?.answer === "string" ? body.answer.trim().toUpperCase() : null;
    const answer = answerRaw === "X" ? "X" : answerRaw === "O" ? "O" : null;

    if (!userId || !questionKey || !answer) {
      return NextResponse.json(
        { error: "userId, questionKey and answer are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from(PROFILE_OX_TABLE)
      .upsert(
        {
          user_id: userId,
          question_key: questionKey,
          answer,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,question_key" }
      )
      .select("user_id, question_key, answer, updated_at")
      .single();

    if (error) {
      console.error("profile-ox upsert error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, record: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
