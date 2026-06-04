import SwiftUI

struct GhostDetectorView: View {
    @StateObject private var vm = GhostDetectionViewModel()
    @StateObject private var camera = SimpleCameraManager()
    @State private var showLog = false
    @State private var showInfo = false

    var body: some View {
        ZStack {
            background
            nightVisionOverlay
            content

            if let alert = vm.lastAlert {
                AlertBanner(detection: alert)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(10)
            }
        }
        .sheet(isPresented: $showLog) {
            DetectionLogView(detections: vm.detections)
        }
        .sheet(isPresented: $showInfo) {
            InfoView()
        }
        .onAppear {
            vm.begin()
            if !vm.depth.isSupported { camera.start() }
        }
        .onDisappear {
            vm.stop()
            camera.stop()
        }
    }

    // MARK: - 배경 (LiDAR면 AR 카메라, 아니면 일반 카메라)

    @ViewBuilder
    private var background: some View {
        if vm.depth.isSupported {
            ARCameraView(session: vm.depth.session)
                .ignoresSafeArea()
        } else {
            CameraPreview(manager: camera)
                .ignoresSafeArea()
        }
    }

    private var nightVisionOverlay: some View {
        ZStack {
            // 점점 짙어지는 비네팅 + 활동색 틴트
            RadialGradient(
                colors: [.clear, vm.activityLevel.color.opacity(0.18 + vm.paranormalScore * 0.25)],
                center: .center, startRadius: 80, endRadius: 500
            )
            LinearGradient(
                colors: [.black.opacity(0.55), .clear, .black.opacity(0.75)],
                startPoint: .top, endPoint: .bottom
            )
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - 콘텐츠

    private var content: some View {
        VStack(spacing: 0) {
            topBar
            Spacer()
            if vm.phase == .scanning {
                GhostRadarView(blips: vm.blips, heading: vm.heading, activityColor: vm.activityLevel.color)
                    .frame(maxWidth: 320)
                    .padding(.horizontal, 30)
            } else {
                idleHero
            }
            Spacer()
            bottomPanel
        }
        .padding(.vertical, 12)
    }

    private var topBar: some View {
        HStack(alignment: .top) {
            // 상태 배지
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(vm.activityLevel.color)
                        .frame(width: 8, height: 8)
                        .shadow(color: vm.activityLevel.color, radius: 4)
                    Text(vm.statusMessage)
                        .font(.subheadline.bold())
                        .foregroundStyle(.white)
                }
                Text(sensorSummary)
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.55))
            }
            Spacer()
            HStack(spacing: 14) {
                Button { showLog = true } label: {
                    Image(systemName: "list.bullet.rectangle")
                }
                Button { showInfo = true } label: {
                    Image(systemName: "info.circle")
                }
            }
            .font(.title3)
            .foregroundStyle(.white.opacity(0.85))
        }
        .padding(.horizontal, 20)
    }

    private var sensorSummary: String {
        var parts = ["EMF \(String(format: "%.0f", vm.sensors.emfDeviation))µT"]
        if vm.depth.isSupported { parts.append("LiDAR ✓") }
        if vm.sensors.audioLevel > 0.01 { parts.append("MIC \(String(format: "%.0f%%", vm.sensors.audioLevel * 100))") }
        return parts.joined(separator: " · ")
    }

    private var idleHero: some View {
        VStack(spacing: 20) {
            Text("👻")
                .font(.system(size: 90))
                .opacity(vm.phase == .calibrating ? 0.5 : 1)
                .scaleEffect(vm.phase == .calibrating ? 0.9 : 1)
                .animation(.easeInOut(duration: 1).repeatForever(), value: vm.phase)
            Text("GHOST DETECTOR")
                .font(.title2.bold())
                .tracking(4)
                .foregroundStyle(.white)
            Text(vm.phase == .calibrating ? "보정 중..." : "센서를 융합해 심령 활동을 추적합니다")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.6))
        }
    }

    // MARK: - 하단 패널 (EMF + 점수 + 버튼)

    private var bottomPanel: some View {
        VStack(spacing: 16) {
            HStack(alignment: .bottom, spacing: 16) {
                EMFMeterView(reading: vm.emfReading, level: vm.activityLevel)
                ActivityGauge(score: vm.paranormalScore, level: vm.activityLevel)
            }
            .frame(maxWidth: .infinity)

            actionButton
        }
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private var actionButton: some View {
        switch vm.phase {
        case .idle:
            Button(action: vm.calibrateAndScan) {
                Label("스캔 시작", systemImage: "dot.radiowaves.left.and.right")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(.white, in: Capsule())
                    .foregroundStyle(.black)
            }
        case .calibrating:
            HStack {
                ProgressView().tint(.white)
                Text("보정 중...").foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(.white.opacity(0.15), in: Capsule())
        case .scanning:
            Button(action: vm.stop) {
                Label("스캔 정지", systemImage: "stop.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(vm.activityLevel.color.opacity(0.85), in: Capsule())
                    .foregroundStyle(.white)
            }
        }
    }
}

// MARK: - 활동 점수 게이지

private struct ActivityGauge: View {
    let score: Double
    let level: ActivityLevel

    var body: some View {
        VStack(spacing: 8) {
            Text("활동 지수")
                .font(.caption.bold())
                .foregroundStyle(.white.opacity(0.7))
                .tracking(1)
            ZStack {
                Circle()
                    .stroke(.white.opacity(0.12), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: score)
                    .stroke(level.color, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .shadow(color: level.color, radius: 6)
                Text("\(Int(score * 100))")
                    .font(.title2.bold().monospacedDigit())
                    .foregroundStyle(.white)
            }
            .frame(width: 84, height: 84)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(level.color.opacity(0.5), lineWidth: 1)
        )
    }
}

// MARK: - 탐지 알림 배너

private struct AlertBanner: View {
    let detection: Detection

    var body: some View {
        VStack {
            HStack(spacing: 12) {
                Text(detection.type.emoji)
                    .font(.system(size: 34))
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(detection.type.rawValue) 감지!")
                        .font(.headline)
                        .foregroundStyle(.white)
                    Text(String(format: "방위 %.0f° · 거리 %.1fm · %@",
                                detection.bearing, detection.distance, detection.level.label))
                        .font(.caption)
                        .foregroundStyle(.white.opacity(0.8))
                }
                Spacer()
            }
            .padding(16)
            .background(detection.level.color.opacity(0.85), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(.white.opacity(0.3), lineWidth: 1))
            .padding(.horizontal, 16)
            .padding(.top, 8)
            Spacer()
        }
    }
}

#Preview {
    GhostDetectorView()
}
