import SwiftUI

struct DetectorView: View {
    @StateObject private var viewModel = DetectionViewModel()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Camera feed
            CameraPreview(session: viewModel.captureSession)
                .ignoresSafeArea()

            // Scan lines effect
            ScanLines()
                .ignoresSafeArea()

            // Detection bounding boxes
            DetectionOverlay(objects: viewModel.detectedObjects)
                .ignoresSafeArea()

            // Screen corner brackets
            ScreenCorners()

            // Crosshair
            Crosshair()

            // HUD overlay
            VStack {
                // Top bar
                HUDTopBar(fps: viewModel.fps)

                Spacer()

                // Bottom detected objects list
                HUDBottomBar(objects: viewModel.detectedObjects)
            }

            // Error message
            if let error = viewModel.errorMessage {
                ErrorOverlay(message: error)
            }
        }
        .onAppear {
            viewModel.setupCamera()
        }
        .onDisappear {
            viewModel.stopSession()
        }
    }
}

// MARK: - HUD Top Bar

struct HUDTopBar: View {
    let fps: Int

    var body: some View {
        HStack {
            Text("OBJECT DETECT")
                .font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundColor(Color(red: 0, green: 0.94, blue: 1))
                .shadow(color: Color(red: 0, green: 0.94, blue: 1).opacity(0.5), radius: 5)
                .tracking(4)

            Spacer()

            Text("\(fps) FPS")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(.green)
                .tracking(2)
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 40)
        .background(
            LinearGradient(
                colors: [.black.opacity(0.7), .clear],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
    }
}

// MARK: - HUD Bottom Bar

struct HUDBottomBar: View {
    let objects: [DetectedObject]

    private var uniqueLabels: [(label: String, count: Int, color: Color)] {
        var seen: [String: (count: Int, color: Color)] = [:]
        for obj in objects {
            let korean = KoreanLabels.korean(for: obj.label)
            if let existing = seen[korean] {
                seen[korean] = (existing.count + 1, existing.color)
            } else {
                seen[korean] = (1, obj.color)
            }
        }
        return seen.map { (label: $0.key, count: $0.value.count, color: $0.value.color) }
            .sorted { $0.label < $1.label }
    }

    var body: some View {
        VStack(spacing: 10) {
            // Object count
            Text(objects.isEmpty ? "SCANNING..." : "\(objects.count) OBJECT\(objects.count > 1 ? "S" : "") DETECTED")
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundColor(.gray)
                .tracking(3)

            // Tags
            FlowLayout(spacing: 8) {
                ForEach(uniqueLabels, id: \.label) { item in
                    DetectedTag(
                        label: item.label,
                        count: item.count,
                        color: item.color
                    )
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.bottom, 20)
        .padding(.top, 30)
        .background(
            LinearGradient(
                colors: [.clear, .black.opacity(0.8)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
    }
}

// MARK: - Detected Tag

struct DetectedTag: View {
    let label: String
    let count: Int
    let color: Color

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.system(size: 13, weight: .bold))
            if count > 1 {
                Text("×\(count)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
            }
        }
        .foregroundColor(color)
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(color.opacity(0.1))
                .overlay(
                    Capsule()
                        .strokeBorder(color.opacity(0.4), lineWidth: 1)
                )
        )
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            totalHeight = y + rowHeight
        }

        return (CGSize(width: maxWidth, height: totalHeight), positions)
    }
}

// MARK: - Visual Effects

struct ScanLines: View {
    var body: some View {
        Canvas { context, size in
            for y in stride(from: 0, to: size.height, by: 4) {
                let rect = CGRect(x: 0, y: y, width: size.width, height: 1)
                context.fill(Path(rect), with: .color(.black.opacity(0.03)))
            }
        }
        .allowsHitTesting(false)
    }
}

struct ScreenCorners: View {
    let color = Color(red: 0, green: 0.94, blue: 1).opacity(0.3)
    let size: CGFloat = 30
    let lineWidth: CGFloat = 2

    var body: some View {
        GeometryReader { geo in
            // Top-left
            CornerShape(corner: .topLeft, size: size)
                .stroke(color, lineWidth: lineWidth)
                .frame(width: size, height: size)
                .position(x: 30, y: 70)

            // Top-right
            CornerShape(corner: .topRight, size: size)
                .stroke(color, lineWidth: lineWidth)
                .frame(width: size, height: size)
                .position(x: geo.size.width - 30, y: 70)

            // Bottom-left
            CornerShape(corner: .bottomLeft, size: size)
                .stroke(color, lineWidth: lineWidth)
                .frame(width: size, height: size)
                .position(x: 30, y: geo.size.height - 100)

            // Bottom-right
            CornerShape(corner: .bottomRight, size: size)
                .stroke(color, lineWidth: lineWidth)
                .frame(width: size, height: size)
                .position(x: geo.size.width - 30, y: geo.size.height - 100)
        }
        .allowsHitTesting(false)
    }
}

struct CornerShape: Shape {
    enum Corner { case topLeft, topRight, bottomLeft, bottomRight }
    let corner: Corner
    let size: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path()
        switch corner {
        case .topLeft:
            path.move(to: CGPoint(x: 0, y: size))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: size, y: 0))
        case .topRight:
            path.move(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: size, y: 0))
            path.addLine(to: CGPoint(x: size, y: size))
        case .bottomLeft:
            path.move(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: 0, y: size))
            path.addLine(to: CGPoint(x: size, y: size))
        case .bottomRight:
            path.move(to: CGPoint(x: size, y: 0))
            path.addLine(to: CGPoint(x: size, y: size))
            path.addLine(to: CGPoint(x: 0, y: size))
        }
        return path
    }
}

struct Crosshair: View {
    var body: some View {
        ZStack {
            Rectangle()
                .fill(.white.opacity(0.15))
                .frame(width: 1, height: 40)
            Rectangle()
                .fill(.white.opacity(0.15))
                .frame(width: 40, height: 1)
        }
        .allowsHitTesting(false)
    }
}

// MARK: - Error Overlay

struct ErrorOverlay: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundColor(.orange)

            Text(message)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
        }
        .padding(30)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
        )
    }
}

#Preview {
    DetectorView()
        .preferredColorScheme(.dark)
}
