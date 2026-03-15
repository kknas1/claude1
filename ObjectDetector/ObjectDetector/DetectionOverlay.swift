import SwiftUI

/// Overlay that draws all detected bounding boxes on top of the camera feed
struct DetectionOverlay: View {
    let objects: [DetectedObject]

    var body: some View {
        GeometryReader { geometry in
            ForEach(objects) { object in
                BoundingBoxView(object: object, geometry: geometry)
            }
        }
    }
}
