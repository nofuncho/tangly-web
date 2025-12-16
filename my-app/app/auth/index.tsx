import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase } from "@/lib/supabase";
import LoginGraphic from "@/assets/images/login-background.png";
import TanglyLogo from "@/assets/images/logo-tangly.png";

export default function LoginScreen() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        router.replace("/");
      } else {
        setCheckingSession(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/");
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSocialLogin = (provider: "kakao" | "google") => {
    Alert.alert("준비 중", `${provider === "kakao" ? "카카오" : "구글"} 로그인은 곧 연결될 예정입니다.`);
  };

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingState}>
          <ActivityIndicator color="#A884CC" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image source={LoginGraphic} style={styles.backgroundImage} resizeMode="cover" />
      <ScrollView contentContainerStyle={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.heroSection}>
          <Image source={TanglyLogo} style={styles.heroLogo} resizeMode="contain" />
          <Text style={styles.heroHeadline}>끝나지 않는{"\n"}탱탱함, 탱글리</Text>
          <Text style={styles.heroTagline}>사진 한 장으로 루틴이 달라집니다.</Text>
        </View>

        <View style={styles.buttonStack}>
          <Pressable style={[styles.loginButton, styles.kakaoButton]} onPress={() => handleSocialLogin("kakao")}>
            <Text style={styles.kakaoText}>카카오로 로그인</Text>
          </Pressable>
          <Pressable style={[styles.loginButton, styles.emailTrigger]} onPress={() => router.push("/auth/email-login")}>
            <Text style={styles.emailTriggerText}>이메일로 로그인</Text>
          </Pressable>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  container: {
    paddingBottom: 48,
    paddingHorizontal: 20,
    gap: 24,
  },
  heroSection: {
    alignItems: "center",
    paddingTop: 140,
    paddingBottom: 16,
  },
  heroLogo: {
    width: 108,
    height: 40,
    marginBottom: 8,
  },
  heroHeadline: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1F1F24",
    textAlign: "center",
    lineHeight: 34,
  },
  heroTagline: {
    fontSize: 14,
    color: "#6D6D74",
    marginTop: 6,
    textAlign: "center",
  },
  buttonStack: {
    gap: 14,
  },
  loginButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
  },
  kakaoButton: {
    backgroundColor: "#FEE500",
  },
  emailTrigger: {
    backgroundColor: "#E5E5EB",
  },
  kakaoText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#211100",
  },
  emailTriggerText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1F1F24",
  },
});

