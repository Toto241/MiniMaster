import SwiftUI

#if canImport(FamilyControls)
import FamilyControls

struct IOSScreenTimeBlacklistEditor: View {
    let storedValues: [String]
    let onSave: ([String]) -> Void

    @State private var selection: FamilyActivitySelection
    @State private var isPickerPresented = false

    init(storedValues: [String], onSave: @escaping ([String]) -> Void) {
        self.storedValues = storedValues
        self.onSave = onSave
        _selection = State(initialValue: ScreenTimeAppSelection.decodeSelection(from: storedValues))
    }

    var body: some View {
        Section("iOS App-Auswahl") {
            Text(DevicePlatform.ios.appBlacklistEditorHint)
                .foregroundStyle(.secondary)

            Button("Screen-Time-Auswahl öffnen") {
                isPickerPresented = true
            }

            Text(summaryText)
                .foregroundStyle(.secondary)

            if !ScreenTimeAppSelection.bundleIDs(from: storedValues).isEmpty {
                Text("Vorhandene manuelle Bundle-IDs werden auf iOS nicht durchgesetzt und sollten ersetzt werden.")
                    .foregroundStyle(.orange)
            }
        }
        .familyActivityPicker(isPresented: $isPickerPresented, selection: $selection)
        .onChange(of: selection) { newSelection in
            onSave(ScreenTimeAppSelection.encode(newSelection))
        }
    }

    private var summaryText: String {
        let tokenCount = selection.applicationTokens.count
        if tokenCount == 0 {
            return "Noch keine iOS-Apps ueber Screen Time ausgewaehlt."
        }
        return "Aktuell sind \(tokenCount) App-Tokens ausgewaehlt."
    }
}
#else
struct IOSScreenTimeBlacklistEditor: View {
    let storedValues: [String]
    let onSave: ([String]) -> Void

    var body: some View {
        Section("iOS App-Auswahl") {
            Text("FamilyControls ist in dieser Build-Umgebung nicht verfuegbar. Die gespeicherte iOS-Auswahl kann hier nicht bearbeitet werden.")
                .foregroundStyle(.orange)
            Text("Gespeicherte Token: \(ScreenTimeAppSelection.encodedTokenCount(in: storedValues))")
                .foregroundStyle(.secondary)
        }
    }
}
#endif
