import SwiftUI

struct StatsView: View {
    @ObservedObject private var progress = Progress.shared
    @Environment(\.dismiss) private var dismiss

    private let accent = Color(red: 1.0, green: 0.84, blue: 0.30)

    var body: some View {
        NavigationStack {
            List {
                Section("기록") {
                    statRow("🐹 누적 잡은 두더지", "\(progress.totalMoles)마리")
                    statRow("🎮 플레이 횟수", "\(progress.totalGames)판")
                    statRow("🔥 최고 콤보", "\(progress.bestCombo)")
                    statRow("🕐 클래식 최고점", "\(progress.bestClassic)점")
                    statRow("💀 하드코어 최고 생존", String(format: "%.0f초", progress.bestHardcoreSurvival))
                    statRow("📅 데일리 최고점 / 연속", "\(progress.bestDaily)점 · \(progress.dailyStreak)일")
                }

                Section("업적 \(progress.unlocked.count)/\(Progress.all.count)") {
                    ForEach(Progress.all) { a in
                        let done = progress.unlocked.contains(a.id)
                        HStack {
                            Text(done ? a.emoji : "🔒")
                                .font(.title3)
                                .frame(width: 34)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(a.title)
                                    .fontWeight(done ? .bold : .regular)
                                    .foregroundStyle(done ? .primary : .secondary)
                                Text(a.detail)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if done {
                                Image(systemName: "checkmark.seal.fill").foregroundStyle(accent)
                            }
                        }
                    }
                }
            }
            .navigationTitle("📊 기록 & 업적")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("닫기") { dismiss() }
                }
            }
        }
    }

    private func statRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value).bold().foregroundStyle(accent)
        }
    }
}
