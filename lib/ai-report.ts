import { type SupabaseClient } from "@supabase/supabase-js";

import type {
  NeedEntry,
  OxResponseRow,
  PhotoRow,
  RecommendationPayload,
  ReportItem,
} from "@/lib/recommendations";
import type { ProfileDetails } from "@/lib/profile-details";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL =
  process.env.OPENAI_MODEL ??
  process.env.OPENAI_RESPONSE_MODEL ??
  "gpt-4.1-mini";
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL ??
  process.env.OPENAI_API_URL ??
  "https://api.openai.com/v1/chat/completions";
const AI_TIMEOUT_MS = Number.parseInt(
  process.env.AI_REPORT_TIMEOUT_MS ?? "",
  10
) || 20000;

export type AiKeyFindingStatus = "good" | "neutral" | "caution";
export type AiFocusTopic =
  | "hydration"
  | "elasticity"
  | "wrinkle"
  | "radiance"
  | "trouble";
export type AiActionFrequency = "daily" | "weekly" | "three_per_week";

export type AiReportContent = {
  oneLiner: string;
  summary: string[];
  keyFindings: {
    title: string;
    status: AiKeyFindingStatus;
    description: string;
  }[];
  ageComparison: {
    percentile: number;
    statement: string;
  };
  focus: {
    topic: AiFocusTopic;
    reason: string;
  };
  actions: {
    title: string;
    description: string;
    frequency: AiActionFrequency;
  }[];
  warnings: string[];
};

export type AiReportEnvelope = {
  status: "ready" | "unavailable" | "error";
  payload?: AiReportContent | null;
  generatedAt?: string | null;
  error?: string | null;
};

type AiReportRow = {
  session_id: string;
  payload: AiReportContent;
  provider?: string | null;
  model?: string | null;
  generated_at?: string | null;
};

type BuildAiReportParams = {
  supabase: SupabaseClient;
  sessionId: string;
  sessionCreatedAt?: string | null;
  payload: RecommendationPayload;
  photos: PhotoRow[];
  oxResponses: OxResponseRow[];
  profile?: ProfileDetails | null;
};

type ReferencedPhoto = PhotoRow & { reference: string };

export const ensureAiReport = async ({
  supabase,
  sessionId,
  sessionCreatedAt,
  payload,
  photos,
  oxResponses,
  profile,
}: BuildAiReportParams): Promise<AiReportEnvelope> => {
  try {
    const { data: cached } = await supabase
      .from("ai_reports")
      .select("session_id, payload, model, provider, generated_at")
      .eq("session_id", sessionId)
      .maybeSingle<AiReportRow>();

    if (cached?.payload) {
      return {
        status: "ready",
        payload: sanitizeAiPayload(cached.payload),
        generatedAt: cached.generated_at ?? null,
      };
    }

    if (!OPENAI_API_KEY) {
      return {
        status: "unavailable",
        error: "OPENAI_API_KEY is not configured",
      };
    }

    const aiResponse = await requestAiReport({
      report: payload,
      sessionId,
      sessionCreatedAt,
      photos,
      oxResponses,
      profile,
    });

    if (!aiResponse.success || !aiResponse.payload) {
      return {
        status: "error",
        error: aiResponse.error ?? "AI 응답을 생성하지 못했습니다.",
      };
    }

    const sanitized = sanitizeAiPayload(aiResponse.payload);

    const { data: upserted, error: insertError } = await supabase
      .from("ai_reports")
      .upsert(
        {
          session_id: sessionId,
          payload: sanitized,
          provider: "openai",
          model: OPENAI_MODEL,
        },
        { onConflict: "session_id" }
      )
      .select("payload, generated_at")
      .maybeSingle<AiReportRow>();

    if (insertError) {
      console.error("ai_reports upsert error", insertError);
      // Continue even if caching fails so the client can render once.
    }

    return {
      status: "ready",
      payload: sanitized,
      generatedAt: upserted?.generated_at ?? new Date().toISOString(),
    };
  } catch (error) {
    console.error("ensureAiReport error", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : "AI 처리 중 오류",
    };
  }
};

type AiRequestResult = {
  success: boolean;
  payload?: AiReportContent;
  error?: string;
};

type AiRequestInput = {
  report: RecommendationPayload;
  sessionId: string;
  sessionCreatedAt?: string | null;
  photos: PhotoRow[];
  oxResponses: OxResponseRow[];
  profile?: ProfileDetails | null;
};

const requestAiReport = async ({
  report,
  sessionId,
  sessionCreatedAt,
  photos,
  oxResponses,
  profile,
}: AiRequestInput): Promise<AiRequestResult> => {
  const referencedPhotos = attachPhotoReferences(photos);
  const body = {
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "당신은 40-50대 여성을 위한 고급 스킨케어 코치입니다. " +
          "의학적 진단이나 강압적 문장은 금지합니다. " +
          "모든 응답은 JSON으로 반환해야 하며, 지정한 스키마를 반드시 따르세요.",
      },
      buildUserMessage({
        sessionId,
        sessionCreatedAt,
        report,
        photos: referencedPhotos,
        oxResponses,
        profile,
      }),
    ],
  };

  try {
    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("AI API error", response.status, errorText);
      return {
        success: false,
        error: "AI API 호출에 실패했습니다.",
      };
    }

    const payload = await response.json();
    const rawContent =
      payload?.choices?.[0]?.message?.content ??
      payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!rawContent || typeof rawContent !== "string") {
      return { success: false, error: "AI 응답 포맷이 올바르지 않습니다." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      console.error("AI JSON parse error", error, rawContent);
      return { success: false, error: "AI JSON 응답을 해석할 수 없습니다." };
    }
    return { success: true, payload: parsed as AiReportContent };
  } catch (error) {
    console.error("AI request failure", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "AI 요청 중 오류",
    };
  }
};

type PromptBuilderInput = {
  sessionId: string;
  sessionCreatedAt?: string | null;
  report: RecommendationPayload;
  photos: ReferencedPhoto[];
  oxResponses: OxResponseRow[];
  profile?: ProfileDetails | null;
};

const buildPromptPayload = ({
  sessionId,
  sessionCreatedAt,
  report,
  photos,
  oxResponses,
  profile,
}: PromptBuilderInput) => {
  const providedPhotos = photos.map((photo) => ({
    reference: photo.reference,
    shotType: photo.shot_type ?? null,
    focus: photo.focus_area ?? null,
    capturedAt: photo.created_at,
    imageUrl: photo.image_url ?? null,
    notes: photo.focus_area
      ? `${photo.shot_type ?? "unknown"} focusing on ${photo.focus_area}`
      : photo.shot_type ?? "unknown",
  }));

  const attachedPhotoReferences = providedPhotos
    .filter((photo) => !!photo.imageUrl)
    .map((photo) => photo.reference);

  const template = {
    instructions: {
      tone:
        "고급스럽고 부드러운 톤, 현실적으로 실행 가능한 관리법, 훈육 금지, 진단 단정 금지",
      sections: {
        oneLiner: "1문장으로 이번 피부 상태와 방향 제시",
        summary: "3-5줄, 핵심 인사이트",
        keyFindings:
          "3-6개, 제목+상태(good|neutral|caution)+근거, 상태는 한국어 대신 코드값 사용",
        ageComparison:
          "percentile(0-100)과 해당 수치에 대한 설명, 단정 대신 참고 톤",
        focus:
          "hydration|elasticity|wrinkle|radiance|trouble 중 1개, 선택 이유 1-2문장",
        actions:
          "1-3개, 제목/방법/빈도(daily|weekly|three_per_week), '이번 주 딱 이것만' 취지",
        warnings:
          "0-3개, 민감/자극 주의 안내, 부담을 줄이는 어조. 없으면 빈 배열",
      },
    },
    session: {
      id: sessionId,
      capturedAt: sessionCreatedAt,
    },
    report: {
      summary: report.summary,
      highlight: report.highlight,
      needs: report.needs,
      keyFindings: report.items,
      recommendations: report.recommendations.slice(0, 5),
      tips: report.tips.slice(0, 5),
    },
    oxResponses: oxResponses.map((entry) => ({
      question: entry.question_key,
      answer: entry.answer,
    })),
    photoShots: providedPhotos,
    imagesProvided: {
      description:
        "첨부된 이미지(reference)는 photoShots 배열과 동일한 순서이며, reference 값으로 각각을 구분하세요.",
      referenceList: attachedPhotoReferences,
    },
    profile: profile
      ? {
          gender: profile.gender,
          ageRange: profile.ageRange,
          concerns: profile.concerns,
        }
      : null,
  };

  return JSON.stringify(template, null, 2);
};

const buildUserMessage = ({
  sessionId,
  sessionCreatedAt,
  report,
  photos,
  oxResponses,
  profile,
}: PromptBuilderInput) => {
  const promptText = buildPromptPayload({
    sessionId,
    sessionCreatedAt,
    report,
    photos,
    oxResponses,
    profile,
  });
  const attachments = buildVisionAttachments(photos);
  if (attachments.length === 0) {
    return {
      role: "user",
      content: promptText,
    };
  }
  return {
    role: "user",
    content: [{ type: "text", text: promptText }, ...attachments],
  };
};

const attachPhotoReferences = (photos: PhotoRow[]): ReferencedPhoto[] =>
  photos.map((photo, index) => ({
    ...photo,
    reference: `PHOTO_${index + 1}`,
  }));

const buildVisionAttachments = (photos: ReferencedPhoto[]) => {
  return photos
    .filter((photo) => typeof photo.image_url === "string" && photo.image_url.trim().length > 0)
    .map((photo) => ({
      type: "image_url",
      image_url: {
        url: (photo.image_url as string).trim(),
        detail: "high" as const,
      },
    }));
};

export const sanitizeAiPayload = (raw: AiReportContent): AiReportContent => {
  const summary = Array.isArray(raw?.summary)
    ? raw.summary.map((line) => `${line}`.trim()).filter(Boolean).slice(0, 5)
    : [];

  const keyFindings: AiReportContent["keyFindings"] = Array.isArray(
    raw?.keyFindings
  )
    ? raw.keyFindings
        .map((entry) => ({
          title: `${entry?.title ?? ""}`.trim(),
          status: normalizeStatus(entry?.status),
          description: `${entry?.description ?? ""}`.trim(),
        }))
        .filter((entry) => entry.title && entry.description)
        .slice(0, 6)
    : [];

  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings.map((line) => `${line}`.trim()).filter(Boolean).slice(0, 3)
    : [];

  const actions: AiReportContent["actions"] = Array.isArray(raw?.actions)
    ? raw.actions
        .map((action) => ({
          title: `${action?.title ?? ""}`.trim(),
          description: `${action?.description ?? ""}`.trim(),
          frequency: normalizeFrequency(action?.frequency),
        }))
        .filter((item) => item.title && item.description)
        .slice(0, 3)
    : [];

  return {
    oneLiner: `${raw?.oneLiner ?? ""}`.trim(),
    summary,
    keyFindings,
    ageComparison: {
      percentile: clampPercent(raw?.ageComparison?.percentile),
      statement: `${raw?.ageComparison?.statement ?? ""}`.trim(),
    },
    focus: {
      topic: normalizeFocus(raw?.focus?.topic),
      reason: `${raw?.focus?.reason ?? ""}`.trim(),
    },
    actions,
    warnings,
  };
};

const normalizeStatus = (value?: string | null): AiKeyFindingStatus => {
  switch ((value ?? "").toLowerCase()) {
    case "good":
    case "positive":
      return "good";
    case "caution":
    case "warning":
      return "caution";
    default:
      return "neutral";
  }
};

const normalizeFocus = (value?: string | null): AiFocusTopic => {
  switch ((value ?? "").toLowerCase()) {
    case "elasticity":
    case "firmness":
      return "elasticity";
    case "wrinkle":
    case "wrinkles":
      return "wrinkle";
    case "radiance":
    case "glow":
    case "tone":
      return "radiance";
    case "trouble":
    case "troubles":
    case "blemish":
    case "acne":
      return "trouble";
    default:
      return "hydration";
  }
};

const normalizeFrequency = (
  value?: string | null
): AiActionFrequency => {
  switch ((value ?? "").toLowerCase()) {
    case "weekly":
    case "once_a_week":
      return "weekly";
    case "three_per_week":
    case "3_per_week":
    case "three-times-per-week":
      return "three_per_week";
    default:
      return "daily";
  }
};

const clampPercent = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 50;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

export type { NeedEntry, ReportItem };
