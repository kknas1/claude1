import SwiftUI

/// 회전하는 스윕 라인과 탐지된 개체 블립을 표시하는 레이더.
struct GhostRadarView: View {
    let blips: [RadarBlip]
    let heading: Double
    let activityColor: Color

    @State private var sweep: Double = 0

    private let rings = 3

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let radius = size / 2

            ZStack {
                // 동심원
                ForEach(1...rings, id: \.self) { i in
                    Circle()
                        .stroke(activityColor.opacity(0.25), lineWidth: 1)
                        .frame(width: size * CGFloat(i) / CGFloat(rings),
                               height: size * CGFloat(i) / CGFloat(rings))
                }

                // 십자선
                Path { p in
                    p.move(to: CGPoint(x: center.x, y: center.y - radius))
                    p.addLine(to: CGPoint(x: center.x, y: center.y + radius))
                    p.move(to: CGPoint(x: center.x - radius, y: center.y))
                    p.addLine(to: CGPoint(x: center.x + radius, y: center.y))
                }
                .stroke(activityColor.opacity(0.2), lineWidth: 1)

                // 스윕 그라데이션 섹터
                SweepSector()
                    .fill(
                        AngularGradient(
                            gradient: Gradient(colors: [activityColor.opacity(0.0), activityColor.opacity(0.35)]),
                            center: .center,
                            startAngle: .degrees(0),
                            endAngle: .degrees(60)
                        )
                    )
                    .frame(width: size, height: size)
                    .rotationEffect(.degrees(sweep))

                // 블립들
                ForEach(blips) { blip in
                    BlipMark(blip: blip, heading: heading, center: center, radius: radius, color: activityColor)
                }

                // 중심(나)
                Circle()
                    .fill(.white)
                    .frame(width: 10, height: 10)
                    .shadow(color: .white, radius: 4)

                // 방위 표시
                Text("N")
                    .font(.caption2.bold())
                    .foregroundStyle(.white.opacity(0.6))
                    .position(x: center.x, y: center.y - radius + 10)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(1, contentMode: .fit)
        .onAppear {
            withAnimation(.linear(duration: 2.5).repeatForever(autoreverses: false)) {
                sweep = 360
            }
        }
    }
}

/// 60도 부채꼴
private struct SweepSector: Shape {
    func path(in rect: CGRect) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        var p = Path()
        p.move(to: center)
        p.addArc(center: center, radius: radius,
                 startAngle: .degrees(-90), endAngle: .degrees(-30), clockwise: false)
        p.closeSubpath()
        return p
    }
}

/// 단일 블립 마커. 방위(bearing)는 절대 방위이므로 heading만큼 보정해 상대 위치로 표시.
private struct BlipMark: View {
    let blip: RadarBlip
    let heading: Double
    let center: CGPoint
    let radius: CGFloat
    let color: Color

    @State private var pulse = false

    var body: some View {
        let relative = (blip.bearing - heading) * .pi / 180
        let r = radius * CGFloat(blip.distance)
        let x = center.x + r * CGFloat(sin(relative))
        let y = center.y - r * CGFloat(cos(relative))

        Text(blip.type.emoji)
            .font(.system(size: 22))
            .scaleEffect(pulse ? 1.15 : 0.85)
            .shadow(color: color, radius: 8)
            .position(x: x, y: y)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                    pulse = true
                }
            }
            .transition(.scale.combined(with: .opacity))
    }
}

#Preview {
    ZStack {
        Color.black
        GhostRadarView(
            blips: [
                RadarBlip(bearing: 45, distance: 0.6, type: .shadow, ttl: 5),
                RadarBlip(bearing: 200, distance: 0.4, type: .orb, ttl: 5)
            ],
            heading: 0,
            activityColor: .green
        )
        .padding(40)
    }
}
