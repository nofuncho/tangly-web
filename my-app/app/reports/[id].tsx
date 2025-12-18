import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";

import {
  type NeedEntry,
  type ProductRecommendation,
  type ReportItem,
} from "@/types/report";
import type {
  AiActionFrequency,
  AiFocusTopic,
  AiKeyFindingStatus,
  AiReportEnvelope,
} from "@/types/ai-report";
import { buildServerUrl } from "@/lib/server";
import { type PersonalColorExtras } from "@/lib/personal-color";
import { supabase } from "@/lib/supabase";
import { useRequireProfileDetails } from "@/hooks/use-profile-details";

type ReportType = "skin" | "eye_wrinkle" | "personal_color";
type PlanType = "free" | "pro";

type ReportDetailPayload = {
  type: ReportType;
  sessionId: string;
  createdAt: string | null;
  thumbnail: string | null;
  summary: string;
  highlight: string;
  items: ReportItem[];
  tips: string[];
  needs: NeedEntry[];
  recommendations: ProductRecommendation[];
  extras?: PersonalColorExtras | null;
  aiReport?: AiReportEnvelope | null;
};

type ApiResponse = ReportDetailPayload & { error?: string };

const SKELETON_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABBAEAfZcb1gAAAABJRU5ErkJggg==";

const KEY_STATUS_LABELS: Record<AiKeyFindingStatus, string> = {
  good: "좋음",
  neutral: "보통",
  caution: "주의",
};

const KEY_STATUS_COLORS: Record<
  AiKeyFindingStatus,
  { background: string; text: string }
> = {
  good: { background: "#F0F8F2", text: "#2D8B5C" },
  neutral: { background: "#F3F3F6", text: "#6F6F73" },
  caution: { background: "#FFF5F3", text: "#C0392B" },
};

const FOCUS_LABELS: Record<AiFocusTopic, string> = {
  hydration: "수분",
  elasticity: "탄력",
  wrinkle: "주름",
  radiance: "광채",
  trouble: "트러블",
};

const FREQUENCY_LABELS: Record<AiActionFrequency, string> = {
  daily: "매일",
  weekly: "주 1회",
  three_per_week: "주 3회",
};

export default function ReportDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; thumbnail?: string; createdAt?: string; type?: string }>();
  const sessionId = params.id && !Array.isArray(params.id) ? params.id : null;
  const initialThumb = params.thumbnail && !Array.isArray(params.thumbnail) ? params.thumbnail : null;
  const initialDate = params.createdAt && !Array.isArray(params.createdAt) ? params.createdAt : null;
  const typeParam = params.type && !Array.isArray(params.type) ? params.type : null;
  const parseType = (value?: string | null): ReportType => {
    if (value === "personal_color") return "personal_color";
    if (value === "eye_wrinkle") return "eye_wrinkle";
    return "skin";
  };
  const initialType: ReportType = parseType(typeParam);

  const [report, setReport] = useState<ReportDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportType, setReportType] = useState<ReportType>(initialType);
  const [planType, setPlanType] = useState<PlanType>("free");
  const [planLoading, setPlanLoading] = useState(true);
  const { loading: detailsChecking } = useRequireProfileDetails();

  useEffect(() => {
    setReportType(initialType);
  }, [initialType, sessionId]);

  useEffect(() => {
    let active = true;
    const loadPlan = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (active) {
            setPlanType("free");
            setPlanLoading(false);
          }
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan_type")
          .eq("id", user.id)
          .maybeSingle<{ plan_type: string | null }>();
        if (!active) return;
        const planLabel =
          (profile?.plan_type ??
            (user.user_metadata?.plan_type as string | null) ??
            "")?.toString().toLowerCase() ?? "";
        setPlanType(planLabel === "pro" ? "pro" : "free");
      } catch (err) {
        console.warn("plan fetch error", err);
        if (active) {
          setPlanType("free");
        }
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
    if (!sessionId) {
      setError("리포트 정보를 찾을 수 없습니다.");
      setLoading(false);
      return;
    }

    const fetchDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const query = reportType === "personal_color" ? "?type=personal_color" : "";
        const response = await fetch(buildServerUrl(`/api/reports/${sessionId}${query}`));
        if (!response.ok) {
          throw new Error("리포트를 불러오지 못했습니다.");
        }
        const payload = (await response.json()) as ApiResponse;
        if ((payload as { error?: string }).error) {
          throw new Error((payload as { error: string }).error);
        }
        if (payload.type && payload.type !== reportType) {
          setReportType(parseType(payload.type));
        }
        setReport(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [sessionId, reportType]);

  const heroImage = report?.thumbnail ?? initialThumb;
  const dateLabel = useMemo(() => formatDate(report?.createdAt ?? initialDate), [report?.createdAt, initialDate]);
  const typeLabel =
    reportType === "personal_color" ? "퍼스널컬러" : reportType === "eye_wrinkle" ? "눈 주름" : "피부";

  const renderBody = () => {
    if (loading || detailsChecking) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.stateText}>리포트를 불러오는 중입니다...</Text>
        </View>
      );
    }

    if (error || !report) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>{error ?? "리포트를 찾을 수 없습니다."}</Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.detailContent} showsVerticalScrollIndicator={false}>
        {heroImage ? (
          <Image
            source={heroImage}
            style={styles.detailImage}
            placeholder={SKELETON_PLACEHOLDER}
            transition={250}
            cachePolicy="disk"
            contentFit="cover"
          />
        ) : (
          <View style={[styles.detailImage, styles.detailPlaceholder]} />
        )}
        <Text style={styles.typeLabel}>{typeLabel}</Text>
        <Text style={styles.dateLabel}>{dateLabel}</Text>
        <Text style={styles.headline}>{report.highlight}</Text>
        <Text style={styles.summary}>{report.summary}</Text>

        <AiReportSection
          data={report.aiReport}
          planType={planType}
          loadingPlan={planLoading}
          onUpgradePress={() => router.push("/mypage")}
        />

        <ReportCard data={report} />
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>뒤로</Text>
        </Pressable>
        <Text style={styles.headerTitle}>리포트</Text>
        <View style={{ width: 44 }} />
      </View>
      {renderBody()}
    </SafeAreaView>
  );
}

const AiReportSection = ({
  data,
  planType,
  loadingPlan,
  onUpgradePress,
}: {
  data?: AiReportEnvelope | null;
  planType: PlanType;
  loadingPlan: boolean;
  onUpgradePress: () => void;
}) => {
  if (!data) return null;

  const renderNotice = (message: string) => (
    <View style={styles.aiCard}>
      <View style={styles.aiHeaderRow}>
        <Text style={styles.aiHeaderTitle}>AI 상세 리포트</Text>
        <View style={[styles.aiBadge, styles.aiBadgePreview]}>
          <Text style={[styles.aiBadgeText, styles.aiBadgePreviewText]}>PREVIEW</Text>
        </View>
      </View>
      <Text style={styles.aiNoticeText}>{message}</Text>
    </View>
  );

  if (data.status === "unavailable") {
    return renderNotice(data.error ?? "현재 AI 리포트를 준비 중입니다. 기본 리포트를 먼저 안내드릴게요.");
  }
  if (data.status === "error") {
    return renderNotice(data.error ?? "AI 리포트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  if (!data.payload) {
    return null;
  }

  const { payload } = data;
  const previewOnly = planType !== "pro";
  const summaryLines = previewOnly ? payload.summary.slice(0, 2) : payload.summary;

  const badgeTextStyle = [
    styles.aiBadgeText,
    planType === "pro" ? null : styles.aiBadgePreviewText,
  ];

  return (
    <View style={styles.aiCard}>
      <View style={styles.aiHeaderRow}>
        <Text style={styles.aiHeaderTitle}>AI 상세 리포트</Text>
        <View style={[styles.aiBadge, planType === "pro" ? styles.aiBadgePro : styles.aiBadgePreview]}>
          <Text style={badgeTextStyle}>{planType === "pro" ? "PRO" : "PREVIEW"}</Text>
        </View>
      </View>
      <Text style={styles.aiOneLiner}>{payload.oneLiner || "AI가 리포트를 정리하고 있습니다."}</Text>
      {summaryLines.map((line) => (
        <Text key={line} style={styles.aiSummaryLine}>
          • {line}
        </Text>
      ))}

      <View style={styles.aiFocusBlock}>
        <Text style={styles.aiFocusLabel}>이번 주 포커스</Text>
        <Text style={styles.aiFocusTopic}>{FOCUS_LABELS[payload.focus.topic]}</Text>
        <Text style={styles.aiFocusReason}>{payload.focus.reason}</Text>
      </View>

      {previewOnly ? (
        <AiPreviewUpsell loading={loadingPlan} onUpgradePress={onUpgradePress} />
      ) : (
        <>
          {payload.keyFindings.length > 0 && (
            <View style={styles.aiKeyFindings}>
              {payload.keyFindings.map((finding, index) => {
                const colors = KEY_STATUS_COLORS[finding.status];
                return (
                  <View key={`${finding.title}-${index}`} style={styles.aiKeyRow}>
                    <View style={styles.aiKeyRowHeader}>
                      <Text style={styles.aiKeyTitle}>{finding.title}</Text>
                      <View
                        style={[
                          styles.aiKeyBadge,
                          { backgroundColor: colors.background },
                        ]}
                      >
                        <Text style={[styles.aiKeyBadgeText, { color: colors.text }]}>
                          {KEY_STATUS_LABELS[finding.status]}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.aiKeyDescription}>{finding.description}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {payload.ageComparison.statement ? (
            <View style={styles.aiAgeBlock}>
              <Text style={styles.aiAgePercentile}>{payload.ageComparison.percentile} %</Text>
              <Text style={styles.aiAgeCaption}>{payload.ageComparison.statement}</Text>
            </View>
          ) : null}

          {payload.actions.length > 0 && (
            <View style={styles.aiActionList}>
              <Text style={styles.aiActionTitle}>이번 주 액션</Text>
              {payload.actions.map((action, index) => (
                <View key={`${action.title}-${index}`} style={styles.aiActionRow}>
                  <View style={styles.aiActionHeader}>
                    <Text style={styles.aiActionName}>{action.title}</Text>
                    <Text style={styles.aiActionFrequency}>{FREQUENCY_LABELS[action.frequency]}</Text>
                  </View>
                  <Text style={styles.aiActionDescription}>{action.description}</Text>
                </View>
              ))}
            </View>
          )}

          {payload.warnings.length > 0 && (
            <View style={styles.aiWarningCard}>
              <Text style={styles.aiWarningTitle}>주의할 점</Text>
              {payload.warnings.map((warning, index) => (
                <Text key={`${warning}-${index}`} style={styles.aiWarningText}>
                  • {warning}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const AiPreviewUpsell = ({
  loading,
  onUpgradePress,
}: {
  loading: boolean;
  onUpgradePress: () => void;
}) => (
  <View style={styles.aiUpsellCard}>
    <Text style={styles.aiUpsellTitle}>AI 상세 리포트 전체 보기</Text>
    <Text style={styles.aiUpsellDescription}>
      PRO 구독 시 키 포인트, 나이 대비 비교, 맞춤 액션과 주의사항까지 모두 열어드려요.
    </Text>
    <Pressable style={styles.aiUpsellButton} onPress={onUpgradePress} disabled={loading}>
      <Text style={styles.aiUpsellButtonText}>
        {loading ? "확인 중..." : "구독하고 전체 보기"}
      </Text>
    </Pressable>
  </View>
);

const ReportCard = ({ data }: { data: ReportDetailPayload }) => (
  <View style={styles.reportCard}>
    <Text style={styles.reportTitle}>세션 요약</Text>
    <Text style={styles.reportSession}>
      {data.type === "personal_color" ? "기록 ID" : "세션 ID"}: {data.sessionId}
    </Text>
    <Text style={styles.reportSummary}>{data.summary}</Text>
    <Text style={styles.reportHighlight}>{data.highlight}</Text>

    {data.type === "personal_color" && <PersonalColorExtrasView extras={data.extras} />}

    {data.needs.length > 0 && <NeedFocusList needs={data.needs} />}

    {data.recommendations.length > 0 && (
      <View style={styles.recommendSection}>
        <Text style={styles.recommendSectionTitle}>맞춤 제품 추천</Text>
        {data.recommendations.map((item) => (
          <ProductRecommendationCard key={item.id} item={item} />
        ))}
      </View>
    )}

    <View style={styles.reportItemList}>
      {data.items.map((item) => (
        <View key={item.id} style={styles.reportItem}>
          <View style={styles.reportItemHeader}>
            <Text style={styles.reportItemTitle}>{item.title}</Text>
            <Text
              style={[styles.reportBadge, item.status === "주의" && styles.reportBadgeWarning]}
            >
              {item.status}
            </Text>
          </View>
          <Text style={styles.reportItemDescription}>{item.description}</Text>
          <Text style={styles.reportItemComparison}>{item.comparison}</Text>
        </View>
      ))}
    </View>

    <View style={styles.reportTips}>
      <Text style={styles.reportTipsTitle}>케어 팁</Text>
      {data.tips.map((tip) => (
        <Text key={tip} style={styles.reportTip}>
          • {tip}
        </Text>
      ))}
    </View>
  </View>
);

const PersonalColorExtrasView = ({ extras }: { extras?: PersonalColorExtras | null }) => {
  if (!extras) return null;
  return (
    <View style={styles.personalCard}>
      <Text style={styles.personalTone}>{extras.toneLabel}</Text>
      <View style={styles.personalPaletteRow}>
        {extras.palette.map((color) => (
          <View key={color} style={[styles.personalPaletteChip, { backgroundColor: color }]} />
        ))}
      </View>
      <View style={styles.personalStory}>
        {extras.storyline.map((line) => (
          <Text key={line} style={styles.personalStoryText}>
            {line}
          </Text>
        ))}
      </View>
      {extras.sliderDetails?.length > 0 && (
        <View style={styles.personalSliderBlock}>
          {extras.sliderDetails.map((slider) => (
            <View key={slider.id} style={styles.personalSliderRow}>
              <Text style={styles.personalSliderLabel}>{slider.label}</Text>
              <View style={styles.personalSliderTrack}>
                <View style={[styles.personalSliderFill, { width: `${slider.value * 100}%` }]} />
              </View>
              <View style={styles.personalSliderCaption}>
                <Text style={styles.personalSliderText}>{slider.leftLabel}</Text>
                <Text style={styles.personalSliderText}>{slider.rightLabel}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const NeedFocusList = ({ needs }: { needs: NeedEntry[] }) => (
  <View style={styles.needsCard}>
    <Text style={styles.needsTitle}>이번 세션에서 집중할 케어</Text>
    {needs.map((need) => (
      <View key={need.id} style={styles.needRow}>
        <View style={styles.needBadge}>
          <Text style={styles.needBadgeLabel}>{need.label}</Text>
          <Text style={styles.needBadgeLevel}>{need.level === "high" ? "우선" : "보강"}</Text>
        </View>
        <Text style={styles.needDescription}>{need.description}</Text>
      </View>
    ))}
  </View>
);

const ProductRecommendationCard = ({
  item,
}: {
  item: ProductRecommendation;
}) => (
  <View style={styles.recommendCard}>
    <View style={styles.recommendHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.recommendName}>{item.name}</Text>
        {item.brand && <Text style={styles.recommendBrand}>{item.brand}</Text>}
        {item.category && <Text style={styles.recommendCategory}>{item.category}</Text>}
      </View>
      {item.imageUrl ? (
        <Image
          source={item.imageUrl}
          style={styles.recommendImage}
          placeholder={SKELETON_PLACEHOLDER}
          transition={200}
          cachePolicy="disk"
          contentFit="cover"
        />
      ) : null}
    </View>
    <Text style={styles.recommendReason}>{item.reason}</Text>
    {item.focus.length > 0 && (
      <View style={styles.recommendFocusRow}>
        {item.focus.map((focus) => (
          <Text key={focus} style={styles.recommendFocusChip}>
            {focus}
          </Text>
        ))}
      </View>
    )}
    {item.keyIngredients.length > 0 && (
      <Text style={styles.recommendIngredients}>
        핵심 성분: {item.keyIngredients.join(", ")}
      </Text>
    )}
    {item.note ? <Text style={styles.recommendNote}>{item.note}</Text> : null}
  </View>
);

const formatDate = (input: string | null) => {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}.${month}.${day}`;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E6E6EB",
  },
  backButtonText: {
    color: "#6F6F73",
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  stateText: {
    marginTop: 12,
    color: "#6F6F73",
  },
  detailContent: {
    paddingBottom: 48,
  },
  detailImage: {
    width: "90%",
    aspectRatio: 2 / 2.5,
    borderRadius: 24,
    alignSelf: "center",
    marginTop: 20,
    backgroundColor: "#F1EAFB",
  },
  detailPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  typeLabel: {
    textAlign: "center",
    color: "#A884CC",
    fontWeight: "600",
    marginTop: 12,
  },
  dateLabel: {
    marginTop: 20,
    textAlign: "center",
    color: "#6F6F73",
  },
  headline: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    color: "#1F1F24",
    marginTop: 8,
    paddingHorizontal: 32,
  },
  summary: {
    fontSize: 14,
    color: "#4E4E55",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 32,
  },
  aiCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginTop: 20,
    marginHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#F0ECF7",
  },
  aiHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  aiBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  aiBadgePro: {
    backgroundColor: "#1F1F24",
  },
  aiBadgePreview: {
    backgroundColor: "#EAE4F5",
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  aiBadgePreviewText: {
    color: "#5C3AA1",
  },
  aiNoticeText: {
    fontSize: 14,
    color: "#6F6F73",
  },
  aiOneLiner: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F1F24",
    lineHeight: 22,
  },
  aiSummaryLine: {
    fontSize: 14,
    color: "#4E4E55",
  },
  aiFocusBlock: {
    backgroundColor: "#F7F2FF",
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  aiFocusLabel: {
    fontSize: 12,
    color: "#8E7BB8",
    fontWeight: "600",
  },
  aiFocusTopic: {
    fontSize: 18,
    fontWeight: "700",
    color: "#5D3EA8",
  },
  aiFocusReason: {
    fontSize: 13,
    color: "#4B3A63",
  },
  aiKeyFindings: {
    gap: 12,
  },
  aiKeyRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F1E8FF",
    padding: 12,
    gap: 4,
  },
  aiKeyRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiKeyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F1F24",
    flex: 1,
    marginRight: 10,
  },
  aiKeyBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  aiKeyBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  aiKeyDescription: {
    fontSize: 13,
    color: "#4B3A63",
  },
  aiAgeBlock: {
    borderRadius: 16,
    backgroundColor: "#F0F5FF",
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  aiAgePercentile: {
    fontSize: 28,
    fontWeight: "700",
    color: "#2D8B5C",
  },
  aiAgeCaption: {
    fontSize: 13,
    color: "#4E4E55",
    textAlign: "center",
  },
  aiActionList: {
    gap: 8,
  },
  aiActionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F1F24",
  },
  aiActionRow: {
    borderRadius: 14,
    backgroundColor: "#F8F8FB",
    padding: 14,
    gap: 4,
  },
  aiActionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiActionName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1F1F24",
  },
  aiActionFrequency: {
    fontSize: 12,
    color: "#6F6F73",
  },
  aiActionDescription: {
    fontSize: 13,
    color: "#4B3A63",
  },
  aiWarningCard: {
    borderRadius: 16,
    backgroundColor: "#FFF5F3",
    padding: 12,
    gap: 4,
  },
  aiWarningTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#C0392B",
  },
  aiWarningText: {
    fontSize: 13,
    color: "#8C4F45",
  },
  aiUpsellCard: {
    borderRadius: 16,
    backgroundColor: "#F6F1FA",
    padding: 16,
    gap: 8,
  },
  aiUpsellTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F1F24",
  },
  aiUpsellDescription: {
    fontSize: 13,
    color: "#4B3A63",
    lineHeight: 18,
  },
  aiUpsellButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "#1F1F24",
    paddingVertical: 12,
    alignItems: "center",
  },
  aiUpsellButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  reportCard: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    marginTop: 24,
    marginHorizontal: 16,
    gap: 12,
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f1b2e",
  },
  reportSession: {
    color: "#6A4BA1",
    fontSize: 12,
  },
  reportSummary: {
    fontSize: 15,
    color: "#1f1b2e",
  },
  reportHighlight: {
    fontSize: 14,
    color: "#C0392B",
    fontWeight: "600",
  },
  personalCard: {
    backgroundColor: "#F6F1FC",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  personalTone: {
    fontSize: 18,
    fontWeight: "700",
    color: "#A884CC",
    textAlign: "center",
  },
  personalPaletteRow: {
    flexDirection: "row",
    gap: 8,
  },
  personalPaletteChip: {
    flex: 1,
    height: 36,
    borderRadius: 12,
  },
  personalStory: {
    gap: 4,
  },
  personalStoryText: {
    color: "#4A4A55",
    fontSize: 13,
  },
  personalSliderBlock: {
    gap: 12,
  },
  personalSliderRow: {},
  personalSliderLabel: {
    fontSize: 14,
    color: "#1F1F24",
    marginBottom: 4,
  },
  personalSliderTrack: {
    height: 8,
    backgroundColor: "#E0D2F1",
    borderRadius: 999,
    overflow: "hidden",
  },
  personalSliderFill: {
    height: "100%",
    backgroundColor: "#A884CC",
  },
  personalSliderCaption: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  personalSliderText: {
    fontSize: 11,
    color: "#6F6F73",
  },
  reportItemList: {
    gap: 12,
  },
  reportItem: {
    backgroundColor: "#F6F1FA",
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  reportItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reportItemTitle: {
    fontWeight: "700",
    color: "#1f1b2e",
  },
  reportBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#D6BDF0",
    color: "#1f1b2e",
    fontSize: 12,
    fontWeight: "700",
  },
  reportBadgeWarning: {
    backgroundColor: "#FADBD8",
    color: "#C0392B",
  },
  reportItemDescription: {
    color: "#4B3A63",
  },
  reportItemComparison: {
    fontSize: 12,
    color: "#6A4BA1",
  },
  reportTips: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  reportTipsTitle: {
    fontWeight: "700",
    color: "#1f1b2e",
  },
  reportTip: {
    color: "#4B3A63",
    fontSize: 13,
  },
  needsCard: {
    backgroundColor: "#F4F0FF",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  needsTitle: {
    fontWeight: "700",
    color: "#1f1b2e",
  },
  needRow: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  needBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  needBadgeLabel: {
    fontWeight: "700",
    color: "#5C3AA1",
  },
  needBadgeLevel: {
    backgroundColor: "#E4DDF7",
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    color: "#5C3AA1",
    fontWeight: "700",
  },
  needDescription: {
    color: "#4B3A63",
    fontSize: 13,
  },
  recommendSection: {
    gap: 12,
  },
  recommendSectionTitle: {
    fontWeight: "700",
    color: "#1f1b2e",
    fontSize: 16,
  },
  recommendCard: {
    backgroundColor: "#F6F1FA",
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  recommendHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recommendName: {
    fontWeight: "700",
    color: "#1f1b2e",
    fontSize: 16,
  },
  recommendBrand: {
    color: "#6A4BA1",
    fontSize: 13,
  },
  recommendCategory: {
    color: "#8C7FAE",
    fontSize: 12,
  },
  recommendImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: "#E4DDF7",
  },
  recommendReason: {
    color: "#4B3A63",
    fontSize: 13,
  },
  recommendFocusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recommendFocusChip: {
    backgroundColor: "#1f1b2e",
    color: "white",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
  },
  recommendIngredients: {
    color: "#5C3AA1",
    fontSize: 12,
  },
  recommendNote: {
    color: "#7A6D92",
    fontSize: 12,
  },
});
