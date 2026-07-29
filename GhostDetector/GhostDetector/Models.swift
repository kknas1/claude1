import Foundation
import SwiftUI

/// 탐지된 심령 개체의 종류 (엔터테인먼트용)
enum EntityType: String, CaseIterable {
    case orb = "오브"
    case shadow = "그림자"
    case presence = "기척"
    case poltergeist = "폴터가이스트"
    case wisp = "도깨비불"
    case echo = "잔향"

    var emoji: String {
        switch self {
        case .orb: return "🔮"
        case .shadow: return "👤"
        case .presence: return "🌫️"
        case .poltergeist: return "💥"
        case .wisp: return "🔥"
        case .echo: return "🎐"
        }
    }

    var description: String {
        switch self {
        case .orb: return "떠다니는 에너지 구체. 비교적 약한 반응."
        case .shadow: return "형체가 흐릿한 그림자. 시야 경계에서 포착됨."
        case .presence: return "특정할 수 없는 존재감. 자기장 교란 동반."
        case .poltergeist: return "물리적 진동을 유발하는 활동성 개체."
        case .wisp: return "빠르게 이동하는 빛의 잔상."
        case .echo: return "과거의 소리가 반복되는 음향 잔향."
        }
    }
}

/// 활동 강도 단계
enum ActivityLevel: Int, Comparable {
    case dormant = 0   // 잠잠
    case faint = 1     // 미약
    case active = 2    // 활동
    case strong = 3    // 강함
    case intense = 4   // 격렬

    static func < (lhs: ActivityLevel, rhs: ActivityLevel) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    init(score: Double) {
        switch score {
        case ..<0.2: self = .dormant
        case ..<0.4: self = .faint
        case ..<0.6: self = .active
        case ..<0.8: self = .strong
        default: self = .intense
        }
    }

    var label: String {
        switch self {
        case .dormant: return "잠잠함"
        case .faint: return "미약한 반응"
        case .active: return "활동 감지"
        case .strong: return "강한 반응"
        case .intense: return "격렬한 활동"
        }
    }

    var color: Color {
        switch self {
        case .dormant: return .green
        case .faint: return .mint
        case .active: return .yellow
        case .strong: return .orange
        case .intense: return .red
        }
    }
}

/// 하나의 탐지 이벤트 기록
struct Detection: Identifiable {
    let id = UUID()
    let timestamp: Date
    let type: EntityType
    let level: ActivityLevel
    let bearing: Double      // 방향 (도, 0~360)
    let distance: Double     // 추정 거리 (m)
    let emf: Double          // 당시 EMF 수치
    let note: String

    var timeString: String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f.string(from: timestamp)
    }
}

/// 레이더에 표시되는 블립
struct RadarBlip: Identifiable {
    let id = UUID()
    var bearing: Double      // 방향 (도)
    var distance: Double     // 0~1 정규화 (중심=0, 가장자리=1)
    var type: EntityType
    var bornAt: Date = Date()
    var ttl: TimeInterval    // 생존 시간
}
