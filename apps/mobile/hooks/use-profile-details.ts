import { usePathname, useRouter } from "expo-router";
import { useEffect } from "react";

import { useProfileDetailsContext } from "@/contexts/profile-details-context";

export const useProfileDetails = () => {
  return useProfileDetailsContext();
};

export const useRequireProfileDetails = () => {
  const router = useRouter();
  const pathname = usePathname();
  const ctx = useProfileDetailsContext();
  const isOnboardingRoute = pathname?.startsWith("/onboarding");
  const isAuthRoute = pathname?.startsWith("/auth");

  useEffect(() => {
    if (!ctx.loading && ctx.userId && !ctx.completed && !isOnboardingRoute && !isAuthRoute) {
      router.replace("/onboarding/details");
    }
  }, [ctx.loading, ctx.completed, ctx.userId, isOnboardingRoute, isAuthRoute, router]);

  return ctx;
};
