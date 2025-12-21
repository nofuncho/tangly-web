import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  buildRecommendationPayload,
  type OxResponseRow,
  type PhotoRow,
  type ProductRow,
} from "@/lib/recommendations";
import { buildEyeWrinkleArchiveEntry } from "@/lib/eye-wrinkle-report";
import {
  buildProfileOxMap,
  fetchProfileOxRows,
  mergeSessionAndProfileOx,
  type ProfileOxRow,
} from "@/lib/ox-storage";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 36;

type PersonalColorRow = {
  id: string;
  created_at: string | null;
  thumbnail_url: string | null;
  result_summary?: string | null;
  result_headline?: string | null;
};

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
      .select("id, created_at, source, user_id")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (sessionError) {
      console.error("reports sessions error", sessionError);
      return NextResponse.json({ error: sessionError.message }, { status: 500 });
    }

    const sessionIds = (sessions ?? []).map((session) => session.id);
    const userIds = Array.from(
      new Set(
        (sessions ?? [])
          .map((session) => session.user_id)
          .filter((value): value is string => typeof value === "string" && value.length > 0)
      )
    );

    let photosBySession = new Map<string, PhotoRow[]>();
    let oxBySession = new Map<string, OxResponseRow[]>();
    let profileOxByUser = new Map<string, ProfileOxRow[]>();
    const products: ProductRow[] = [];

    if (sessionIds.length) {
      const [{ data: photosData, error: photosError }, { data: oxData, error: oxError }, { data: productsData, error: productError }, profileRows] =
        await Promise.all([
          supabase
            .from("photos")
            .select("id, session_id, shot_type, focus_area, image_url, created_at")
            .in("session_id", sessionIds),
          supabase
            .from("ox_responses")
            .select("session_id, question_key, answer, created_at")
            .in("session_id", sessionIds),
          supabase
            .from("products")
            .select("id, name, brand, category, key_ingredients, note, image_url")
            .limit(80),
          fetchProfileOxRows(supabase, userIds),
        ]);

      if (photosError) {
        console.error("reports photos error", photosError);
        return NextResponse.json({ error: photosError.message }, { status: 500 });
      }
      if (oxError) {
        console.error("reports ox error", oxError);
        return NextResponse.json({ error: oxError.message }, { status: 500 });
      }
      if (productError) {
        console.error("reports product error", productError);
        return NextResponse.json({ error: productError.message }, { status: 500 });
      }

      photosBySession = groupBySession(photosData ?? []);
      oxBySession = groupOxBySession(oxData ?? []);
      profileOxByUser = buildProfileOxMap(profileRows);
      products.push(...((productsData ?? []) as ProductRow[]));
    }

    const analysisReports =
      sessions?.flatMap((session) => {
        const sessionPhotos = photosBySession.get(session.id) ?? [];
        if ((session.source ?? "").toLowerCase() === "eye_wrinkle") {
          const eyeEntry = buildEyeWrinkleArchiveEntry(session.id, session.created_at, sessionPhotos);
          const thumbnail = eyeEntry.thumbnail ?? selectThumbnail(sessionPhotos);
          if (!thumbnail) {
            return [];
          }
          return [
            {
              id: session.id,
              createdAt: session.created_at,
              summary: eyeEntry.summary,
              headline: eyeEntry.headline,
              thumbnail,
              type: "eye_wrinkle" as const,
            },
          ];
        }

        const profileAnswers = session.user_id
          ? profileOxByUser.get(session.user_id) ?? []
          : [];
        const sessionOx = mergeSessionAndProfileOx(
          oxBySession.get(session.id) ?? [],
          profileAnswers,
          { sessionId: session.id }
        );
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

        return [
          {
            id: session.id,
            createdAt: session.created_at,
            summary: payload.summary,
            headline: payload.highlight,
            thumbnail,
            type: "skin" as const,
          },
        ];
      }) ?? [];

    const { data: personalRows, error: personalError } = await supabase
      .from("personal_color_reports")
      .select("id, created_at, thumbnail_url, result_summary, result_headline")
      .order("created_at", { ascending: false })
      .limit(limit * 2);

    if (personalError) {
      console.error("personal-color list error", personalError);
      return NextResponse.json({ error: personalError.message }, { status: 500 });
    }

    const personalReports = ((personalRows ?? []) as PersonalColorRow[])
      .filter((row) => row.thumbnail_url)
      .map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        summary: row.result_summary ?? "퍼스널컬러 리포트",
        headline: row.result_headline ?? "퍼스널컬러 결과",
        thumbnail: row.thumbnail_url,
        type: "personal_color" as const,
      }));

    const combined = [...analysisReports, ...personalReports].sort((a, b) => {
      const left = a.createdAt ? Date.parse(a.createdAt) : 0;
      const right = b.createdAt ? Date.parse(b.createdAt) : 0;
      return right - left;
    });

    return NextResponse.json({ reports: combined.slice(0, limit) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("reports list error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const groupBySession = (photos: PhotoRow[]) => {
  const map = new Map<string, PhotoRow[]>();
  photos.forEach((photo) => {
    if (!photo?.session_id) return;
    const bucket = map.get(photo.session_id) ?? [];
    bucket.push(photo);
    map.set(photo.session_id, bucket);
  });
  return map;
};

const groupOxBySession = (rows: OxResponseRow[]) => {
  const map = new Map<string, OxResponseRow[]>();
  rows.forEach((entry) => {
    if (!entry?.session_id) return;
    const bucket = map.get(entry.session_id) ?? [];
    bucket.push(entry);
    map.set(entry.session_id, bucket);
  });
  return map;
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
