import SwiftUI

/// 작동 원리 설명 + 엔터테인먼트 고지.
struct InfoView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    disclaimer

                    section(
                        icon: "antenna.radiowaves.left.and.right",
                        title: "EMF (전자기장)",
                        body: "기기의 자기장 센서로 주변 자기장을 측정합니다. 보정 시 기준값을 잡고, 이후 기준값에서 벗어나는 편차를 K-II 스타일 미터로 표시합니다. 전자제품·금속 근처에서 수치가 크게 변합니다."
                    )
                    section(
                        icon: "cube.transparent",
                        title: "LiDAR 깊이 스캔",
                        body: "Pro 모델의 LiDAR로 공간의 깊이 맵을 읽어, 프레임 간 깊이 변화가 큰 영역을 활동 후보로 표시합니다. LiDAR가 없는 기기에서는 자동으로 비활성화됩니다."
                    )
                    section(
                        icon: "waveform",
                        title: "마이크 (EVP)",
                        body: "마이크의 음압 레벨만 실시간으로 측정합니다. 갑작스러운 소리는 활동 지수를 높입니다. 음성은 저장되지 않습니다."
                    )
                    section(
                        icon: "gyroscope",
                        title: "모션 · 기압",
                        body: "가속도계·자이로로 미세한 진동을, 기압계로 급격한 기압 변화를 감지합니다. 폴터가이스트·콜드스팟 연출에 사용됩니다."
                    )
                    section(
                        icon: "camera.viewfinder",
                        title: "카메라 오버레이",
                        body: "후면 카메라 영상 위에 야간투시 느낌의 비네팅과 레이더를 합성합니다."
                    )
                }
                .padding(20)
            }
            .navigationTitle("작동 원리")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("닫기") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }

    private var disclaimer: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text("이 앱은 오락 목적입니다. 표시되는 수치는 실제 초자연 현상을 증명하지 않으며, 일반 센서 데이터를 극적으로 시각화한 결과입니다.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.85))
        }
        .padding(14)
        .background(.yellow.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    }

    private func section(icon: String, title: String, body: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: icon)
                .font(.headline)
                .foregroundStyle(.white)
            Text(body)
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.7))
        }
    }
}

#Preview {
    InfoView()
}
