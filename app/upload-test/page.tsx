"use client";

export default function UploadTest() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Upload Test Page</h1>
      <form action="/api/upload" method="POST" encType="multipart/form-data">
        <input type="file" name="file" />
        <button type="submit" className="bg-purple-500 text-white px-4 py-2 rounded">
          Upload
        </button>
      </form>
    </div>
  );
}
