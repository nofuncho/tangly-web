import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { useProfileDetails } from "@/hooks/use-profile-details";
import { concernToFriendlyLabel } from "@/lib/profile-details";

type PlanType = "free" | "pro";

export default function MyPageScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [planType, setPlanType] = useState<PlanType>("free");
  const [planSaving, setPlanSaving] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const { details } = useProfileDetails();

  useEffect(() => {
    let active = true;
    const loadPlan = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (active) {
            setPlanLoading(false);
          }
          return;
        }
        setUserId(user.id);
        const { data } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", user.id)
          .maybeSingle<{ plan_type: string | null }>();
        if (!active) return;
        const planLabel =
          (data?.plan_type ?? (user.user_metadata?.plan_type as string | null) ?? "")
            .toString()
            .toLowerCase();
        setPlanType(planLabel === "pro" ? "pro" : "free");
      } catch (error) {
        console.warn("plan fetch error", error);
      } finally {
        if (active) {
          setPlanLoading(false);
        }
      }
    };

    loadPlan();
    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      router.replace("/auth");
    } catch (err) {
      const message = err instanceof Error ? err.message : "로그아웃 중 문제가 발생했습니다.";
      Alert.alert("로그아웃 실패", message);
    } finally {
      setSigningOut(false);
    }
  };

  const handlePlanChange = async (nextPlan: PlanType) => {
    if (planType === nextPlan || planSaving) return;
    if (!userId) {
      Alert.alert("확인 필요", "로그인 정보를 불러오지 못했습니다.");
      return;
    }

    try {
      setPlanSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({ plan_type: nextPlan })
        .eq("id", userId);
      if (error) {
        throw error;
      }
      setPlanType(nextPlan);
    } catch (err) {
      const message = err instanceof Error ? err.message : "플랜을 변경하지 못했습니다.";
      Alert.alert("플랜 변경 실패", message);
    } finally {
      setPlanSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <Text style={styles.title}>마이페이지</Text>
        <Text style={styles.subtitle}>Tangly 계정과 기본 정보를 관리합니다.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>계정</Text>
          <Text style={styles.cardText}>다른 기기에서도 같은 계정으로 로그인할 수 있어요.</Text>
          <Pressable style={[styles.logoutButton, signingOut && styles.logoutDisabled]} disabled={signingOut} onPress={handleSignOut}>
            <Text style={styles.logoutText}>{signingOut ? "로그아웃 중..." : "로그아웃"}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI 리포트 플랜</Text>
          <Text style={styles.cardText}>
            현재 플랜:{" "}
            <Text style={styles.planLabel}>
              {planLoading ? "불러오는 중..." : planType === "pro" ? "PRO" : "FREE"}
            </Text>
          </Text>
          <View style={styles.planButtonRow}>
            <Pressable
              style={[
                styles.planButton,
                planType === "free" && styles.planButtonActive,
                planSaving && styles.logoutDisabled,
              ]}
              disabled={planSaving}
              onPress={() => handlePlanChange("free")}
            >
              <Text
                style={[
                  styles.planButtonText,
                  planType === "free" && styles.planButtonTextActive,
                ]}
              >
                일반 모드
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.planButton,
                planType === "pro" && styles.planButtonActive,
                planSaving && styles.logoutDisabled,
              ]}
              disabled={planSaving}
              onPress={() => handlePlanChange("pro")}
            >
              <Text
                style={[
                  styles.planButtonText,
                  planType === "pro" && styles.planButtonTextActive,
                ]}
              >
                PRO 모드
              </Text>
            </Pressable>
          </View>
          <Text style={styles.planHelpText}>
            PRO 모드를 선택하면 AI 상세 리포트 전체 섹션을 미리볼 수 있습니다.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>내 피부 정보</Text>
          <Text style={styles.cardText}>AI 리포트와 루틴이 참고하는 값이에요.</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>성별</Text>
            <Text style={styles.detailValue}>{mapGenderLabel(details?.gender)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>연령대</Text>
            <Text style={styles.detailValue}>
              {details?.ageRange ? `${details.ageRange}세` : "미입력"}
            </Text>
          </View>
          <View style={[styles.detailRow, { alignItems: "flex-start" }]}>
            <Text style={styles.detailLabel}>피부 고민</Text>
            <Text style={[styles.detailValue, { flex: 1 }]}>
              {details?.concerns?.length
                ? details.concerns.map((key) => concernToFriendlyLabel(key) ?? key).join(", ")
                : "미입력"}
            </Text>
          </View>
          <Pressable
            style={styles.editButton}
            onPress={() => router.push("/onboarding/details?mode=edit")}
          >
            <Text style={styles.editButtonText}>
              {details?.completedAt ? "정보 수정" : "지금 입력하기"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F7FB",
  },
  container: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1F1F24",
  },
  subtitle: {
    fontSize: 14,
    color: "#6D6D74",
  },
  card: {
    marginTop: 12,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  cardText: {
    fontSize: 14,
    color: "#6D6D74",
  },
  logoutButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#1F1F24",
  },
  logoutDisabled: {
    opacity: 0.6,
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  planLabel: {
    fontWeight: "700",
    color: "#5C3AA1",
  },
  planButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  planButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0D8F1",
    paddingVertical: 12,
    alignItems: "center",
  },
  planButtonActive: {
    backgroundColor: "#EFE6FF",
    borderColor: "#5C3AA1",
  },
  planButtonText: {
    fontSize: 14,
    color: "#6D6D74",
    fontWeight: "600",
  },
  planButtonTextActive: {
    color: "#5C3AA1",
  },
  planHelpText: {
    marginTop: 8,
    fontSize: 13,
    color: "#77727F",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: "#6D6D74",
    width: 80,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F1F24",
    flexShrink: 1,
    textAlign: "right",
  },
  editButton: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E3DAF3",
    paddingVertical: 12,
    alignItems: "center",
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5C3AA1",
  },
});

const mapGenderLabel = (gender?: string | null) => {
  switch (gender) {
    case "female":
      return "여성";
    case "male":
      return "남성";
    case "unspecified":
      return "선택하지 않음";
    default:
      return "미입력";
  }
};
