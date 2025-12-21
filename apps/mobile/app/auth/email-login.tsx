import { useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import TanglyLogo from "@/assets/images/logo-tangly.png";

export default function EmailLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();
  const disableLogin = loading || trimmedEmail.length === 0 || trimmedPassword.length < 6;

  const handleLogin = async () => {
    if (disableLogin) {
      return;
    }
    try {
      setLoading(true);
      setErrorMessage(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail.toLowerCase(),
        password: trimmedPassword,
      });
      if (error) {
        throw error;
      }
      await upsertProfile({ userId: data.user?.id });
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "로그인 중 문제가 발생했습니다.";
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image source={TanglyLogo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>이메일 로그인</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.label}>이메일 주소</Text>
          <TextInput
            style={styles.input}
            placeholder="name@example.com"
            placeholderTextColor="#B8AFCF"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            style={styles.input}
            placeholder="6자 이상 입력"
            placeholderTextColor="#B8AFCF"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable style={[styles.primaryButton, disableLogin && styles.disabledButton]} disabled={disableLogin} onPress={handleLogin}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>로그인</Text>}
          </Pressable>
          <Pressable style={styles.linkButton} onPress={() => router.push("/auth/register")}>
            <Text style={styles.linkText}>이메일로 가입하기</Text>
          </Pressable>
          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#EBDDF6",
  },
  container: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  header: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 24,
  },
  logo: {
    width: 110,
    height: 44,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1F1F24",
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    color: "#6E6580",
  },
  input: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1F1F24",
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: "#A884CC",
    alignItems: "center",
    paddingVertical: 16,
  },
  disabledButton: {
    backgroundColor: "#D7C9EC",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  linkButton: {
    marginTop: 16,
    alignItems: "center",
  },
  linkText: {
    fontSize: 15,
    color: "#6E5CA8",
    textDecorationLine: "underline",
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: "#D6455D",
    textAlign: "center",
  },
});
