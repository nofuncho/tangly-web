import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useRequireProfileDetails } from "@/hooks/use-profile-details";

export default function RecommendScreen() {
  const { loading: checkingDetails } = useRequireProfileDetails();

  if (checkingDetails) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#A884CC" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>추천</Text>
        <Text style={styles.description}>현재 준비중입니다.</Text>
        <Text style={styles.helper}>조금만 기다려 주세요. 곧 맞춤 추천을 만날 수 있어요.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F1F24",
  },
  description: {
    fontSize: 18,
    fontWeight: "500",
    color: "#1F1F24",
  },
  helper: {
    fontSize: 16,
    color: "#6F6F73",
  },
});
