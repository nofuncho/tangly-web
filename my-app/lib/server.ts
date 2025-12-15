const uploadApiUrl = process.env.EXPO_PUBLIC_UPLOAD_API_URL ?? "";

const computeServerBase = () => {
  const fromEnv = process.env.EXPO_PUBLIC_SERVER_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/?$/, "");
  }
  if (uploadApiUrl) {
    try {
      const parsed = new URL(uploadApiUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return "";
    }
  }
  return "";
};

export const UPLOAD_API_URL = uploadApiUrl;
export const SERVER_BASE_URL = computeServerBase();

export const buildServerUrl = (path: string) => {
  if (!SERVER_BASE_URL) {
    return "";
  }
  if (!path) {
    return SERVER_BASE_URL;
  }
  return `${SERVER_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
};
