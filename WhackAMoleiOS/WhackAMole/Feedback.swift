import Foundation
import AVFoundation
import UIKit

// 네이티브의 맛: 진동(햅틱) + 합성 효과음/BGM (에셋 파일 없음)
// 설정(사운드/BGM/햅틱)은 UserDefaults 토글을 매번 확인한다.

enum Pref {
    static func on(_ key: String) -> Bool {
        let d = UserDefaults.standard
        return d.object(forKey: key) == nil ? true : d.bool(forKey: key)
    }
    static let sound = "pref.sound"
    static let bgm = "pref.bgm"
    static let haptics = "pref.haptics"
}

enum Haptics {
    static func light() {
        guard Pref.on(Pref.haptics) else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
    static func medium() {
        guard Pref.on(Pref.haptics) else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
    static func heavy() {
        guard Pref.on(Pref.haptics) else { return }
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
    }
}

final class Sounds {
    static let shared = Sounds()

    private let engine = AVAudioEngine()
    private let sfxPlayer = AVAudioPlayerNode()
    private let bgmPlayer = AVAudioPlayerNode()
    private let format: AVAudioFormat
    private var ready = false
    private var bgmBuffer: AVAudioPCMBuffer?
    private var bgmPlaying = false

    private init() {
        format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        engine.attach(sfxPlayer)
        engine.attach(bgmPlayer)
        engine.connect(sfxPlayer, to: engine.mainMixerNode, format: format)
        engine.connect(bgmPlayer, to: engine.mainMixerNode, format: format)
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            try engine.start()
            sfxPlayer.play()
            bgmPlayer.volume = 0.35
            bgmPlayer.play()
            ready = true
        } catch {
            ready = false
        }
        bgmBuffer = makeBGMBuffer()
    }

    // MARK: - 공용 버퍼 생성

    /// steps: (주파수Hz — 0이면 쉼표, 길이초)
    private func makeBuffer(steps: [(Double, Double)], volume: Float,
                            decay: Bool = true) -> AVAudioPCMBuffer? {
        let sr = format.sampleRate
        let total = steps.reduce(0) { $0 + $1.1 }
        let frames = AVAudioFrameCount(sr * total)
        guard frames > 0,
              let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames),
              let data = buf.floatChannelData?[0] else { return nil }
        buf.frameLength = frames
        var frame = 0
        for (freq, dur) in steps {
            let n = Int(sr * dur)
            var phase = 0.0
            let inc = freq / sr
            for i in 0..<n where frame < Int(frames) {
                if freq <= 0 {
                    data[frame] = 0
                } else {
                    let env: Float = decay ? Float(1.0 - Double(i) / Double(n)) : 0.8
                    let square: Float = phase.truncatingRemainder(dividingBy: 1.0) < 0.5 ? 1 : -1
                    data[frame] = square * env * volume
                }
                phase += inc
                frame += 1
            }
        }
        return buf
    }

    private func playSFX(steps: [(Double, Double)], volume: Float = 0.18) {
        guard ready, Pref.on(Pref.sound) else { return }
        guard let buf = makeBuffer(steps: steps, volume: volume) else { return }
        sfxPlayer.scheduleBuffer(buf, completionHandler: nil)
    }

    // MARK: - BGM (경쾌한 8비트풍 루프)

    private func makeBGMBuffer() -> AVAudioPCMBuffer? {
        // C장조 8마디 아르페지오 루프, 낮은 볼륨
        let q = 0.16 // 한 음 길이
        let C4 = 261.63, E4 = 329.63, G4 = 392.0, A4 = 440.0
        let F4 = 349.23, D4 = 293.66, C5 = 523.25
        let melody: [(Double, Double)] = [
            (C4, q), (E4, q), (G4, q), (C5, q), (G4, q), (E4, q),
            (F4, q), (A4, q), (C5, q), (A4, q), (F4, q), (D4, q),
            (E4, q), (G4, q), (C5, q), (G4, q), (E4, q), (C4, q),
            (D4, q), (F4, q), (A4, q), (F4, q), (D4, q), (0, q),
        ]
        return makeBuffer(steps: melody, volume: 0.05, decay: true)
    }

    func startBGM() {
        guard ready, Pref.on(Pref.bgm), !bgmPlaying, let buf = bgmBuffer else { return }
        bgmPlaying = true
        bgmPlayer.scheduleBuffer(buf, at: nil, options: .loops, completionHandler: nil)
    }

    func stopBGM() {
        guard bgmPlaying else { return }
        bgmPlaying = false
        bgmPlayer.stop()
        bgmPlayer.play() // 노드는 다시 재생 대기 상태로
    }

    // MARK: - 효과음

    func hit() { playSFX(steps: [(500, 0.05), (330, 0.04), (220, 0.04)]) }
    func gold() { playSFX(steps: [(720, 0.07), (1080, 0.1)], volume: 0.16) }
    func clink() { playSFX(steps: [(1500, 0.03), (1100, 0.03)], volume: 0.14) }
    func bomb() { playSFX(steps: [(100, 0.12), (70, 0.1), (45, 0.1)], volume: 0.3) }
    func whiff() { playSFX(steps: [(180, 0.04)], volume: 0.06) }
    func levelUp() { playSFX(steps: [(620, 0.07), (830, 0.07), (1100, 0.12)], volume: 0.15) }
    func startGame() { playSFX(steps: [(520, 0.08), (780, 0.12)], volume: 0.15) }
    func end() { playSFX(steps: [(660, 0.14), (520, 0.14), (390, 0.24)], volume: 0.16) }
    func tick() { playSFX(steps: [(1200, 0.04)], volume: 0.1) }
    func countBeep(final: Bool) {
        playSFX(steps: [(final ? 1040 : 660, final ? 0.18 : 0.09)], volume: 0.16)
    }
}
