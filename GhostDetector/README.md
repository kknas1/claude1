# 👻 Ghost Detector

아이폰의 내장 센서를 융합해 "심령 활동"을 추적하는 **엔터테인먼트** iOS 앱입니다.

> ⚠️ 이 앱은 오락 목적입니다. 표시되는 수치는 실제 초자연 현상을 증명하지 않으며,
> 일반 센서 데이터를 극적으로 시각화한 결과입니다.

## 사용 센서

| 센서 | 역할 | 프레임워크 |
|------|------|-----------|
| 자기장계 (Magnetometer) | EMF(전자기장) 측정 — K-II 스타일 미터 | CoreMotion |
| LiDAR (깊이 스캔) | 프레임 간 깊이 변화로 활동 영역 추정 | ARKit |
| 마이크 | 음압(EVP) 스파이크 감지 (녹음 안 함) | AVFoundation |
| 가속도 · 자이로 | 미세 진동 / 요동 (폴터가이스트) | CoreMotion |
| 기압계 (Barometer) | 급격한 기압 변화 (콜드스팟) | CoreMotion |
| 나침반 (Heading) | 레이더 방위 표시 | CoreLocation |
| 후면 카메라 | 야간투시 느낌의 배경 합성 | AVFoundation / ARKit |

## 작동 방식

1. **보정** — 시작 시 약 3초간 주변 자기장 기준선을 측정합니다.
2. **융합** — 각 센서를 0~1로 정규화한 뒤 가중 합산해 `활동 지수(0~100)`를 계산합니다.
   - EMF 40% · 모션 20% · 마이크 15% · LiDAR 15% · 기압 10%
   - LiDAR가 없는 기기는 깊이 가중치를 EMF로 재분배합니다.
3. **탐지** — 지수가 임계값을 넘으면 확률적으로 개체(오브/그림자/폴터가이스트 등)를
   생성해 레이더에 블립으로 표시하고, 방위·거리·EMF와 함께 기록에 남깁니다.

## 화면 구성

- **레이더** — 회전 스윕 라인 위에 탐지된 개체를 방위/거리로 표시
- **EMF 미터** — 5칸 LED 바 (K-II 미터 스타일)
- **활동 지수 게이지** — 0~100 원형 게이지
- **탐지 기록** — 시간순 로그
- **작동 원리** — 각 센서 설명 및 고지

## 빌드

`GhostDetector.xcodeproj`를 Xcode 15+ 에서 열고 실기기(iOS 17+)에 빌드하세요.
LiDAR 깊이 스캔은 iPhone Pro 모델에서만 동작하며, 그 외 기기에서는 자동으로
비활성화되고 나머지 센서로 동작합니다. (시뮬레이터는 센서가 없어 권장하지 않습니다.)

## 구조

```
GhostDetector/
├── GhostDetectorApp.swift        # 앱 진입점
├── Models.swift                  # 개체/활동수준/탐지 모델
├── SensorManager.swift           # 자기장·모션·기압·마이크 수집
├── DepthScanner.swift            # ARKit/LiDAR 깊이 분석
├── GhostDetectionViewModel.swift # 센서 융합 → 점수 → 탐지
├── CameraPreview.swift           # 일반 카메라 배경 (비-LiDAR 기기)
├── ARCameraView.swift            # AR 카메라 배경 (LiDAR 기기)
├── EMFMeterView.swift            # EMF LED 미터
├── GhostRadarView.swift          # 레이더 + 블립
├── GhostDetectorView.swift       # 메인 화면
├── DetectionLogView.swift        # 탐지 기록
└── InfoView.swift                # 작동 원리 / 고지
```
