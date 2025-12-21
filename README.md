# Tangly Monorepo

웹(Next.js)과 모바일(Expo) 앱을 한 레포에서 관리하도록 폴더를 정리했습니다.

## 구조
- `apps/web` : 기존 Next.js 웹앱 (API, 페이지, 크롤러 스크립트 포함)
- `apps/mobile` : 기존 Expo 모바일 앱

## 주요 명령어 (루트에서 실행)
- `npm run dev` : 웹앱 개발 서버 실행
- `npm run build` / `npm run start` : 웹앱 빌드/서버 실행
- `npm run lint` : 웹앱 린트
- `npm run crawl:oliveyoung` : 웹앱 크롤러 스크립트 실행
- `npm run dev:mobile` : 모바일 앱 실행 (`expo start`)
- `npm run lint:mobile` : 모바일 앱 린트

## 설치
각 앱 디렉터리에서 한 번씩 의존성을 설치해 주세요.
- `npm install --prefix apps/web`
- `npm install --prefix apps/mobile`
