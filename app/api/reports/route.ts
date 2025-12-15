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

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 36;

export async function GET(req: Request) {
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

    const url = new URL(req.url ?? "http://localhost");
    const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const { data: sessions, error: sessionError } = await supabase
      .from("analysis_sessions")
      .select("id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (sessionError) {
      console.error("reports sessions error", sessionError);
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    if (!sessions?.length) {
      return NextResponse.json({ reports: [] });
    }

    const sessionIds = sessions.map((session) => session.id);

    const { data: photosData, error: photosError } = await supabase
      .from("photos")
      .select("id, session_id, shot_type, focus_area, image_url, created_at")
      .in("session_id", sessionIds);

    if (photosError) {
      console.error("reports photos error", photosError);
      return NextResponse.json({ error: photosError.message }, { status: 500 });
    }

    const { data: oxData, error: oxError } = await supabase
      .from("ox_responses")
      .select("session_id, question_key, answer, created_at")
      .in("session_id", sessionIds);

    if (oxError) {
      console.error("reports ox error", oxError);
      return NextResponse.json({ error: oxError.message }, { status: 500 });
    }

    const { data: productsData, error: productError } = await supabase
      .from("products")
      .select("id, name, brand, category, key_ingredients, note, image_url")
      .limit(80);

    if (productError) {
      console.error("reports product error", productError);
      return NextResponse.json({ error: productError.message }, { status: 500 });
    }

    const photosBySession = new Map<string, PhotoRow[]>();
    (photosData ?? []).forEach((photo) => {
      if (!photo?.session_id) return;
      const bucket = photosBySession.get(photo.session_id) ?? [];
      bucket.push(photo as PhotoRow);
      photosBySession.set(photo.session_id, bucket);
    });

    const oxBySession = new Map<string, OxResponseRow[]>();
    (oxData ?? []).forEach((entry) => {
      if (!entry?.session_id) return;
      const bucket = oxBySession.get(entry.session_id) ?? [];
      bucket.push(entry as OxResponseRow);
      oxBySession.set(entry.session_id, bucket);
    });

    const products: ProductRow[] = (productsData ?? []) as ProductRow[];

    const reports = sessions.flatMap((session) => {
      const sessionPhotos = photosBySession.get(session.id) ?? [];
      const sessionOx = oxBySession.get(session.id) ?? [];
      const payload = buildRecommendationPayload({
        sessionId: session.id,
        photos: sessionPhotos,
        oxResponses: sessionOx,
        products,
      });

      const thumbnail = selectThumbnail(sessionPhotos);
      if (!thumbnail) {
        return [];
      }

      return [{
        id: session.id,
        createdAt: session.created_at,
        summary: payload.summary,
        headline: payload.highlight,
        thumbnail,
      }];
    });

    return NextResponse.json({ reports });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("reports list error", error);
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
