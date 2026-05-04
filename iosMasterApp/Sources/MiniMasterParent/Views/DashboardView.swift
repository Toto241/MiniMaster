import SwiftUI

/// Main dashboard showing all paired children and quick-action controls.
struct DashboardView: View {

    @EnvironmentObject var authService: AuthService
    @StateObject private var vm = DashboardViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading {
                    ProgressView("dashboard.loading")
                } else if vm.children.isEmpty {
                    ContentUnavailableView("dashboard.empty.title", systemImage: "iphone",
                                          description: Text("dashboard.empty.description"))
                } else {
                    List(vm.children) { child in
                        NavigationLink(destination: ChildDetailView(child: child, vm: vm)) {
                            ChildRowView(child: child)
                        }
                    }
                }
            }
            .navigationTitle("dashboard.navTitle")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    NavigationLink(destination: PairingView()) {
                        Image(systemName: "plus")
                    }
                }
            }
            .alert("common.error", isPresented: .constant(vm.errorMessage != nil)) {
                Button("dashboard.alert.ok") { vm.errorMessage = nil }
            } message: {
                Text(vm.errorMessage ?? "")
            }
        }
        .onAppear {
            if let imei = authService.masterImei {
                vm.startListening(masterImei: imei)
            }
        }
        .onDisappear { vm.stopListening() }
    }
}

// MARK: - Child Row

struct ChildRowView: View {
    let child: ChildDevice

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: child.platform == .ios ? "iphone" : "iphone.homebutton")
                .foregroundStyle(child.isLocked ? .red : .green)
                .font(.title2)

            VStack(alignment: .leading, spacing: 2) {
                Text(child.deviceName).font(.headline)
                HStack(spacing: 6) {
                    Label(child.platform == .ios ? "iOS" : "Android",
                          systemImage: child.platform == .ios ? "apple.logo" : "gear")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if child.isOnline {
                        Label("dashboard.status.online", systemImage: "circle.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                }
            }
            Spacer()
            if child.isLocked {
                Image(systemName: "lock.fill").foregroundStyle(.red)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Child Detail

struct ChildDetailView: View {
    let child: ChildDevice
    let vm: DashboardViewModel

    var body: some View {
        List {
            Section(header: Text("dashboard.section.status")) {
                LabeledContent("dashboard.status.platform", value: child.platform.rawValue.capitalized)
                LabeledContent("dashboard.status.policyVersion", value: "\(child.policyVersion)")
                LabeledContent("dashboard.status.lastSeen",
                               value: child.lastSeen.map { $0.formatted(.relative(presentation: .named)) } ?? "–")
            }
            Section(header: Text("dashboard.quickActions.title")) {
                Button(child.isLocked ? "dashboard.quickActions.unlock" : "dashboard.quickActions.lock") {
                    Task { await vm.setLocked(child, isLocked: !child.isLocked) }
                }
                .foregroundStyle(child.isLocked ? .green : .red)
            }
            Section(header: Text("dashboard.rules.title")) {
                NavigationLink(String(format: NSLocalizedString("dashboard.rules.appBlacklist", comment: ""), child.appBlacklist.count)) {
                    AppBlacklistView(child: child, vm: vm)
                }
                NavigationLink("dashboard.rules.usageRules") {
                    UsageRulesView(child: child, vm: vm)
                }
            }
        }
        .navigationTitle(Text(child.deviceName))
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - App Blacklist

struct AppBlacklistView: View {
    let child: ChildDevice
    let vm: DashboardViewModel

    @State private var newApp = ""
    @State private var apps: [String]

    init(child: ChildDevice, vm: DashboardViewModel) {
        self.child = child
        self.vm = vm
        _apps = State(initialValue: child.appBlacklist)
    }

    var body: some View {
        List {
            if child.platform.supportsBundleIdBlacklistEditing {
                Section(header: Text("blacklist.section.hint")) {
                    Text(child.platform.appBlacklistEditorHint)
                        .foregroundStyle(.secondary)
                }
                Section {
                    HStack {
                        TextField("blacklist.field.bundleId", text: $newApp)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button("blacklist.button.add") {
                            guard !newApp.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                            apps.append(newApp.trimmingCharacters(in: .whitespaces))
                            newApp = ""
                            save()
                        }
                    }
                }
            }
            if child.platform.supportsScreenTimeTokenSelection {
                IOSScreenTimeBlacklistEditor(storedValues: apps) { newValues in
                    apps = newValues
                    save()
                }
                Section(header: Text("blacklist.section.saved")) {
                    Text(String(format: NSLocalizedString("blacklist.saved.tokens", comment: ""), ScreenTimeAppSelection.encodedTokenCount(in: apps)))
                        .foregroundStyle(.secondary)
                    if !ScreenTimeAppSelection.bundleIDs(from: apps).isEmpty {
                        Text(String(format: NSLocalizedString("blacklist.saved.unmigrated", comment: ""), ScreenTimeAppSelection.bundleIDs(from: apps).count))
                            .foregroundStyle(.orange)
                    }
                }
            } else {
                Section(header: Text(String(format: NSLocalizedString("blacklist.section.blocked", comment: ""), apps.count))) {
                    ForEach(apps, id: \.self) { app in
                        Text(app)
                    }
                    .onDelete { idx in
                        guard child.platform.supportsBundleIdBlacklistEditing else { return }
                        apps.remove(atOffsets: idx)
                        save()
                    }
                }
            }
        }
        .navigationTitle("App-Blacklist")
    }

    private func save() {
        Task { await vm.updateAppBlacklist(child, apps: apps) }
    }
}

// MARK: - Usage Rules

struct UsageRulesView: View {
    let child: ChildDevice
    let vm: DashboardViewModel

    @State private var dailyLimit: String
    @State private var bedtimeStart: String
    @State private var bedtimeEnd: String

    init(child: ChildDevice, vm: DashboardViewModel) {
        self.child = child
        self.vm = vm
        _dailyLimit  = State(initialValue: child.usageRules.dailyLimitMinutes.map(String.init) ?? "")
        _bedtimeStart = State(initialValue: child.usageRules.bedtimeStart ?? "")
        _bedtimeEnd   = State(initialValue: child.usageRules.bedtimeEnd ?? "")
    }

    var body: some View {
        Form {
            Section(header: Text("usage.section.dailyLimit")) {
                HStack {
                    TextField("usage.field.minutes", text: $dailyLimit)
                        .keyboardType(.numberPad)
                    Text("usage.unit.perDay")
                        .foregroundStyle(.secondary)
                }
            }
            Section(header: Text("usage.section.bedtime")) {
                TextField("Anfang (HH:MM)", text: $bedtimeStart)
                    .keyboardType(.numbersAndPunctuation)
                TextField("Ende   (HH:MM)", text: $bedtimeEnd)
                    .keyboardType(.numbersAndPunctuation)
            }
            Section {
                HStack {
                    Spacer()
                    Button("usage.button.save") { save() }
                    Spacer()
                }
            }
        }
        .navigationTitle("usage.navTitle")
    }

    private func save() {
        let rules = UsageRules(
            dailyLimitMinutes: Int(dailyLimit),
            bedtimeStart: bedtimeStart.isEmpty ? nil : bedtimeStart,
            bedtimeEnd: bedtimeEnd.isEmpty ? nil : bedtimeEnd
        )
        Task { await vm.setUsageRules(child, rules: rules) }
    }
}
