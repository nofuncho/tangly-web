# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## AI 피부 진단 흐름

1. 홈 화면 상단의 **AI 피부 진단** 배너를 누르면 전면 카메라가 열립니다.
2. 촬영 버튼을 누를 때 전체 화면 플래시가 켜지고, 촬영된 이미지는 미리보기 카드에 표시됩니다.
3. 촬영 직후 이미지가 Supabase Storage 버킷(`EXPO_PUBLIC_SUPABASE_BUCKET`)으로 업로드되고 public URL이 노출됩니다.
4. 이어서 `photos` 테이블에 이미지 경로/URL이 저장됩니다. 업로드가 끝나면 "피부 점수 계산 준비 중" 상태 메시지를 확인할 수 있습니다.

> ⚠️ `.env` (or app.config) needs the following keys before building:
> ```
> EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
> EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
> EXPO_PUBLIC_SUPABASE_BUCKET=photos
> ```
> The anon key must have RLS/storage policies that allow inserts/uploads from mobile clients.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
