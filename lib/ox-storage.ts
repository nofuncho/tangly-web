import type { SupabaseClient } from "@supabase/supabase-js";

import type { OxResponseRow } from "@/lib/recommendations";

export const PROFILE_OX_TABLE = "profile_ox_records";

export type ProfileOxRow = {
  user_id: string;
  question_key: string;
  answer: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export const buildProfileOxMap = (rows: ProfileOxRow[]) => {
  const map = new Map<string, ProfileOxRow[]>();
  rows.forEach((row) => {
    if (!row?.user_id) return;
    const bucket = map.get(row.user_id) ?? [];
    bucket.push(row);
    map.set(row.user_id, bucket);
  });
  return map;
};

export const profileRowsToResponses = (
  rows: ProfileOxRow[],
  sessionId?: string
): OxResponseRow[] => {
  return rows.map((row) => ({
    session_id: sessionId ?? null,
    user_id: row.user_id,
    question_key: row.question_key,
    answer: row.answer,
    created_at: row.updated_at ?? row.created_at ?? null,
  }));
};

export const mergeSessionAndProfileOx = (
  sessionRows: OxResponseRow[],
  profileRows: ProfileOxRow[],
  options?: { sessionId?: string }
): OxResponseRow[] => {
  const merged = new Map<string, OxResponseRow>();

  profileRowsToResponses(profileRows, options?.sessionId).forEach((row) => {
    merged.set(row.question_key, row);
  });

  sessionRows.forEach((row) => {
    merged.set(row.question_key, row);
  });

  return Array.from(merged.values());
};

export const fetchProfileOxRows = async (
  supabase: SupabaseClient,
  userIds: string[]
): Promise<ProfileOxRow[]> => {
  if (!userIds.length) return [];
  const { data, error } = await supabase
    .from(PROFILE_OX_TABLE)
    .select("user_id, question_key, answer, created_at, updated_at")
    .in("user_id", userIds);
  if (error) {
    console.warn("profile_ox_records select error", error);
    return [];
  }
  return (data ?? []) as ProfileOxRow[];
};

export const fetchProfileOxForUser = async (
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileOxRow[]> => {
  if (!userId) return [];
  const { data, error } = await supabase
    .from(PROFILE_OX_TABLE)
    .select("user_id, question_key, answer, created_at, updated_at")
    .eq("user_id", userId);
  if (error) {
    console.warn("profile_ox_records fetch error", error);
    return [];
  }
  return (data ?? []) as ProfileOxRow[];
};
