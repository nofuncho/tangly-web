/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",     // ← 핵심: app 전체를 스캔
    "./components/**/*.{js,ts,jsx,tsx}", // ← 컴포넌트 폴더 사용하는 경우 유지 가능
  ],
  theme: {
    extend: {
      colors: {
        lilac: {
          light: "#E9D7F7",
          DEFAULT: "#C9A7E6",
          dark: "#A884CC",
        },
        pearl: "#F7F4FF",
      },
      boxShadow: {
        glow: "0 0 20px rgba(201, 167, 230, 0.4)",
      },
    },
  },
  plugins: [],
};
