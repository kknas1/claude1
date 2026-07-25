import Foundation
import GameKit
import UIKit

// Game Center 연동. 로그인 안 했거나 기기에서 꺼져 있어도
// 게임 전체가 그대로 동작하도록 모든 호출을 인증 여부로 가드한다.
//
// App Store Connect에 등록해야 하는 ID (README의 체크리스트 참고):
//   리더보드  whackmole.classic  — 클래식 최고 점수
//            whackmole.hardcore — 하드코어 최장 생존(초)
//            whackmole.daily    — 데일리 챌린지 최고 점수
//   업적     "whackmole." + Progress 업적 id (예: whackmole.first_game)
@MainActor
final class GameCenterManager: ObservableObject {
    static let shared = GameCenterManager()

    static let lbClassic = "whackmole.classic"
    static let lbHardcore = "whackmole.hardcore"
    static let lbDaily = "whackmole.daily"

    @Published private(set) var authenticated = false

    // 메뉴 화면에서만 Game Center 배지(액세스 포인트)를 띄운다
    private var menuVisible = false

    private init() {}

    func authenticate() {
        GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, _ in
            Task { @MainActor in
                guard let self else { return }
                if let viewController {
                    self.present(viewController)
                    return
                }
                self.authenticated = GKLocalPlayer.local.isAuthenticated
                GKAccessPoint.shared.location = .topLeading
                GKAccessPoint.shared.showHighlights = false
                GKAccessPoint.shared.isActive = self.menuVisible && self.authenticated
            }
        }
    }

    func setAccessPoint(visible: Bool) {
        menuVisible = visible
        GKAccessPoint.shared.isActive = visible && authenticated
    }

    private func present(_ vc: UIViewController) {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        guard var top = scene?.keyWindow?.rootViewController else { return }
        while let presented = top.presentedViewController { top = presented }
        top.present(vc, animated: true)
    }

    func reportScore(score: Int, survival: Double, mode: GameMode) {
        guard authenticated else { return }
        let id: String
        let value: Int
        switch mode {
        case .classic:
            id = Self.lbClassic
            value = score
        case .hardcore:
            id = Self.lbHardcore
            value = Int(survival)
        case .daily:
            id = Self.lbDaily
            value = score
        }
        guard value > 0 else { return }
        Task {
            try? await GKLeaderboard.submitScore(value, context: 0,
                                                 player: GKLocalPlayer.local,
                                                 leaderboardIDs: [id])
        }
    }

    func reportAchievement(_ id: String) {
        guard authenticated else { return }
        let achievement = GKAchievement(identifier: "whackmole." + id)
        achievement.percentComplete = 100
        achievement.showsCompletionBanner = false // 게임오버 패널이 이미 알려준다
        Task {
            try? await GKAchievement.report([achievement])
        }
    }
}
