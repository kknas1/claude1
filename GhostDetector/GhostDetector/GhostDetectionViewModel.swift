import Foundation
import SwiftUI
import UIKit
import CoreLocation
import Combine

/// 여러 센서 입력을 하나의 "심령 활동 점수"로 융합하고,
/// 임계값을 넘으면 탐지 이벤트와 레이더 블립을 생성한다.
///
/// ⚠️ 이 앱은 오락/엔터테인먼트 목적입니다. 측정값은 실제 초자연 현상을
///    증명하지 않으며, 일반 센서 노이즈를 극적으로 시각화한 것입니다.
final class GhostDetectionViewModel: NSObject, ObservableObject {

    // MARK: - 의존성
    let sensors = SensorManager()
    let depth = DepthScanner()
    private let locationManager = CLLocationManager()

    // MARK: - 상태
    @Published var phase: Phase = .idle
    @Published var paranormalScore: Double = 0          // 0~1
    @Published var activityLevel: ActivityLevel = .dormant
    @Published var emfReading: Double = 0               // 0~5 (K-II 스타일)
    @Published var heading: Double = 0                  // 나침반 방위
    @Published var blips: [RadarBlip] = []
    @Published var detections: [Detection] = []
    @Published var lastAlert: Detection?
    @Published var statusMessage: String = "보정이 필요합니다"

    enum Phase { case idle, calibrating, scanning }

    private var cancellables = Set<AnyCancellable>()
    private var loop: Timer?
    private var lastDetectionTime: Date = .distantPast

    // 점수 가중치
    private struct Weights {
        static let emf = 0.40
        static let motion = 0.20
        static let audio = 0.15
        static let pressure = 0.10
        static let depth = 0.15
    }

    override init() {
        super.init()
        locationManager.delegate = self
        locationManager.headingFilter = 2
    }

    // MARK: - 수명주기

    func begin() {
        sensors.start()
        locationManager.requestWhenInUseAuthorization()
        if CLLocationManager.headingAvailable() {
            locationManager.startUpdatingHeading()
        }
    }

    func calibrateAndScan() {
        phase = .calibrating
        statusMessage = "주변 자기장 보정 중..."
        sensors.calibrate(duration: 3.0) { [weak self] in
            guard let self else { return }
            self.startScanning()
        }
    }

    private func startScanning() {
        phase = .scanning
        statusMessage = "스캔 중 — 기기를 천천히 움직이세요"
        depth.start()
        loop?.invalidate()
        loop = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
            self?.tick()
        }
    }

    func stop() {
        loop?.invalidate()
        loop = nil
        sensors.stop()
        depth.stop()
        locationManager.stopUpdatingHeading()
        phase = .idle
        statusMessage = "정지됨"
    }

    // MARK: - 메인 루프

    private func tick() {
        // 1) 각 센서를 0~1로 정규화
        let emfNorm = min(1.0, sensors.emfDeviation / 60.0)          // 60µT 편차면 최대
        let motionNorm = min(1.0, sensors.motionJitter / 0.6)
        let audioNorm = sensors.audioLevel
        let pressureNorm = min(1.0, sensors.pressureDelta / 0.05)
        let depthNorm = depth.isSupported ? depth.depthAnomaly : 0

        // 2) 가중 융합
        var score = emfNorm * Weights.emf
                  + motionNorm * Weights.motion
                  + audioNorm * Weights.audio
                  + pressureNorm * Weights.pressure
                  + depthNorm * Weights.depth

        // LiDAR 없는 기기는 깊이 가중치를 EMF로 재분배
        if !depth.isSupported {
            score += emfNorm * Weights.depth
        }

        score = min(1.0, score)

        // 3) 평활화 + UI 반영
        withAnimation(.easeOut(duration: 0.2)) {
            paranormalScore = paranormalScore * 0.7 + score * 0.3
            activityLevel = ActivityLevel(score: paranormalScore)
            emfReading = min(5.0, emfNorm * 5.0)
            statusMessage = activityLevel.label
        }

        // 4) 블립 수명 관리
        pruneBlips()

        // 5) 임계값 초과 시 탐지 이벤트
        evaluateDetection(emfNorm: emfNorm, depthNorm: depthNorm)
    }

    private func evaluateDetection(emfNorm: Double, depthNorm: Double) {
        guard paranormalScore > 0.55 else { return }
        // 과도한 알림 방지: 최소 2.5초 간격 + 확률적 발생
        guard Date().timeIntervalSince(lastDetectionTime) > 2.5 else { return }
        let probability = (paranormalScore - 0.5) * 0.8
        guard Double.random(in: 0...1) < probability else { return }

        lastDetectionTime = Date()

        // 방향: LiDAR 이상영역 또는 임의 + 현재 방위 반영
        let baseBearing = depth.isSupported && depthNorm > 0.3
            ? heading + depth.anomalyBearing
            : Double.random(in: 0..<360)
        let bearing = (baseBearing.truncatingRemainder(dividingBy: 360) + 360)
            .truncatingRemainder(dividingBy: 360)

        let distance = depth.isSupported && depth.nearestPoint > 0
            ? max(0.5, depth.nearestPoint)
            : Double.random(in: 1...6)

        let type = pickEntityType()
        let level = ActivityLevel(score: paranormalScore)

        let detection = Detection(
            timestamp: Date(),
            type: type,
            level: level,
            bearing: bearing,
            distance: distance,
            emf: emfReading,
            note: type.description
        )

        // 레이더 블립 추가
        let blip = RadarBlip(
            bearing: bearing,
            distance: min(1.0, distance / 8.0),
            type: type,
            ttl: Double.random(in: 3...6)
        )

        DispatchQueue.main.async {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
                self.blips.append(blip)
                self.detections.insert(detection, at: 0)
                if self.detections.count > 50 { self.detections.removeLast() }
                self.lastAlert = detection
            }
            // 햅틱
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(level >= .strong ? .warning : .success)
            // 알림 자동 사라짐
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
                if self.lastAlert?.id == detection.id {
                    withAnimation { self.lastAlert = nil }
                }
            }
        }
    }

    /// 활동 수준에 따라 개체 종류 가중 선택
    private func pickEntityType() -> EntityType {
        switch activityLevel {
        case .intense:
            return [.poltergeist, .shadow, .wisp].randomElement()!
        case .strong:
            return [.shadow, .presence, .poltergeist, .wisp].randomElement()!
        case .active:
            return [.orb, .presence, .echo, .wisp].randomElement()!
        default:
            return [.orb, .echo, .presence].randomElement()!
        }
    }

    private func pruneBlips() {
        let now = Date()
        blips.removeAll { now.timeIntervalSince($0.bornAt) > $0.ttl }
    }
}

// MARK: - 나침반 방위

extension GhostDetectionViewModel: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        let h = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        DispatchQueue.main.async {
            self.heading = h
        }
    }
}
