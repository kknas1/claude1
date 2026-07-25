import Foundation

// 데일리 챌린지용 결정적 난수: 같은 날짜 → 전 세계 모두 같은 두더지 패턴.
// SplitMix64 — 짧고 품질 좋은 표준 알고리즘.
struct SeededRandom {
    private var state: UInt64

    init(seed: UInt64) {
        state = seed
    }

    /// "2026-07-23" 같은 날짜 문자열로 시드 생성 (FNV-1a 해시)
    init(dateString: String) {
        var h: UInt64 = 0xcbf29ce484222325
        for b in dateString.utf8 {
            h ^= UInt64(b)
            h = h &* 0x100000001b3
        }
        self.init(seed: h)
    }

    mutating func nextUInt64() -> UInt64 {
        state = state &+ 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }

    /// [0, 1) 구간 Double
    mutating func nextDouble() -> Double {
        Double(nextUInt64() >> 11) * (1.0 / 9007199254740992.0)
    }

    mutating func nextInt(_ upperBound: Int) -> Int {
        guard upperBound > 0 else { return 0 }
        return Int(nextUInt64() % UInt64(upperBound))
    }

    static func todayString() -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.timeZone = .current
        return fmt.string(from: Date())
    }
}
