# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## AI 피부 진단 흐름

1. 홈 화면 상단의 **AI 피부 진단** 배너를 누르면 전면 카메라가 열립니다.
2. 촬영 버튼을 누르면 전체 화면 플래시가 켜지고, 촬영된 이미지는 미리보기 카드에 표시됩니다.
3. 촬영 직후 파일이 Next.js 업로드 API(`EXPO_PUBLIC_UPLOAD_API_URL`)로 전송됩니다. 이 API가 Supabase Storage + DB 저장을 처리합니다.
4. 업로드가 끝나면 서버에서 돌려준 `publicUrl` 로 미리보기가 갱신되고 "피부 점수 계산 준비 중" 메시지가 표시됩니다.

> ⚠️ `.env` 혹은 app config에 아래 값을 꼭 설정하세요.
> ```
> EXPO_PUBLIC_UPLOAD_API_URL=http://<your-next-host>/api/upload
> ```
> 로컬 개발 시에는 노트북의 LAN IP를 사용해야 기기에서 접근할 수 있습니다(예: `http://192.168.0.20:3000/api/upload`).

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
