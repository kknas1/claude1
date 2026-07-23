import SwiftUI

struct GameView: View {
    @StateObject private var engine = GameEngine()
    @StateObject private var board = Leaderboard()

    @State private var name = UserDefaults.standard.string(forKey: "whackmole.name") ?? ""
    @State private var registered = false
    @State private var myEntryId: String?
    @State private var submitting = false
    @State private var showRanks = false

    private let fieldGreen = Color(red: 0.29, green: 0.63, blue: 0.31)
    private let darkGreen = Color(red: 0.05, green: 0.15, blue: 0.07)
    private let accent = Color(red: 1.0, green: 0.84, blue: 0.30)

    var body: some View {
        ZStack {
            RadialGradient(colors: [Color(red: 0.16, green: 0.43, blue: 0.19), darkGreen],
                           center: .top, startRadius: 0, endRadius: 700)
                .ignoresSafeArea()

            VStack(spacing: 10) {
                hud
                field
            }
            .padding(.horizontal, 12)

            if engine.bombFlash {
                Color.red.opacity(0.18).ignoresSafeArea().allowsHitTesting(false)
            }

            if !engine.running && !engine.gameOver {
                startOverlay
            }
            if engine.gameOver {
                gameOverOverlay
            }
        }
        .sheet(isPresented: $showRanks) {
            RanksView(board: board, highlightId: myEntryId)
        }
        .statusBarHidden()
    }

    // MARK: HUD

    private var hud: some View {
        HStack {
            hudItem("점수", "\(engine.score)")
            Spacer()
            hudItem("시간", "\(Int(engine.remaining.rounded(.up)))")
            Spacer()
            hudItem("최고", "\(engine.best)")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(darkGreen.opacity(0.85), in: RoundedRectangle(cornerRadius: 14))
    }

    private func hudItem(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.white.opacity(0.6))
            Text(value).font(.title2.bold()).monospacedDigit().foregroundStyle(accent)
        }
    }

    // MARK: 필드

    private var field: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Text("LV \(engine.level)")
                    .font(.footnote.bold())
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(accent, in: Capsule())
                    .foregroundStyle(Color(red: 0.23, green: 0.16, blue: 0.0))
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.black.opacity(0.3))
                        Capsule()
                            .fill(engine.remaining > 22 ? Color.green :
                                  engine.remaining > 10 ? Color.orange : Color.red)
                            .frame(width: geo.size.width * engine.remaining / GameEngine.totalTime)
                    }
                }
                .frame(height: 14)
            }
            .padding(.top, 10)

            ZStack {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4),
                          spacing: 2) {
                    ForEach(0..<GameEngine.holeCount, id: \.self) { i in
                        HoleCell(
                            hole: engine.holes[i],
                            progress: engine.progress(engine.holes[i]),
                            popups: engine.popups.filter { $0.holeIndex == i },
                            onTap: { engine.whack(i) }
                        )
                    }
                }

                if let banner = engine.banner {
                    Text(banner)
                        .font(.system(size: 38, weight: .black))
                        .foregroundStyle(accent)
                        .shadow(color: .black.opacity(0.5), radius: 2, y: 2)
                        .transition(.scale)
                        .allowsHitTesting(false)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 8)
        .background(fieldGreen, in: RoundedRectangle(cornerRadius: 18))
        .overlay(alignment: .topTrailing) {
            Text("v1.0")
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.5))
                .padding(6)
        }
    }

    // MARK: 시작 화면

    private var startOverlay: some View {
        panel {
            Text("🔨 두더지 잡기").font(.largeTitle.bold()).foregroundStyle(accent)
            Text("45초, 4×4 구멍에서 최대한 많이!")
                .font(.subheadline).foregroundStyle(.white.opacity(0.85))

            VStack(alignment: .leading, spacing: 7) {
                Text("🐹 두더지 +10점 · ✨ 황금 +30점")
                Text("⛑️ 헬멧 두더지는 두 번! +20점")
                Text("💣 머리에 불꽃 심지가 타면 폭탄! -30점 & -2초")
                Text("🔥 연속으로 잡으면 콤보 보너스")
                Text("⏫ 9초마다 레벨업, 점점 대혼돈")
            }
            .font(.footnote)
            .padding(14)
            .background(.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))

            Button { engine.start(); registered = false; myEntryId = nil } label: {
                Text("시작하기").font(.title3.bold()).padding(.horizontal, 30).padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
            .tint(accent)
            .foregroundStyle(Color(red: 0.23, green: 0.16, blue: 0.0))

            Button {
                showRanks = true
                Task { await board.refresh() }
            } label: {
                Text("🏅 순위 보기").font(.subheadline.bold())
            }
            .buttonStyle(.bordered)
            .tint(accent)
        }
    }

    // MARK: 게임 오버

    private var gameOverOverlay: some View {
        panel {
            Text("⏰ 게임 종료!").font(.largeTitle.bold()).foregroundStyle(accent)
            Text("\(engine.score)점 · 두더지 \(engine.molesHit)마리")
                .font(.headline).foregroundStyle(.white)

            if engine.score >= engine.best && engine.score > 0 {
                Text("🏆 신기록!").font(.headline).foregroundStyle(accent)
            }

            if let id = myEntryId, let rank = board.weeklyRank(of: id) {
                Text("🔥 이번 주 \(rank)위!").font(.title2.bold()).foregroundStyle(accent)
            }

            if let err = board.lastError {
                Text(err).font(.caption).foregroundStyle(.orange)
            }

            if !registered && engine.score > 0 {
                HStack {
                    TextField("이름 (8자)", text: $name)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 160)
                    Button {
                        submitting = true
                        registered = true
                        let finalName = name.isEmpty ? "무명 두더지꾼" : name
                        UserDefaults.standard.set(finalName, forKey: "whackmole.name")
                        Task {
                            let entry = await board.submit(name: finalName,
                                                           score: engine.score,
                                                           moles: engine.molesHit)
                            myEntryId = entry.id
                            submitting = false
                        }
                    } label: {
                        if submitting { ProgressView() } else { Text("순위 등록").bold() }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(accent)
                    .foregroundStyle(Color(red: 0.23, green: 0.16, blue: 0.0))
                }
            }

            HStack(spacing: 10) {
                Button { engine.start(); registered = false; myEntryId = nil } label: {
                    Text("다시 도전").bold().padding(.horizontal, 12).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .tint(accent)
                .foregroundStyle(Color(red: 0.23, green: 0.16, blue: 0.0))

                Button { showRanks = true; Task { await board.refresh() } } label: {
                    Text("순위 보기")
                }
                .buttonStyle(.bordered)
                .tint(accent)
            }

            ShareLink(item: URL(string: "https://kknas1.github.io/claude1/WhackAMole/")!,
                      subject: Text("두더지 잡기 도전장"),
                      message: Text("🔨 두더지 잡기에서 \(engine.score)점 냈다! 이겨볼 사람? 👉")) {
                Label("도전장 보내기", systemImage: "square.and.arrow.up")
                    .font(.subheadline.bold())
            }
            .buttonStyle(.bordered)
            .tint(accent)
        }
    }

    private func panel<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 14, content: content)
            .padding(24)
            .frame(maxWidth: 340)
            .background(Color(red: 0.08, green: 0.20, blue: 0.10).opacity(0.97),
                        in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(accent.opacity(0.3)))
            .shadow(radius: 20)
    }
}

// MARK: - 순위 화면

struct RanksView: View {
    @ObservedObject var board: Leaderboard
    let highlightId: String?

    @State private var tab = 0
    @Environment(\.dismiss) private var dismiss

    private let accent = Color(red: 1.0, green: 0.84, blue: 0.30)

    var body: some View {
        NavigationStack {
            VStack(spacing: 10) {
                Picker("보기", selection: $tab) {
                    Text("🔥 이번 주").tag(0)
                    Text("🌍 전체").tag(1)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)

                if let champ = board.lastWeekChampion {
                    Text("👑 지난주 챔피언: \(champ.name) (\(champ.score)점)")
                        .font(.footnote.bold())
                        .foregroundStyle(accent)
                }

                if board.loading {
                    ProgressView("순위 불러오는 중…").padding(.top, 40)
                    Spacer()
                } else {
                    let list = Array((tab == 0 ? board.thisWeek : board.scores)
                        .prefix(Leaderboard.visibleMax))
                    if list.isEmpty {
                        Text("아직 기록이 없어요").foregroundStyle(.secondary).padding(.top, 40)
                        Spacer()
                    } else {
                        List(Array(list.enumerated()), id: \.element.id) { idx, entry in
                            HStack {
                                Text(idx == 0 ? "🥇" : idx == 1 ? "🥈" : idx == 2 ? "🥉" : "\(idx + 1)위")
                                    .frame(width: 44, alignment: .leading)
                                Text(entry.name)
                                    .fontWeight(entry.id == highlightId ? .black : .regular)
                                    .foregroundStyle(entry.id == highlightId ? accent : .primary)
                                Spacer()
                                Text("\(entry.score)점 · \(entry.moles)마리")
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .listStyle(.plain)
                    }
                }

                if let err = board.lastError {
                    Text(err).font(.caption).foregroundStyle(.orange)
                }
            }
            .navigationTitle("🏅 순위")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("닫기") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await board.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
    }
}
