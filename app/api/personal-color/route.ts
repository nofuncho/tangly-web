import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photos";

type PersonalColorPayload = {
  sessionLabel?: string;
  summary?: string;
  highlight?: string;
  items?: unknown;
  tips?: unknown;
  needs?: unknown;
  recommendations?: unknown;
  extras?: unknown;
};

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const payloadRaw = formData.get("payload");
    const inputsRaw = formData.get("inputs");
    const labelRaw = formData.get("session_label");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
    }

    const payload: PersonalColorPayload | null =
      typeof payloadRaw === "string" ? safeJsonParse(payloadRaw) : null;
    const inputs = typeof inputsRaw === "string" ? safeJsonParse(inputsRaw) : null;
    const sessionLabel =
      (typeof labelRaw === "string" && labelRaw.trim()) ||
      payload?.sessionLabel ||
      `퍼스널컬러-${Date.now()}`;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `personal-color/${Date.now()}-${file.name || "result"}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadError) {
      console.error("personal-color upload error", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(uploadData.path);
    const publicUrl = publicUrlData.publicUrl;

    const insertPayload = {
      id: randomUUID(),
      session_label: sessionLabel,
      thumbnail_url: publicUrl,
      result_summary: payload?.summary ?? "퍼스널 컬러 요약",
      result_headline: payload?.highlight ?? "퍼스널 컬러 결과",
      payload,
      inputs,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("personal_color_reports")
      .insert(insertPayload)
      .select("id, created_at, thumbnail_url")
      .single();

    if (insertError) {
      console.error("personal-color insert error", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      id: inserted.id,
      createdAt: inserted.created_at,
      thumbnail: inserted.thumbnail_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    console.error("personal-color route error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const safeJsonParse = (input: string) => {
  try {
    return JSON.parse(input);
  } catch (error) {
    console.warn("Failed to parse personal-color payload", error);
    return null;
  }
};
