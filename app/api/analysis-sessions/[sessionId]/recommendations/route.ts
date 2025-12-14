import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildRecommendationPayload,
  type OxResponseRow,
  type PhotoRow,
  type ProductRow,
} from "@/lib/recommendations";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET(
  req: Request,
  { params }: { params: { sessionId?: string } }
) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  const sessionId =
    params.sessionId ?? extractSessionIdFromUrl(req.url ?? "");
  if (!sessionId) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: session, error: sessionError } = await supabase
      .from("analysis_sessions")
      .select("id")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: photosData, error: photosError } = await supabase
      .from("photos")
      .select("id, shot_type, focus_area, image_url, created_at")
      .eq("session_id", sessionId);

    if (photosError) {
      console.error("photos fetch error", photosError);
      return NextResponse.json(
        { error: photosError.message },
        { status: 500 }
      );
    }

    const { data: oxData, error: oxError } = await supabase
      .from("ox_responses")
      .select("question_key, answer, created_at")
      .eq("session_id", sessionId);

    if (oxError) {
      console.error("ox fetch error", oxError);
      return NextResponse.json({ error: oxError.message }, { status: 500 });
    }

    const { data: productsData, error: productError } = await supabase
      .from("products")
      .select(
        "id, name, brand, category, key_ingredients, effect_tags, note, image_url"
      )
      .limit(80);

    if (productError) {
      console.error("products fetch error", productError);
      return NextResponse.json({ error: productError.message }, { status: 500 });
    }

    const payload = buildRecommendationPayload({
      sessionId,
      photos: (photosData ?? []) as PhotoRow[],
      oxResponses: (oxData ?? []) as OxResponseRow[],
      products: (productsData ?? []) as ProductRow[],
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("recommendations error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const extractSessionIdFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const analysisIndex = parts.indexOf("analysis-sessions");
    if (analysisIndex >= 0 && parts.length > analysisIndex + 1) {
      return parts[analysisIndex + 1];
    }
  } catch (error) {
    console.warn("Failed to extract sessionId from url", error);
  }
  return "";
};
