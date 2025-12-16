import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  primary: "#A884CC",
  background: "#FFFFFF",
  textPrimary: "#1F1F24",
  textSecondary: "#6F6F73",
  divider: "#E6E6EB",
  paleLavender: "#F6F3FB",
  softLavender: "#E7DAF7",
  subtleGray: "#F4F4F6",
};

const FEATURE_ITEMS: FeatureItem[] = [
  { key: "capture", label: "피부촬영", icon: "lens", action: "capture" },
  { key: "eye", label: "눈주름검사", icon: "eye" },
  { key: "color", label: "퍼스널컬러", icon: "palette", action: "personalColor" },
  { key: "report", label: "리포트", icon: "report", action: "reports" },
  { key: "product", label: "찰떡 제품", icon: "product" },
];

const CONTENT_CARDS = [
  {
    id: "balance",
    title: "임시 콘텐츠 카드",
    description: "실제 콘텐츠가 들어오기 전까지 화면 균형을 체크하는 자리입니다.",
  },
  {
    id: "routine",
    title: "리스트 스타일 플레이스홀더",
    description: "스크롤 구조를 검증하기 위한 더미 콘텐츠입니다.",
  },
];

const TAB_ITEMS: TabItem[] = [
  { key: "home", label: "홈", icon: "home", active: true },
  { key: "report", label: "리포트", icon: "report", action: "reports" },
  { key: "deal", label: "최저가", icon: "deal" },
  { key: "mypage", label: "마이페이지", icon: "mypage" },
];

type FeatureAction = "capture" | "reports" | "personalColor";
type FeatureIconType = "lens" | "eye" | "palette" | "report" | "product";
type FeatureItem = {
  key: string;
  label: string;
  icon: FeatureIconType;
  action?: FeatureAction;
};

type TabAction = FeatureAction;
type TabIconType = "home" | "report" | "deal" | "mypage";
type TabItem = {
  key: string;
  label: string;
  icon: TabIconType;
  active?: boolean;
  action?: TabAction;
};

export default function HomeScreen() {
  const router = useRouter();

  const handleStartCapture = () => {
    router.push("/capture");
  };

  const handlePersonalColor = () => {
    router.push("/personal-color");
  };

  const handleOpenReports = () => {
    router.push("/reports");
  };

  const handleFeaturePress = (action?: FeatureAction) => {
    if (!action) return;
    if (action === "capture") {
      handleStartCapture();
      return;
    }
    if (action === "personalColor") {
      handlePersonalColor();
      return;
    }
    if (action === "reports") {
      handleOpenReports();
    }
  };

  const handleTabPress = (action?: TabAction) => {
    if (!action) return;
    if (action === "reports") {
      handleOpenReports();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.logoWrapper}>
            <CloudLogoMark />
            <Text style={styles.logoText}>Tangly</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable style={styles.actionIcon} accessibilityLabel="알림 보기">
              <NotificationIcon />
            </Pressable>
            <Pressable style={styles.actionIcon} accessibilityLabel="메뉴 열기">
              <MenuIcon />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={handleStartCapture}
            style={styles.bannerCard}
            accessibilityRole="button"
            accessibilityLabel="피부 사진 촬영으로 이동"
          >
            <View style={styles.bannerTextArea}>
              <Text style={styles.bannerSubtitle}>지금 피부 상태</Text>
              <Text style={styles.bannerTitle}>사진으로 확인해보세요</Text>
              <Text style={styles.bannerBody}>
                광채 · 탄력 · 주름을 한 번에 분석해드려요
              </Text>
              <View style={styles.bannerButton}>
                <Text style={styles.bannerButtonText}>촬영 시작하기</Text>
              </View>
            </View>
            <MeasurementIllustration />
          </Pressable>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>주요 기능</Text>
            <View style={styles.featureRow}>
              {FEATURE_ITEMS.map((item) => (
                <Pressable
                  key={item.key}
                  style={styles.featureItem}
                  accessibilityLabel={item.label}
                  accessibilityRole={item.action ? "button" : undefined}
                  onPress={() => handleFeaturePress(item.action)}
                >
                  <View style={styles.featureIconWrapper}>
                    <FeatureIcon type={item.icon} />
                  </View>
                  <Text style={styles.featureLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>콘텐츠 프리뷰</Text>
            {CONTENT_CARDS.map((card) => (
              <View key={card.id} style={styles.placeholderCard}>
                <View style={styles.placeholderBadge} />
                <View style={styles.placeholderTextBlock}>
                  <Text style={styles.placeholderTitle}>{card.title}</Text>
                  <Text style={styles.placeholderDescription}>{card.description}</Text>
                </View>
              </View>
            ))}
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
              <TabIcon type={tab.icon} active={tab.active} />
              <Text style={tab.active ? styles.tabLabelActive : styles.tabLabel}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function CloudLogoMark() {
  return (
    <View style={styles.cloudLogo}>
      <View style={styles.cloudBase} />
      <View style={[styles.cloudCircleLarge, styles.cloudCircleCenter]} />
      <View style={[styles.cloudCircleSmall, styles.cloudCircleLeft]} />
      <View style={[styles.cloudCircleSmall, styles.cloudCircleRight]} />
    </View>
  );
}

function FeatureIcon({ type }: { type: FeatureIconType }) {
  switch (type) {
    case "lens":
      return (
        <View style={styles.lensIcon}>
          <View style={styles.lensInner} />
        </View>
      );
    case "eye":
      return (
        <View style={styles.eyeIcon}>
          <View style={styles.eyeLid} />
          <View style={styles.eyeIris} />
        </View>
      );
    case "palette":
      return (
        <View style={styles.paletteIcon}>
          <View style={styles.paletteDotPrimary} />
          <View style={styles.paletteDotSecondary} />
          <View style={styles.paletteDotTertiary} />
        </View>
      );
    case "report":
      return (
        <View style={styles.reportIcon}>
          <View style={styles.reportBarTall} />
          <View style={styles.reportBarMedium} />
          <View style={styles.reportBarShort} />
        </View>
      );
    case "product":
    default:
      return (
        <View style={styles.productIcon}>
          <View style={styles.productCap} />
          <View style={styles.productBody} />
        </View>
      );
  }
}

function TabIcon({ type, active }: { type: TabIconType; active?: boolean }) {
  const color = active ? COLORS.primary : "#B6B6C0";

  switch (type) {
    case "home":
      return <View style={[styles.tabHome, { borderColor: color }]} />;
    case "report":
      return (
        <View style={styles.tabReport}>
          <View style={[styles.tabReportLine, { width: 18, backgroundColor: color }]} />
          <View style={[styles.tabReportLine, { width: 14, backgroundColor: color }]} />
          <View style={[styles.tabReportLine, { width: 10, backgroundColor: color }]} />
        </View>
      );
    case "deal":
      return (
        <View style={styles.tabDeal}>
          <View style={[styles.coinOuter, { borderColor: color }]}> 
            <View style={[styles.coinInner, { backgroundColor: color }]} />
          </View>
        </View>
      );
    case "mypage":
    default:
      return (
        <View style={styles.tabMy}>
          <View style={[styles.tabMyCircle, { borderColor: color }]} />
          <View style={[styles.tabMyBody, { backgroundColor: color }]} />
        </View>
      );
  }
}

function MeasurementIllustration() {
  return (
    <View style={styles.bannerIllustration}>
      <View style={styles.bannerSheet}>
        <View style={styles.bannerChartRow}>
          <View style={styles.bannerChartBlock} />
          <View style={styles.bannerChartBlock} />
        </View>
        <View style={styles.bannerChartRow}>
          <View style={[styles.bannerChartBlock, styles.bannerChartAccent]} />
          <View style={styles.bannerChartBlock} />
        </View>
      </View>
      <View style={styles.bannerTagRow}>
        <View style={styles.bannerTag} />
        <View style={[styles.bannerTag, styles.bannerTagSecondary]} />
      </View>
      <View style={styles.bannerLensOuter}>
        <View style={styles.bannerLensInner} />
      </View>
    </View>
  );
}

function NotificationIcon() {
  return (
    <View style={styles.notificationIcon}>
      <View style={styles.notificationBell} />
      <View style={styles.notificationClapper} />
    </View>
  );
}

function MenuIcon() {
  return (
    <View style={styles.menuIcon}>
      <View style={styles.menuLine} />
      <View style={styles.menuLine} />
      <View style={styles.menuLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  logoWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cloudLogo: {
    width: 46,
    height: 34,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  cloudBase: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 18,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    zIndex: 1,
  },
  cloudCircleLarge: {
    position: "absolute",
    top: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    zIndex: 2,
  },
  cloudCircleSmall: {
    position: "absolute",
    top: 9,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    zIndex: 2,
  },
  cloudCircleCenter: {
    left: 8,
  },
  cloudCircleLeft: {
    left: -2,
  },
  cloudCircleRight: {
    right: -2,
  },
  logoText: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  topActions: {
    flexDirection: "row",
    gap: 12,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.divider,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 140,
  },
  bannerCard: {
    backgroundColor: COLORS.paleLavender,
    borderRadius: 24,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.softLavender,
  },
  bannerTextArea: {
    flex: 1,
    paddingRight: 16,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  bannerBody: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  bannerButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: "flex-start",
  },
  bannerButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  bannerIllustration: {
    width: 120,
    height: 120,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 16,
    justifyContent: "space-between",
  },
  bannerSheet: {
    backgroundColor: COLORS.subtleGray,
    borderRadius: 16,
    padding: 8,
  },
  bannerChartRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  bannerChartBlock: {
    width: 26,
    height: 20,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  bannerChartAccent: {
    backgroundColor: COLORS.primary,
  },
  bannerTagRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  bannerTag: {
    width: 36,
    height: 14,
    borderRadius: 10,
    backgroundColor: COLORS.softLavender,
  },
  bannerTagSecondary: {
    opacity: 0.6,
  },
  bannerLensOuter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: COLORS.primary,
    alignSelf: "center",
    marginTop: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  bannerLensInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  featureItem: {
    flex: 1,
    alignItems: "center",
  },
  featureIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.softLavender,
    backgroundColor: COLORS.paleLavender,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  featureLabel: {
    fontSize: 13,
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  placeholderCard: {
    backgroundColor: COLORS.subtleGray,
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  placeholderBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.softLavender,
    marginRight: 12,
  },
  placeholderTextBlock: {
    flex: 1,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  placeholderDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  bottomTabWrapper: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: COLORS.divider,
    backgroundColor: COLORS.background,
  },
  tabItem: {
    alignItems: "center",
    gap: 4,
  },
  tabLabel: {
    fontSize: 11,
    color: "#8E8E93",
  },
  tabLabelActive: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: "600",
  },
  lensIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  lensInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  eyeIcon: {
    width: 42,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  eyeLid: {
    position: "absolute",
    width: 24,
    height: 2,
    backgroundColor: COLORS.primary,
  },
  eyeIris: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  paletteIcon: {
    width: 40,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.softLavender,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  paletteDotPrimary: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  paletteDotSecondary: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C8BCD8",
  },
  paletteDotTertiary: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#B2A5C5",
  },
  reportIcon: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  reportBarTall: {
    width: 10,
    height: 32,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  reportBarMedium: {
    width: 10,
    height: 24,
    borderRadius: 4,
    backgroundColor: "#C9B8E1",
  },
  reportBarShort: {
    width: 10,
    height: 16,
    borderRadius: 4,
    backgroundColor: "#E4D9F2",
  },
  productIcon: {
    width: 28,
    alignItems: "center",
  },
  productCap: {
    width: 18,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginBottom: 4,
  },
  productBody: {
    width: 24,
    height: 28,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  tabHome: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
  },
  tabReport: {
    width: 20,
    alignItems: "flex-end",
    gap: 3,
  },
  tabReportLine: {
    height: 4,
    borderRadius: 2,
  },
  tabDeal: {
    alignItems: "center",
  },
  coinOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  coinInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabMy: {
    alignItems: "center",
    gap: 4,
  },
  tabMyCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  tabMyBody: {
    width: 14,
    height: 6,
    borderRadius: 3,
  },
  notificationIcon: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  notificationBell: {
    width: 16,
    height: 16,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.textPrimary,
  },
  notificationClapper: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textPrimary,
  },
  menuIcon: {
    gap: 4,
  },
  menuLine: {
    width: 18,
    height: 2,
    backgroundColor: COLORS.textPrimary,
  },
});
