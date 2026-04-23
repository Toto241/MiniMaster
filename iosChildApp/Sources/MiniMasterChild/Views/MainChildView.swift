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
    @State private var taskError: Error?
    @State private var showUnpairAlert = false

    var body: some View {
        NavigationStack {
            List {
                statusSection
                if let blacklistNotice = blockingManager.appBlacklistNotice {
                    blacklistNoticeSection(blacklistNotice)
                }
                if !syncService.pendingCommandCount.isZero {
                    syncSection
                }
                tasksSection
            }
            .navigationTitle("MiniMaster")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .refreshable { await refresh() }
            .alert("Gerät abmelden?", isPresented: $showUnpairAlert) {
                Button("Abmelden", role: .destructive) { authService.unpair() }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Das Gerät wird von der Eltern-App getrennt.")
            }
            .task { await syncService.onAppStart() }
        }
    }

    // MARK: - Sections

    private var statusSection: some View {
        Section("Status") {
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
        Section("Meine Aufgaben") {
            if isLoadingTasks {
                ProgressView("Aufgaben laden…")
            } else if tasks.isEmpty {
                Text("Keine offenen Aufgaben")
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
        await syncService.onFcmWakeUp()
        await loadTasks()
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
        case "pending": return "Offen"
        case "pending_approval": return "Zur Prüfung"
        case "approved": return "Genehmigt"
        case "rejected": return "Abgelehnt"
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
