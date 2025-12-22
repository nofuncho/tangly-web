import { type SupabaseClient } from "@supabase/supabase-js";

import {
  buildRecommendationPayload,
  type NeedEntry,
  type OxResponseRow,
  type PhotoRow,
  type ProductRow,
  type RecommendationPayload,
} from "@/lib/recommendations";
import { ensureAiReport, type AiReportContent } from "@/lib/ai-report";
import {
  fetchProfileDetails,
  mapConcernToFocus,
  pickPrimaryConcern,
  concernToFriendlyLabel,
  type ProfileDetails,
} from "@/lib/profile-details";
import {
  fetchProfileOxForUser,
  mergeSessionAndProfileOx,
} from "@/lib/ox-storage";

type MonthlyRoutineRow = {
  id: string;
  user_id: string;
  period_month: string;
  goal: string;
  summary: unknown;
  cautions: string | null;
  habits: unknown;
  payload: Record<string, unknown>;
  generated_at: string | null;
  updated_at: string | null;
};

type WeeklyRoutineRow = {
  id: string;
  user_id: string;
  session_id: string | null;
  week_start: string;
  week_end: string;
  focus: string;
  focus_reason: string | null;
  conclusion: string | null;
  recommended_days: string[] | null;
  intensity: string;
  optional_steps: unknown;
  base_routine: unknown;
  actions: unknown;
  warnings: unknown;
  ai_payload: Record<string, unknown> | null;
  generated_at: string | null;
  updated_at: string | null;
};

export type MonthlyRoutinePayload = {
  id: string;
  periodMonth: string;
  goal: string;
  summary: string[];
  cautions: string | null;
  habits: string[];
  generatedAt: string | null;
};

export type WeeklyRoutinePayload = {
  id: string;
  weekStart: string;
  weekEnd: string;
  focus: string;
  focusReason: string;
  conclusion: string;
  recommendedDays: string[];
  intensity: "gentle" | "standard" | "focus";
  optionalSteps: RoutineStep[];
  baseRoutine: string[];
  actions: RoutineAction[];
  warnings: string[];
  aiPayload?: AiReportContent | null;
  generatedAt: string | null;
  progress: {
    completed: number;
    target: number;
    daysChecked: string[];
  };
};

export type RoutineAction = {
  title: string;
  description: string;
};

export type RoutineStep = {
  key: string;
  label: string;
  enabled: boolean;
};

export type WeeklyProgressDetail = {
  count: number;
  daysChecked: string[];
};

type RecommendationContext = {
  sessionId: string;
  payload: RecommendationPayload;
  photos: PhotoRow[];
  ox: OxResponseRow[];
};

const DEFAULT_OPTIONAL_STEPS: RoutineStep[] = [
  { key: "eye", label: "아이크림", enabled: true },
  { key: "mask", label: "시트팩", enabled: false },
  { key: "peel", label: "부드러운 각질케어", enabled: false },
];

const DAY_SETS: string[][] = [
  ["월", "수", "금"],
  ["화", "목", "토"],
  ["수", "금", "일"],
];

export const ensureMonthlyRoutine = async (supabase: SupabaseClient, userId: string) => {
  const periodMonth = getMonthStart().toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("monthly_routines")
    .select("*")
    .eq("user_id", userId)
    .eq("period_month", periodMonth)
    .maybeSingle<MonthlyRoutineRow>();

  if (existing) {
    return toMonthlyPayload(existing);
  }

  const [context, profile] = await Promise.all([
    loadRecommendationContext(supabase, userId).catch(() => null),
    fetchProfileDetails(supabase, userId).catch(() => null),
  ]);
  const monthly = deriveMonthlyRoutine(
    context?.payload,
    context?.payload?.needs ?? [],
    profile ?? null
  );

  const { data: inserted, error } = await supabase
    .from("monthly_routines")
    .insert({
      user_id: userId,
      period_month: periodMonth,
      goal: monthly.goal,
      summary: monthly.summary,
      cautions: monthly.cautions,
      habits: monthly.habits,
      payload: monthly.payload,
    })
    .select("*")
    .maybeSingle<MonthlyRoutineRow>();

  if (error || !inserted) {
    throw error ?? new Error("Failed to insert monthly routine");
  }

  return toMonthlyPayload(inserted);
};

export const ensureWeeklyRoutine = async (supabase: SupabaseClient, userId: string) => {
  const { weekStart, weekEnd } = getWeekRange();

  const { data: existing } = await supabase
    .from("weekly_routines")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle<WeeklyRoutineRow>();

  if (existing) {
    return existing;
  }

  const [context, profile] = await Promise.all([
    loadRecommendationContext(supabase, userId),
    fetchProfileDetails(supabase, userId).catch(() => null),
  ]);
  const aiReport = await ensureAiReport({
    supabase,
    sessionId: context.sessionId,
    sessionCreatedAt: context.payload?.sessionLabel,
    payload: context.payload,
    photos: context.photos,
    oxResponses: context.ox,
    profile: profile ?? null,
  });

  const weekly = deriveWeeklyRoutine(context.payload, aiReport.payload ?? null, profile ?? null);
  const { data: inserted, error } = await supabase
    .from("weekly_routines")
    .insert({
      user_id: userId,
      session_id: context.sessionId,
      week_start: weekStart,
      week_end: weekEnd,
      focus: weekly.focus,
      focus_reason: weekly.focusReason,
      conclusion: weekly.conclusion,
      recommended_days: weekly.recommendedDays,
      intensity: weekly.intensity,
      optional_steps: weekly.optionalSteps,
      base_routine: weekly.baseRoutine,
      actions: weekly.actions,
      warnings: weekly.warnings,
      ai_payload: aiReport.payload ?? null,
    })
    .select("*")
    .maybeSingle<WeeklyRoutineRow>();

  if (error || !inserted) {
    throw error ?? new Error("Failed to insert weekly routine");
  }

  return inserted;
};

export const updateWeeklyRoutine = async (
  supabase: SupabaseClient,
  userId: string,
  updates: {
    recommendedDays?: string[];
    intensity?: "gentle" | "standard" | "focus";
    optionalSteps?: RoutineStep[];
  }
) => {
  const { weekStart } = getWeekRange();
  const payload: Record<string, unknown> = {};
  if (updates.recommendedDays) {
    payload.recommended_days = updates.recommendedDays;
  }
  if (updates.intensity) {
    payload.intensity = updates.intensity;
  }
  if (updates.optionalSteps) {
    payload.optional_steps = updates.optionalSteps;
  }

  const { data, error } = await supabase
    .from("weekly_routines")
    .update(payload)
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .select("*")
    .maybeSingle<WeeklyRoutineRow>();

  if (error || !data) {
    throw error ?? new Error("Failed to update weekly routine");
  }

  return data;
};

export const recordWeeklyCheck = async (
  supabase: SupabaseClient,
  routineId: string,
  weekStart?: string,
  weekEnd?: string
) => {
  const { error } = await supabase
    .from("weekly_routine_checks")
    .insert({ routine_id: routineId });
  if (error) {
    throw error;
  }
  return getWeeklyProgressDetail(supabase, routineId, weekStart, weekEnd);
};

export const getWeeklyProgressDetail = async (
  supabase: SupabaseClient,
  routineId: string,
  weekStart?: string,
  weekEnd?: string
): Promise<WeeklyProgressDetail> => {
  const range = weekStart && weekEnd ? { weekStart, weekEnd } : getWeekRange();
  const { data, error } = await supabase
    .from("weekly_routine_checks")
    .select("created_at")
    .eq("routine_id", routineId)
    .gte("created_at", `${range.weekStart}T00:00:00.000Z`)
    .lte("created_at", `${range.weekEnd}T23:59:59.999Z`)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const daysChecked = Array.from(
    new Set(
      (data ?? [])
        .map((entry) => (entry?.created_at ? `${entry.created_at}`.slice(0, 10) : null))
        .filter((value): value is string => Boolean(value))
    )
  );

  return {
    count: daysChecked.length,
    daysChecked,
  };
};

export const getWeeklyProgressCount = async (supabase: SupabaseClient, routineId: string) => {
  const { count } = await getWeeklyProgressDetail(supabase, routineId);
  return count;
};

export const toMonthlyPayload = (row: MonthlyRoutineRow): MonthlyRoutinePayload => ({
  id: row.id,
  periodMonth: row.period_month,
  goal: row.goal,
  summary: toStringArray(row.summary),
  cautions: row.cautions,
  habits: toStringArray(row.habits),
  generatedAt: row.generated_at,
});

export const toWeeklyPayload = (
  row: WeeklyRoutineRow,
  progressCount: number,
  daysChecked: string[] = []
): WeeklyRoutinePayload => ({
  id: row.id,
  weekStart: row.week_start,
  weekEnd: row.week_end,
  focus: row.focus,
  focusReason: row.focus_reason ?? "",
  conclusion: row.conclusion ?? "",
  recommendedDays: row.recommended_days ?? DAY_SETS[0],
  intensity: normalizeIntensity(row.intensity),
  optionalSteps: toStepArray(row.optional_steps),
  baseRoutine: toStringArray(row.base_routine),
  actions: toActionArray(row.actions),
  warnings: toStringArray(row.warnings),
  aiPayload: (row.ai_payload as AiReportContent | null) ?? null,
  generatedAt: row.generated_at,
  progress: {
    completed: progressCount,
    target: Math.max(row.recommended_days?.length ?? DAY_SETS[0].length, 3),
    daysChecked: Array.from(new Set(daysChecked)),
  },
});

export const loadRecommendationContext = async (
  supabase: SupabaseClient,
  userId: string
): Promise<RecommendationContext> => {
  const { data: session, error: sessionError } = await supabase
    .from("analysis_sessions")
    .select("id, created_at, user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; created_at: string | null; user_id: string | null }>();

  if (sessionError || !session) {
    throw sessionError ?? new Error("세션 정보를 찾을 수 없습니다.");
  }

  const [{ data: photos, error: photosError }, { data: ox, error: oxError }, { data: products, error: productError }] =
    await Promise.all([
      supabase
        .from("photos")
        .select("id, session_id, shot_type, focus_area, image_url, created_at")
        .eq("session_id", session.id),
      supabase
        .from("ox_responses")
        .select("session_id, question_key, answer, created_at")
        .eq("session_id", session.id),
      supabase
        .from("products")
        .select("id, name, brand, category, key_ingredients, note, image_url")
        .limit(80),
    ]);

  if (photosError) throw photosError;
  if (oxError) throw oxError;
  if (productError) throw productError;

  const profileOx = session.user_id
    ? await fetchProfileOxForUser(supabase, session.user_id)
    : [];
  const mergedOx = mergeSessionAndProfileOx(
    (ox ?? []) as OxResponseRow[],
    profileOx,
    { sessionId: session.id }
  );

  const payload = buildRecommendationPayload({
    sessionId: session.id,
    photos: (photos ?? []) as PhotoRow[],
    oxResponses: mergedOx,
    products: (products ?? []) as ProductRow[],
  });

  return {
    sessionId: session.id,
    payload,
    photos: (photos ?? []) as PhotoRow[],
    ox: mergedOx,
  };
};

const deriveMonthlyRoutine = (
  payload?: RecommendationPayload | null,
  needs: NeedEntry[] = [],
  profile?: ProfileDetails | null
) => {
  const profileConcern = pickPrimaryConcern(profile?.concerns);
  const profileConcernLabel = concernToFriendlyLabel(profileConcern);
  const primaryNeed = needs[0];
  const goal = profileConcernLabel
    ? `${profileConcernLabel} 집중하기`
    : primaryNeed?.label
      ? `${primaryNeed.label} 집중하기`
      : "수분 밀도 유지";
  const summary =
    payload?.items?.slice(0, 3).map((item) => `${item.title}: ${item.description}`) ??
    [
      "아침: 미온수 세안 → 수분 토너 → 탄력 세럼 → 선크림",
      "저녁: 저자극 세안 → 장벽 앰플 → 영양 크림",
    ];

  const caution =
    payload?.items?.find((item) => item.status === "주의")?.description ??
    "피부가 예민하면 하루 정도 쉬어가도 충분해요.";

  const baseHabits =
    payload?.tips?.slice(0, 2) ??
    [
      "주 2회 미지근한 스팀타월로 얼굴을 감싸 주세요.",
      "잠들기 전 미온수 한 잔으로 몸을 편안하게 해 주세요.",
    ];

  const habits = profileConcernLabel
    ? [
        `${profileConcernLabel} 완화를 위해 주 3회 루틴만 지켜도 충분합니다.`,
        ...baseHabits,
      ].slice(0, 3)
    : baseHabits;

  return {
    goal,
    summary,
    cautions: caution,
    habits,
    payload: payload ?? {},
  };
};

const deriveWeeklyRoutine = (
  payload: RecommendationPayload,
  ai?: AiReportContent | null,
  profile?: ProfileDetails | null
) => {
  const range = getWeekRange();
  const profileConcern = pickPrimaryConcern(profile?.concerns);
  const profileConcernLabel = concernToFriendlyLabel(profileConcern);
  const fallbackTopic =
    profileConcern
      ? mapConcernToFocus(profileConcern)
      : focusLabelKey(payload.needs[0]?.label ?? "");
  const focusTopic = ai?.focus?.topic ?? fallbackTopic;
  const focus = focusLabel(focusTopic);

  const focusReason =
    ai?.focus?.reason ??
    (profileConcernLabel
      ? `${profileConcernLabel} 완화를 위해 이번 주 루틴 강도를 조정했어요.`
      : "이번 주는 느슨해진 루틴을 다시 붙잡는 데 집중해요.");
  const conclusion =
    ai?.oneLiner ?? "주 3회만 지켜도 충분합니다. 하루 정도는 쉬어가도 괜찮아요.";

  const baseRoutine =
    payload.items.slice(0, 4).map((item) => `${item.title}: ${item.description}`) ??
    [];

  const actions =
    ai?.actions?.length
      ? ai.actions.map((action) => ({
          title: action.title,
          description: action.description,
        }))
      : buildFallbackActions(focusTopic);

  const warnings =
    ai?.warnings?.length
      ? ai.warnings
      : ["피부가 예민하게 느껴지는 날은 하루 쉬어도 괜찮아요."];

  return {
    focus,
    focusReason,
    conclusion,
    recommendedDays: DAY_SETS[0],
    intensity: "standard" as const,
    optionalSteps: DEFAULT_OPTIONAL_STEPS,
    baseRoutine: baseRoutine.length ? baseRoutine : [
      "클렌징: 미온수와 순한 클렌저로 가볍게",
      "수분 충전: 토너 패드 후 베이스 세럼",
      "탄력케어: 리프팅 에센스 2회 레이어링",
      "마무리: 장벽 크림 + 아이크림",
    ],
    actions,
    warnings,
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
  };
};

const buildFallbackActions = (focus: string): RoutineAction[] => {
  switch (focus) {
    case "elasticity":
      return [
        { title: "턱선 마사지", description: "저녁 루틴 후 턱선을 10초씩 부드럽게 눌러 주세요." },
        { title: "리프팅 세럼 덧바르기", description: "볼과 턱에 한 번 더 겹쳐 발라 탄력을 유지하세요." },
      ];
    case "wrinkle":
      return [
        { title: "아이존 패치", description: "화장 전 10분 붙였다가 떼고 가볍게 눌러주세요." },
        { title: "잠들기 전 보습막", description: "아이크림을 살짝 도톰하게 얹어 건조를 막아 주세요." },
      ];
    case "trouble":
      return [
        { title: "진정 팩", description: "트러블 부위에 5분 정도 얹어 열감을 내립니다." },
        { title: "순한 세안", description: "욕심내지 말고 거품을 짧게 머물게 하세요." },
      ];
    case "hydration":
    default:
      return [
        { title: "슬리핑 마스크", description: "주 3회, 저녁에 도톰하게 올리고 그대로 주무세요." },
        { title: "미온수 스팀", description: "볼과 턱을 3분 정도 덮어 순환을 도와주세요." },
      ];
  }
};

const getMonthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const getWeekRange = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const weekStartDate = new Date(now.setDate(diff));
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekStartDate.getDate() + 6);
  return {
    weekStart: weekStartDate.toISOString().slice(0, 10),
    weekEnd: weekEndDate.toISOString().slice(0, 10),
  };
};

const toStringArray = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input.map((value) => `${value}`.trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[\n\r]+/)
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
};

const toActionArray = (input: unknown): RoutineAction[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => ({
      title: `${entry?.title ?? ""}`.trim(),
      description: `${entry?.description ?? ""}`.trim(),
    }))
    .filter((entry) => entry.title && entry.description);
};

const toStepArray = (input: unknown): RoutineStep[] => {
  if (!Array.isArray(input)) {
    return DEFAULT_OPTIONAL_STEPS;
  }
  return input
    .map((entry) => ({
      key: `${entry?.key ?? ""}`.trim(),
      label: `${entry?.label ?? ""}`.trim(),
      enabled: Boolean(entry?.enabled),
    }))
    .filter((entry) => entry.key && entry.label);
};

const normalizeIntensity = (value?: string | null): "gentle" | "standard" | "focus" => {
  switch ((value ?? "").toLowerCase()) {
    case "gentle":
      return "gentle";
    case "focus":
      return "focus";
    default:
      return "standard";
  }
};

const focusLabel = (topic: string) => {
  switch ((topic ?? "").toLowerCase()) {
    case "elasticity":
      return "탄력";
    case "wrinkle":
      return "주름";
    case "radiance":
      return "광채";
    case "trouble":
      return "트러블";
    default:
      return "건조";
  }
};

const focusLabelKey = (label: string) => {
  switch (label) {
    case "탄력":
      return "elasticity";
    case "주름":
      return "wrinkle";
    case "광채":
      return "radiance";
    case "트러블":
      return "trouble";
    default:
      return "hydration";
  }
};
