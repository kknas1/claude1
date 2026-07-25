# 🔨 두더지 잡기 — App Store 제출 가이드

이 문서 하나로 App Store Connect(ASC) 제출을 끝낼 수 있게 만든 체크리스트입니다.
전제: **무료 앱, 광고·인앱결제 없음, 한국어 단일 출시** (영어 현지화는 출시 후 과제).

---

## 0. 준비물

- [ ] Apple Developer Program 가입 완료 ($99/년, https://developer.apple.com)
- [ ] 맥 + Xcode 16 이상, 이 저장소의 `WhackAMoleiOS/` 빌드 성공 상태
- [ ] 실기기 또는 시뮬레이터에서 한 판 플레이 확인

## 1. App Store Connect에서 앱 만들기

1. https://appstoreconnect.apple.com → 나의 앱 → **+** → 신규 앱
2. 플랫폼 **iOS**, 이름 **두더지 잡기!** (아래 문안 참고), 기본 언어 **한국어**
3. 번들 ID: Xcode의 것과 동일하게 (기본 `com.kknas1.whackamole` — Xcode에서 바꿨다면 그걸로)
4. SKU: `whackamole-001` (내부 관리용, 아무거나)

## 2. 스토어 문안 (복사해서 붙여넣기)

### 한국어 (기본)

| 항목 | 내용 |
|---|---|
| 이름 (30자) | `두더지 잡기! 가족 순위 아케이드` |
| 부제 (30자) | `45초 두더지 사냥, 가족과 순위 경쟁` |
| 프로모션 텍스트 (170자) | `황금 두더지, 헬멧 두더지, 그리고 두더지인 척하는 폭탄까지! 매일 새로운 데일리 챌린지에서 가족·친구와 순위를 겨뤄 보세요.` |
| 키워드 (100자) | `두더지,두더지잡기,아케이드,미니게임,순위,리더보드,가족게임,캐주얼,반응속도,whack,mole,arcade` |
| 지원 URL | `https://kknas1.github.io/claude1/WhackAMole/support.html` |
| 개인정보 처리방침 URL | `https://kknas1.github.io/claude1/WhackAMole/privacy.html` |

**설명:**

```
🔨 구멍에서 올라오는 두더지를 탭해서 잡는 클래식 아케이드!

간단하지만 만만치 않습니다. 폭탄이 두더지랑 똑같이 생겼거든요 —
머리 위에 타들어가는 심지가 유일한 힌트입니다.

■ 게임 모드 3종
· 클래식 — 45초 안에 최고 점수. 9초마다 빨라집니다
· 하드코어 — 목숨 3개, 끝없이 빨라지는 무한 생존
· 데일리 챌린지 — 매일 전 세계가 같은 두더지 패턴, 하루 한 번

■ 두더지 도감
· 🐹 일반 +10점 · ✨ 황금 +30점
· ⛑️ 헬멧 두더지는 두 번 때려야 잡힙니다
· 💣 폭탄은 치면 -30점에 시간까지 깎여요
· 🔥 연속으로 잡으면 콤보 보너스!

■ 함께 경쟁
· Game Center 리더보드 & 업적 12종
· 웹으로 하는 가족·친구와 같은 온라인 순위판 — 한 리그!
· 매주 월요일 리셋되는 주간 리그와 지난주 챔피언

계정 가입 없음, 광고 없음, 결제 없음. 그냥 잡으세요!
```

### English (출시 후 en 현지화 추가 시)

| Item | Copy |
|---|---|
| Name | `Whack-A-Mole! Family Arcade` |
| Subtitle | `45s mole hunt. Beat your family` |
| Keywords | `whack,mole,arcade,casual,family,leaderboard,reflex,tap,daily,challenge` |

```
Tap the moles before they hide! Simple — until the bombs show up
disguised as moles. The burning fuse is your only warning.

• 3 modes: Classic (45s), Hardcore (3 lives, endless), Daily Challenge
  (same pattern for everyone, once a day)
• Golden & helmet moles, combo bonuses
• Game Center leaderboards & 12 achievements
• Shared online league with friends playing the web version

No account. No ads. No purchases. Just whack.
```

## 3. 연령 등급 설문

정직하게 아래처럼 답하면 됩니다 (등급은 ASC가 자동 계산 — 나온 값 그대로 제출):

- 만화 또는 판타지 폭력: **빈도 낮음/경미** (망치로 만화 두더지를 잡는 연출)
- 사실적 폭력, 성적 콘텐츠, 욕설, 공포, 약물, 도박(시뮬레이션 포함): **없음**
- 무제한 웹 접근: **아니요** (설정의 고정 링크뿐)
- 사용자 생성 콘텐츠 관련 질문이 있으면: 닉네임 순위판이 있으며 **비속어 필터,
  신고, 숨기기 기능 제공** — 해당 항목 "예 + 보호장치 있음"으로

## 4. 앱 개인정보 (App Privacy 라벨)

- 데이터 수집: **예 — 사용자 콘텐츠(기타 사용자 콘텐츠)** 1건만
  - 항목: 닉네임·점수 (순위판 등록 시에만)
  - 목적: **앱 기능**
  - 사용자 신원과 **연결되지 않음** (계정·식별자 없음)
  - **추적에 사용되지 않음**
- 그 외(연락처, 위치, 식별자, 진단 등): 전부 **수집 안 함**
- Game Center 데이터는 Apple이 처리하므로 개발자 라벨에 적지 않습니다

## 5. Game Center 설정 (ASC → 앱 → 서비스 → Game Center)

앱이 이미 이 ID로 보고하므로 **ID를 철자 그대로** 만들어야 합니다.

### 리더보드 3개 (유형: 최고 기록 단일 리더보드)

| ID | 표시 이름 | 점수 형식 | 정렬 | 제출 범위 |
|---|---|---|---|---|
| `whackmole.classic` | 클래식 최고 점수 | 정수 | 높은 순 | 1 ~ 1000000 |
| `whackmole.hardcore` | 하드코어 최장 생존(초) | 정수 | 높은 순 | 1 ~ 86400 |
| `whackmole.daily` | 데일리 챌린지 | 정수 | 높은 순 | 1 ~ 1000000 |

### 업적 12개 (각 100점, 숨김 아님, 1회 달성)

ID는 전부 `whackmole.` + 아래 이름 (예: `whackmole.first_game`):

| ID 뒷부분 | 표시 이름 | 설명 |
|---|---|---|
| `first_game` | 첫 걸음 | 첫 게임을 끝까지 플레이 |
| `first_post` | 명단 등록 | 순위판에 첫 기록 등록 |
| `score_100` | 백점 돌파 | 한 판 100점 |
| `score_500` | 고수의 향기 | 한 판 500점 |
| `score_1000` | 두더지의 왕 | 한 판 1,000점 |
| `combo_10` | 열 콤보 | 콤보 10 |
| `combo_20` | 무아지경 | 콤보 20 |
| `no_bomb` | 무결점 | 클래식에서 폭탄 0회로 종료 |
| `moles_500` | 사냥꾼 | 누적 500마리 |
| `moles_2000` | 두더지 학살자 | 누적 2,000마리 |
| `hardcore_180` | 생존왕 | 하드코어 3분 생존 |
| `daily_3` | 성실왕 | 데일리 3일 연속 |

> 업적 이미지는 512×512 필요 — 앱 아이콘(`icon-1024.png`)을 512로 줄여 전부 같은
> 이미지로 올려도 심사에 문제 없습니다.

## 6. 스크린샷 (시뮬레이터로 5장)

1. Xcode에서 시뮬레이터 **iPhone 16 Pro Max**(6.9형)로 Run — ASC가 6.7형(1290×2796)을
   요구하면 **iPhone 15 Pro Max**로
2. `⌘S` 로 저장 → ASC에 그대로 업로드 (권장 장면):
   - 시작 화면 (모드 3종 보이게)
   - 플레이 중 콤보 배지 + 팝업 점수
   - 폭탄(심지) 클로즈업 타이밍
   - 순위판 (주간 리그 탭)
   - 기록/업적 화면

## 7. 빌드 업로드 & 제출

1. Xcode: 기기 대상 **Any iOS Device (arm64)** → Product → **Archive**
2. Organizer → **Distribute App** → App Store Connect → Upload (기본값 그대로)
3. ASC → 앱 → 버전 1.0 → 위 문안·스크린샷 입력 → **빌드 선택**
4. 수출 규정 질문은 나오지 않습니다 (`ITSAppUsesNonExemptEncryption = NO` 프로젝트에 설정됨)
5. **심사 정보 → 메모**에 아래 복붙:

```
· 계정/로그인 없이 모든 기능 사용 가능합니다.
· 온라인 순위판(닉네임+점수)은 비속어 필터로 등록을 차단하고, 필터를 지나친
  이름도 화면에서 마스킹됩니다. 순위 화면에서 항목을 길게 누르면 숨기기/신고가
  가능합니다 (Guideline 1.2 대응).
· Game Center는 선택 사항이며 미로그인 시에도 전체 게임이 동작합니다.
· 데일리 챌린지는 날짜 시드 난수로 모두에게 같은 패턴이 나오는 모드로,
  기록은 하루 1회 등록됩니다.
```

6. **심사 제출** — 보통 1~3일

## 8. 출시 후 과제 (다음 버전)

- [ ] 영어 현지화: String Catalog(`Localizable.xcstrings`) 추가 + 위 en 문안으로 스토어 현지화
- [ ] iPad 지원 (`TARGETED_DEVICE_FAMILY = 1,2` + 레이아웃 점검)
- [ ] 업적 개별 아트워크

## 문제가 생기면

- 서명/Capability 오류: `WhackAMoleiOS/README.md`의 Game Center 절 참고
- 빌드 오류: 오류 메시지를 그대로 복사해서 Claude 세션에 붙여넣기 (즉시 수정 왕복)
