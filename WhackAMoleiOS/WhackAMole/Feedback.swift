import Foundation
import AVFoundation
import UIKit

// 네이티브의 맛: 진동(햅틱) + 합성 효과음 (에셋 파일 없음, 웹 버전과 같은 톤)

enum Haptics {
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func medium() { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
    static func heavy() { UIImpactFeedbackGenerator(style: .heavy).impactOccurred() }
}

final class Sounds {
    static let shared = Sounds()

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format: AVAudioFormat
    private var ready = false

    private init() {
        format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            try engine.start()
            player.play()
            ready = true
        } catch {
            ready = false
        }
    }

    /// 주파수 스텝들의 사각파 비프. steps: (주파수Hz, 길이초)
    private func play(steps: [(Double, Double)], volume: Float = 0.18) {
        guard ready else { return }
        let sr = format.sampleRate
        let total = steps.reduce(0) { $0 + $1.1 }
        let frames = AVAudioFrameCount(sr * total)
        guard frames > 0,
              let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
              let data = buf.floatChannelData?[0] else { return }
        buf.frameLength = frames
        var frame = 0
        for (freq, dur) in steps {
            let n = Int(sr * dur)
            var phase = 0.0
            let inc = freq / sr
            for i in 0..<n where frame < Int(frames) {
                let env = Float(1.0 - Double(i) / Double(n)) // linear decay
                let square: Float = phase.truncatingRemainder(dividingBy: 1.0) < 0.5 ? 1 : -1
                data[frame] = square * env * volume
                phase += inc
                frame += 1
            }
        }
        player.scheduleBuffer(buf, completionHandler: nil)
    }

    func hit() { play(steps: [(500, 0.05), (330, 0.04), (220, 0.04)]) }
    func gold() { play(steps: [(720, 0.07), (1080, 0.1)], volume: 0.16) }
    func clink() { play(steps: [(1500, 0.03), (1100, 0.03)], volume: 0.14) }
    func bomb() { play(steps: [(100, 0.12), (70, 0.1), (45, 0.1)], volume: 0.3) }
    func whiff() { play(steps: [(180, 0.04)], volume: 0.06) }
    func levelUp() { play(steps: [(620, 0.07), (830, 0.07), (1100, 0.12)], volume: 0.15) }
    func startGame() { play(steps: [(520, 0.08), (780, 0.12)], volume: 0.15) }
    func end() { play(steps: [(660, 0.14), (520, 0.14), (390, 0.24)], volume: 0.16) }
}
