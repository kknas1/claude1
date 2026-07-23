# 🔨 두더지 잡기 — 네이티브 iOS 앱

웹 버전(`../WhackAMole`)과 **같은 순위판 서버를 공유**하는 Swift/SwiftUI 네이티브 앱입니다.
앱에서 등록한 점수가 웹(PWA) 유저들의 순위판에도 그대로 보입니다 — 한 리그에서 경쟁!

## 기능

- 4×4 그리드, 45초, 9초마다 레벨업 (웹 v1.6 규칙과 동일)
- 🐹 일반 +10 · ✨ 황금 +30 · ⛑️ 헬멧(두 번, +20) · 💣 위장 폭탄(-30점 & -2초)
- 진동 햅틱(타격/폭탄) + 합성 효과음 — 네이티브만의 손맛
- 🔥 주간 리그(월요일 리셋) / 🌍 전체 순위 / 👑 지난주 챔피언 / 이번 주 N위 표시
- 도전장 공유(ShareLink)

## 내 아이폰에 설치 (무료, 5분)

1. 이 폴더(`WhackAMoleiOS`)를 맥북으로 가져와 `WhackAMole.xcodeproj` 더블클릭
2. Xcode 좌측 파일 목록에서 프로젝트(WhackAMole) 클릭 → **Signing & Capabilities** 탭
   - **Team**: 본인 Apple ID 선택 (없으면 "Add an Account…"로 무료 로그인 → Personal Team)
   - Bundle Identifier 충돌 경고가 뜨면 `com.본인아이디.whackamole` 같이 아무거나 고유하게 수정
3. 아이폰을 케이블로 연결 → Xcode 상단 기기 선택에서 내 아이폰 선택 → **▶ Run**
4. 아이폰에서 처음 한 번: 설정 → 일반 → VPN 및 기기 관리 → 개발자 앱 신뢰
   (iOS 16+는 설정 → 개인정보 보호 및 보안 → **개발자 모드** 켜기도 필요)

> 무료 Apple ID(Personal Team)로 설치한 앱은 **7일마다 Xcode로 다시 Run** 해줘야 합니다.
> 유료 개발자 계정($99/년)이면 1년 유효 + TestFlight/App Store 배포 가능.

## App Store에 올리려면 (나중에)

1. https://developer.apple.com 에서 Apple Developer Program 등록 ($99/년)
2. Xcode → Product → Archive → Distribute App → App Store Connect
3. App Store Connect에서 스크린샷·설명 입력 후 심사 제출 (보통 1~3일)

## 구조

| 파일 | 역할 |
|---|---|
| `WhackAMole/GameEngine.swift` | 게임 로직 (웹 game.js 1:1 포팅) |
| `WhackAMole/Leaderboard.swift` | 공유 순위판 클라이언트 (웹과 같은 Apps Script 서버) |
| `WhackAMole/GameView.swift` | 게임 화면 + 시작/게임오버/순위 UI |
| `WhackAMole/MoleViews.swift` | 두더지/구멍 그리기 |
| `WhackAMole/Feedback.swift` | 햅틱 + 합성 효과음 |

서버 주소를 바꾸려면 `Leaderboard.swift`의 `boardURL`과 웹 `game.js`의 `BOARD_URL`을 함께 수정하세요.

## 프로젝트가 안 열릴 때 (예비책)

Xcode 버전이 낮아 프로젝트 파일을 못 읽는 경우:
1. Xcode → File → New → Project → iOS App → 이름 `WhackAMole`, Interface: SwiftUI
2. 새 프로젝트의 `ContentView.swift`를 지우고, 이 저장소 `WhackAMoleiOS/WhackAMole/`의
   `.swift` 파일 5개를 드래그해서 추가 (Copy items if needed 체크)
3. `Assets.xcassets`의 AppIcon에 `icon-1024.png`를 드래그
4. 그대로 Run
