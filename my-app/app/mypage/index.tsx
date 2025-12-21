import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { useProfileDetails } from "@/hooks/use-profile-details";
import { concernToFriendlyLabel, pickPrimaryConcern } from "@/lib/profile-details";

type PlanType = "free" | "pro";

type QuickAction = {
  key: string;
  label: string;
  icon: string;
};

type PurchaseItem = QuickAction;

type ActivityRowProps = {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  disabled?: boolean;
};

const QUICK_ACTIONS: QuickAction[] = [
  { key: "coupon", label: "쿠폰함", icon: "🎫" },
  { key: "giftbox", label: "선물함", icon: "🎁" },
];

const PURCHASE_ITEMS: PurchaseItem[] = [
  { key: "gift", label: "선물하기", icon: "🎁" },
  { key: "market", label: "마켓", icon: "🏬" },
  { key: "order", label: "해피오더", icon: "😊" },
];

export default function MyPageScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [planType, setPlanType] = useState<PlanType>("free");
  const [planSaving, setPlanSaving] = useState(false);
  const [planLoading, setPlanLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("Tangly 회원");
  const [avatarInitial, setAvatarInitial] = useState("T");
  const { details } = useProfileDetails();

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
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
        if (!active) return;
        setUserId(user.id);
        const displayName =
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          (user.user_metadata?.name as string | undefined)?.trim() ||
          user.email ||
          "Tangly 회원";
        setProfileName(displayName);
        const initial = displayName.trim().charAt(0).toUpperCase();
        setAvatarInitial(initial || "T");

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

    loadProfile();
    return () => {
      active = false;
    };
  }, []);

  const primaryConcern = useMemo(
    () => pickPrimaryConcern(details?.concerns ?? []),
    [details?.concerns]
  );

  const profileTagline = useMemo(() => {
    if (primaryConcern) {
      const friendly = concernToFriendlyLabel(primaryConcern) ?? primaryConcern;
      return `${friendly} 케어에 집중하고 있어요`;
    }
    return "AI 리포트와 루틴을 준비 중이에요.";
  }, [primaryConcern]);

  const handlePlaceholderPress = (label: string) => {
    Alert.alert("준비 중이에요", `${label} 기능은 곧 만나볼 수 있어요.`);
  };

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

  const handlePlanOptions = () => {
    if (planLoading || planSaving) return;
    Alert.alert("AI 리포트 플랜", "사용할 모드를 선택해 주세요.", [
      { text: "일반 모드", onPress: () => handlePlanChange("free") },
      { text: "PRO 모드", onPress: () => handlePlanChange("pro") },
      { text: "닫기", style: "cancel" },
    ]);
  };

  const handleEditProfile = () => {
    router.push("/onboarding/details?mode=edit");
  };

  const tierLabel = planLoading ? "불러오는 중" : planType === "pro" ? "PRO Member" : "Friend";
  const tierBadge = planLoading ? "..." : planType.toUpperCase();
  const pointLabel = planType === "pro" ? "∞ AI" : "1,010 P";

  const genderLabel = mapGenderLabel(details?.gender);
  const ageLabel = details?.ageRange ? `${details.ageRange}세` : "미입력";
  const concernLabel = details?.concerns?.length
    ? details.concerns.map((key) => concernToFriendlyLabel(key) ?? key).join(", ")
    : "미입력";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarInitial}>{avatarInitial}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{profileName}</Text>
            <Text style={styles.profileTagline}>{profileTagline}</Text>
          </View>
        </View>

        <View style={styles.tierCard}>
          <View>
            <View style={styles.tierLabelRow}>
              <Text style={styles.tierBadge}>{tierBadge}</Text>
              <Text style={styles.tierLabel}>{tierLabel}</Text>
            </View>
            <Text style={styles.tierHelper}>Tangly와 함께 즐겁게 루틴 만들기</Text>
          </View>
          <Text style={styles.pointValue}>{pointLabel}</Text>
        </View>

        <View style={styles.quickRow}>
          {QUICK_ACTIONS.map((action) => (
            <QuickActionButton
              key={action.key}
              icon={action.icon}
              label={action.label}
              onPress={() => handlePlaceholderPress(action.label)}
            />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>나의 구매 내역</Text>
          <View style={styles.purchaseRow}>
            {PURCHASE_ITEMS.map((item) => (
              <PurchaseButton
                key={item.key}
                icon={item.icon}
                label={item.label}
                onPress={() => handlePlaceholderPress(item.label)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>나의 활동</Text>
          <View style={styles.activityCard}>
            <ActivityRow
              icon="✨"
              label="PRO 모드 설정"
              value={planLoading ? "..." : planType === "pro" ? "PRO" : "FREE"}
              onPress={handlePlanOptions}
              disabled={planLoading || planSaving}
            />
            <ActivityRow
              icon="🧴"
              label="피부 정보 편집"
              value="정보 수정"
              onPress={handleEditProfile}
            />
            <ActivityRow
              icon="↪"
              label={signingOut ? "로그아웃 중..." : "로그아웃"}
              onPress={handleSignOut}
              disabled={signingOut}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>내 피부 정보</Text>
          <View style={styles.infoCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>성별</Text>
              <Text style={styles.detailValue}>{genderLabel}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>연령대</Text>
              <Text style={styles.detailValue}>{ageLabel}</Text>
            </View>
            <View style={[styles.detailRow, styles.detailRowStack]}>
              <Text style={styles.detailLabel}>피부 고민</Text>
              <Text style={[styles.detailValue, styles.detailValueMulti]}>{concernLabel}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const QuickActionButton = ({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) => {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <Text style={styles.quickActionIcon}>{icon}</Text>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
};

const PurchaseButton = ({ icon, label, onPress }: PurchaseItem & { onPress: () => void }) => {
  return (
    <Pressable style={styles.purchaseButton} onPress={onPress}>
      <Text style={styles.purchaseIcon}>{icon}</Text>
      <Text style={styles.purchaseLabel}>{label}</Text>
    </Pressable>
  );
};

const ActivityRow = ({ icon, label, value, onPress, disabled }: ActivityRowProps) => {
  return (
    <Pressable
      style={[styles.activityRow, disabled && styles.activityRowDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.activityLeft}>
        <Text style={styles.activityIcon}>{icon}</Text>
        <Text style={styles.activityLabel}>{label}</Text>
      </View>
      <View style={styles.activityRight}>
        {value ? <Text style={styles.activityValue}>{value}</Text> : null}
        <Text style={styles.activityArrow}>›</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F6FB",
  },
  container: {
    padding: 20,
    gap: 20,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 20,
    shadowColor: "#2C1C4C",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    gap: 18,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#FFE2B4",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 32,
    fontWeight: "700",
    color: "#8A5A00",
  },
  profileText: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F1F24",
  },
  profileTagline: {
    fontSize: 14,
    color: "#6F6F73",
  },
  tierCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 20,
    alignItems: "center",
    shadowColor: "#2C1C4C",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  tierLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FFEBD1",
    color: "#A35C00",
    fontWeight: "700",
  },
  tierLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F1F24",
  },
  tierHelper: {
    marginTop: 4,
    fontSize: 13,
    color: "#77727F",
  },
  pointValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#A884CC",
  },
  quickRow: {
    flexDirection: "row",
    gap: 12,
  },
  quickAction: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    alignItems: "center",
    gap: 6,
    shadowColor: "#2C1C4C",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  quickActionIcon: {
    fontSize: 22,
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F1F24",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1F1F24",
  },
  purchaseRow: {
    flexDirection: "row",
    gap: 12,
  },
  purchaseButton: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    paddingVertical: 18,
    alignItems: "center",
    gap: 8,
    shadowColor: "#2C1C4C",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  purchaseIcon: {
    fontSize: 22,
  },
  purchaseLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F1F24",
  },
  activityCard: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#EFE8F6",
  },
  activityRowDisabled: {
    opacity: 0.5,
  },
  activityLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activityIcon: {
    fontSize: 18,
  },
  activityLabel: {
    fontSize: 15,
    color: "#1F1F24",
  },
  activityRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activityValue: {
    fontSize: 13,
    color: "#7A7483",
  },
  activityArrow: {
    fontSize: 18,
    color: "#B9B5C5",
  },
  infoCard: {
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    padding: 18,
    gap: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  detailRowStack: {
    alignItems: "flex-start",
  },
  detailLabel: {
    fontSize: 14,
    color: "#7A7483",
    width: 80,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F1F24",
    flex: 1,
    textAlign: "right",
  },
  detailValueMulti: {
    textAlign: "left",
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
