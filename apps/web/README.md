# tangly-web

Tangly Web (Next.js) project

## AI 상세 리포트 설정

AI 상세 리포트를 사용하려면 아래 설정을 추가해야 합니다.

1. **환경변수 추가** (`.env.local`)
   ```bash
   OPENAI_API_KEY=<프로 모델 API 키>
   # 선택: 기본값은 gpt-4.1-mini
   OPENAI_MODEL=gpt-4.1-mini
   # 선택: 자가 호스팅 프록시를 쓸 경우
   # OPENAI_BASE_URL=https://your-proxy-endpoint/chat/completions
   # 선택: 요청 타임아웃 (밀리초)
   # AI_REPORT_TIMEOUT_MS=20000
   ```
2. **Supabase 테이블 생성**
   ```sql
   create table if not exists public.ai_reports (
     session_id uuid primary key references analysis_sessions(id) on delete cascade,
     provider text,
     model text,
     payload jsonb not null,
     generated_at timestamptz default now()
   );
   ```
3. **구독 플랜 컬럼 추가**
   - `profiles` 테이블에 `plan_type text default 'free'` 컬럼을 추가합니다.
   - PRO 사용자에 대해 `plan_type = 'pro'` 로 업데이트하면 앱에서 전체 AI 리포트를 노출합니다.

환경 구성 후 Next.js dev 서버를 재시작하면 `/api/reports/[sessionId]` 호출 시 AI 리포트가 생성/캐싱되며, 앱에서는 Free/Pro 구분에 따라 노출됩니다.***
