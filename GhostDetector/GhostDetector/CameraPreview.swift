import SwiftUI
import AVFoundation

/// 후면 카메라 라이브 영상을 배경으로 보여준다 (야간 투시 느낌의 오버레이와 합성).
/// LiDAR 세션이 활성화되면 ARKit이 카메라를 점유하므로, 이 프리뷰는
/// LiDAR가 없는 기기에서 배경 영상으로 사용된다.
struct CameraPreview: UIViewRepresentable {
    let manager: SimpleCameraManager

    func makeUIView(context: Context) -> CameraPreviewUIView {
        let view = CameraPreviewUIView()
        view.previewLayer.session = manager.session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ uiView: CameraPreviewUIView, context: Context) {}
}

final class CameraPreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

/// LiDAR가 없는 기기용 간단한 카메라 세션.
final class SimpleCameraManager: ObservableObject {
    let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "ghost.camera.session")

    func start() {
        sessionQueue.async { [weak self] in
            guard let self else { return }
            if !self.session.inputs.isEmpty {
                if !self.session.isRunning { self.session.startRunning() }
                return
            }
            self.session.beginConfiguration()
            self.session.sessionPreset = .high
            if let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
               let input = try? AVCaptureDeviceInput(device: device),
               self.session.canAddInput(input) {
                self.session.addInput(input)
            }
            self.session.commitConfiguration()
            self.session.startRunning()
        }
    }

    func stop() {
        sessionQueue.async { [weak self] in
            guard let self, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }
}
