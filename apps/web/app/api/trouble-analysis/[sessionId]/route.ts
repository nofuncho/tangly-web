import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { sanitizeAiPayload, type AiReportContent } from "@/lib/ai-report";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL =
  process.env.OPENAI_MODEL ?? process.env.OPENAI_RESPONSE_MODEL ?? "gpt-4o-mini";
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL ??
  process.env.OPENAI_API_URL ??
  "https://api.openai.com/v1/chat/completions";

type PhotoRow = {
  id: string;
  shot_type?: string | null;
  focus_area?: string | null;
  image_url?: string | null;
  created_at?: string | null;
};

const resolveParams = async <T>(params: T | Promise<T>): Promise<T> => {
  if (typeof (params as Promise<T>)?.then === "function") {
    return params as Promise<T>;
  }
  return params as T;
};

export async function GET(
  _req: Request,
  context: { params: { sessionId?: string } | Promise<{ sessionId?: string }> }
) {
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !OPENAI_API_KEY ||
    !OPENAI_MODEL
  ) {
    return NextResponse.json(
      { error: "Server configuration is missing." },
      { status: 500 }
    );
  }

  const resolvedParams = await resolveParams(context.params);
  const sessionId = resolvedParams?.sessionId;
  if (!sessionId) {
    return NextResponse.json({ error: "Session id is required" }, { status: 400 });
  }

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

  const { data: photos, error: photoError } = await supabase
    .from("photos")
    .select("id, shot_type, focus_area, image_url, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (photoError) {
    return NextResponse.json({ error: photoError.message }, { status: 500 });
  }

  const troublePhotos = (photos ?? []).filter((photo) =>
    (photo.shot_type ?? "").toLowerCase().includes("trouble")
  );
  if (!troublePhotos.length) {
    return NextResponse.json(
      { error: "Trouble photos are required for analysis." },
      { status: 400 }
    );
  }

  try {
    const aiPayload = await requestTroubleAnalysis({
      photos: troublePhotos,
      sessionId,
      capturedAt: session.created_at ?? null,
    });

    const { error: upsertError } = await supabase
      .from("ai_reports")
      .upsert(
        {
          session_id: sessionId,
          payload: aiPayload,
          provider: "openai",
          model: OPENAI_MODEL,
        },
        { onConflict: "session_id" }
      );
    if (upsertError) {
      console.warn("Failed to cache trouble AI report", upsertError);
    }

    return NextResponse.json({ status: "ready", payload: aiPayload });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to analyze trouble photos.";
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

const requestTroubleAnalysis = async ({
  photos,
  sessionId,
  capturedAt,
}: {
  photos: PhotoRow[];
  sessionId: string;
  capturedAt: string | null;
}): Promise<AiReportContent> => {
  const referenced = photos.map((photo, index) => ({
    ...photo,
    reference: `PHOTO_${index + 1}`,
  }));
  const textPayload = JSON.stringify(
    {
      purpose:
        "여드름, 잡티, 홍조 등을 포함한 국소 트러블을 식별하고 관리법을 제안해주세요.",
      instructions: {
        tone:
          "피부과 전문 코치처럼 차분하고 현실적인 표현을 사용하세요. 의학적 확진 표현은 피합니다.",
        requirements: [
          "각 reference마다 무엇이 보이는지 짧게 언급하세요. 가급적 keyFindings 설명에 reference 코드를 명시하세요.",
          "keyFindings는 최소 2개, status는 good|neutral|caution 중 선택하세요.",
          "actions는 최소 2개 작성하고, 실행 빈도(frequency)는 daily|weekly|three_per_week 중 하나로 지정하세요.",
          "summary는 bullet 느낌의 짧은 문장 2-4개로 작성합니다.",
        ],
      },
      session: {
        id: sessionId,
        capturedAt,
      },
      photoShots: referenced.map((photo) => ({
        reference: photo.reference,
        shotType: photo.shot_type,
        focus: photo.focus_area,
        capturedAt: photo.created_at,
        imageUrl: photo.image_url,
      })),
    },
    null,
    2
  );

  const messageContent = [
    { type: "text", text: textPayload },
    ...referenced
      .filter(
        (photo) =>
          typeof photo.image_url === "string" && photo.image_url.trim().length > 0
      )
      .map((photo) => ({
        type: "image_url" as const,
        image_url: { url: (photo.image_url as string).trim(), detail: "high" as const },
      })),
  ];

  const schema = {
    name: "TroubleAiReport",
    schema: {
      type: "object",
      properties: {
        oneLiner: { type: "string" },
        summary: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 4,
        },
        keyFindings: {
          type: "array",
          minItems: 2,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              status: {
                type: "string",
                enum: ["good", "neutral", "caution"],
              },
              description: { type: "string" },
            },
            required: ["title", "status", "description"],
            additionalProperties: true,
          },
        },
        ageComparison: {
          type: "object",
          properties: {
            percentile: { type: "number" },
            statement: { type: "string" },
          },
          required: ["percentile", "statement"],
        },
        focus: {
          type: "object",
          properties: {
            topic: {
              type: "string",
              enum: ["hydration", "elasticity", "wrinkle", "radiance", "trouble"],
            },
            reason: { type: "string" },
          },
          required: ["topic", "reason"],
        },
        actions: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              frequency: {
                type: "string",
                enum: ["daily", "weekly", "three_per_week"],
              },
            },
            required: ["title", "description", "frequency"],
          },
        },
        warnings: {
          type: "array",
          items: { type: "string" },
          maxItems: 3,
        },
      },
      required: [
        "oneLiner",
        "summary",
        "keyFindings",
        "ageComparison",
        "focus",
        "actions",
        "warnings",
      ],
      additionalProperties: true,
    },
  };

  const body = {
    model: OPENAI_MODEL,
    response_format: { type: "json_schema", json_schema: schema },
    messages: [
      {
        role: "system",
        content:
          "당신은 피부 트러블을 분석하는 뷰티 코치입니다. 응답은 반드시 JSON으로 반환하고, 위험한 의학적 표현은 피하세요.",
      },
      {
        role: "user",
        content: messageContent,
      },
    ],
  };

  const response = await fetch(OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "OpenAI API error");
  }

  const raw = await response.json();
  const rawContent =
    raw?.choices?.[0]?.message?.content ??
    raw?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!rawContent || typeof rawContent !== "string") {
    throw new Error("AI 응답 형식을 해석할 수 없습니다.");
  }
  let parsed: AiReportContent;
  try {
    parsed = JSON.parse(rawContent) as AiReportContent;
  } catch {
    throw new Error("AI JSON 응답 파싱에 실패했습니다.");
  }
  return sanitizeAiPayload(parsed);
};
