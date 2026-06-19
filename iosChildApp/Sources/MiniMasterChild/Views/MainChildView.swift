import SwiftUI

/// The main screen shown to the child after successful pairing.
/// Displays current policy state, active tasks, and sync status.
struct MainChildView: View {

    @EnvironmentObject private var authService: ChildAuthService
    @EnvironmentObject private var policyStore: PolicyStore
    @EnvironmentObject private var syncService: CommandSyncService
    @EnvironmentObject private var blockingManager: AppBlockingManager

    @State private var tasks: [ChildTask] = []
    @State private var isLoadingTasks = false
    @State private var isRequestingFamilyControls = false
    @State private var taskError: Error?
    @State private var showUnpairAlert = false

    var body: some View {
        NavigationStack {
            List {
                statusSection
                familyControlsSection
                if let blacklistNotice = blockingManager.appBlacklistNotice {
                    blacklistNoticeSection(blacklistNotice)
                }
                if syncService.pendingCommandCount > 0 {
                    syncSection
                }
                tasksSection
            }
            .navigationTitle("childMain.navTitle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .refreshable { await refresh() }
            .alert("childMain.unpair.alert.title", isPresented: $showUnpairAlert) {
                Button("childMain.unpair.alert.confirm", role: .destructive) {
                    Task { await unpairDevice() }
                }
                Button("childMain.unpair.alert.cancel", role: .cancel) {}
            } message: {
                Text("childMain.unpair.alert.message")
            }
            .task {
                await blockingManager.checkAuthorization()
                await syncService.onAppStart()
                await loadTasks()
            }
        }
    }

    // MARK: - Sections

    private var statusSection: some View {
        Section(header: Text("childMain.section.status")) {
            statusRow(
                icon: policyStore.policy.isLocked ? "lock.fill" : "lock.open.fill",
                tint: policyStore.policy.isLocked ? .red : .green,
                label: policyStore.policy.isLocked ? "Gerät gesperrt" : "Gerät entsperrt"
            )
            statusRow(
                icon: "slider.horizontal.3",
                tint: .blue,
                label: "Richtlinien-Version \(policyStore.policy.policyVersion)"
            )
            if let lastSync = policyStore.lastSyncDate {
                statusRow(
                    icon: "arrow.triangle.2.circlepath",
                    tint: .secondary,
                    label: "Letzte Synchronisierung: \(lastSync.formatted(.relative(presentation: .named)))"
                )
            }
            if syncService.isOffline && isPolicyStale {
                statusRow(
                    icon: "wifi.slash",
                    tint: .orange,
                    label: "Offline – Richtlinie veraltet"
                )
            }
        }
    }

    private var familyControlsSection: some View {
        Section(header: Text("childMain.section.familyControls")) {
            statusRow(
                icon: blockingManager.isAuthorized ? "checkmark.shield.fill" : "exclamationmark.shield.fill",
                tint: blockingManager.isAuthorized ? .green : .orange,
                label: blockingManager.isAuthorized
                    ? NSLocalizedString("childMain.familyControls.authorized", comment: "")
                    : NSLocalizedString("childMain.familyControls.missing", comment: "")
            )
            if !blockingManager.isAuthorized {
                Text("childMain.familyControls.description")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Button {
                    Task { await requestFamilyControls() }
                } label: {
                    if isRequestingFamilyControls {
                        ProgressView("childMain.familyControls.requesting")
                    } else {
                        Label("childMain.familyControls.button", systemImage: "shield.lefthalf.filled")
                    }
                }
                .disabled(isRequestingFamilyControls)
            }
            if let error = blockingManager.authorizationError {
                Text(error.localizedDescription)
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }

    private var syncSection: some View {
        Section {
            HStack {
                ProgressView()
                    .padding(.trailing, 4)
                Text("Befehle werden angewendet…")
                    .foregroundColor(.secondary)
            }
        }
    }

    private func blacklistNoticeSection(_ message: String) -> some View {
        Section("App-Blacklist") {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                Text(message)
                    .foregroundColor(.secondary)
            }
        }
    }

    private var tasksSection: some View {
        Section(header: Text("childMain.section.tasks")) {
            if isLoadingTasks {
                ProgressView("childMain.tasks.loading")
            } else if tasks.isEmpty {
                Text("childMain.tasks.empty")
                    .foregroundColor(.secondary)
            } else {
                ForEach(tasks) { task in
                    TaskRowView(task: task)
                }
            }
        }
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                Task { await refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
        }
        ToolbarItem(placement: .topBarLeading) {
            Button(role: .destructive) {
                showUnpairAlert = true
            } label: {
                Image(systemName: "rectangle.portrait.and.arrow.right")
            }
        }
    }

    // MARK: - Actions

    private func refresh() async {
        await blockingManager.checkAuthorization()
        await syncService.onFcmWakeUp()
        await loadTasks()
    }

    private func requestFamilyControls() async {
        isRequestingFamilyControls = true
        await blockingManager.requestAuthorization()
        if blockingManager.isAuthorized {
            blockingManager.applyPolicy(policyStore.policy)
        }
        isRequestingFamilyControls = false
    }

    private func unpairDevice() async {
        blockingManager.clearPolicy()
        policyStore.reset()
        authService.unpair()
    }

    private func loadTasks() async {
        guard let childId = authService.currentChildId else { return }
        isLoadingTasks = true
        defer { isLoadingTasks = false }
        do {
            tasks = try await syncService.fetchTasks(childId: childId)
        } catch {
            taskError = error
        }
    }

    // MARK: - Helpers

    private var isPolicyStale: Bool {
        guard let cachedAt = policyStore.cachedAt ?? policyStore.lastSyncDate else { return true }
        return Date().timeIntervalSince(cachedAt) > 300
    }

    private func statusRow(icon: String, tint: Color, label: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundColor(tint)
                .font(.body)
            Text(label)
        }
    }
}

// MARK: - ChildTask Model (local display only)

struct ChildTask: Identifiable {
    let id: String
    let description: String
    let status: String
    let deadline: Date?
}

// MARK: - TaskRowView

private struct TaskRowView: View {
    let task: ChildTask

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(task.description)
                .font(.body)
            HStack {
                Text(statusLabel)
                    .font(.caption)
                    .foregroundColor(statusColor)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(statusColor.opacity(0.15))
                    .cornerRadius(6)
                if let deadline = task.deadline {
                    Text("Fällig: \(deadline.formatted(date: .abbreviated, time: .omitted))")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var statusLabel: String {
        switch task.status {
        case "pending": return NSLocalizedString("childMain.task.status.pending", comment: "")
        case "pending_approval": return NSLocalizedString("childMain.task.status.pendingApproval", comment: "")
        case "approved": return NSLocalizedString("childMain.task.status.approved", comment: "")
        case "rejected": return NSLocalizedString("childMain.task.status.rejected", comment: "")
        default: return task.status
        }
    }

    private var statusColor: Color {
        switch task.status {
        case "pending": return .orange
        case "pending_approval": return .blue
        case "approved": return .green
        case "rejected": return .red
        default: return .secondary
        }
    }
}

// MARK: - CommandSyncService extension (task fetch convenience)

extension CommandSyncService {
    func fetchTasks(childId: String) async throws -> [ChildTask] {
        let raw = try await client.getTasks(childId: childId)
        return raw.map {
            ChildTask(
                id: $0["id"] as? String ?? "",
                description: $0["description"] as? String ?? "",
                status: $0["status"] as? String ?? "pending",
                deadline: nil
            )
        }
    }
}

#Preview {
    MainChildView()
        .environmentObject(PolicyStore())
}
