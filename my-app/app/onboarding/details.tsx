import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { saveProfileDetails } from "@/lib/supabase";
import { useProfileDetails } from "@/hooks/use-profile-details";
import type { ProfileGender } from "@/lib/profile-details";

const GENDER_OPTIONS: { key: ProfileGender; label: string }[] = [
  { key: "female", label: "여성" },
  { key: "male", label: "남성" },
  { key: "unspecified", label: "선택하지 않음" },
];

const AGE_OPTIONS = ["40-44", "45-49", "50-54", "55-59", "60+"];

const CONCERN_OPTIONS: { key: string; label: string }[] = [
  { key: "wrinkle", label: "주름" },
  { key: "elasticity", label: "탄력 저하" },
  { key: "sagging", label: "처짐(리프팅)" },
  { key: "dryness", label: "건조함" },
  { key: "inner_dryness", label: "속건조(당김)" },
  { key: "pores", label: "모공" },
  { key: "texture", label: "피부결(거칠음)" },
  { key: "dullness", label: "칙칙함" },
  { key: "radiance", label: "광채 부족" },
  { key: "spots", label: "기미/잡티" },
  { key: "pigmentation", label: "색소침착" },
  { key: "redness", label: "홍조" },
  { key: "sensitivity", label: "민감/자극" },
  { key: "trouble", label: "트러블" },
  { key: "sebum", label: "피지/번들거림" },
  { key: "blackhead", label: "블랙헤드/화이트헤드" },
  { key: "eye_wrinkle", label: "아이 주름" },
  { key: "unknown", label: "잘 모르겠어요" },
];

const MAX_CONCERNS = 5;

export default function ProfileDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const editMode = params.mode === "edit";
  const { loading, userId, details, setDetails } = useProfileDetails();

  const [gender, setGender] = useState<ProfileGender>(details?.gender ?? null);
  const [ageRange, setAgeRange] = useState<string | null>(details?.ageRange ?? null);
  const [concerns, setConcerns] = useState<string[]>(details?.concerns ?? []);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (editMode) {
        return () => {};
      }
      const handleBack = () => {
        Alert.alert(
          "잠깐만요",
          "정확한 리포트와 루틴을 위해 30초만 입력해 주세요.",
          [{ text: "계속 입력하기", style: "cancel" }]
        );
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", handleBack);
      return () => subscription.remove();
    }, [editMode])
  );

  const toggleConcern = (key: string) => {
    setConcerns((prev) => {
      const exists = prev.includes(key);
      if (key === "unknown") {
        return exists ? [] : ["unknown"];
      }
      if (exists) {
        return prev.filter((item) => item !== key);
      }
      const filtered = prev.filter((item) => item !== "unknown");
      if (filtered.length >= MAX_CONCERNS) {
        Alert.alert("알림", `최대 ${MAX_CONCERNS}개까지 선택할 수 있어요.`);
        return filtered;
      }
      return [...filtered, key];
    });
  };

  const ready =
    Boolean(gender) &&
    Boolean(ageRange) &&
    (concerns.length > 0 || concerns.includes("unknown"));

  const concernsLabel = useMemo(() => {
    if (!concerns.length) {
      return "최소 1개 이상 선택해 주세요 (최대 5개)";
    }
    if (concerns.includes("unknown")) {
      return "추천받기를 선택했어요. AI가 우선 순위를 잡아드릴게요.";
    }
    return `${concerns.length}개 선택 (최대 ${MAX_CONCERNS}개)`;
  }, [concerns]);

  const handleSubmit = async () => {
    if (!ready || !gender || !ageRange) {
      return;
    }
    try {
      setSaving(true);
      const normalizedConcerns = concerns.length ? concerns : ["unknown"];
      const saved = await saveProfileDetails({
        userId,
        gender,
        ageRange,
        concerns: normalizedConcerns,
      });
      setDetails(saved);
      const nextRoute = editMode ? "/mypage" : "/";
      Alert.alert("입력 완료", "이제 개인화된 리포트와 루틴을 준비해 드릴게요.", [
        {
          text: "시작하기",
          onPress: () => router.replace(nextRoute),
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "정보를 저장하지 못했습니다.";
      Alert.alert("저장 실패", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#A884CC" />
          <Text style={styles.stateText}>정보를 불러오는 중입니다...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>내 피부에 맞게 시작하기</Text>
        <Text style={styles.subtitle}>정확한 리포트와 루틴 추천을 위해 3가지만 알려주세요.</Text>
        <Text style={styles.helper}>나중에 마이페이지에서 언제든 변경할 수 있어요.</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>성별</Text>
          <View style={styles.optionRow}>
            {GENDER_OPTIONS.map((option) => {
              const active = gender === option.key;
              return (
                <Pressable
                  key={option.key ?? "none"}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  onPress={() => setGender(option.key)}
                >
                  <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>연령대</Text>
          <View style={styles.optionRow}>
            {AGE_OPTIONS.map((option) => {
              const active = ageRange === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.optionChip, active && styles.optionChipActive]}
                  onPress={() => setAgeRange(option)}
                >
                  <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                    {option}세
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>현재 피부 고민</Text>
            <Text style={styles.concernHelper}>{concernsLabel}</Text>
          </View>
          <View style={styles.concernGrid}>
            {CONCERN_OPTIONS.map((option) => {
              const selected = concerns.includes(option.key);
              return (
                <Pressable
                  key={option.key}
                  style={[styles.concernChip, selected && styles.concernChipActive]}
                  onPress={() => toggleConcern(option.key)}
                >
                  <Text style={[styles.concernText, selected && styles.concernTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.submitButton, (!ready || saving) && styles.submitDisabled]}
          disabled={!ready || saving}
          onPress={handleSubmit}
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>시작하기</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9F6FF",
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    gap: 20,
  },
  title: {
    marginTop: 20,
    fontSize: 26,
    fontWeight: "700",
    color: "#1F1F24",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: "#6D6D74",
  },
  helper: {
    fontSize: 13,
    color: "#8E7FAF",
  },
  section: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    gap: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3D8F5",
    backgroundColor: "#FFFFFF",
  },
  optionChipActive: {
    borderColor: "#6E4AC9",
    backgroundColor: "#F0E9FF",
  },
  optionChipText: {
    fontSize: 14,
    color: "#554D68",
    fontWeight: "500",
  },
  optionChipTextActive: {
    color: "#3D2B7A",
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  concernHelper: {
    fontSize: 12,
    color: "#8C7FAE",
  },
  concernGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  concernChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E6E0F0",
  },
  concernChipActive: {
    borderColor: "#1F1F24",
    backgroundColor: "#1F1F24",
  },
  concernText: {
    fontSize: 13,
    color: "#514C5F",
  },
  concernTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    backgroundColor: "#F9F6FF",
    borderTopWidth: 1,
    borderTopColor: "#E8E0F7",
  },
  submitButton: {
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#1F1F24",
  },
  submitDisabled: {
    backgroundColor: "#D1CED8",
  },
  submitText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  stateText: {
    fontSize: 14,
    color: "#6F6F73",
  },
});
