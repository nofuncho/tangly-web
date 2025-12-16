import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";

import { SERVER_BASE_URL, buildServerUrl } from "@/lib/server";

type ArchiveType = "skin" | "eye_wrinkle" | "personal_color";

type ArchiveItem = {
  id: string;
  createdAt: string | null;
  summary: string;
  headline: string;
  thumbnail: string | null;
  type: ArchiveType;
};

type ArchiveResponse = {
  reports: ArchiveItem[];
};

const SKELETON_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2NkYGD4DwABBAEAfZcb1gAAAABJRU5ErkJggg==";

export default function ReportArchiveScreen() {
  const router = useRouter();
  const [reports, setReports] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReports = async () => {
      if (!SERVER_BASE_URL) {
        setError("서버 주소가 설정되지 않았습니다.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await fetch(buildServerUrl("/api/reports?limit=20"));
        if (!response.ok) {
          throw new Error("리포트를 불러오지 못했습니다.");
        }
        const payload = (await response.json()) as ArchiveResponse;
        setReports(payload.reports ?? []);
      } catch (err) {
        const message = err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator />
          <Text style={styles.stateText}>리포트를 불러오는 중입니다...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      );
    }

    if (!reports.length) {
      return (
        <View style={styles.centerState}>
          <Text style={styles.stateText}>아직 저장된 리포트가 없습니다.</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        windowSize={6}
        initialNumToRender={4}
        removeClippedSubviews
        renderItem={({ item }) => (
          <ReportCard
            item={item}
            onPress={(report) =>
              router.push({
                pathname: "/reports/[id]",
                params: {
                  id: report.id,
                  thumbnail: report.thumbnail ?? "",
                  createdAt: report.createdAt ?? "",
                  type: report.type,
                },
              })
            }
          />
        )}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.pageTitle}>리포트</Text>
        <Text style={styles.pageSubtitle}>촬영 후 생성된 리포트를 차곡차곡 모았어요.</Text>
        {renderContent()}
      </View>
    </SafeAreaView>
  );
}

const ReportCard = ({
  item,
  onPress,
}: {
  item: ArchiveItem;
  onPress: (item: ArchiveItem) => void;
}) => {
  const dateLabel = useMemo(() => formatDate(item.createdAt), [item.createdAt]);
  const typeLabel =
    item.type === "personal_color" ? "퍼스널컬러" : item.type === "eye_wrinkle" ? "눈 주름" : "피부";

  return (
    <Pressable style={styles.card} onPress={() => onPress(item)}>
      <View style={styles.thumbnailWrapper}>
        {item.thumbnail ? (
          <Image
            source={item.thumbnail}
            style={styles.thumbnail}
            placeholder={SKELETON_PLACEHOLDER}
            transition={200}
            cachePolicy="disk"
            contentFit="cover"
          />
        ) : (
          <View style={styles.thumbnailPlaceholder} />
        )}
        <View style={styles.thumbnailOverlay}>
          <Text style={styles.typeBadge}>{typeLabel}</Text>
          <Text style={styles.thumbnailDate}>{dateLabel}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardHeadline} numberOfLines={2}>
          {item.headline}
        </Text>
        <Text style={styles.cardSummary} numberOfLines={2}>
          {item.summary}
        </Text>
      </View>
    </Pressable>
  );
};

const CARD_ASPECT = 2 / 2.5;

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
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1F1F24",
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#6F6F73",
    marginTop: 6,
    marginBottom: 16,
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
  listContent: {
    paddingBottom: 32,
  },
  columnWrapper: {
    justifyContent: "space-between",
    marginBottom: 16,
  },
  card: {
    width: "48%",
    backgroundColor: "#F9F7FC",
    borderRadius: 20,
    overflow: "hidden",
    elevation: 1,
  },
  thumbnailWrapper: {
    width: "100%",
    aspectRatio: CARD_ASPECT,
    backgroundColor: "#E5DCF4",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  thumbnailPlaceholder: {
    flex: 1,
    backgroundColor: "#E5DCF4",
  },
  thumbnailOverlay: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  thumbnailDate: {
    color: "#FFFFFF",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  cardBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  cardHeadline: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F1F24",
  },
  cardSummary: {
    fontSize: 12,
    color: "#6F6F73",
  },
});
