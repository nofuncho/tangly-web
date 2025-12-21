import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "@/lib/supabase";
import { useRequireProfileDetails } from "@/hooks/use-profile-details";
import LogoImage from "@/assets/images/logo-tangly.png";
import HomeBannerImage from "@/assets/images/home-banner-main.png";
import HomeStripImage from "@/assets/images/home-banner-strip.png";
import IconSkinImage from "@/assets/images/home-icon-skin.png";
import IconEyeImage from "@/assets/images/home-icon-eye.png";
import IconTroubleImage from "@/assets/images/home-icon-trouble.png";
import IconOxImage from "@/assets/images/home-icon-ox.png";
import Review1Image from "@/assets/images/home-review-1.png";
import Review2Image from "@/assets/images/home-review-2.png";
import Review3Image from "@/assets/images/home-review-3.png";

const COLORS = {
  primary: "#A884CC",
  background: "#FFFFFF",
  textPrimary: "#1F1F24",
  textSecondary: "#6F6F73",
  divider: "#E6E6EB",
  paleLavender: "#F6F3FB",
  gray100: "#F8F7FA",
  gray200: "#EEEAF5",
  gray300: "#D9D0E5",
  badgeGray: "#F0EEF3",
};

const HOME_IMAGES = {
  logo: LogoImage,
  hero: HomeBannerImage,
  strip: HomeStripImage,
  iconSkin: IconSkinImage,
  iconEye: IconEyeImage,
  iconTrouble: IconTroubleImage,
  iconOx: IconOxImage,
  review1: Review1Image,
  review2: Review2Image,
  review3: Review3Image,
};

type HeroContent = {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
};

type AiCheckAction = "capture" | "eye" | "trouble" | "ox";

type AiCheckCard = {
  id: string;
  label: string;
  image: ImageSourcePropType;
  action?: AiCheckAction;
  comingSoon?: boolean;
};

type ReviewCard = {
  id: string;
  title: string;
  subtitle: string;
  rating: number;
  image: ImageSourcePropType;
};

type TabAction = "reports" | "mypage" | "routine" | "recommend";

const HERO_CARD: HeroContent = {
  eyebrow: "3초 만에 검사하는",
  title: "내 피부 상태",
  description: "AI가 피부 결·탄력·주름을 한 번에 분석해 드려요.",
  cta: "AI 피부 분석 시작하기",
};

const AI_CHECK_ITEMS: AiCheckCard[] = [
  { id: "skin", label: "피부 상태", image: HOME_IMAGES.iconSkin, action: "capture" },
  { id: "eye", label: "눈 주름", image: HOME_IMAGES.iconEye, action: "eye" },
  { id: "trouble", label: "트러블 체크", image: HOME_IMAGES.iconTrouble, action: "trouble" },
  { id: "ox", label: "OX 체크", image: HOME_IMAGES.iconOx, action: "ox" },
];

const REVIEW_ITEMS: ReviewCard[] = [
  {
    id: "review-1",
    title: "미리 만나는 체험단 후기",
    subtitle: "탄력이 차오르는 느낌이에요.",
    rating: 5,
    image: HOME_IMAGES.review1,
  },
  {
    id: "review-2",
    title: "미리 만나는 체험단 후기",
    subtitle: "수분감이 확실해요.",
    rating: 5,
    image: HOME_IMAGES.review2,
  },
  {
    id: "review-3",
    title: "미리 만나는 체험단 후기",
    subtitle: "주름이 옅어졌어요.",
    rating: 5,
    image: HOME_IMAGES.review3,
  },
];

const TAB_ITEMS = [
  { key: "home", label: "홈", icon: "home", active: true },
  { key: "report", label: "리포트", icon: "report", action: "reports" as TabAction },
  { key: "routine", label: "루틴", icon: "routine", action: "routine" as TabAction },
  { key: "recommend", label: "추천", icon: "recommend", action: "recommend" as TabAction },
  { key: "mypage", label: "마이", icon: "mypage", action: "mypage" as TabAction },
];

export default function HomeScreen() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const { loading: checkingDetails } = useRequireProfileDetails();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setCheckingSession(false);
      } else {
        router.replace("/auth");
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace("/auth");
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleStartCapture = () => {
    router.push("/capture");
  };

  const handleEyeWrinkle = () => {
    router.push("/eye-wrinkle");
  };

  const handleOpenReports = () => {
    router.push("/reports");
  };

  const handleStripBanner = () => {
    router.push("/recommend");
  };

  const handleAiCardPress = (action?: AiCheckAction) => {
    if (!action) return;
    if (action === "capture") {
      handleStartCapture();
    } else if (action === "eye") {
      handleEyeWrinkle();
    } else if (action === "trouble") {
      router.push("/trouble-check");
    } else if (action === "ox") {
      router.push("/ox-check");
    }
  };

  const handleTabPress = (action?: TabAction) => {
    if (!action) return;
    if (action === "reports") {
      handleOpenReports();
      return;
    }
    if (action === "routine") {
      router.push("/routine");
      return;
    }
    if (action === "recommend") {
      router.push("/recommend");
      return;
    }
    if (action === "mypage") {
      router.push("/mypage");
    }
  };

  if (checkingSession || checkingDetails) {
    return (
      <SafeAreaView style={styles.loadingSafeArea}>
        <StatusBar style="dark" />
        <ActivityIndicator color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.logoWrapper}>
            <Image source={HOME_IMAGES.logo} style={styles.logoImage} resizeMode="contain" />
          </View>
          <Pressable style={styles.notificationButton} accessibilityRole="button">
            <View style={styles.notificationBell} />
            <View style={styles.notificationBadge} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Pressable style={styles.heroCard} onPress={handleStartCapture}>
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroEyebrow}>{HERO_CARD.eyebrow}</Text>
              <Text style={styles.heroTitle}>{HERO_CARD.title}</Text>
              <Text style={styles.heroDescription}>{HERO_CARD.description}</Text>
              <View style={styles.heroCta}>
                <Text style={styles.heroCtaText}>{HERO_CARD.cta}</Text>
              </View>
            </View>
            <Image source={HOME_IMAGES.hero} style={styles.heroImage} resizeMode="contain" />
          </Pressable>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>AI 피부 체크</Text>
            <View style={styles.aiGrid}>
              {AI_CHECK_ITEMS.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.aiCard, item.comingSoon && styles.aiCardDisabled]}
                  disabled={!item.action}
                  onPress={() => handleAiCardPress(item.action)}
                >
                  <View style={styles.aiImageWrapper}>
                    <Image source={item.image} style={styles.aiImage} resizeMode="contain" />
                  </View>
                  <Text style={styles.aiLabel}>{item.label}</Text>
                  {item.comingSoon && <Text style={styles.aiBadge}>준비중</Text>}
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable style={styles.stripBanner} onPress={handleStripBanner}>
            <View>
              <Text style={styles.stripEyebrow}>나의 피부에 맞는</Text>
              <Text style={styles.stripTitle}>성분으로만 구성된 제품</Text>
            </View>
            <Image
              source={HOME_IMAGES.strip}
              style={styles.stripImage}
              resizeMode="contain"
            />
          </Pressable>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>꾸준한 변화 후기</Text>
              <Text style={styles.sectionSubtitle}>실제 이용자가 보내온 생생한 후기</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.reviewRow}
            >
              {REVIEW_ITEMS.map((card) => (
                <View key={card.id} style={styles.reviewCard}>
                  <Image source={card.image} style={styles.reviewImage} resizeMode="cover" />
                  <View style={styles.reviewOverlay}>
                    <Text style={styles.reviewStars}>{"★".repeat(card.rating)}</Text>
                    <Text style={styles.reviewTitle}>{card.title}</Text>
                    <Text style={styles.reviewSubtitle}>{card.subtitle}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <Pressable style={styles.moreButton} onPress={handleOpenReports}>
              <Text style={styles.moreButtonText}>자세히 보기</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.bottomTabWrapper}>
          {TAB_ITEMS.map((tab) => (
            <Pressable
              key={tab.key}
              style={styles.tabItem}
              accessibilityRole={tab.action ? "button" : undefined}
              onPress={() => handleTabPress(tab.action)}
            >
              <View
                style={[
                  styles.tabDot,
                  tab.active && { backgroundColor: COLORS.primary },
                ]}
              />
              <Text style={tab.active ? styles.tabLabelActive : styles.tabLabel}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingSafeArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  logoWrapper: {
    height: 32,
    justifyContent: "center",
  },
  logoImage: {
    height: 32,
    width: 120,
  },
  notificationButton: {
    height: 32,
    width: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  notificationBell: {
    width: 12,
    height: 14,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: COLORS.primary,
  },
  notificationBadge: {
    position: "absolute",
    top: 6,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF5A79",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 140,
    gap: 28,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.gray100,
    borderRadius: 28,
    padding: 20,
    overflow: "hidden",
  },
  heroTextBlock: {
    flex: 1,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  heroDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  heroCta: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    alignSelf: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 16,
  },
  heroCtaText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  heroImage: {
    width: 120,
    height: 120,
    marginLeft: 12,
  },
  section: {
    gap: 14,
  },
  sectionHeader: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  aiGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  aiCard: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  aiCardDisabled: {
    backgroundColor: COLORS.badgeGray,
  },
  aiImageWrapper: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.gray100,
    justifyContent: "center",
    alignItems: "center",
  },
  aiImage: {
    width: 44,
    height: 44,
  },
  aiLabel: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  aiBadge: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  stripBanner: {
    backgroundColor: "#A3AE97",
    borderRadius: 26,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stripEyebrow: {
    color: "#F6F6F0",
    fontSize: 13,
  },
  stripTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },
  stripImage: {
    width: 80,
    height: 60,
  },
  reviewRow: {
    gap: 12,
  },
  reviewCard: {
    width: 160,
    height: 200,
    borderRadius: 24,
    overflow: "hidden",
    position: "relative",
  },
  reviewImage: {
    width: "100%",
    height: "100%",
  },
  reviewOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    gap: 4,
  },
  reviewStars: {
    color: "#FFD94C",
    fontSize: 12,
  },
  reviewTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  reviewSubtitle: {
    color: "#E6E6EB",
    fontSize: 12,
  },
  moreButton: {
    marginTop: 8,
    alignSelf: "center",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  moreButtonText: {
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  bottomTabWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.background,
    paddingBottom: 12,
    paddingTop: 8,
    justifyContent: "space-around",
  },
  tabItem: {
    alignItems: "center",
    gap: 4,
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#B6B6C0",
  },
  tabLabel: {
    fontSize: 11,
    color: "#B6B6C0",
  },
  tabLabelActive: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: "600",
  },
});
