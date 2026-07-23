import Foundation
import SwiftUI

// 웹 버전(WhackAMole/game.js)과 동일한 규칙:
// 4x4, 45초, 9초마다 레벨업(1~5), 일반 +10 / 황금 +30 / 헬멧 두 번(+20) /
// 폭탄(두더지로 위장, 심지가 힌트) -30점 & -2초, 콤보 보너스.

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

    @Published var holes: [Hole] = Array(repeating: Hole(), count: GameEngine.holeCount)
    @Published var score = 0
    @Published var combo = 0
    @Published var molesHit = 0
    @Published var level = 1
    @Published var elapsed: Double = 0
    @Published var running = false
    @Published var gameOver = false
    @Published var banner: String?
    @Published var popups: [Popup] = []
    @Published var bombFlash = false
    @Published var best = UserDefaults.standard.integer(forKey: "whackmole.best")

    private var timer: Timer?
    private var spawnIn: Double = 0.45
    private var bannerAge: Double = 0

    var remaining: Double { max(0, Self.totalTime - elapsed) }
    var cfg: LevelCfg { Self.levels[level - 1] }

    func start() {
        holes = Array(repeating: Hole(), count: Self.holeCount)
        popups = []
        score = 0
        combo = 0
        molesHit = 0
        level = 1
        elapsed = 0
        spawnIn = 0.45
        banner = nil
        gameOver = false
        running = true
        Sounds.shared.startGame()
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
        if remaining <= 0 {
            endGame()
            return
        }

        let newLevel = min(Self.levels.count, Int(elapsed / Self.levelDur) + 1)
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
            if Double.random(in: 0..<1) < cfg.dbl { spawnMole() }
            if Double.random(in: 0..<1) < cfg.triple { spawnMole() }
            spawnIn += cfg.spawn
        }

        for i in holes.indices {
            advance(&holes[i], dt)
        }

        for i in popups.indices { popups[i].age += dt }
        popups.removeAll { $0.age > 0.7 }
    }

    private func advance(_ h: inout Hole, _ dt: Double) {
        guard h.state != .empty else { return }
        h.t += dt
        switch h.state {
        case .rising where h.t >= Self.riseDur:
            h.state = .up
            h.t = 0
        case .up where h.t >= h.upDur:
            h.state = .falling
            h.t = 0
        case .falling where h.t >= Self.fallDur:
            h.state = .empty
        case .whacked where h.t >= Self.whackDur:
            h.state = .empty
        default:
            break
        }
    }

    private func pickType() -> MoleType {
        var r = Double.random(in: 0..<1)
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
        guard let i = empties.randomElement() else { return }
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
        holes[i] = h
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
        score = max(0, score - 30)
        elapsed = min(Self.totalTime - 0.01, elapsed + 2) // 시간 -2초
        holes[i].state = .whacked
        holes[i].t = 0
        popups.append(Popup(holeIndex: i, text: "-30 · -2초", color: .red))
        bombFlash = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 250_000_000)
            self.bombFlash = false
        }
        Sounds.shared.bomb()
        Haptics.heavy()
    }

    private func endGame() {
        stop()
        for i in holes.indices where holes[i].state == .rising || holes[i].state == .up {
            holes[i].state = .falling
            holes[i].t = 0
        }
        if score > best {
            best = score
            UserDefaults.standard.set(best, forKey: "whackmole.best")
        }
        gameOver = true
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
