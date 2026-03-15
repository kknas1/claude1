import AVFoundation
import Vision
import SwiftUI
import CoreML

/// Detected object with screen-space coordinates
struct DetectedObject: Identifiable {
    let id = UUID()
    let label: String
    let confidence: Float
    let boundingBox: CGRect  // normalized Vision coordinates (origin bottom-left)
    let color: Color
}

@MainActor
final class DetectionViewModel: NSObject, ObservableObject {
    // MARK: - Published State
    @Published var detectedObjects: [DetectedObject] = []
    @Published var fps: Int = 0
    @Published var isRunning = false
    @Published var errorMessage: String?

    // MARK: - Camera
    let captureSession = AVCaptureSession()
    private let videoOutput = AVCaptureVideoDataOutput()
    private let sessionQueue = DispatchQueue(label: "camera.session")
    private let detectionQueue = DispatchQueue(label: "detection", qos: .userInteractive)

    // MARK: - Vision
    private var detectionRequest: VNCoreMLRequest?
    private var isProcessing = false

    // MARK: - FPS Tracking
    private var frameCount = 0
    private var lastFPSTime = CACurrentMediaTime()

    // MARK: - Color Assignment
    private var classColors: [String: Color] = [:]
    private let palette: [Color] = [
        Color(red: 0, green: 0.94, blue: 1),       // cyan
        Color(red: 1, green: 0, blue: 0.24),         // red
        Color(red: 0.06, green: 1, blue: 0.31),      // green
        Color(red: 1, green: 0.4, blue: 0),           // orange
        Color(red: 0.8, green: 0, blue: 1),           // purple
        Color(red: 1, green: 0.87, blue: 0),          // yellow
        Color(red: 0, green: 1, blue: 0.6),           // mint
        Color(red: 1, green: 0, blue: 0.5),           // pink
        Color(red: 0, green: 0.5, blue: 1),           // blue
        Color(red: 1, green: 0.53, blue: 0),          // amber
    ]
    private var colorIndex = 0

    // MARK: - Setup

    func setupCamera() {
        sessionQueue.async { [weak self] in
            self?.configureCaptureSession()
        }
    }

    private func configureCaptureSession() {
        captureSession.beginConfiguration()
        captureSession.sessionPreset = .hd1280x720

        // Back camera
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera) else {
            Task { @MainActor in
                self.errorMessage = "카메라를 사용할 수 없습니다"
            }
            captureSession.commitConfiguration()
            return
        }

        guard captureSession.canAddInput(input) else {
            captureSession.commitConfiguration()
            return
        }
        captureSession.addInput(input)

        // Video output
        videoOutput.alwaysDiscardsLateVideoFrames = true
        videoOutput.setSampleBufferDelegate(self, queue: detectionQueue)

        guard captureSession.canAddOutput(videoOutput) else {
            captureSession.commitConfiguration()
            return
        }
        captureSession.addOutput(videoOutput)

        // Set video orientation to portrait
        if let connection = videoOutput.connection(with: .video) {
            connection.videoRotationAngle = 90
        }

        captureSession.commitConfiguration()

        // Setup ML model
        setupVisionModel()

        // Start
        captureSession.startRunning()
        Task { @MainActor in
            self.isRunning = true
        }
    }

    private func setupVisionModel() {
        // Use YOLOv3TinyInt8LUT - Apple's optimized on-device object detection model
        // User needs to add the .mlmodelc to the project bundle
        let config = MLModelConfiguration()
        config.computeUnits = .all

        // Try to load compiled model from bundle
        if let modelURL = Bundle.main.url(forResource: "YOLOv3TinyInt8LUT", withExtension: "mlmodelc"),
           let mlModel = try? MLModel(contentsOf: modelURL, configuration: config),
           let vnModel = try? VNCoreMLModel(for: mlModel) {
            let request = VNCoreMLRequest(model: vnModel) { [weak self] request, _ in
                self?.handleDetectionResults(request)
            }
            request.imageCropAndScaleOption = .scaleFill
            detectionRequest = request
            return
        }

        // Try YOLOv3Tiny (non-quantized)
        if let modelURL = Bundle.main.url(forResource: "YOLOv3Tiny", withExtension: "mlmodelc"),
           let mlModel = try? MLModel(contentsOf: modelURL, configuration: config),
           let vnModel = try? VNCoreMLModel(for: mlModel) {
            let request = VNCoreMLRequest(model: vnModel) { [weak self] request, _ in
                self?.handleDetectionResults(request)
            }
            request.imageCropAndScaleOption = .scaleFill
            detectionRequest = request
            return
        }

        // Fallback: try any .mlmodelc in bundle
        if let resourcePath = Bundle.main.resourcePath {
            let enumerator = FileManager.default.enumerator(atPath: resourcePath)
            while let path = enumerator?.nextObject() as? String {
                if path.hasSuffix(".mlmodelc") {
                    let url = URL(fileURLWithPath: resourcePath).appendingPathComponent(path)
                    if let mlModel = try? MLModel(contentsOf: url, configuration: config),
                       let vnModel = try? VNCoreMLModel(for: mlModel) {
                        let request = VNCoreMLRequest(model: vnModel) { [weak self] request, _ in
                            self?.handleDetectionResults(request)
                        }
                        request.imageCropAndScaleOption = .scaleFill
                        detectionRequest = request
                        return
                    }
                }
            }
        }

        Task { @MainActor in
            self.errorMessage = "ML 모델을 찾을 수 없습니다.\nYOLOv3TinyInt8LUT.mlmodel을\n프로젝트에 추가해주세요."
        }
    }

    // MARK: - Detection Results

    private func handleDetectionResults(_ request: VNRequest) {
        guard let results = request.results as? [VNRecognizedObjectObservation] else { return }

        let objects = results.compactMap { observation -> DetectedObject? in
            guard let topLabel = observation.labels.first,
                  topLabel.confidence > 0.3 else { return nil }

            let label = topLabel.identifier
            let color = colorForClass(label)

            return DetectedObject(
                label: label,
                confidence: topLabel.confidence,
                boundingBox: observation.boundingBox,
                color: color
            )
        }

        Task { @MainActor in
            self.detectedObjects = objects
            self.updateFPS()
        }
    }

    private func colorForClass(_ className: String) -> Color {
        if let color = classColors[className] {
            return color
        }
        let color = palette[colorIndex % palette.count]
        classColors[className] = color
        colorIndex += 1
        return color
    }

    private func updateFPS() {
        frameCount += 1
        let now = CACurrentMediaTime()
        if now - lastFPSTime >= 1.0 {
            fps = frameCount
            frameCount = 0
            lastFPSTime = now
        }
    }

    func stopSession() {
        sessionQueue.async { [weak self] in
            self?.captureSession.stopRunning()
        }
    }
}

// MARK: - AVCaptureVideoDataOutputSampleBufferDelegate

extension DetectionViewModel: AVCaptureVideoDataOutputSampleBufferDelegate {
    nonisolated func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard !isProcessing,
              let request = detectionRequest,
              let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        isProcessing = true
        defer { isProcessing = false }

        let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
        try? handler.perform([request])
    }
}
