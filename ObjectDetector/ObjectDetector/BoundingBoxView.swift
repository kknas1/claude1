import SwiftUI

/// A single bounding box with tech-style corner brackets and label
struct BoundingBoxView: View {
    let object: DetectedObject
    let geometry: GeometryProxy

    private var rect: CGRect {
        // Convert Vision coordinates (origin bottom-left, normalized)
        // to SwiftUI coordinates (origin top-left, screen points)
        let w = geometry.size.width
        let h = geometry.size.height
        let box = object.boundingBox
        return CGRect(
            x: box.minX * w,
            y: (1 - box.maxY) * h,
            width: box.width * w,
            height: box.height * h
        )
    }

    private var cornerLength: CGFloat {
        min(20, rect.width * 0.15, rect.height * 0.15)
    }

    private var confidence: Int {
        Int(object.confidence * 100)
    }

    private var koreanLabel: String {
        KoreanLabels.korean(for: object.label)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // Thin border rectangle
            Rectangle()
                .stroke(object.color.opacity(0.25), lineWidth: 1)
                .frame(width: rect.width, height: rect.height)
                .position(x: rect.midX, y: rect.midY)

            // Center horizontal scan line
            Rectangle()
                .fill(object.color.opacity(0.08))
                .frame(width: rect.width, height: 1)
                .position(x: rect.midX, y: rect.midY)

            // Corner brackets (the cool part)
            CornerBrackets(rect: rect, cornerLength: cornerLength, color: object.color)

            // Glow effect behind corners
            CornerBrackets(rect: rect, cornerLength: cornerLength, color: object.color)
                .blur(radius: 6)
                .opacity(0.6)

            // Label tag
            LabelTag(
                label: koreanLabel,
                confidence: confidence,
                color: object.color
            )
            .position(x: rect.minX + 60, y: rect.minY - 16)
        }
        .animation(.easeInOut(duration: 0.15), value: rect.origin.x)
        .animation(.easeInOut(duration: 0.15), value: rect.origin.y)
    }
}

// MARK: - Corner Brackets Shape

struct CornerBrackets: View {
    let rect: CGRect
    let cornerLength: CGFloat
    let color: Color

    var body: some View {
        Canvas { context, _ in
            var path = Path()

            // Top-left corner
            path.move(to: CGPoint(x: rect.minX, y: rect.minY + cornerLength))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.minX + cornerLength, y: rect.minY))

            // Top-right corner
            path.move(to: CGPoint(x: rect.maxX - cornerLength, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + cornerLength))

            // Bottom-left corner
            path.move(to: CGPoint(x: rect.minX, y: rect.maxY - cornerLength))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.minX + cornerLength, y: rect.maxY))

            // Bottom-right corner
            path.move(to: CGPoint(x: rect.maxX - cornerLength, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - cornerLength))

            context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 3, lineCap: .square))
        }
    }
}

// MARK: - Label Tag

struct LabelTag: View {
    let label: String
    let confidence: Int
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            // Color accent bar
            Rectangle()
                .fill(color)
                .frame(width: 3, height: 20)

            Text(label)
                .font(.system(size: 14, weight: .bold, design: .default))
                .foregroundColor(.white)

            Text("\(confidence)%")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(color)

            // Confidence dot
            Circle()
                .fill(confidence > 70 ? .green : confidence > 40 ? .yellow : .red)
                .frame(width: 6, height: 6)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(color.opacity(0.15))
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(.ultraThinMaterial)
                )
        )
    }
}
