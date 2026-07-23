import SwiftUI

// 두더지 한 마리의 몸통+얼굴. 디자인 기준 60x80, 부모가 스케일한다.
struct MoleBody: View {
    let type: MoleType
    let whacked: Bool
    let hp: Int

    private var bodyColors: [Color] {
        switch type {
        case .gold:
            return [Color(red: 0.91, green: 0.71, blue: 0.16),
                    Color(red: 1.00, green: 0.85, blue: 0.39),
                    Color(red: 0.85, green: 0.64, blue: 0.12)]
        default:
            return [Color(red: 0.48, green: 0.32, blue: 0.20),
                    Color(red: 0.59, green: 0.41, blue: 0.25),
                    Color(red: 0.43, green: 0.29, blue: 0.18)]
        }
    }

    private var muzzle: Color {
        type == .gold
            ? Color(red: 1.0, green: 0.93, blue: 0.69)
            : Color(red: 0.81, green: 0.66, blue: 0.47)
    }

    var body: some View {
        ZStack(alignment: .top) {
            UnevenRoundedRectangle(topLeadingRadius: 30, bottomLeadingRadius: 0,
                                   bottomTrailingRadius: 0, topTrailingRadius: 30)
                .fill(LinearGradient(colors: bodyColors, startPoint: .leading, endPoint: .trailing))
                .frame(width: 60, height: 80)

            // 주둥이
            Ellipse().fill(muzzle).frame(width: 34, height: 24).offset(x: 0, y: 30)
            // 코
            Ellipse().fill(Color(red: 0.94, green: 0.42, blue: 0.54))
                .frame(width: 13, height: 10).offset(y: 30)
            // 볼터치
            HStack(spacing: 28) {
                Ellipse().fill(Color.pink.opacity(0.3)).frame(width: 11, height: 7)
                Ellipse().fill(Color.pink.opacity(0.3)).frame(width: 11, height: 7)
            }
            .offset(y: 33)

            if whacked {
                HStack(spacing: 14) {
                    Text("✕")
                    Text("✕")
                }
                .font(.system(size: 12, weight: .black))
                .foregroundStyle(Color(red: 0.17, green: 0.11, blue: 0.06))
                .offset(y: 17)
            } else {
                // 눈
                HStack(spacing: 16) {
                    Circle().fill(Color(red: 0.14, green: 0.09, blue: 0.07)).frame(width: 8, height: 8)
                    Circle().fill(Color(red: 0.14, green: 0.09, blue: 0.07)).frame(width: 8, height: 8)
                }
                .offset(y: 19)
                // 앞니
                HStack(spacing: 1) {
                    RoundedRectangle(cornerRadius: 1).fill(.white).frame(width: 4, height: 6)
                    RoundedRectangle(cornerRadius: 1).fill(.white).frame(width: 4, height: 6)
                }
                .offset(y: 42)
            }

            if type == .helmet && hp > 1 && !whacked {
                // 안전모: 한 대 맞으면 벗겨진다
                ZStack {
                    UnevenRoundedRectangle(topLeadingRadius: 26, bottomLeadingRadius: 2,
                                           bottomTrailingRadius: 2, topTrailingRadius: 26)
                        .fill(Color(red: 0.96, green: 0.73, blue: 0.12))
                        .frame(width: 52, height: 20)
                    Ellipse().fill(Color(red: 0.85, green: 0.61, blue: 0.02))
                        .frame(width: 62, height: 8).offset(y: 9)
                }
                .offset(y: -3)
            }

            if type == .bomb && !whacked {
                // 폭탄 두더지의 유일한 힌트: 머리 위 심지 + 불꽃
                FuseView().offset(x: 12, y: -20)
            }

            if type == .gold && !whacked {
                Text("✨").font(.system(size: 13)).offset(x: 22, y: -8)
            }
        }
        .frame(width: 60, height: 80, alignment: .top)
    }
}

struct FuseView: View {
    @State private var flicker = false

    var body: some View {
        ZStack {
            // 심지
            Path { p in
                p.move(to: CGPoint(x: 0, y: 22))
                p.addQuadCurve(to: CGPoint(x: 14, y: 4), control: CGPoint(x: 2, y: 4))
            }
            .stroke(Color(red: 0.42, green: 0.29, blue: 0.16),
                    style: StrokeStyle(lineWidth: 4, lineCap: .round))
            .frame(width: 20, height: 24)
            // 불꽃 (깜빡임)
            Circle()
                .fill(Color.orange.opacity(flicker ? 0.5 : 0.25))
                .frame(width: flicker ? 22 : 16, height: flicker ? 22 : 16)
                .offset(x: 10, y: -8)
            Text("★")
                .font(.system(size: flicker ? 15 : 12))
                .foregroundStyle(Color(red: 1.0, green: 0.75, blue: 0.2))
                .offset(x: 10, y: -8)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.25).repeatForever(autoreverses: true)) {
                flicker = true
            }
        }
    }
}

// 구멍 하나 = 뒤 구멍 + (클리핑된) 두더지 + 앞 테두리
struct HoleCell: View {
    let hole: Hole
    let progress: Double
    let popups: [Popup]
    let onTap: () -> Void

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let holeH = w * 0.30
            let moleH = h - holeH * 0.5
            let scale = (w * 0.66) / 60.0

            ZStack(alignment: .bottom) {
                // 흙더미 + 구멍
                VStack {
                    Spacer()
                    ZStack {
                        Ellipse().fill(Color(red: 0.42, green: 0.29, blue: 0.16))
                            .frame(width: w * 0.98, height: holeH * 1.25)
                        Ellipse().fill(Color(red: 0.12, green: 0.08, blue: 0.05))
                            .frame(width: w * 0.9, height: holeH)
                    }
                }

                // 두더지: 아래로 잠긴 만큼 오프셋 + 구멍 라인 아래는 잘라냄
                if hole.state != .empty && progress > 0.03 {
                    VStack(spacing: 0) {
                        Spacer(minLength: 0)
                        MoleBody(type: hole.type, whacked: hole.state == .whacked, hp: hole.hp)
                            .scaleEffect(scale, anchor: .bottom)
                            .offset(y: (1 - progress) * moleH * 0.9)
                    }
                    .frame(height: moleH + 30)
                    .padding(.bottom, holeH * 0.45)
                    .clipped()
                }

                // 구멍 앞 테두리(두더지 하반신을 가림)
                VStack {
                    Spacer()
                    Ellipse()
                        .fill(Color(red: 0.49, green: 0.34, blue: 0.20))
                        .frame(width: w * 0.98, height: holeH * 0.62)
                        .offset(y: holeH * 0.18)
                }

                // 점수 팝업
                ForEach(popups) { p in
                    Text(p.text)
                        .font(.system(size: 15, weight: .black))
                        .foregroundStyle(p.color)
                        .shadow(color: .black.opacity(0.6), radius: 1, y: 1)
                        .offset(y: -h * 0.55 - p.age * 26)
                        .opacity(1 - p.age / 0.7)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture { onTap() }
        }
        .aspectRatio(0.72, contentMode: .fit)
    }
}
