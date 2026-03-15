import SwiftUI

@main
struct ObjectDetectorApp: App {
    var body: some Scene {
        WindowGroup {
            DetectorView()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
                .persistentSystemOverlays(.hidden)
        }
    }
}
