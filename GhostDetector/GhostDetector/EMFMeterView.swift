import SwiftUI

/// K-II 스타일 EMF 미터. 5칸 LED 바.
struct EMFMeterView: View {
    let reading: Double      // 0~5
    let level: ActivityLevel

    private let segments = 5

    var body: some View {
        VStack(spacing: 8) {
            Text("EMF")
                .font(.caption.bold())
                .foregroundStyle(.white.opacity(0.7))
                .tracking(2)

            HStack(spacing: 5) {
                ForEach(0..<segments, id: \.self) { i in
                    Capsule()
                        .fill(segmentColor(i))
                        .frame(width: 10, height: 22 + CGFloat(i) * 6)
                        .shadow(color: isLit(i) ? segmentColor(i) : .clear, radius: 6)
                        .animation(.easeOut(duration: 0.15), value: reading)
                }
            }

            Text(String(format: "%.1f mG", reading * 20))
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.white.opacity(0.6))
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(level.color.opacity(0.5), lineWidth: 1)
        )
    }

    private func isLit(_ index: Int) -> Bool {
        Double(index) < reading
    }

    private func segmentColor(_ index: Int) -> Color {
        guard isLit(index) else { return .white.opacity(0.12) }
        switch index {
        case 0: return .green
        case 1: return .mint
        case 2: return .yellow
        case 3: return .orange
        default: return .red
        }
    }
}

#Preview {
    ZStack {
        Color.black
        EMFMeterView(reading: 3.4, level: .strong)
    }
}
