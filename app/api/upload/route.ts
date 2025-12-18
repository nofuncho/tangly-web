import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "photos";

export async function POST(req: Request) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 500 }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Invalid content type" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const shotTypeRaw = formData.get("shot_type");
    const focusAreaRaw = formData.get("focus_area");
    const sessionIdRaw = formData.get("session_id");
    const userIdRaw = formData.get("user_id");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    if (typeof sessionIdRaw !== "string" || sessionIdRaw.trim().length === 0) {
      return NextResponse.json(
        { error: "session_id is required" },
        { status: 400 }
      );
    }

    if (typeof shotTypeRaw !== "string") {
      return NextResponse.json(
        { error: "shot_type is required" },
        { status: 400 }
      );
    }

    const shotType = shotTypeRaw.toLowerCase();
    const validShotTypes = ["base", "cheek", "eye_open", "eye_closed"];
    if (!validShotTypes.includes(shotType)) {
      return NextResponse.json(
        { error: "Invalid shot_type" },
        { status: 400 }
      );
    }

    const focusArea =
      typeof focusAreaRaw === "string" && focusAreaRaw.trim().length > 0
        ? focusAreaRaw.toLowerCase()
        : null;
    const sessionId = sessionIdRaw.trim();
    const userId =
      typeof userIdRaw === "string" && userIdRaw.trim().length > 0 ? userIdRaw.trim() : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${Date.now()}-${file.name || "upload"}`;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: sessionRow } = await supabase
      .from("analysis_sessions")
      .select("user_id")
      .eq("id", sessionId)
      .maybeSingle<{ user_id: string | null }>();

    const derivedUserId = sessionRow?.user_id ?? userId ?? null;

    if (!sessionRow?.user_id && userId) {
      const { error: sessionUpdateError } = await supabase
        .from("analysis_sessions")
        .update({ user_id: userId })
        .eq("id", sessionId);
      if (sessionUpdateError) {
        console.warn("Failed to backfill session user_id", sessionUpdateError);
      }
    }

    /* 1️⃣ Storage 업로드 */
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, buffer, {
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    }

    /* 2️⃣ Public URL 생성 */
    const { data: publicUrlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(uploadData.path);

    const publicUrl = publicUrlData.publicUrl;

    /* 3️⃣ photos 테이블 insert (⭐ 핵심 수정 ⭐) */
    const { data: insertedRow, error: insertError } = await supabase
      .from("photos")
      .insert({
        id: randomUUID(),
        session_id: sessionId,
        user_id: derivedUserId,
        image_path: uploadData.path,
        image_url: publicUrl,
        source: "upload_api",
        shot_type: shotType,
        focus_area: focusArea,
      })
      .select()
      .single();

    if (insertError) {
      console.error("DB insert error:", insertError);
      return NextResponse.json(
        { error: insertError.message || "Uploaded but DB insert failed" },
        { status: 500 }
      );
    }

    /* 4️⃣ 성공 응답 */
    return NextResponse.json({
      success: true,
      photo: insertedRow,
      publicUrl,
    });
  } catch (error) {
    console.error("Upload handler error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
