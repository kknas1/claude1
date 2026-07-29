import SwiftUI

/// 탐지 기록 목록.
struct DetectionLogView: View {
    let detections: [Detection]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if detections.isEmpty {
                    ContentUnavailableView(
                        "기록 없음",
                        systemImage: "moon.zzz",
                        description: Text("아직 감지된 활동이 없습니다.\n스캔을 시작해 보세요.")
                    )
                } else {
                    List(detections) { d in
                        HStack(spacing: 14) {
                            Text(d.type.emoji)
                                .font(.system(size: 30))
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(d.type.rawValue).font(.headline)
                                    Circle().fill(d.level.color).frame(width: 7, height: 7)
                                    Text(d.level.label)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Text(d.note)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                Text(String(format: "%@ · 방위 %.0f° · %.1fm · EMF %.1f",
                                            d.timeString, d.bearing, d.distance, d.emf))
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(.tertiary)
                            }
                            Spacer()
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .navigationTitle("탐지 기록")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("닫기") { dismiss() }
                }
            }
        }
        .preferredColorScheme(.dark)
    }
}
