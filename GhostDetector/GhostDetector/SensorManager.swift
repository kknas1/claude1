import Foundation
import CoreMotion
import AVFoundation
import Combine

/// 아이폰 내장 센서를 한곳에서 수집한다.
/// - 자기장계(magnetometer) → EMF(전자기장) 측정의 기반
/// - 가속도/자이로 → 물리적 진동/요동 감지
/// - 기압계(barometer) → 급격한 기압 변화(콜드스팟 트로프)
/// - 마이크 → EVP(전자음성현상) 음압 스파이크
final class SensorManager: ObservableObject {

    // MARK: - 공개 측정값
    @Published var magneticMagnitude: Double = 0      // µT (마이크로테슬라)
    @Published var emfBaseline: Double = 0            // 보정된 기준값
    @Published var motionJitter: Double = 0           // 가속도 변화량
    @Published var rotationRate: Double = 0           // 각속도 크기
    @Published var pressureDelta: Double = 0          // 직전 대비 기압 변화 (kPa)
    @Published var audioLevel: Double = 0             // 0~1 정규화 음압
    @Published var isCalibrating: Bool = false
    @Published var hasMagnetometer: Bool = false

    // MARK: - 내부
    private let motion = CMMotionManager()
    private let altimeter = CMAltimeter()
    private let queue = OperationQueue()

    private var audioRecorder: AVAudioRecorder?
    private var audioTimer: Timer?

    private var magSamples: [Double] = []
    private var lastPressure: Double?
    private var lastAccel: (x: Double, y: Double, z: Double)?

    // MARK: - 시작 / 정지

    func start() {
        startMotion()
        startBarometer()
        startMicrophone()
    }

    func stop() {
        motion.stopMagnetometerUpdates()
        motion.stopDeviceMotionUpdates()
        motion.stopAccelerometerUpdates()
        motion.stopGyroUpdates()
        altimeter.stopRelativeAltitudeUpdates()
        audioTimer?.invalidate()
        audioTimer = nil
        audioRecorder?.stop()
        audioRecorder = nil
    }

    // MARK: - 자기장 / 모션

    private func startMotion() {
        hasMagnetometer = motion.isMagnetometerAvailable
        motion.magnetometerUpdateInterval = 0.1
        if motion.isMagnetometerAvailable {
            motion.startMagnetometerUpdates(to: queue) { [weak self] data, _ in
                guard let self, let f = data?.magneticField else { return }
                let mag = sqrt(f.x * f.x + f.y * f.y + f.z * f.z)
                DispatchQueue.main.async { self.magneticMagnitude = mag }
            }
        }

        motion.accelerometerUpdateInterval = 0.05
        if motion.isAccelerometerAvailable {
            motion.startAccelerometerUpdates(to: queue) { [weak self] data, _ in
                guard let self, let a = data?.acceleration else { return }
                var jitter = 0.0
                if let last = self.lastAccel {
                    jitter = abs(a.x - last.x) + abs(a.y - last.y) + abs(a.z - last.z)
                }
                self.lastAccel = (a.x, a.y, a.z)
                DispatchQueue.main.async {
                    // 약간의 평활화
                    self.motionJitter = self.motionJitter * 0.7 + jitter * 0.3
                }
            }
        }

        motion.gyroUpdateInterval = 0.1
        if motion.isGyroAvailable {
            motion.startGyroUpdates(to: queue) { [weak self] data, _ in
                guard let self, let r = data?.rotationRate else { return }
                let rate = sqrt(r.x * r.x + r.y * r.y + r.z * r.z)
                DispatchQueue.main.async {
                    self.rotationRate = self.rotationRate * 0.7 + rate * 0.3
                }
            }
        }
    }

    // MARK: - 기압계

    private func startBarometer() {
        guard CMAltimeter.isRelativeAltitudeAvailable() else { return }
        altimeter.startRelativeAltitudeUpdates(to: queue) { [weak self] data, _ in
            guard let self, let p = data?.pressure.doubleValue else { return }
            var delta = 0.0
            if let last = self.lastPressure {
                delta = abs(p - last)
            }
            self.lastPressure = p
            DispatchQueue.main.async {
                self.pressureDelta = self.pressureDelta * 0.6 + delta * 0.4
            }
        }
    }

    // MARK: - 마이크 (음압만 측정, 녹음 저장 안 함)

    private func startMicrophone() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            return
        }

        let url = URL(fileURLWithPath: "/dev/null")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatAppleLossless),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.max.rawValue
        ]

        do {
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            recorder.isMeteringEnabled = true
            recorder.record()
            audioRecorder = recorder

            audioTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                guard let self, let r = self.audioRecorder else { return }
                r.updateMeters()
                let power = r.averagePower(forChannel: 0)        // dB, 보통 -160 ~ 0
                let normalized = max(0, (power + 50) / 50)         // -50dB 이상을 0~1로
                self.audioLevel = self.audioLevel * 0.6 + min(1, normalized) * 0.4
            }
        } catch {
            return
        }
    }

    // MARK: - 보정

    /// 주변 자기장의 기준선을 측정한다. 이후 EMF는 이 기준선 대비 편차로 계산.
    func calibrate(duration: TimeInterval = 3.0, completion: @escaping () -> Void) {
        guard motion.isMagnetometerAvailable else {
            emfBaseline = 50
            completion()
            return
        }
        isCalibrating = true
        magSamples.removeAll()

        let interval = 0.1
        var elapsed = 0.0
        Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] t in
            guard let self else { t.invalidate(); return }
            self.magSamples.append(self.magneticMagnitude)
            elapsed += interval
            if elapsed >= duration {
                t.invalidate()
                let avg = self.magSamples.isEmpty
                    ? 50
                    : self.magSamples.reduce(0, +) / Double(self.magSamples.count)
                self.emfBaseline = avg
                self.isCalibrating = false
                completion()
            }
        }
    }

    /// 기준선 대비 EMF 편차 (µT). 음수가 나오지 않도록 절대값.
    var emfDeviation: Double {
        abs(magneticMagnitude - emfBaseline)
    }
}
