import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss

    @AppStorage(Pref.sound) private var soundOn = true
    @AppStorage(Pref.bgm) private var bgmOn = true
    @AppStorage(Pref.haptics) private var hapticsOn = true
    @AppStorage("whackmole.name") private var nickname = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("소리 & 진동") {
                    Toggle("🔊 효과음", isOn: $soundOn)
                    Toggle("🎵 배경 음악", isOn: $bgmOn)
                        .onChange(of: bgmOn) { _, on in
                            if !on { Sounds.shared.stopBGM() }
                        }
                    Toggle("📳 진동 (햅틱)", isOn: $hapticsOn)
                }

                Section {
                    TextField("이름 (8자)", text: $nickname)
                        .onChange(of: nickname) { _, v in
                            if v.count > 8 { nickname = String(v.prefix(8)) }
                        }
                } header: {
                    Text("순위판 이름")
                } footer: {
                    Text("클래식 모드에서 순위 등록할 때 쓰이는 이름이에요. 웹으로 하는 가족들에게도 이 이름으로 보입니다.")
                }

                Section("정보") {
                    LabeledContent("버전", value: "1.0")
                    Link("웹 버전으로 플레이", destination: URL(string: "https://kknas1.github.io/claude1/WhackAMole/")!)
                    Link("개인정보 처리방침", destination: URL(string: "https://kknas1.github.io/claude1/WhackAMole/privacy.html")!)
                    Link("지원 / 문의", destination: URL(string: "https://kknas1.github.io/claude1/WhackAMole/support.html")!)
                }
            }
            .navigationTitle("⚙️ 설정")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("닫기") { dismiss() }
                }
            }
        }
    }
}
