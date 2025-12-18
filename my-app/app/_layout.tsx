import { useEffect } from "react";
import { Text, TextInput } from "react-native";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import PretendardFont from "../assets/fonts/PretendardVariable.ttf";
import { ProfileDetailsProvider } from "@/contexts/profile-details-context";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Pretendard: PretendardFont,
  });

  useEffect(() => {
    if (fontsLoaded) {
      const fontStyle = { fontFamily: 'Pretendard' };
      Text.defaultProps ??= {};
      Text.defaultProps.style = [Text.defaultProps.style, fontStyle].filter(Boolean);
      TextInput.defaultProps ??= {};
      TextInput.defaultProps.style = [TextInput.defaultProps.style, fontStyle].filter(Boolean);
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ProfileDetailsProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} initialRouteName="auth/index">
          <Stack.Screen name="auth/index" />
          <Stack.Screen name="auth/register" />
          <Stack.Screen name="auth/email-login" />
          <Stack.Screen name="index" />
          <Stack.Screen name="capture" />
          <Stack.Screen name="eye-wrinkle/index" />
          <Stack.Screen name="personal-color/index" />
          <Stack.Screen name="reports/index" />
          <Stack.Screen name="reports/[id]" />
          <Stack.Screen name="routine/index" />
          <Stack.Screen name="mypage/index" />
          <Stack.Screen name="onboarding/details" />
          <Stack.Screen
            name="modal"
            options={{
              presentation: "modal",
              title: "Modal",
              headerShown: true,
            }}
          />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ProfileDetailsProvider>
  );
}
