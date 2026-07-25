import SwiftUI

// 첫 실행에 딱 한 번 보여주는 3장짜리 안내
struct OnboardingView: View {
    @Binding var isPresented: Bool
    @State private var page = 0

    private let accent = Color(red: 1.0, green: 0.84, blue: 0.30)

    private struct Page {
        let emoji: String
        let title: String
        let lines: [String]
    }

    private let pages: [Page] = [
        Page(emoji: "🐹", title: "두더지를 잡아라!", lines: [
            "구멍에서 올라오는 두더지를 탭!",
            "일반 +10점 · ✨ 황금 +30점",
            "⛑️ 헬멧 두더지는 두 번 때려야 잡혀요",
        ]),
        Page(emoji: "💣", title: "심지를 조심해", lines: [
            "폭탄은 두더지와 똑같이 생겼어요",
            "머리 위에 타는 불꽃 심지가 유일한 힌트",
            "치면 -30점, 클래식에선 시간도 -2초!",
        ]),
        Page(emoji: "🏆", title: "함께 경쟁해요", lines: [
            "클래식 점수는 온라인 순위판에 등록",
            "🔥 주간 리그는 매주 월요일 리셋",
            "📅 데일리 챌린지는 모두 같은 패턴!",
        ]),
    ]

    var body: some View {
        ZStack {
            Color(red: 0.05, green: 0.15, blue: 0.07).ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                TabView(selection: $page) {
                    ForEach(pages.indices, id: \.self) { i in
                        VStack(spacing: 18) {
                            Text(pages[i].emoji).font(.system(size: 90))
                            Text(pages[i].title).font(.title.bold()).foregroundStyle(accent)
                            VStack(spacing: 8) {
                                ForEach(pages[i].lines, id: \.self) { line in
                                    Text(line).font(.callout).foregroundStyle(.white.opacity(0.85))
                                }
                            }
                        }
                        .tag(i)
                        .padding(.horizontal, 30)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .always))
                .frame(height: 340)

                Button {
                    if page < pages.count - 1 {
                        withAnimation { page += 1 }
                    } else {
                        UserDefaults.standard.set(true, forKey: "onboarded")
                        isPresented = false
                    }
                } label: {
                    Text(page < pages.count - 1 ? "다음" : "시작하자!")
                        .font(.title3.bold())
                        .frame(maxWidth: 240)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)
                .tint(accent)
                .foregroundStyle(Color(red: 0.23, green: 0.16, blue: 0.0))

                Button("건너뛰기") {
                    UserDefaults.standard.set(true, forKey: "onboarded")
                    isPresented = false
                }
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.5))

                Spacer()
            }
        }
    }
}
