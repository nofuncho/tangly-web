import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { supabase, upsertProfile } from "@/lib/supabase";

const HERO_IMAGES = [
  {
    id: "skin",
    label: "skin type",
    uri: "https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "color",
    label: "personal color",
    uri: "https://images.unsplash.com/photo-1503863937795-62954a3c0f05?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "cosmetics",
    label: "cosmetics",
    uri: "https://images.unsplash.com/photo-1478641300939-0ec5188d3802?auto=format&fit=crop&w=900&q=60",
  },
];

export default function LoginScreen() {
  const router = useRouter();
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();
  const disableLogin = authLoading || trimmedEmail.length === 0 || trimmedPassword.length < 6;

  const heroRows = useMemo(() => HERO_IMAGES, []);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
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
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSocialLogin = (provider: "kakao" | "google") => {
    Alert.alert("준비 중", `${provider === "kakao" ? "카카오" : "구글"} 로그인은 곧 연결될 예정입니다.`);
  };

  const handleEmailLogin = async () => {
    if (disableLogin) {
      return;
    }
    try {
      setAuthLoading(true);
      setErrorMessage(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail.toLowerCase(),
        password: trimmedPassword,
      });
      if (error) {
        throw error;
      }
      setEmail("");
      setPassword("");
      await upsertProfile({ userId: data.user?.id });
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "로그인 중 문제가 발생했습니다.";
      setErrorMessage(message);
    } finally {
      setAuthLoading(false);
    }
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
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <View style={styles.heroSection}>
          {heroRows.map((row) => (
            <ImageBackground
              resizeMode="cover"
              source={{ uri: row.uri }}
              key={row.id}
              style={styles.heroRow}
              imageStyle={styles.heroImage}
            >
              <View style={styles.heroOverlay} />
              <Text style={styles.heroLabel}>{row.label}</Text>
            </ImageBackground>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.welcomeTitle}>Tangly와 피부 여정을 시작해요</Text>
          <Text style={styles.welcomeSubtitle}>편안하게 사용할 로그인 방식을 선택하세요.</Text>

          <Pressable style={[styles.socialButton, styles.kakaoButton]} onPress={() => handleSocialLogin("kakao")}>
            <View style={[styles.socialIcon, styles.kakaoIcon]} />
            <Text style={styles.kakaoText}>카카오로 로그인</Text>
          </Pressable>
          <Pressable style={[styles.socialButton, styles.googleButton]} onPress={() => handleSocialLogin("google")}>
            <View style={[styles.socialIcon, styles.googleIcon]} />
            <Text style={styles.googleText}>구글로 로그인</Text>
          </Pressable>

          <Pressable
            style={styles.toggleButton}
            onPress={() => setShowEmailLogin((prev) => !prev)}
            hitSlop={8}
          >
            <Text style={styles.toggleText}>{showEmailLogin ? "다른 방법 접기" : "다른 방법으로 로그인"}</Text>
          </Pressable>

          {showEmailLogin && (
            <View style={styles.emailBox}>
              <Text style={styles.emailLabel}>이메일</Text>
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor="#B9B9BF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
              />
              <Text style={styles.emailLabel}>비밀번호</Text>
              <TextInput
                style={styles.input}
                placeholder="6자 이상 입력"
                placeholderTextColor="#B9B9BF"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable
                onPress={handleEmailLogin}
              style={[styles.emailLoginButton, disableLogin && styles.disabledButton]}
              disabled={disableLogin}
            >
                {authLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.emailLoginText}>이메일로 로그인</Text>}
              </Pressable>
              <Pressable style={styles.linkButton} onPress={() => router.push("/auth/register")}>
                <Text style={styles.linkText}>이메일로 가입하기</Text>
              </Pressable>
              {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    paddingBottom: 32,
  },
  heroSection: {
    height: 360,
  },
  heroRow: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  heroImage: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  heroLabel: {
    fontSize: 26,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  card: {
    marginTop: -40,
    marginHorizontal: 20,
    padding: 24,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1F1F24",
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: "#6D6D74",
    marginTop: 6,
    marginBottom: 24,
  },
  socialButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  kakaoButton: {
    backgroundColor: "#FEE500",
  },
  googleButton: {
    borderWidth: 1,
    borderColor: "#DFE1E5",
    backgroundColor: "#FFFFFF",
  },
  socialIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 12,
  },
  kakaoIcon: {
    backgroundColor: "#371D1E",
  },
  googleIcon: {
    borderWidth: 1,
    borderColor: "#4285F4",
  },
  kakaoText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#211100",
  },
  googleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F1F24",
  },
  toggleButton: {
    marginTop: 12,
    alignSelf: "center",
  },
  toggleText: {
    fontSize: 13,
    color: "#9B9BA5",
  },
  emailBox: {
    marginTop: 20,
    borderTopWidth: 1,
    borderColor: "#F0F0F4",
    paddingTop: 16,
    gap: 10,
  },
  emailLabel: {
    fontSize: 13,
    color: "#5B5B63",
  },
  input: {
    borderWidth: 1,
    borderColor: "#E3E3EA",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1F1F24",
  },
  emailLoginButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#A884CC",
  },
  disabledButton: {
    backgroundColor: "#D7C9EC",
  },
  emailLoginText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  linkButton: {
    marginTop: 8,
    alignItems: "center",
  },
  linkText: {
    fontSize: 14,
    color: "#715993",
    fontWeight: "600",
  },
  errorText: {
    marginTop: 8,
    textAlign: "center",
    color: "#D6455D",
    fontSize: 13,
  },
});
