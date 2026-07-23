import Foundation

// 웹 게임과 완전히 같은 순위판 서버(Google Apps Script)를 사용한다.
// 앱에서 등록한 점수가 웹(PWA) 유저들에게도 그대로 보인다 — 한 리그!

struct Entry: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    let score: Int
    let moles: Int
    let date: Double // ms since epoch (웹과 동일)
}

private struct BoardBody: Codable {
    var scores: [Entry]?
    var error: String?
    var reset: Bool?
    var admin: String?
    var action: String?
}

enum BoardError: LocalizedError {
    case server(String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .server(let m): return m
        case .badResponse: return "서버 응답을 읽지 못했어요"
        }
    }
}

@MainActor
final class Leaderboard: ObservableObject {
    // 웹 game.js 의 BOARD_URL 과 동일해야 앱-웹이 한 순위판을 공유한다
    static let boardURL = URL(string: "https://script.google.com/macros/s/AKfycbz1Of-cmNR_1nBrUtanRofWDhAAjLgIvaAUfU6nBKHMXZGTF6OnmhIXkeWZZ8cyZURfsw/exec")!
    static let storeMax = 50
    static let visibleMax = 20

    @Published var scores: [Entry] = Leaderboard.loadCache()
    @Published var loading = false
    @Published var lastError: String?

    private static func loadCache() -> [Entry] {
        guard let data = UserDefaults.standard.data(forKey: "whackmole.board.cache"),
              let list = try? JSONDecoder().decode([Entry].self, from: data) else { return [] }
        return list
    }

    private func saveCache(_ list: [Entry]) {
        if let data = try? JSONEncoder().encode(list) {
            UserDefaults.standard.set(data, forKey: "whackmole.board.cache")
        }
    }

    private func request(_ body: BoardBody?) async throws -> [Entry] {
        var req = URLRequest(url: Self.boardURL, timeoutInterval: 25)
        if let body {
            req.httpMethod = "POST"
            // text/plain: simple request 유지 (Apps Script는 preflight 응답 불가)
            req.setValue("text/plain;charset=utf-8", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(body)
        }
        let (data, _) = try await URLSession.shared.data(for: req)
        guard let parsed = try? JSONDecoder().decode(BoardBody.self, from: data) else {
            throw BoardError.badResponse
        }
        if let err = parsed.error { throw BoardError.server(err) }
        var list = parsed.scores ?? []
        list.sort { $0.score != $1.score ? $0.score > $1.score : $0.date < $1.date }
        return Array(list.prefix(Self.storeMax))
    }

    func refresh() async {
        loading = true
        lastError = nil
        defer { loading = false }
        do {
            let list = try await request(nil)
            scores = list
            saveCache(list)
        } catch {
            lastError = "연결 실패 — 마지막으로 받아둔 순위예요"
        }
    }

    func submit(name: String, score: Int, moles: Int) async -> Entry {
        let entry = Entry(
            id: UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased(),
            name: String(name.precomposedStringWithCanonicalMapping.prefix(8)),
            score: score,
            moles: moles,
            date: Date().timeIntervalSince1970 * 1000
        )
        do {
            // 복제본을 함께 보내 서버가 비어 있어도 복구되게 (웹과 동일한 규약)
            let list = try await request(BoardBody(scores: [entry] + scores, error: nil, reset: nil, admin: nil, action: nil))
            scores = list
            saveCache(list)
            lastError = nil
        } catch {
            lastError = "연결 실패 — 나중에 다시 시도해 주세요"
            // 로컬에는 반영해 두어 화면에서는 보이게
            var merged = scores + [entry]
            merged.sort { $0.score != $1.score ? $0.score > $1.score : $0.date < $1.date }
            scores = Array(merged.prefix(Self.storeMax))
        }
        return entry
    }

    // ---------- 주간 리그 ----------
    static func weekStart(_ offsetWeeks: Int = 0) -> Date {
        var cal = Calendar(identifier: .iso8601) // 월요일 시작
        cal.timeZone = .current
        let start = cal.dateInterval(of: .weekOfYear, for: Date())?.start ?? Date()
        return cal.date(byAdding: .weekOfYear, value: -offsetWeeks, to: start) ?? start
    }

    var thisWeek: [Entry] {
        let from = Self.weekStart().timeIntervalSince1970 * 1000
        return scores.filter { $0.date >= from }
    }

    var lastWeekChampion: Entry? {
        let from = Self.weekStart(1).timeIntervalSince1970 * 1000
        let to = Self.weekStart().timeIntervalSince1970 * 1000
        return scores
            .filter { $0.date >= from && $0.date < to }
            .max { a, b in a.score != b.score ? a.score < b.score : a.date > b.date }
    }

    func weeklyRank(of id: String) -> Int? {
        guard let idx = thisWeek.firstIndex(where: { $0.id == id }) else { return nil }
        return idx + 1
    }
}
