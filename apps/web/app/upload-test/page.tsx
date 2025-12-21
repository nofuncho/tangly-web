"use client";

import Image from "next/image";
import { useState } from "react";

type UploadState = "idle" | "uploading" | "success" | "error";

export default function UploadTest() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadState>("idle");
  const [message, setMessage] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setStatus("error");
      setMessage("업로드할 파일을 선택하세요.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setStatus("uploading");
      setMessage("업로드 중...");
      setUploadedUrl("");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "업로드 실패");
      }

      setStatus("success");
      setMessage("업로드 완료!");
      setUploadedUrl(result.publicUrl || "");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류");
    }
  };

  return (
    <div className="min-h-screen bg-pearl p-8">
      <div className="max-w-xl mx-auto bg-white shadow-glow p-8 rounded-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-lilac-dark">스토리지 업로드 테스트</h1>
          <p className="text-gray-500 mt-2">Supabase Storage 업로드 상태를 확인합니다.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-gray-700 font-medium">이미지 파일</label>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="mt-2 block w-full rounded border border-gray-200 px-3 py-2"
            />
          </div>

          <button
            type="submit"
            disabled={status === "uploading"}
            className="w-full rounded-lg bg-lilac-dark px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {status === "uploading" ? "업로드 중..." : "업로드"}
          </button>
        </form>

        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              status === "success"
                ? "bg-green-100 text-green-700"
                : status === "error"
                  ? "bg-red-100 text-red-700"
                  : "bg-lilac-light text-lilac-dark"
            }`}
          >
            {message}
          </div>
        )}

        {uploadedUrl && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-600">Public URL</p>
            <a
              href={uploadedUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm text-blue-600 underline"
            >
              {uploadedUrl}
            </a>
            <div className="relative mt-3 w-full">
              <Image
                src={uploadedUrl}
                alt="업로드된 이미지 미리보기"
                width={800}
                height={800}
                sizes="(max-width: 640px) 100vw, 640px"
                unoptimized
                className="max-h-80 w-full rounded-lg object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
