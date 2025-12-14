# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## AI 피부 촬영 플로우

1. 세션을 시작하면 2단계(step-based) 촬영이 순차적으로 진행됩니다.
   - **STEP 1 · 기준 얼굴(base)** : 얼굴 전체가 원형 가이드에 들어오도록 촬영
   - **STEP 2 · 볼 클로즈업(cheek)** : 볼에 최대한 가까이 다가가 피부 결을 확보
2. 각 단계는 **품질 판정**을 거치며, “분석에 적합/다시 촬영 권장” 메시지를 보여줍니다.
3. 품질을 통과한 촬영만 Next.js 업로드 API(`EXPO_PUBLIC_UPLOAD_API_URL`)로 전송되고, 서버가 Supabase Storage + `photos` 테이블 insert를 처리합니다.
4. 서버는 `analysis_sessions`를 먼저 생성하고, 촬영 결과는 해당 `session_id`로 저장됩니다.
5. 촬영이 모두 끝나면 바로 **AI 분석 중** 화면 → 설명형 **1차 리포트** 흐름이 재생됩니다 (점수 대신 언어 중심 요약).
6. 리포트 화면에서 생활습관 **OX 질문**을 추가로 받을 수 있으며, 각 응답은 `ox_responses` 테이블에 row 단위(`question_key`, `answer`)로 저장돼 향후 리포트 문장 톤을 보정합니다.

> ⚠️ `.env` 혹은 app config에 아래 값을 꼭 설정하세요.
> ```
> EXPO_PUBLIC_UPLOAD_API_URL=http://<your-next-host>/api/upload
> EXPO_PUBLIC_SERVER_BASE_URL=http://<your-next-host>
> ```
> 로컬 개발 시에는 노트북의 LAN IP를 사용해야 기기에서 접근할 수 있습니다(예: `http://192.168.0.20:3000` / `http://192.168.0.20:3000/api/upload`).

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
