import { useColorScheme as useRNColorScheme } from "react-native";

/**
 * To support static rendering, fall back to light mode until the browser can provide the preference.
 */
export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  const isBrowser = typeof window !== "undefined";

  if (!isBrowser) {
    return "light";
  }

  return colorScheme ?? "light";
}
