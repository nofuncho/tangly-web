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
import { buildServerUrl } from "@/lib/server";
import { type PersonalColorExtras } from "@/lib/personal-color";

type ReportType = "skin" | "eye_wrinkle" | "personal_color";

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
};

type ApiResponse = ReportDetailPayload & { error?: string };

const SKELETON_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABBAEAfZcb1gAAAABJRU5ErkJggg==";

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

  useEffect(() => {
    setReportType(initialType);
  }, [initialType, sessionId]);

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
    if (loading) {
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
