import { useState } from "react";
import {
  ActivityIndicator,
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
import { SERVER_BASE_URL } from "@/lib/server";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedPassword = password.trim();
  const trimmedConfirm = confirmPassword.trim();

  const disableSubmit =
    submitting ||
    !trimmedName ||
    !trimmedEmail ||
    trimmedPassword.length < 6 ||
    trimmedPassword !== trimmedConfirm;

  const handleSubmit = async () => {
    if (disableSubmit) {
      return;
    }
    try {
      setSubmitting(true);
      setErrorMessage(null);
      if (!SERVER_BASE_URL) {
        throw new Error("서버 주소가 설정되지 않았습니다.");
      }

      const response = await fetch(`${SERVER_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password: trimmedPassword,
          displayName: trimmedName,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "가입에 실패했습니다.");
      }

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });
      if (loginError) {
        throw loginError;
      }
      await upsertProfile({ userId: loginData.user?.id, displayName: trimmedName });
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "가입 중 오류가 발생했습니다.";
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <Text style={styles.title}>이메일로 Tangly 가입</Text>
        <Text style={styles.subtitle}>루틴을 저장하고 맞춤 추천을 받으려면 간단히 정보를 입력하세요.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="홍길동"
            placeholderTextColor="#B9B9BF"
          />
          <Text style={styles.label}>이메일</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@example.com"
            placeholderTextColor="#B9B9BF"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="6자 이상"
            placeholderTextColor="#B9B9BF"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.label}>비밀번호 확인</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="다시 입력"
            placeholderTextColor="#B9B9BF"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Pressable
            style={[styles.submitButton, disableSubmit && styles.disabledButton]}
            onPress={handleSubmit}
            disabled={disableSubmit}
          >
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>가입하기</Text>}
          </Pressable>
          <Pressable style={styles.backLink} onPress={() => router.back()}>
            <Text style={styles.backText}>이미 계정이 있나요? 로그인</Text>
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
    backgroundColor: "#FFFFFF",
  },
  container: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F1F24",
    marginTop: 16,
  },
  subtitle: {
    fontSize: 14,
    color: "#6D6D74",
    marginTop: 8,
  },
  form: {
    marginTop: 28,
    gap: 10,
  },
  label: {
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
    marginBottom: 6,
  },
  submitButton: {
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#A884CC",
  },
  disabledButton: {
    backgroundColor: "#D7C9EC",
  },
  submitText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  backLink: {
    marginTop: 12,
    alignItems: "center",
  },
  backText: {
    fontSize: 14,
    color: "#715993",
    fontWeight: "600",
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: "#D6455D",
    textAlign: "center",
  },
});
