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
        Section(header: Text("blacklist.section.iosSelection")) {
            Text(DevicePlatform.ios.appBlacklistEditorHint)
                .foregroundStyle(.secondary)

            Button("blacklist.button.openPicker") {
                isPickerPresented = true
            }

            Text(summaryText)
                .foregroundStyle(.secondary)

            if !ScreenTimeAppSelection.bundleIDs(from: storedValues).isEmpty {
                Text("blacklist.warning.manualBundleIds")
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
            return NSLocalizedString("blacklist.noSelection", comment: "")
        }
        return String(format: NSLocalizedString("blacklist.selectedCount", comment: ""), tokenCount)
    }
}
#else
struct IOSScreenTimeBlacklistEditor: View {
    let storedValues: [String]
    let onSave: ([String]) -> Void

    var body: some View {
        Section(header: Text("blacklist.unavailable.title")) {
            Text("blacklist.unavailable.message")
                .foregroundStyle(.orange)
            Text(String(format: NSLocalizedString("blacklist.unavailable.tokens", comment: ""), ScreenTimeAppSelection.encodedTokenCount(in: storedValues)))
                .foregroundStyle(.secondary)
        }
    }
}
#endif
