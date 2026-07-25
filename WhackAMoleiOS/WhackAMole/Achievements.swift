import Foundation
import SwiftUI

// 누적 통계 + 업적. 전부 로컬(UserDefaults) 저장이며,
// PR-3에서 Game Center 업적 보고가 여기에 연결된다.

struct AchievementDef: Identifiable {
    let id: String        // Game Center 업적 ID로도 그대로 사용
    let emoji: String
    let title: String
    let detail: String
}

@MainActor
final class Progress: ObservableObject {
    static let shared = Progress()

    private let d = UserDefaults.standard

    // ---------- 누적 통계 ----------
    @Published var totalMoles: Int
    @Published var totalGames: Int
    @Published var bestCombo: Int
    @Published var bestClassic: Int
    @Published var bestHardcoreSurvival: Double // 초
    @Published var bestDaily: Int
    @Published var dailyStreak: Int
    @Published var unlocked: Set<String>

    var newlyUnlocked: [AchievementDef] = [] // 게임오버 화면에서 한 번 보여주고 비움

    private init() {
        totalMoles = d.integer(forKey: "stat.totalMoles")
        totalGames = d.integer(forKey: "stat.totalGames")
        bestCombo = d.integer(forKey: "stat.bestCombo")
        bestClassic = d.integer(forKey: "whackmole.best")
        bestHardcoreSurvival = d.double(forKey: "stat.bestHardcore")
        bestDaily = d.integer(forKey: "stat.bestDaily")
        dailyStreak = d.integer(forKey: "stat.dailyStreak")
        unlocked = Set(d.stringArray(forKey: "stat.unlocked") ?? [])
    }

    static let all: [AchievementDef] = [
        AchievementDef(id: "first_game", emoji: "👣", title: "첫 걸음", detail: "첫 게임을 끝까지 플레이"),
        AchievementDef(id: "first_post", emoji: "📝", title: "명단 등록", detail: "공유 순위판에 첫 기록 등록"),
        AchievementDef(id: "score_100", emoji: "💯", title: "백점 돌파", detail: "한 판 100점 달성"),
        AchievementDef(id: "score_500", emoji: "🚀", title: "고수의 향기", detail: "한 판 500점 달성"),
        AchievementDef(id: "score_1000", emoji: "👑", title: "두더지의 왕", detail: "한 판 1,000점 달성"),
        AchievementDef(id: "combo_10", emoji: "🔥", title: "열 콤보", detail: "콤보 10 달성"),
        AchievementDef(id: "combo_20", emoji: "⚡", title: "무아지경", detail: "콤보 20 달성"),
        AchievementDef(id: "no_bomb", emoji: "🧘", title: "무결점", detail: "클래식에서 폭탄을 한 번도 안 누르고 종료"),
        AchievementDef(id: "moles_500", emoji: "🏹", title: "사냥꾼", detail: "누적 500마리 잡기"),
        AchievementDef(id: "moles_2000", emoji: "🐹", title: "두더지 학살자", detail: "누적 2,000마리 잡기"),
        AchievementDef(id: "hardcore_180", emoji: "🛡️", title: "생존왕", detail: "하드코어에서 3분 생존"),
        AchievementDef(id: "daily_3", emoji: "📅", title: "성실왕", detail: "데일리 챌린지 3일 연속 참가"),
    ]

    private func save() {
        d.set(totalMoles, forKey: "stat.totalMoles")
        d.set(totalGames, forKey: "stat.totalGames")
        d.set(bestCombo, forKey: "stat.bestCombo")
        d.set(bestHardcoreSurvival, forKey: "stat.bestHardcore")
        d.set(bestDaily, forKey: "stat.bestDaily")
        d.set(dailyStreak, forKey: "stat.dailyStreak")
        d.set(Array(unlocked), forKey: "stat.unlocked")
    }

    func unlock(_ id: String) {
        guard !unlocked.contains(id) else { return }
        unlocked.insert(id)
        if let def = Self.all.first(where: { $0.id == id }) {
            newlyUnlocked.append(def)
        }
        GameCenterBridge.reportAchievement(id)
        save()
    }

    // 게임 한 판이 끝날 때 엔진이 호출
    func recordGame(mode: GameMode, score: Int, moles: Int, maxCombo: Int,
                    bombsHit: Int, survival: Double) {
        totalGames += 1
        totalMoles += moles
        bestCombo = max(bestCombo, maxCombo)

        unlock("first_game")
        if score >= 100 { unlock("score_100") }
        if score >= 500 { unlock("score_500") }
        if score >= 1000 { unlock("score_1000") }
        if maxCombo >= 10 { unlock("combo_10") }
        if maxCombo >= 20 { unlock("combo_20") }
        if totalMoles >= 500 { unlock("moles_500") }
        if totalMoles >= 2000 { unlock("moles_2000") }

        switch mode {
        case .classic:
            bestClassic = max(bestClassic, score)
            if bombsHit == 0 && moles > 0 { unlock("no_bomb") }
        case .hardcore:
            bestHardcoreSurvival = max(bestHardcoreSurvival, survival)
            if survival >= 180 { unlock("hardcore_180") }
        case .daily:
            bestDaily = max(bestDaily, score)
            bumpDailyStreak()
            if dailyStreak >= 3 { unlock("daily_3") }
        }
        save()
    }

    func recordPosted() {
        unlock("first_post")
    }

    private func bumpDailyStreak() {
        let today = SeededRandom.todayString()
        let last = d.string(forKey: "stat.lastDaily") ?? ""
        guard last != today else { return }
        let cal = Calendar.current
        if let lastDate = dateFrom(last),
           let yesterday = cal.date(byAdding: .day, value: -1, to: cal.startOfDay(for: Date())),
           cal.isDate(lastDate, inSameDayAs: yesterday) {
            dailyStreak += 1
        } else {
            dailyStreak = 1
        }
        d.set(today, forKey: "stat.lastDaily")
    }

    private func dateFrom(_ s: String) -> Date? {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = .current
        return fmt.date(from: s)
    }

    // 데일리 챌린지: 오늘 이미 기록했는지
    func dailyPlayedToday() -> Bool {
        d.string(forKey: "stat.dailyDone") == SeededRandom.todayString()
    }
    func markDailyPlayed(score: Int) {
        d.set(SeededRandom.todayString(), forKey: "stat.dailyDone")
        d.set(score, forKey: "stat.dailyTodayScore")
    }
    func dailyTodayScore() -> Int {
        d.integer(forKey: "stat.dailyTodayScore")
    }
}

// PR-3에서 GameCenterManager 로 대체되는 얇은 다리.
// 지금은 아무것도 하지 않아 Game Center 없이도 전체가 동작한다.
enum GameCenterBridge {
    static func reportAchievement(_ id: String) {}
    static func reportScore(_ score: Int, mode: GameMode) {}
}
