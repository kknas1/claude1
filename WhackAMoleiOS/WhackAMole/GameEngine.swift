import Foundation
import SwiftUI

// 게임 규칙 (클래식은 웹 WhackAMole/game.js v1.6 과 동일):
// 4x4, 9초마다 레벨업, 일반 +10 / 황금 +30 / 헬멧 두 번(+20) /
// 폭탄(두더지로 위장, 심지가 힌트) -30점 & -2초, 콤보 보너스.

enum GameMode: String, CaseIterable, Identifiable {
    case classic, hardcore, daily
    var id: String { rawValue }

    var title: String {
        switch self {
        case .classic: return "클래식"
        case .hardcore: return "하드코어"
        case .daily: return "데일리 챌린지"
        }
    }
    var emoji: String {
        switch self {
        case .classic: return "🕐"
        case .hardcore: return "💀"
        case .daily: return "📅"
        }
    }
    var subtitle: String {
        switch self {
        case .classic: return "45초 최고 점수 · 온라인 리그"
        case .hardcore: return "목숨 3개, 끝없이 빨라짐"
        case .daily: return "매일 같은 패턴, 하루 한 번"
        }
    }
}

enum MoleType {
    case normal, gold, helmet, bomb
}

enum HoleState {
    case empty, rising, up, falling, whacked
}

struct Hole {
    var state: HoleState = .empty
    var type: MoleType = .normal
    var t: Double = 0          // seconds spent in the current state
    var upDur: Double = 1
    var hp: Int = 1            // helmet moles take two hits
}

struct Popup: Identifiable {
    let id = UUID()
    let holeIndex: Int
    let text: String
    let color: Color
    var age: Double = 0
}

struct LevelCfg {
    let spawn: Double
    let up: Double
    let bomb: Double
    let helmet: Double
    let dbl: Double
    let triple: Double
}

@MainActor
final class GameEngine: ObservableObject {
    static let holeCount = 16
    static let totalTime: Double = 45
    static let levelDur: Double = 9
    static let riseDur: Double = 0.13
    static let fallDur: Double = 0.17
    static let whackDur: Double = 0.32
    static let goldChance: Double = 0.09

    static let levels: [LevelCfg] = [
        LevelCfg(spawn: 0.80, up: 1.05, bomb: 0.07, helmet: 0.00, dbl: 0.10, triple: 0.00),
        LevelCfg(spawn: 0.64, up: 0.89, bomb: 0.10, helmet: 0.10, dbl: 0.25, triple: 0.00),
        LevelCfg(spawn: 0.51, up: 0.75, bomb: 0.12, helmet: 0.12, dbl: 0.40, triple: 0.10),
        LevelCfg(spawn: 0.41, up: 0.63, bomb: 0.14, helmet: 0.14, dbl: 0.55, triple: 0.22),
        LevelCfg(spawn: 0.33, up: 0.52, bomb: 0.16, helmet: 0.15, dbl: 0.70, triple: 0.35),
    ]

    @Published var mode: GameMode = .classic
    @Published var holes: [Hole] = Array(repeating: Hole(), count: GameEngine.holeCount)
    @Published var score = 0
    @Published var combo = 0
    @Published var molesHit = 0
    @Published var level = 1
    @Published var elapsed: Double = 0
    @Published var lives = 3
    @Published var running = false
    @Published var gameOver = false
    @Published var banner: String?
    @Published var popups: [Popup] = []
    @Published var bombFlash = false
    @Published var best = UserDefaults.standard.integer(forKey: "whackmole.best")

    private(set) var maxCombo = 0
    private(set) var bombsHit = 0

    private var timer: Timer?
    private var spawnIn: Double = 0.45
    private var bannerAge: Double = 0
    private var seeded: SeededRandom?
    private var lastTickSecond = -1

    var remaining: Double { max(0, Self.totalTime - elapsed) }
    var timed: Bool { mode != .hardcore }

    // 하드코어는 레벨 5 이후에도 계속 빨라진다
    var cfg: LevelCfg {
        if level <= Self.levels.count {
            return Self.levels[level - 1]
        }
        let baseCfg = Self.levels[Self.levels.count - 1]
        let k = pow(0.93, Double(level - Self.levels.count))
        return LevelCfg(
            spawn: max(0.22, baseCfg.spawn * k),
            up: max(0.34, baseCfg.up * k),
            bomb: min(0.20, baseCfg.bomb + Double(level - 5) * 0.005),
            helmet: baseCfg.helmet,
            dbl: min(0.85, baseCfg.dbl + Double(level - 5) * 0.02),
            triple: min(0.55, baseCfg.triple + Double(level - 5) * 0.02)
        )
    }

    private func rand() -> Double {
        if seeded != nil {
            return seeded!.nextDouble()
        }
        return Double.random(in: 0..<1)
    }

    func start(_ newMode: GameMode) {
        mode = newMode
        seeded = newMode == .daily ? SeededRandom(dateString: SeededRandom.todayString()) : nil
        holes = Array(repeating: Hole(), count: Self.holeCount)
        popups = []
        score = 0
        combo = 0
        maxCombo = 0
        bombsHit = 0
        molesHit = 0
        level = 1
        elapsed = 0
        lives = 3
        spawnIn = 0.45
        banner = nil
        lastTickSecond = -1
        gameOver = false
        running = true
        Sounds.shared.startGame()
        Sounds.shared.startBGM()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick(1.0 / 60.0)
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        running = false
    }

    private func tick(_ dt: Double) {
        guard running else { return }
        elapsed += dt
        if timed && remaining <= 0 {
            endGame()
            return
        }
        // 마지막 5초 긴박 카운트
        if timed {
            let sec = Int(remaining.rounded(.up))
            if sec <= 5 && sec != lastTickSecond {
                lastTickSecond = sec
                Sounds.shared.tick()
            }
        }

        let maxLevel = mode == .hardcore ? 99 : Self.levels.count
        let newLevel = min(maxLevel, Int(elapsed / Self.levelDur) + 1)
        if newLevel != level {
            level = newLevel
            banner = "LEVEL \(level)!"
            bannerAge = 0
            spawnIn = min(spawnIn, 0.12)
            Sounds.shared.levelUp()
            Haptics.medium()
        }
        if banner != nil {
            bannerAge += dt
            if bannerAge > 1.0 { banner = nil }
        }

        spawnIn -= dt
        while spawnIn <= 0 {
            spawnMole()
            if rand() < cfg.dbl { spawnMole() }
            if rand() < cfg.triple { spawnMole() }
            spawnIn += cfg.spawn
        }

        for i in holes.indices {
            advance(i, dt)
        }
        if !running { return } // 하드코어에서 목숨 소진으로 이미 종료됐을 수 있음

        for i in popups.indices { popups[i].age += dt }
        popups.removeAll { $0.age > 0.7 }
    }

    private func advance(_ i: Int, _ dt: Double) {
        guard holes[i].state != .empty else { return }
        holes[i].t += dt
        switch holes[i].state {
        case .rising where holes[i].t >= Self.riseDur:
            holes[i].state = .up
            holes[i].t = 0
        case .up where holes[i].t >= holes[i].upDur:
            let type = holes[i].type
            holes[i].state = .falling
            holes[i].t = 0
            // 하드코어: 두더지를 놓치면 목숨 -1 (폭탄은 놓치는 게 정답)
            if mode == .hardcore && type != .bomb {
                loseLife(at: i, reason: "놓침!")
            }
        case .falling where holes[i].t >= Self.fallDur:
            holes[i].state = .empty
        case .whacked where holes[i].t >= Self.whackDur:
            holes[i].state = .empty
        default:
            break
        }
    }

    private func pickType() -> MoleType {
        var r = rand()
        r -= Self.goldChance
        if r < 0 { return .gold }
        r -= cfg.bomb
        if r < 0 { return .bomb }
        r -= cfg.helmet
        if r < 0 { return .helmet }
        return .normal
    }

    private func spawnMole() {
        let empties = holes.indices.filter { holes[$0].state == .empty }
        guard !empties.isEmpty else { return }
        let pick = seeded != nil ? empties[seeded!.nextInt(empties.count)]
                                 : empties[Int.random(in: 0..<empties.count)]
        var h = Hole()
        h.type = pickType()
        h.state = .rising
        h.t = 0
        h.hp = h.type == .helmet ? 2 : 1
        var up = cfg.up
        if h.type == .gold { up *= 0.72 }
        if h.type == .bomb { up *= 1.1 }
        if h.type == .helmet { up *= 1.25 }
        h.upDur = up
        holes[pick] = h
    }

    // 셀을 탭했을 때. 두더지가 없으면 헛스윙(콤보 리셋).
    func whack(_ i: Int) {
        guard running else { return }
        let h = holes[i]
        guard h.state == .rising || h.state == .up else {
            if h.state != .whacked {
                combo = 0
                Sounds.shared.whiff()
            }
            return
        }
        switch h.type {
        case .bomb:
            hitBomb(i)
        case .helmet where h.hp > 1:
            hitHelmetBlock(i)
        default:
            hitMole(i)
        }
    }

    private func hitMole(_ i: Int) {
        combo += 1
        maxCombo = max(maxCombo, combo)
        let bonus = min(combo - 1, 10) * 2
        let base: Int
        switch holes[i].type {
        case .gold: base = 30
        case .helmet: base = 20
        default: base = 10
        }
        let pts = base + bonus
        score += pts
        molesHit += 1
        holes[i].state = .whacked
        holes[i].t = 0
        let gold = holes[i].type == .gold
        popups.append(Popup(holeIndex: i, text: "+\(pts)", color: gold ? .yellow : .white))
        if gold { Sounds.shared.gold() } else { Sounds.shared.hit() }
        Haptics.light()
    }

    private func hitHelmetBlock(_ i: Int) {
        holes[i].hp = 1
        holes[i].t = max(0, holes[i].t - 0.3) // 두 번째 타격 여유
        popups.append(Popup(holeIndex: i, text: "깡!", color: Color(white: 0.9)))
        Sounds.shared.clink()
        Haptics.light()
    }

    private func hitBomb(_ i: Int) {
        combo = 0
        bombsHit += 1
        score = max(0, score - 30)
        holes[i].state = .whacked
        holes[i].t = 0
        bombFlash = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            self.bombFlash = false
        }
        Sounds.shared.bomb()
        Haptics.heavy()

        if mode == .hardcore {
            popups.append(Popup(holeIndex: i, text: "-30 · 💔", color: .red))
            loseLife(at: nil, reason: nil)
        } else {
            elapsed = min(Self.totalTime - 0.01, elapsed + 2) // 시간 -2초
            popups.append(Popup(holeIndex: i, text: "-30 · -2초", color: .red))
        }
    }

    private func loseLife(at holeIndex: Int?, reason: String?) {
        lives -= 1
        if let i = holeIndex, let text = reason {
            popups.append(Popup(holeIndex: i, text: text, color: .red))
        }
        Haptics.heavy()
        if lives <= 0 {
            endGame()
        }
    }

    private func endGame() {
        stop()
        for i in holes.indices where holes[i].state == .rising || holes[i].state == .up {
            holes[i].state = .falling
            holes[i].t = 0
        }
        if mode == .classic && score > best {
            best = score
            UserDefaults.standard.set(best, forKey: "whackmole.best")
        }
        Progress.shared.recordGame(mode: mode, score: score, moles: molesHit,
                                   maxCombo: maxCombo, bombsHit: bombsHit,
                                   survival: elapsed)
        if mode == .daily {
            Progress.shared.markDailyPlayed(score: score)
        }
        GameCenterManager.shared.reportScore(score: score, survival: elapsed, mode: mode)
        gameOver = true
        Sounds.shared.stopBGM()
        Sounds.shared.end()
    }

    // 그리기용 진행도(0=구멍 속, 1=완전히 올라옴)
    func progress(_ h: Hole) -> Double {
        switch h.state {
        case .rising:
            let k = min(1, h.t / Self.riseDur)
            return 1 - (1 - k) * (1 - k) // ease-out
        case .up:
            return 1
        case .falling:
            return 1 - min(1, h.t / Self.fallDur)
        case .whacked:
            return 1 - min(1, h.t / Self.whackDur) * 0.6
        case .empty:
            return 0
        }
    }
}
