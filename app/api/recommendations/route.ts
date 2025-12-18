import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ensureMonthlyRoutine,
  ensureWeeklyRoutine,
  getWeeklyProgressCount,
  toMonthlyPayload,
  toWeeklyPayload,
  loadRecommendationContext,
  type MonthlyRoutinePayload,
  type WeeklyRoutinePayload,
} from "@/lib/routines";
import { ensureAiReport } from "@/lib/ai-report";
import {
  fetchProfileDetails,
  pickPrimaryConcern,
  concernToFriendlyLabel,
  mapConcernToFocus,
  type ProfileDetails,
} from "@/lib/profile-details";
import type { NeedEntry, ProductRecommendation } from "@/lib/recommendations";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type TagInfo = {
  id: string;
  label: string;
  level: "high" | "medium";
  reason: string;
  ingredients: string[];
  origin: "profile" | "analysis" | "ai";
};

const FOCUS_INGREDIENT_HINTS: Record<string, string[]> = {
  hydration: ["히알루론산", "베타글루칸", "NMF"],
  elasticity: ["콜라겐", "펩타이드", "엘라스틴"],
  wrinkle: ["레티놀", "바쿠치올", "펩타이드"],
  radiance: ["비타민C", "나이아신아마이드", "알부틴"],
  trouble: ["마데카소사이드", "티트리", "징크PCA"],
  barrier: ["세라마이드", "판테놀", "스쿠알란"],
  soothing: ["녹차", "카모마일", "시카"],
  pore_care: ["BHA", "PHA", "카올린"],
  sebum_control: ["LHA", "아연", "티트리"],
};

const FOCUS_LABELS: Record<string, { label: string; reason?: string }> = {
  hydration: { label: "수분 케어", reason: "속건조와 당김을 완화하기 위한 케어" },
  elasticity: { label: "탄력 케어", reason: "턱선과 윤곽을 지탱하기 위한 케어" },
  wrinkle: { label: "주름 케어", reason: "표정 주름과 눈가 주름을 부드럽게 관리" },
  radiance: { label: "톤 개선", reason: "칙칙함을 밝히기 위한 케어" },
  trouble: { label: "트러블 케어", reason: "열감·피지를 빠르게 진정" },
};

export async function GET(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Supabase configuration missing" }, { status: 500 });
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

    const [{ data: profileRow }, profileDetails, context] = await Promise.all([
      supabase.from("profiles").select("plan_type").eq("id", userId).maybeSingle(),
      fetchProfileDetails(supabase, userId).catch(() => null),
      loadRecommendationContext(supabase, userId).catch(() => null),
    ]);

    const planType =
      (profileRow?.plan_type ?? "").toString().toLowerCase() === "pro" ? "pro" : "free";

    let stateSummary: StateSummary | null = null;
    let routinePayload: WeeklyRoutinePayload | MonthlyRoutinePayload | null = null;

    if (planType === "pro") {
      try {
        const weeklyRow = await ensureWeeklyRoutine(supabase, userId);
        const progressCount = await getWeeklyProgressCount(supabase, weeklyRow.id);
        const weekly = toWeeklyPayload(weeklyRow, progressCount);
        routinePayload = weekly;
        stateSummary = {
          mode: "weekly",
          focus: weekly.focus,
          headline: weekly.conclusion,
          subline: weekly.focusReason,
          summary: weekly.baseRoutine.slice(0, 3),
        };
      } catch (error) {
        console.warn("weekly routine summary error", error);
      }
    } else {
      try {
        const monthlyRow = await ensureMonthlyRoutine(supabase, userId);
        const monthly = toMonthlyPayload(monthlyRow);
        routinePayload = monthly;
        stateSummary = {
          mode: "monthly",
          focus: monthly.goal,
          headline: monthly.goal,
          subline: monthly.cautions ?? "이번 달 루틴을 가볍게 이어가세요.",
          summary: monthly.summary.slice(0, 3),
        };
      } catch (error) {
        console.warn("monthly routine summary error", error);
      }
    }

    if (!context) {
      return NextResponse.json({
        planType,
        profile: profileDetails,
        state: stateSummary,
        tags: buildProfileTags(profileDetails),
        products: [],
      });
    }

    const aiReport = await ensureAiReport({
      supabase,
      sessionId: context.sessionId,
      sessionCreatedAt: context.payload?.sessionLabel,
      payload: context.payload,
      photos: context.photos,
      oxResponses: context.ox,
      profile: profileDetails ?? null,
    });

    const tags = buildAllTags({
      needs: context.payload.needs ?? [],
      profile: profileDetails ?? null,
      aiFocus: aiReport.payload?.focus ?? null,
      routine: routinePayload,
    });

    let products = buildProductTiles(context.payload.recommendations ?? [], tags);
    if (!products.length) {
      const fallback = await fetchFallbackProducts(supabase, 4);
      products = fallback;
    }

    return NextResponse.json({
      planType,
      profile: profileDetails,
      state: stateSummary,
      tags,
      products,
    });
  } catch (error) {
    console.error("recommendations api error", error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type StateSummary =
  | {
      mode: "weekly" | "monthly";
      focus: string;
      headline: string;
      subline: string;
      summary: string[];
    }
  | null;

const buildProfileTags = (profile: ProfileDetails | null): TagInfo[] => {
  if (!profile || !profile.concerns.length) return [];
  const concern = pickPrimaryConcern(profile.concerns);
  if (!concern) return [];
  const topic = mapConcernToFocus(concern);
  const label = concernToFriendlyLabel(concern) ?? FOCUS_LABELS[topic]?.label ?? "맞춤 케어";
  return [
    {
      id: `profile-${topic}`,
      label,
      level: "medium",
      reason: `${label} 개선을 위해 추천 제품을 골라봤어요.`,
      ingredients: FOCUS_INGREDIENT_HINTS[topic] ?? [],
      origin: "profile",
    },
  ];
};

const buildAllTags = ({
  needs,
  profile,
  aiFocus,
  routine,
}: {
  needs: NeedEntry[];
  profile: ProfileDetails | null;
  aiFocus: { topic: string; reason: string } | null | undefined;
  routine: WeeklyRoutinePayload | MonthlyRoutinePayload | null;
}): TagInfo[] => {
  const map = new Map<string, TagInfo>();

  const mergeTag = (tag: TagInfo) => {
    const existing = map.get(tag.id);
    if (!existing) {
      map.set(tag.id, tag);
      return;
    }
    const level =
      existing.level === "high" || tag.level === "high" ? "high" : ("medium" as const);
    const reason = existing.reason.includes(tag.reason)
      ? existing.reason
      : `${existing.reason} / ${tag.reason}`;
    const ingredients = Array.from(
      new Set([...existing.ingredients, ...tag.ingredients])
    ).filter(Boolean);
    map.set(tag.id, { ...tag, level, reason, ingredients });
  };

  needs.forEach((need) => {
    mergeTag({
      id: `need-${need.id}`,
      label: need.label,
      level: need.level === "high" ? "high" : "medium",
      reason: need.description,
      ingredients: FOCUS_INGREDIENT_HINTS[need.id] ?? [],
      origin: "analysis",
    });
  });

  if (profile?.concerns?.length) {
    profile.concerns.forEach((concern) => {
      const topic = mapConcernToFocus(concern);
      const label = concernToFriendlyLabel(concern) ?? FOCUS_LABELS[topic]?.label ?? null;
      if (!label) return;
      mergeTag({
        id: `profile-${topic}`,
        label,
        level: "medium",
        reason: `${label} 고민을 완화하기 위한 추천이에요.`,
        ingredients: FOCUS_INGREDIENT_HINTS[topic] ?? [],
        origin: "profile",
      });
    });
  }

  if (aiFocus) {
    const topic = aiFocus.topic ?? "hydration";
    const label = FOCUS_LABELS[topic]?.label ?? "맞춤 케어";
    mergeTag({
      id: `ai-${topic}`,
      label,
      level: "high",
      reason: aiFocus.reason ?? FOCUS_LABELS[topic]?.reason ?? "이번 주 집중 포커스예요.",
      ingredients: FOCUS_INGREDIENT_HINTS[topic] ?? [],
      origin: "ai",
    });
  }

  if (routine && "focus" in routine && routine.focus) {
    mergeTag({
      id: `routine-${routine.focus}`,
      label: routine.focus,
      level: "medium",
      reason: "현재 루틴의 핵심 포커스입니다.",
      ingredients: [],
      origin: "analysis",
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.level === b.level) {
      return a.label.localeCompare(b.label);
    }
    return a.level === "high" ? -1 : 1;
  });
};

const buildProductTiles = (products: ProductRecommendation[], tags: TagInfo[]) => {
  if (!products.length) return [];
  const normalizedTags = tags.map((tag) => ({
    ...tag,
    normalized: normalizeTag(tag.label),
  }));

  return products.map((item) => {
    const focusMatches = item.focus?.map(normalizeTag).filter(Boolean) ?? [];
    const matchedTags = normalizedTags
      .filter((tag) => focusMatches.some((focus) => focus.includes(tag.normalized)))
      .map((tag) => tag.label);

    return {
      id: item.id,
      name: item.name,
      brand: item.brand,
      category: item.category,
      reason: item.reason,
      focus: item.focus,
      keyIngredients: item.keyIngredients,
      imageUrl: item.imageUrl,
      tags: matchedTags,
    };
  });
};

const normalizeTag = (value?: string | null) =>
  (value ?? "").replace(/\s+/g, "").toLowerCase();

const fetchFallbackProducts = async (supabase: SupabaseClient, limit = 16) => {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, brand, category, key_ingredients, image_url")
    .limit(limit);

  if (error || !data?.length) {
    return [];
  }

  return data.map((product) => ({
    id: `${product.id}`,
    name: product.name ?? "추천 제품",
    brand: product.brand ?? null,
    category: product.category ?? null,
    reason: "상품 데이터 업데이트 중이라 기본 추천을 보여드려요.",
    focus: [],
    keyIngredients: Array.isArray(product.key_ingredients)
      ? product.key_ingredients.map((item) => `${item}`).filter(Boolean)
      : typeof product.key_ingredients === "string"
        ? product.key_ingredients.split(",").map((item) => item.trim())
        : [],
    imageUrl: product.image_url ?? null,
    tags: [],
  }));
};
