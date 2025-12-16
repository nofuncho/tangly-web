import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

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

