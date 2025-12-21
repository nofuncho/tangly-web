// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

const config = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
]);

export default config;
