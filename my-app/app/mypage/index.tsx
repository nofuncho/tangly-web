import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";

export default function MyPageScreen() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <Text style={styles.title}>마이페이지</Text>
        <Text style={styles.subtitle}>Tangly 계정과 기본 정보를 관리합니다.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>계정</Text>
          <Text style={styles.cardText}>다른 기기에서도 같은 계정으로 로그인할 수 있어요.</Text>
          <Pressable style={[styles.logoutButton, signingOut && styles.logoutDisabled]} disabled={signingOut} onPress={handleSignOut}>
            <Text style={styles.logoutText}>{signingOut ? "로그아웃 중..." : "로그아웃"}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F7FB",
  },
  container: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1F1F24",
  },
  subtitle: {
    fontSize: 14,
    color: "#6D6D74",
  },
  card: {
    marginTop: 12,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F1F24",
  },
  cardText: {
    fontSize: 14,
    color: "#6D6D74",
  },
  logoutButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#1F1F24",
  },
  logoutDisabled: {
    opacity: 0.6,
  },
  logoutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
});

