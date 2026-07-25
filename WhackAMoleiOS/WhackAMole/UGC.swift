import Foundation
import SwiftUI

// 공개 순위판(UGC) 대응 — App Store Guideline 1.2:
// 1) 닉네임 비속어 필터 (등록 차단 + 표시 마스킹, 웹 game.js와 같은 목록)
// 2) 남이 올린 기록을 로컬에서 숨기기/신고
@MainActor
final class UGC: ObservableObject {
    static let shared = UGC()

    @Published private(set) var hiddenIds: Set<String>

    private init() {
        hiddenIds = Set(UserDefaults.standard.stringArray(forKey: "ugc.hidden") ?? [])
    }

    func hide(_ id: String) {
        hiddenIds.insert(id)
        save()
    }

    func unhideAll() {
        hiddenIds = []
        save()
    }

    private func save() {
        UserDefaults.standard.set(Array(hiddenIds), forKey: "ugc.hidden")
    }

    // ---------- 비속어 필터 ----------
    // 웹(WhackAMole/game.js)의 BAD_WORDS와 반드시 같은 목록을 유지할 것.
    static let badWords: [String] = [
        "시발", "씨발", "시빨", "씨빨", "쉬발", "씨팔", "씹", "병신", "븅신",
        "지랄", "좆", "존나", "새끼", "새키", "개새", "썅", "미친놈", "미친년",
        "또라이", "걸레", "창녀", "창놈", "자지", "보지", "섹스", "야동",
        "강간", "느금", "니미", "엠창",
        "fuck", "fuk", "shit", "bitch", "asshole", "bastard", "dick",
        "cock", "pussy", "penis", "vagina", "porn", "nigger", "nigga",
        "faggot", "cunt", "whore", "slut", "rape",
    ]

    // 공백·특수문자를 끼워 넣는 우회를 막기 위해 글자/숫자만 남기고 비교
    private static func normalized(_ s: String) -> String {
        s.precomposedStringWithCanonicalMapping
            .lowercased()
            .filter { $0.isLetter || $0.isNumber }
    }

    static func containsProfanity(_ name: String) -> Bool {
        let n = normalized(name)
        guard !n.isEmpty else { return false }
        return badWords.contains { n.contains($0) }
    }

    // 옛 클라이언트로 등록된 기록이 남아 있어도 화면에서는 가린다
    static func displayName(_ name: String) -> String {
        containsProfanity(name) ? "★★★" : name
    }
}
