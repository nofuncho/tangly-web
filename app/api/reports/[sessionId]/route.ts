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

  const sessionId = params?.sessionId ?? extractSessionIdFromUrl(req.url ?? "");
  if (!sessionId) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: session, error: sessionError } = await supabase
      .from("analysis_sessions")
      .select("id, created_at")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { data: photosData, error: photosError } = await supabase
      .from("photos")
      .select("id, session_id, shot_type, focus_area, image_url, created_at")
      .eq("session_id", sessionId);

    if (photosError) {
      console.error("reports detail photos error", photosError);
      return NextResponse.json({ error: photosError.message }, { status: 500 });
    }

    const { data: oxData, error: oxError } = await supabase
      .from("ox_responses")
      .select("session_id, question_key, answer, created_at")
      .eq("session_id", sessionId);

    if (oxError) {
      console.error("reports detail ox error", oxError);
      return NextResponse.json({ error: oxError.message }, { status: 500 });
    }

    const { data: productsData, error: productError } = await supabase
      .from("products")
      .select("id, name, brand, category, key_ingredients, note, image_url")
      .limit(80);

    if (productError) {
      console.error("reports detail product error", productError);
      return NextResponse.json({ error: productError.message }, { status: 500 });
    }

    const payload = buildRecommendationPayload({
      sessionId,
      photos: (photosData ?? []) as PhotoRow[],
      oxResponses: (oxData ?? []) as OxResponseRow[],
      products: (productsData ?? []) as ProductRow[],
    });

    const thumbnail = selectThumbnail((photosData ?? []) as PhotoRow[]);

    return NextResponse.json({
      sessionId,
      createdAt: session.created_at,
      thumbnail,
      ...payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("reports detail error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const selectThumbnail = (photos: PhotoRow[]) => {
  if (!photos.length) {
    return null;
  }
  const sorted = [...photos].sort((a, b) => {
    const left = a.created_at ? Date.parse(a.created_at) : 0;
    const right = b.created_at ? Date.parse(b.created_at) : 0;
    return right - left;
  });

  const toKey = (value?: string | null) => (value ?? "").toLowerCase();
  const cheek = sorted.find((photo) =>
    toKey(photo.shot_type).includes("cheek") || toKey(photo.focus_area).includes("cheek")
  );
  if (cheek?.image_url) {
    return cheek.image_url;
  }
  const fallback = sorted.find((photo) => photo.image_url);
  return fallback?.image_url ?? null;
};

const extractSessionIdFromUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const reportsIndex = parts.indexOf("reports");
    if (reportsIndex >= 0 && parts.length > reportsIndex + 1) {
      return parts[reportsIndex + 1];
    }
  } catch (error) {
    console.warn("Failed to extract sessionId from url", error);
  }
  return "";
};
