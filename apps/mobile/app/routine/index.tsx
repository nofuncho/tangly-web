import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { buildServerUrl } from "@/lib/server";
import { useRequireProfileDetails } from "@/hooks/use-profile-details";

type PlanType = "free" | "pro";

type RoutineAction = {
  title: string;
  description: string;
};

type RoutineTab = "weekly" | "monthly";

type RoutineStep = {
  key: string;
  label: string;
  enabled: boolean;
};

type MonthlyRoutineResponse = {
  id: string;
  periodMonth: string;
  goal: string;
  summary: string[];
  cautions: string | null;
  habits: string[];
};

type WeeklyRoutineResponse = {
  id: string;
  weekStart: string;
  weekEnd: string;
  focus: string;
  focusReason: string;
  conclusion: string;
  recommendedDays: string[];
  intensity: "gentle" | "standard" | "focus";
  optionalSteps: RoutineStep[];
  baseRoutine: string[];
  actions: RoutineAction[];
  warnings: string[];
  progress: {
    completed: number;
    target: number;
    daysChecked: string[];
  };
};

const DAY_ORDER = ["월", "화", "수", "목", "금", "토", "일"];
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export default function RoutineScreen() {
  const [planType, setPlanType] = useState<PlanType>("free");
  const [planLoading, setPlanLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const { loading: detailsChecking } = useRequireProfileDetails();
  const [activeTab, setActiveTab] = useState<RoutineTab>("monthly");

  const [monthlyRoutine, setMonthlyRoutine] = useState<MonthlyRoutineResponse | null>(null);
  const [weeklyRoutine, setWeeklyRoutine] = useState<WeeklyRoutineResponse | null>(null);
  const [routineLoading, setRoutineLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [checking, setChecking] = useState(false);

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
        console.warn("routine plan fetch error", error);
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

  useEffect(() => {
    if (planLoading) return;
    setActiveTab((prev) => {
      if (planType === "pro") {
        return "weekly";
      }
      return prev === "monthly" ? prev : "monthly";
    });
  }, [planLoading, planType]);

  const loadRoutine = useCallback(async (plan: PlanType, ownerId: string) => {
    try {
      setRoutineLoading(true);
      const fetches: Promise<void>[] = [];

      if (plan === "pro") {
        fetches.push(
          fetch(buildServerUrl(`/api/routines/weekly?userId=${ownerId}`))
            .then(async (response) => {
              const payload = await response.json();
              if (!response.ok) {
                throw new Error(payload?.error ?? "주간 루틴을 불러오지 못했습니다.");
              }
              setWeeklyRoutine(payload.routine as WeeklyRoutineResponse);
            })
            .catch((error) => {
              console.warn("weekly routine fetch error", error);
              Alert.alert(
                "루틴 오류",
                error instanceof Error ? error.message : "주간 루틴을 불러오지 못했습니다."
              );
            })
        );
      }

      fetches.push(
        fetch(buildServerUrl(`/api/routines/monthly?userId=${ownerId}`))
          .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) {
              throw new Error(payload?.error ?? "월간 루틴을 불러오지 못했습니다.");
            }
            setMonthlyRoutine(payload.routine as MonthlyRoutineResponse);
          })
          .catch((error) => {
            console.warn("monthly routine fetch error", error);
            Alert.alert(
              "루틴 오류",
              error instanceof Error ? error.message : "월간 루틴을 불러오지 못했습니다."
            );
          })
      );

      await Promise.all(fetches);
    } catch (error) {
      const message = error instanceof Error ? error.message : "루틴을 불러오지 못했습니다.";
      Alert.alert("루틴 오류", message);
    } finally {
      setRoutineLoading(false);
    }
  }, []);

  useEffect(() => {
    if (planLoading || !userId) {
      return;
    }
    setMonthlyRoutine(null);
    setWeeklyRoutine(null);
    loadRoutine(planType, userId);
  }, [planType, planLoading, userId, loadRoutine]);

  const handleAutoRebalance = async () => {
    if (!weeklyRoutine || !userId) return;
    const nextDays = autoRebalanceDays();
    await updateWeeklySettings({ recommendedDays: nextDays });
  };

  const toggleDaySelection = async (day: string) => {
    if (!weeklyRoutine || !userId) return;
    const selected = weeklyRoutine.recommendedDays;
    const hasDay = selected.includes(day);
    const next = hasDay ? selected.filter((item) => item !== day) : [...selected, day];
    const ordered = next.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
    await updateWeeklySettings({ recommendedDays: ordered });
  };

  const handleChangeIntensity = async (next: "gentle" | "standard" | "focus") => {
    if (!weeklyRoutine || weeklyRoutine.intensity === next) return;
    await updateWeeklySettings({ intensity: next });
  };

  const toggleOptionalStep = async (key: string) => {
    if (!weeklyRoutine) return;
    const nextSteps = weeklyRoutine.optionalSteps.map((step) =>
      step.key === key ? { ...step, enabled: !step.enabled } : step
    );
    await updateWeeklySettings({ optionalSteps: nextSteps });
  };

  const updateWeeklySettings = async (updates: {
    recommendedDays?: string[];
    intensity?: "gentle" | "standard" | "focus";
    optionalSteps?: RoutineStep[];
  }) => {
    if (!userId) return;
    try {
      setSavingSettings(true);
      const response = await fetch(buildServerUrl("/api/routines/weekly"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...updates,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "루틴을 수정하지 못했습니다.");
      }
      setWeeklyRoutine(payload.routine as WeeklyRoutineResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "루틴을 수정하지 못했습니다.";
      Alert.alert("루틴 수정 실패", message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCheckIn = async (targetDate: string) => {
    if (!userId || !weeklyRoutine || checking) return;
    const today = getTodayIso();
    if (targetDate !== today) {
      Alert.alert("오늘만 체크할 수 있어요", "오늘 루틴을 완료했다면 오늘 날짜를 눌러 체크해 주세요.");
      return;
    }
    if (weeklyRoutine.progress.daysChecked.includes(today)) {
      return;
    }
    try {
      setChecking(true);
      const response = await fetch(buildServerUrl("/api/routines/weekly/check"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "체크를 기록하지 못했습니다.");
      }
      const routine = (payload?.routine as WeeklyRoutineResponse | undefined) ?? null;
      if (routine) {
        setWeeklyRoutine(routine);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "체크를 기록하지 못했습니다.";
      Alert.alert("체크 실패", message);
    } finally {
      setChecking(false);
    }
  };

  const showReason = (mode: RoutineTab) => {
    if (mode === "weekly" && weeklyRoutine) {
      const reasons = [
        weeklyRoutine.focusReason,
        weeklyRoutine.conclusion,
        weeklyRoutine.warnings[0],
      ].filter(Boolean);
      Alert.alert("이 루틴을 추천한 이유", reasons.join("\n\n"));
      return;
    }
    if (mode === "monthly" && monthlyRoutine) {
      const reasons = [
        monthlyRoutine.goal,
        monthlyRoutine.summary.slice(0, 2).join("\n"),
        monthlyRoutine.cautions ?? "",
      ].filter(Boolean);
      Alert.alert("이 루틴을 추천한 이유", reasons.join("\n\n"));
    }
  };

  const renderMonthlyRoutine = (showWeeklyUpsell: boolean) => {
    if (!monthlyRoutine) {
      return (
        <View style={styles.loadingCard}>
          <Text style={styles.cardText}>
            {routineLoading ? "월간 루틴을 준비 중입니다..." : "월간 루틴 정보를 찾을 수 없습니다."}
          </Text>
        </View>
      );
    }
    return (
      <>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.sectionLabel}>{monthlyRoutine.periodMonth.replace(/-/g, ".")}</Text>
              <Text style={styles.mainTitle}>이번 달 목표</Text>
            </View>
            <Pressable style={styles.reasonButton} onPress={() => showReason("monthly")}>
              <Text style={styles.reasonButtonText}>이 루틴을 추천한 이유</Text>
            </Pressable>
          </View>
          <Text style={styles.mainHighlight}>{monthlyRoutine.goal}</Text>
          <View style={styles.divider} />
          <Text style={styles.cardSubtitle}>기본 루틴</Text>
          {monthlyRoutine.summary.map((line) => (
            <Text key={line} style={styles.cardText}>
              • {line}
            </Text>
          ))}
          {monthlyRoutine.cautions ? <Text style={styles.cardCaution}>{monthlyRoutine.cautions}</Text> : null}
        </View>

        {monthlyRoutine.habits.length ? (
          <View style={styles.card}>
            <Text style={styles.mainTitle}>이번 달 추천 습관</Text>
            {monthlyRoutine.habits.map((habit) => (
              <View key={habit} style={styles.habitRow}>
                <View style={styles.habitDot} />
                <Text style={styles.habitText}>{habit}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {showWeeklyUpsell ? (
          <View style={[styles.card, styles.lockedCard]}>
            <Text style={styles.mainTitle}>주간 루틴 (PRO)</Text>
            <Text style={styles.cardText}>주간 포커스와 데일리 체크는 PRO 전용 기능입니다.</Text>
            <Pressable
              style={styles.ctaButton}
              onPress={() => Alert.alert("PRO 안내", "마이페이지에서 PRO 모드를 활성화해 주세요.")}
            >
              <Text style={styles.ctaText}>PRO 혜택 보기</Text>
            </Pressable>
          </View>
        ) : null}
      </>
    );
  };

  const renderWeeklyLocked = () => (
    <View style={[styles.card, styles.lockedCard]}>
      <Text style={styles.mainTitle}>주간 루틴 (PRO)</Text>
      <Text style={styles.cardText}>주간 포커스와 데일리 체크는 PRO 전용 기능입니다.</Text>
      <Pressable
        style={styles.ctaButton}
        onPress={() => Alert.alert("PRO 안내", "마이페이지에서 PRO 모드를 활성화해 주세요.")}
      >
        <Text style={styles.ctaText}>PRO 혜택 보기</Text>
      </Pressable>
    </View>
  );

  const renderWeeklyRoutine = () => {
    if (!weeklyRoutine) {
      return (
        <View style={styles.loadingCard}>
          <Text style={styles.cardText}>
            {routineLoading ? "주간 루틴을 준비 중입니다..." : "주간 루틴 정보를 찾을 수 없습니다."}
          </Text>
        </View>
      );
    }

    const disableActions = savingSettings || checking;
    const weekDays = buildWeekDays(weeklyRoutine.weekStart);
    const todayIso = getTodayIso();

    return (
      <>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.sectionLabel}>
                {weeklyRoutine.weekStart} - {weeklyRoutine.weekEnd}
              </Text>
              <Text style={styles.mainTitle}>이번 주 루틴</Text>
            </View>
            <Pressable style={styles.reasonButton} onPress={() => showReason("weekly")}>
              <Text style={styles.reasonButtonText}>추천 이유</Text>
            </Pressable>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.focusBadge}>{weeklyRoutine.focus}</Text>
            <Text style={styles.subBadge}>주 {weeklyRoutine.progress.target}회 권장</Text>
          </View>
          <Text style={styles.mainHighlight}>{weeklyRoutine.conclusion}</Text>
          <Text style={styles.cardText}>{weeklyRoutine.focusReason}</Text>
          <View style={styles.divider} />
          <Text style={styles.cardSubtitle}>추천 요일 (자유롭게 선택 가능)</Text>
          <View style={styles.dayRow}>
            {DAY_ORDER.map((day) => {
              const selected = weeklyRoutine.recommendedDays.includes(day);
              return (
                <Pressable
                  key={day}
                  style={[styles.dayChip, selected && styles.dayChipActive]}
                  onPress={() => toggleDaySelection(day)}
                  disabled={disableActions}
                >
                  <Text style={[styles.dayChipText, selected && styles.dayChipTextActive]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.rowBetween}>
            <Pressable style={styles.outlineButton} onPress={handleAutoRebalance} disabled={disableActions}>
              <Text style={styles.outlineButtonText}>자동 재배치</Text>
            </Pressable>
            <View style={styles.intensityRow}>
              {[
                { key: "gentle", label: "순하게" },
                { key: "standard", label: "표준" },
                { key: "focus", label: "집중" },
              ].map((option) => {
                const active = weeklyRoutine.intensity === option.key;
                return (
                  <Pressable
                    key={option.key}
                    style={[styles.intensityChip, active && styles.intensityChipActive]}
                    onPress={() => handleChangeIntensity(option.key as "gentle" | "standard" | "focus")}
                    disabled={disableActions}
                  >
                    <Text style={[styles.intensityText, active && styles.intensityTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.mainTitle}>이번 주 데일리 체크</Text>
            <Text style={styles.progressText}>
              {weeklyRoutine.progress.completed}/{weeklyRoutine.progress.target}회 권장
            </Text>
          </View>
          <Text style={styles.cardText}>
            주 3회만 지켜도 충분하지만, 원하는 만큼 체크할 수 있어요. 오늘 완료했다면 해당 날짜를 눌러 주세요.
          </Text>
          <View style={styles.calendarRow}>
            {weekDays.map((day) => {
              const isChecked = weeklyRoutine.progress.daysChecked.includes(day.iso);
              const isToday = day.iso === todayIso;
              const recommended = weeklyRoutine.recommendedDays.includes(day.label);
              return (
                <Pressable
                  key={day.iso}
                  style={styles.calendarCell}
                  onPress={() => handleCheckIn(day.iso)}
                  disabled={disableActions || isChecked}
                >
                  <View
                    style={[
                      styles.calendarCircle,
                      recommended && styles.calendarCircleRecommended,
                      isToday && styles.calendarCircleToday,
                      isChecked && styles.calendarCircleChecked,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        isChecked && styles.calendarDayTextChecked,
                      ]}
                    >
                      {isChecked ? "✓" : day.dayNumber}
                    </Text>
                  </View>
                  <Text style={[styles.calendarLabel, isToday && styles.calendarLabelToday]}>
                    {day.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[
              styles.ctaButton,
              (disableActions || weeklyRoutine.progress.daysChecked.includes(todayIso)) &&
                styles.ctaButtonDisabled,
            ]}
            onPress={() => handleCheckIn(todayIso)}
            disabled={disableActions || weeklyRoutine.progress.daysChecked.includes(todayIso)}
          >
            <Text style={styles.ctaText}>
              {weeklyRoutine.progress.daysChecked.includes(todayIso) ? "오늘 완료됨" : "오늘 루틴 완료"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.mainTitle}>이번 주 액션</Text>
          {weeklyRoutine.actions.map((action) => (
            <View key={action.title} style={styles.actionRow}>
              <View style={styles.actionBadge}>
                <Text style={styles.actionBadgeText}>주간</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>{action.title}</Text>
                <Text style={styles.actionDescription}>{action.description}</Text>
              </View>
            </View>
          ))}
          {weeklyRoutine.optionalSteps.length ? (
            <>
              <Text style={styles.cardSubtitle}>옵션 단계</Text>
              <View style={styles.optionalRow}>
                {weeklyRoutine.optionalSteps.map((step) => (
                  <Pressable
                    key={step.key}
                    style={[styles.optionalChip, step.enabled && styles.optionalChipActive]}
                    onPress={() => toggleOptionalStep(step.key)}
                    disabled={disableActions}
                  >
                    <Text
                      style={[
                        styles.optionalChipText,
                        step.enabled && styles.optionalChipTextActive,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </View>

        {weeklyRoutine.warnings.length ? (
          <View style={[styles.card, styles.warningCard]}>
            <Text style={styles.mainTitle}>주의할 점</Text>
            {weeklyRoutine.warnings.map((warning) => (
              <Text key={warning} style={styles.warningText}>
                • {warning}
              </Text>
            ))}
          </View>
        ) : null}
      </>
    );
  };

  if (detailsChecking) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingCard}>
          <Text style={styles.cardText}>맞춤 정보를 불러오는 중입니다...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>루틴</Text>
        <Text style={styles.subtitle}>
          주 3회만 해도 충분하지만, 원하는 만큼 체크하며 루틴을 채워 보세요.
        </Text>
        <View style={styles.tabRow}>
          {[
            { key: "weekly", label: "주간", disabled: planType !== "pro" },
            { key: "monthly", label: "월간", disabled: false },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[
                  styles.tabButton,
                  isActive && styles.tabButtonActive,
                  tab.disabled && styles.tabButtonDisabled,
                ]}
                onPress={() => {
                  if (tab.disabled) {
                    Alert.alert("PRO 전용", "주간 루틴은 PRO에서 이용할 수 있어요.");
                    return;
                  }
                  setActiveTab(tab.key as RoutineTab);
                }}
                disabled={planLoading}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    isActive && styles.tabLabelActive,
                    tab.disabled && styles.tabLabelDisabled,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {planLoading ? (
          <View style={styles.loadingCard}>
            <Text style={styles.cardText}>루틴을 불러오는 중입니다...</Text>
          </View>
        ) : activeTab === "weekly" ? (
          planType === "pro" ? renderWeeklyRoutine() : renderWeeklyLocked()
        ) : (
          renderMonthlyRoutine(planType !== "pro")
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const autoRebalanceDays = () => {
  const baseSets = [
    ["월", "수", "금"],
    ["화", "목", "토"],
    ["수", "금", "일"],
  ];
  const index = Math.floor(Math.random() * baseSets.length);
  return baseSets[index];
};

const toLocalDate = (iso: string) => {
  const [year, month, day] = iso.split("-").map((value) => parseInt(value, 10));
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildWeekDays = (weekStart: string) => {
  const start = toLocalDate(weekStart);
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      iso: formatIsoDate(date),
      dayNumber: date.getDate(),
      label: WEEKDAY_LABELS[date.getDay()],
    };
  });
};

const getTodayIso = () => {
  return formatIsoDate(new Date());
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F5FA",
  },
  container: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F1F24",
  },
  subtitle: {
    fontSize: 14,
    color: "#6F6F73",
  },
  tabRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F1EDF9",
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#1F1F24",
  },
  tabButtonDisabled: {
    opacity: 0.6,
  },
  tabLabel: {
    fontSize: 14,
    color: "#4E4E55",
    fontWeight: "700",
  },
  tabLabelActive: {
    color: "#FFFFFF",
  },
  tabLabelDisabled: {
    color: "#8F8F95",
  },
  loadingCard: {
    marginTop: 20,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
  },
  card: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    gap: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  lockedCard: {
    borderWidth: 1,
    borderColor: "#E5DCF5",
    backgroundColor: "#FBF9FF",
  },
  sectionLabel: {
    fontSize: 12,
    color: "#8C7FAE",
    fontWeight: "600",
  },
  mainTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  mainHighlight: {
    fontSize: 16,
    color: "#4B3A63",
  },
  cardSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5C3AA1",
    marginTop: 8,
  },
  cardText: {
    fontSize: 13,
    color: "#4E4E55",
    lineHeight: 20,
  },
  cardCaution: {
    marginTop: 12,
    fontSize: 12,
    color: "#9A4D4D",
    backgroundColor: "#FFF7F3",
    padding: 10,
    borderRadius: 14,
  },
  reasonButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5DCF5",
    backgroundColor: "#F8F6FF",
  },
  reasonButtonText: {
    fontSize: 12,
    color: "#5C3AA1",
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: "#EFE8FB",
    marginVertical: 8,
  },
  habitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  habitDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#5C3AA1",
  },
  habitText: {
    flex: 1,
    fontSize: 13,
    color: "#4B3A63",
  },
  ctaButton: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: "#1F1F24",
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaButtonDisabled: {
    backgroundColor: "#C9C9CF",
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  focusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#EFE6FF",
    color: "#5C3AA1",
    fontSize: 12,
    fontWeight: "600",
  },
  subBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F3F0FA",
    color: "#4B3A63",
    fontSize: 12,
    fontWeight: "600",
  },
  dayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayChip: {
    minWidth: 36,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E5DCF5",
    alignItems: "center",
  },
  dayChipActive: {
    backgroundColor: "#5C3AA1",
    borderColor: "#5C3AA1",
  },
  dayChipText: {
    fontSize: 12,
    color: "#6F6F73",
    fontWeight: "600",
  },
  dayChipTextActive: {
    color: "#FFFFFF",
  },
  outlineButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8CEE9",
  },
  outlineButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5C3AA1",
  },
  intensityRow: {
    flexDirection: "row",
    gap: 8,
  },
  intensityChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EFE8FB",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  intensityChipActive: {
    borderColor: "#5C3AA1",
    backgroundColor: "#EFE6FF",
  },
  intensityText: {
    fontSize: 12,
    color: "#6F6F73",
  },
  intensityTextActive: {
    color: "#5C3AA1",
    fontWeight: "600",
  },
  progressText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F1F24",
  },
  calendarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginVertical: 8,
  },
  calendarCell: {
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  calendarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5DCF5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  calendarCircleRecommended: {
    borderColor: "#CFC4ED",
    backgroundColor: "#F8F5FF",
  },
  calendarCircleToday: {
    borderColor: "#5C3AA1",
  },
  calendarCircleChecked: {
    backgroundColor: "#1F1F24",
    borderColor: "#1F1F24",
  },
  calendarDayText: {
    fontSize: 14,
    color: "#4E4E55",
    fontWeight: "700",
  },
  calendarDayTextChecked: {
    color: "#FFFFFF",
  },
  calendarLabel: {
    fontSize: 12,
    color: "#6F6F73",
    fontWeight: "600",
  },
  calendarLabelToday: {
    color: "#5C3AA1",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 6,
  },
  actionBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#EFE8FB",
  },
  actionBadgeText: {
    fontSize: 11,
    color: "#5C3AA1",
    fontWeight: "600",
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F1F24",
  },
  actionDescription: {
    fontSize: 13,
    color: "#4E4E55",
  },
  optionalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  optionalChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E3DAF3",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionalChipActive: {
    backgroundColor: "#1F1F24",
    borderColor: "#1F1F24",
  },
  optionalChipText: {
    fontSize: 12,
    color: "#6F6F73",
  },
  optionalChipTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  warningCard: {
    backgroundColor: "#FFF7F3",
  },
  warningText: {
    fontSize: 13,
    color: "#8C4F45",
  },
});
