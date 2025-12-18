import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import type { ProfileDetails } from "@/lib/profile-details";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase 환경변수가 설정되지 않았습니다.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const upsertProfile = async ({
  userId,
  displayName,
  photoUrl,
}: {
  userId?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
}) => {
  if (!userId) return;
  const payload: Record<string, unknown> = {
    id: userId,
    last_login_at: new Date().toISOString(),
  };
  if (displayName) {
    payload.display_name = displayName;
  }
  if (photoUrl) {
    payload.photo_url = photoUrl;
  }

  await supabase.from("profiles").upsert(payload, { onConflict: "id" });
};

type SaveProfileDetailsInput = {
  userId?: string | null;
  gender: string;
  ageRange: string;
  concerns: string[];
  birthYear?: number | null;
};

export const saveProfileDetails = async ({
  userId,
  gender,
  ageRange,
  concerns,
  birthYear,
}: SaveProfileDetailsInput): Promise<ProfileDetails> => {
  if (!userId) {
    throw new Error("로그인을 확인해주세요.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("metadata")
    .eq("id", userId)
    .maybeSingle<{ metadata: Record<string, unknown> | null }>();

  const metadata = (profile?.metadata ?? {}) as Record<string, unknown>;
  const details: ProfileDetails = {
    gender,
    ageRange,
    concerns,
    birthYear: birthYear ?? null,
    completedAt: new Date().toISOString(),
  };
  const nextMetadata = {
    ...metadata,
    profileDetails: details,
  };

  const { error } = await supabase.from("profiles").update({ metadata: nextMetadata }).eq("id", userId);
  if (error) {
    throw error;
  }

  return details;
};
