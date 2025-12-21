import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import {
  parseProfileDetails,
  isProfileDetailsComplete,
  type ProfileDetails,
} from "@/lib/profile-details";

type ProfileDetailsState = {
  loading: boolean;
  userId: string | null;
  details: ProfileDetails | null;
  completed: boolean;
};

type ProfileDetailsContextValue = ProfileDetailsState & {
  refresh: () => Promise<void>;
  setDetails: (next: ProfileDetails) => void;
};

const defaultState: ProfileDetailsState = {
  loading: true,
  userId: null,
  details: null,
  completed: false,
};

const ProfileDetailsContext = createContext<ProfileDetailsContextValue | null>(null);

export const ProfileDetailsProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<ProfileDetailsState>(defaultState);

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true }));
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState({ loading: false, userId: null, details: null, completed: false });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("metadata")
        .eq("id", user.id)
        .maybeSingle<{ metadata: Record<string, unknown> | null }>();
      const details = parseProfileDetails(profile?.metadata ?? user.user_metadata ?? {});
      const completed = isProfileDetailsComplete(details);
      setState({
        loading: false,
        userId: user.id,
        details,
        completed,
      });
    } catch (error) {
      console.warn("profile details refresh error", error);
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const kickoff = setTimeout(() => {
      if (mounted) {
        void refresh();
      }
    }, 0);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session) {
        void refresh();
      } else {
        setState({ loading: false, userId: null, details: null, completed: false });
      }
    });
    return () => {
      mounted = false;
      clearTimeout(kickoff);
      subscription.unsubscribe();
    };
  }, [refresh]);

  const setDetails = useCallback((next: ProfileDetails) => {
    setState((prev) => ({
      ...prev,
      details: next,
      completed: isProfileDetailsComplete(next),
    }));
  }, []);

  return (
    <ProfileDetailsContext.Provider value={{ ...state, refresh, setDetails }}>
      {children}
    </ProfileDetailsContext.Provider>
  );
};

export const useProfileDetailsContext = () => {
  const ctx = useContext(ProfileDetailsContext);
  if (!ctx) {
    throw new Error("ProfileDetailsContext is not available");
  }
  return ctx;
};
