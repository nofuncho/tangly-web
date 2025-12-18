import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  buildRecommendationPayload,
  type OxResponseRow,
  type PhotoRow,
  type ProductRow,
} from "@/lib/recommendations";
import { buildEyeWrinkleDetailPayload } from "@/lib/eye-wrinkle-report";
import { ensureAiReport, type AiReportEnvelope } from "@/lib/ai-report";

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

  const url = new URL(req.url ?? "http://localhost");
  const sessionId = params?.sessionId ?? extractSessionIdFromUrl(req.url ?? "");
  if (!sessionId) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

  const type = url.searchParams.get("type") === "personal_color" ? "personal_color" : "analysis";

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    if (type === "personal_color") {
      const response = await fetchPersonalColorReport(supabase, sessionId);
      return response;
    }

    const { data: session, error: sessionError } = await supabase
      .from("analysis_sessions")
      .select("id, created_at, source")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const isEyeWrinkle = (session.source ?? "").toLowerCase() === "eye_wrinkle";

    const { data: photosData, error: photosError } = await supabase
      .from("photos")
      .select("id, session_id, shot_type, focus_area, image_url, created_at")
      .eq("session_id", sessionId);

    if (photosError) {
      console.error("reports detail photos error", photosError);
      return NextResponse.json({ error: photosError.message }, { status: 500 });
    }

    if (isEyeWrinkle) {
      const payload = buildEyeWrinkleDetailPayload({
        sessionId,
        createdAt: session.created_at,
        photos: (photosData ?? []) as PhotoRow[],
      });
      return NextResponse.json({
        ...payload,
        type: "eye_wrinkle",
        aiReport: null as AiReportEnvelope | null,
      });
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
    const aiReport = await ensureAiReport({
      supabase,
      sessionId,
      sessionCreatedAt: session.created_at,
      payload,
      photos: (photosData ?? []) as PhotoRow[],
      oxResponses: (oxData ?? []) as OxResponseRow[],
    });

    return NextResponse.json({
      type: "skin",
      sessionId,
      createdAt: session.created_at,
      thumbnail,
      ...payload,
      aiReport,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("reports detail error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const fetchPersonalColorReport = async (supabase: SupabaseClient, reportId: string) => {
  const { data, error } = await supabase
    .from("personal_color_reports")
    .select("id, created_at, session_label, thumbnail_url, result_summary, result_headline, payload")
    .eq("id", reportId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const payload = (data.payload ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    type: "personal_color",
    sessionId: (data.session_label as string | null) ?? data.id,
    createdAt: data.created_at,
    thumbnail: data.thumbnail_url,
    summary: (payload.summary as string) ?? data.result_summary ?? "퍼스널 컬러 요약",
    highlight: (payload.highlight as string) ?? data.result_headline ?? "퍼스널 컬러 결과",
    items: (payload.items as unknown[]) ?? [],
    tips: (payload.tips as string[]) ?? [],
    needs: (payload.needs as unknown[]) ?? [],
    recommendations: (payload.recommendations as unknown[]) ?? [],
    extras: payload.extras ?? null,
    aiReport: null as AiReportEnvelope | null,
  });
};

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
