# 💗 하트챗 (HeartChat)

AI 캐릭터와의 1:1 채팅 앱. Replika 스타일의 한국형 AI 친구/연인 챗봇.

## 컨셉

- **6명의 한국형 페르소나**: 츤데레 미대생, 다정한 회사 누나, 감성 뮤지션 오빠, 새내기 여대생, 능글능글 변호사, 텐션 높은 댄스 유튜버
- **무료 30 메시지 → 구독 게이트**: 주간 ₩4,900 / 월간 ₩14,900 / 연간 ₩99,000
- **모바일 우선** UI. 카톡 스타일 채팅. 스트리밍 응답
- **localStorage 기반 대화 기록** (MVP — 추후 DB로 이전)

## 기술 스택

- Next.js 16 (App Router, Turbopack)
- TypeScript + Tailwind CSS v4
- Anthropic Claude API (`claude-opus-4-7`) — SSE 스트리밍
- 프롬프트 캐싱으로 시스템 프롬프트 90% 비용 절감

## 실행 방법

1. `.env.example` 을 `.env.local` 로 복사 후 API 키 입력:

   ```bash
   cp .env.example .env.local
   # .env.local 에 ANTHROPIC_API_KEY=sk-ant-... 입력
   ```

2. 의존성 설치 & 실행:

   ```bash
   npm install
   npm run dev
   ```

3. `http://localhost:3000` 접속

## 파일 구조

```
app/
  page.tsx                 # 캐릭터 선택 갤러리
  chat/[id]/
    page.tsx               # 서버 컴포넌트 (캐릭터 로드)
    ChatRoom.tsx           # 클라이언트 컴포넌트 (채팅 UI + 스트리밍)
  api/chat/route.ts        # Anthropic SSE 스트리밍 엔드포인트
lib/
  characters.ts            # 페르소나 정의 (시스템 프롬프트 포함)
```

## 다음 단계 (앱스토어 출시 전)

- [ ] 사용자 인증 (Supabase / Clerk)
- [ ] PostgreSQL 로 대화 저장 (디바이스 간 동기화)
- [ ] 결제 통합 (Stripe / 인앱결제)
- [ ] PWA 매니페스트 + 푸시 알림 (재방문률 ↑)
- [ ] 캐릭터 이미지 (AI 생성 또는 일러스트)
- [ ] 음성 메시지 (ElevenLabs / 음성 합성)
- [ ] 관계 단계 시스템 (호감도, 기념일)
- [ ] React Native / Capacitor 로 네이티브 빌드

## 비즈니스 모델 참고

- **Replika**: 연 매출 1.5억 달러+ (구독 모델)
- **Character.AI**: MAU 2천만, 평균 사용 시간 2시간+
- **Linky / Talkie**: 한·일 시장 급성장 중

핵심: **감정적 유대 + 무료 진입장벽 낮음 + 핵심 기능 페이월**.
