import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import { buildServerUrl } from "@/lib/server";
import { useRequireProfileDetails } from "@/hooks/use-profile-details";

type RecommendationResponse = {
  planType: "free" | "pro";
  profile: {
    gender: string | null;
    ageRange: string | null;
    concerns: string[];
  } | null;
  state: {
    mode: "weekly" | "monthly";
    focus: string;
    headline: string;
    subline: string;
    summary: string[];
  } | null;
  tags: TagInfo[];
  products: ProductTile[];
};

type TagInfo = {
  id: string;
  label: string;
  level: "high" | "medium";
  reason: string;
  ingredients: string[];
};

type ProductTile = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  reason: string;
  focus?: string[];
  keyIngredients: string[];
  imageUrl: string | null;
  tags?: string[];
};

export default function RecommendScreen() {
  const router = useRouter();
  const { loading: checkingDetails } = useRequireProfileDetails();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RecommendationResponse | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/auth");
          return;
        }
        const response = await fetch(
          buildServerUrl(`/api/recommendations?userId=${encodeURIComponent(user.id)}`)
        );
        const payload = (await response.json()) as RecommendationResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload?.error ?? "추천 데이터를 불러오지 못했습니다.");
        }
        if (mounted) {
          setData(payload);
          setError(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "추천 데이터를 불러오지 못했습니다.";
        if (mounted) {
          setError(message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    fetchRecommendations();
    return () => {
      mounted = false;
    };
  }, [router]);

  const productRows = useMemo(() => chunkProducts(data?.products ?? []), [data?.products]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setData(null);
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/auth");
          return;
        }
        const response = await fetch(
          buildServerUrl(`/api/recommendations?userId=${encodeURIComponent(user.id)}`)
        );
        const payload = (await response.json()) as RecommendationResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload?.error ?? "추천 데이터를 불러오지 못했습니다.");
        }
        setData(payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : "추천 데이터를 불러오지 못했습니다.";
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  };

  if (loading || checkingDetails) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator color="#A884CC" />
          <Text style={styles.centerText}>맞춤 추천을 불러오는 중입니다...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <Text style={styles.centerText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryText}>다시 시도</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>추천</Text>
        <Text style={styles.subtitle}>현재 피부 상태에 꼭 맞는 성분과 제품을 담았어요.</Text>

        {data?.state ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateLabel}>
              {data.state.mode === "weekly" ? "이번 주 포커스" : "이번 달 포커스"}
            </Text>
            <Text style={styles.stateFocus}>{data.state.focus}</Text>
            <Text style={styles.stateHeadline}>{data.state.headline}</Text>
            <Text style={styles.stateSubline}>{data.state.subline}</Text>
            {data.state.summary.length > 0 && (
              <View style={styles.stateSummary}>
                {data.state.summary.map((line) => (
                  <Text key={line} style={styles.stateSummaryLine}>
                    • {line}
                  </Text>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.stateCard}>
            <Text style={styles.stateLabel}>분석 결과 없음</Text>
            <Text style={styles.stateSubline}>
              촬영을 진행하면 맞춤 성분과 제품을 즉시 추천해 드릴게요.
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>필요 성분 태그</Text>
          <Text style={styles.sectionHelper}>AI 분석 + 내 루틴 기반</Text>
        </View>
        {data?.tags?.length ? (
          <View style={styles.tagGrid}>
            {data.tags.map((tag) => (
              <View key={tag.id} style={styles.tagCard}>
                <View style={styles.tagHeader}>
                  <Text style={styles.tagLabel}>{tag.label}</Text>
                  <Text style={[styles.tagBadge, tag.level === "high" && styles.tagBadgeHigh]}>
                    {tag.level === "high" ? "High" : "Mid"}
                  </Text>
                </View>
                <Text style={styles.tagReason}>{tag.reason}</Text>
                {tag.ingredients.length ? (
                  <View style={styles.ingredientRow}>
                    {tag.ingredients.map((ingredient) => (
                      <View key={ingredient} style={styles.ingredientChip}>
                        <Text style={styles.ingredientText}>{ingredient}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>아직 추천할 태그가 없어요. 촬영을 진행해 주세요.</Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>맞춤 제품</Text>
          <Text style={styles.sectionHelper}>필요 성분과 루틴에 맞춘 큐레이션</Text>
        </View>
        {data?.products?.length ? (
          <View style={styles.productGrid}>
            {productRows.map((row, index) => (
              <View key={`row-${index}`} style={styles.productRow}>
                {row.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
                {row.length === 1 && <View style={[styles.productCard, styles.productCardPlaceholder]} />}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>추천 제품을 불러오지 못했습니다. 나중에 다시 시도해 주세요.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const ProductCard = ({ product }: { product: ProductTile }) => {
  const handlePress = () => {
    Alert.alert(product.name, product.reason);
  };

  return (
    <Pressable style={styles.productCard} onPress={handlePress}>
      {product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={styles.productImage}
          contentFit="cover"
          cachePolicy="disk"
        />
      ) : (
        <View style={styles.productImagePlaceholder}>
          <Text style={styles.productImagePlaceholderText}>이미지 없음</Text>
        </View>
      )}
      <Text style={styles.productName} numberOfLines={2}>
        {product.name}
      </Text>
      {product.brand ? <Text style={styles.productBrand}>{product.brand}</Text> : null}
      {product.tags?.length ? (
        <View style={styles.productTagRow}>
          {product.tags.map((tag) => (
            <View key={`${product.id}-${tag}`} style={styles.productTagChip}>
              <Text style={styles.productTagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {product.keyIngredients.length ? (
        <Text style={styles.productIngredientText}>
          {product.keyIngredients.slice(0, 3).join(", ")}
        </Text>
      ) : null}
    </Pressable>
  );
};

const chunkProducts = (items: ProductTile[]) => {
  const rows: ProductTile[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }
  return rows;
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8F6FB",
  },
  container: {
    padding: 20,
    gap: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F1F24",
  },
  subtitle: {
    fontSize: 14,
    color: "#6D6D74",
    marginBottom: 8,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  centerText: {
    fontSize: 14,
    color: "#6D6D74",
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#1F1F24",
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  stateCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  stateLabel: {
    fontSize: 13,
    color: "#8B7EB3",
    fontWeight: "600",
  },
  stateFocus: {
    fontSize: 20,
    fontWeight: "700",
    color: "#3B2665",
  },
  stateHeadline: {
    fontSize: 16,
    color: "#1F1F24",
  },
  stateSubline: {
    fontSize: 13,
    color: "#6E6E75",
  },
  stateSummary: {
    marginTop: 8,
    gap: 4,
  },
  stateSummaryLine: {
    fontSize: 13,
    color: "#514B63",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  sectionHelper: {
    fontSize: 12,
    color: "#8F879C",
  },
  tagGrid: {
    gap: 12,
  },
  tagCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    gap: 8,
    borderWidth: 1,
    borderColor: "#EFE4FF",
  },
  tagHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tagLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2B213F",
  },
  tagBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#EFE8FB",
    color: "#6F5AA8",
    fontSize: 11,
    fontWeight: "700",
  },
  tagBadgeHigh: {
    backgroundColor: "#EBD5FF",
    color: "#5C349A",
  },
  tagReason: {
    fontSize: 13,
    color: "#5A5368",
    lineHeight: 18,
  },
  ingredientRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  ingredientChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F4F0FB",
  },
  ingredientText: {
    fontSize: 12,
    color: "#5C4E7D",
  },
  emptyCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#F2EDF9",
  },
  emptyText: {
    fontSize: 13,
    color: "#6B627D",
  },
  productGrid: {
    gap: 16,
  },
  productRow: {
    flexDirection: "row",
    gap: 14,
  },
  productCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 8,
    shadowColor: "#000000",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  productCardPlaceholder: {
    opacity: 0,
  },
  productImage: {
    width: "100%",
    height: 110,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
  },
  productImagePlaceholder: {
    width: "100%",
    height: 110,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  productImagePlaceholderText: {
    fontSize: 12,
    color: "#8A839C",
  },
  productName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1F1F24",
  },
  productBrand: {
    fontSize: 12,
    color: "#6D6D74",
  },
  productTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  productTagChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "#EFE8FB",
  },
  productTagText: {
    fontSize: 11,
    color: "#5B3DA1",
  },
  productIngredientText: {
    fontSize: 12,
    color: "#6F6F73",
  },
});
