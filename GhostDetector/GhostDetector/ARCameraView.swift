import SwiftUI
import ARKit
import SceneKit

/// LiDAR 기기에서 DepthScanner의 ARSession 카메라 영상을 배경으로 보여준다.
struct ARCameraView: UIViewRepresentable {
    let session: ARSession

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView()
        view.session = session
        view.automaticallyUpdatesLighting = true
        view.scene = SCNScene()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: ARSCNView, context: Context) {}
}
