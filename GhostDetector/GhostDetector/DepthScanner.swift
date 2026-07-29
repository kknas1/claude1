import Foundation
import ARKit
import Combine

/// LiDAR(있는 기기) 깊이 데이터를 분석한다.
/// 깊이 맵에서 "예상치 못한 변화"가 큰 영역을 심령 활동의 후보로 본다(엔터테인먼트용).
/// LiDAR가 없는 기기에서는 자동으로 비활성화되고, 다른 센서만으로 동작한다.
final class DepthScanner: NSObject, ObservableObject, ARSessionDelegate {

    @Published var isSupported: Bool = false
    @Published var isRunning: Bool = false
    @Published var depthAnomaly: Double = 0      // 0~1, 깊이 변동성
    @Published var nearestPoint: Double = 0      // 가장 가까운 유효 깊이 (m)
    @Published var anomalyBearing: Double = 0    // 이상 영역의 방향 (도)

    let session = ARSession()
    private var previousDepths: [Float]?

    override init() {
        super.init()
        isSupported = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
        session.delegate = self
    }

    func start() {
        guard isSupported else { return }
        let config = ARWorldTrackingConfiguration()
        config.frameSemantics = .sceneDepth
        session.run(config, options: [.resetTracking, .removeExistingAnchors])
        isRunning = true
    }

    func stop() {
        session.pause()
        isRunning = false
        previousDepths = nil
    }

    // MARK: - ARSessionDelegate

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        guard let depth = frame.sceneDepth?.depthMap else { return }
        analyze(depth)
    }

    /// 깊이 맵을 다운샘플하여 프레임 간 변화량(이상치)을 계산.
    private func analyze(_ pixelBuffer: CVPixelBuffer) {
        CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        guard let base = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }
        let rowBytes = CVPixelBufferGetBytesPerRow(pixelBuffer)

        // 8x8 그리드로 다운샘플
        let cols = 8, rows = 8
        var samples = [Float](repeating: 0, count: cols * rows)
        var nearest: Float = .greatestFiniteMagnitude

        for r in 0..<rows {
            for c in 0..<cols {
                let x = (c * width) / cols
                let y = (r * height) / rows
                let rowPtr = base.advanced(by: y * rowBytes)
                let value = rowPtr.assumingMemoryBound(to: Float32.self)[x]
                samples[r * cols + c] = value
                if value > 0.1 && value < nearest { nearest = value }
            }
        }

        // 프레임 간 변화량 → 이상치, 변화가 가장 큰 셀의 방향
        var anomaly: Float = 0
        var maxCellDelta: Float = 0
        var maxCellCol = cols / 2
        if let prev = previousDepths, prev.count == samples.count {
            for i in 0..<samples.count {
                let d = abs(samples[i] - prev[i])
                anomaly += d
                if d > maxCellDelta {
                    maxCellDelta = d
                    maxCellCol = i % cols
                }
            }
            anomaly /= Float(samples.count)
        }
        previousDepths = samples

        let normalizedAnomaly = min(1.0, Double(anomaly) / 0.3)
        // 셀 컬럼(0~7)을 좌우 방향(-60도~+60도)으로 매핑
        let bearing = (Double(maxCellCol) / Double(cols - 1) - 0.5) * 120

        DispatchQueue.main.async {
            self.depthAnomaly = self.depthAnomaly * 0.6 + normalizedAnomaly * 0.4
            self.nearestPoint = nearest == .greatestFiniteMagnitude ? 0 : Double(nearest)
            self.anomalyBearing = bearing
        }
    }
}
