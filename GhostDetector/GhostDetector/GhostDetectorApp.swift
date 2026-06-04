import SwiftUI

@main
struct GhostDetectorApp: App {
    var body: some Scene {
        WindowGroup {
            GhostDetectorView()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
                .persistentSystemOverlays(.hidden)
        }
    }
}
