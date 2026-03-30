import SwiftUI

/// Task review list — shows all child tasks awaiting approval.
struct TaskListView: View {

    @EnvironmentObject var authService: AuthService
    @StateObject private var vm = TaskReviewViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading {
                    ProgressView("Lade Aufgaben…")
                } else if vm.pendingTasks.isEmpty {
                    ContentUnavailableView("Keine offenen Aufgaben",
                                          systemImage: "checklist.checked",
                                          description: Text("Alle Aufgaben wurden bearbeitet."))
                } else {
                    List(vm.pendingTasks) { task in
                        NavigationLink(destination: TaskDetailView(task: task, vm: vm)) {
                            TaskRowView(task: task)
                        }
                    }
                }
            }
            .navigationTitle("Aufgaben prüfen")
            .badge(vm.pendingTasks.count)
        }
        .onAppear {
            if let imei = authService.masterImei {
                vm.startListening(masterImei: imei)
            }
        }
        .onDisappear { vm.stopListening() }
    }
}

// MARK: - Task Row

struct TaskRowView: View {
    let task: TaskItem
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(task.description)
                .font(.headline)
                .lineLimit(2)
            HStack {
                Label(task.status.displayName, systemImage: "circle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
                if let completedAt = task.completedAt {
                    Spacer()
                    Text(completedAt.formatted(.relative(presentation: .named)))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let ai = task.aiAnalysis, let completion = ai.taskCompletion {
                Label(aiLabel(completion), systemImage: aiIcon(completion))
                    .font(.caption)
                    .foregroundStyle(aiColor(completion))
            }
        }
        .padding(.vertical, 4)
    }

    private func aiLabel(_ c: String) -> String {
        switch c {
        case "completed":     return "KI: Aufgabe erfüllt"
        case "not_completed": return "KI: Nicht erfüllt"
        default:              return "KI: Unklar"
        }
    }
    private func aiIcon(_ c: String) -> String {
        switch c {
        case "completed": return "checkmark.circle.fill"
        case "not_completed": return "xmark.circle.fill"
        default: return "questionmark.circle.fill"
        }
    }
    private func aiColor(_ c: String) -> Color {
        switch c {
        case "completed": return .green
        case "not_completed": return .red
        default: return .orange
        }
    }
}

// MARK: - Task Detail

struct TaskDetailView: View {
    let task: TaskItem
    let vm: TaskReviewViewModel

    @State private var rejectReason = ""
    @State private var showRejectSheet = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text(task.description)
                    .font(.title3.weight(.semibold))

                if let url = task.photoUrl, let imageUrl = URL(string: url) {
                    AsyncImage(url: imageUrl) { image in
                        image.resizable().scaledToFit().cornerRadius(12)
                    } placeholder: {
                        ProgressView()
                    }
                }

                if let ai = task.aiAnalysis {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("KI-Analyse", systemImage: "sparkles")
                            .font(.headline)
                        if let summary = ai.summary {
                            Text(summary).font(.body)
                        }
                        if let confidence = ai.confidence {
                            LabeledContent("Konfidenz", value: "\(Int(confidence * 100)) %")
                        }
                    }
                    .padding()
                    .background(.regularMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                HStack(spacing: 16) {
                    Button {
                        Task {
                            await vm.approveTask(task)
                            dismiss()
                        }
                    } label: {
                        Label("Genehmigen", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)

                    Button {
                        showRejectSheet = true
                    } label: {
                        Label("Ablehnen", systemImage: "xmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                }
            }
            .padding()
        }
        .navigationTitle("Aufgabe prüfen")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showRejectSheet) {
            NavigationStack {
                Form {
                    Section("Ablehnungsgrund (optional)") {
                        TextEditor(text: $rejectReason)
                            .frame(minHeight: 100)
                    }
                }
                .navigationTitle("Ablehnen")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Abbrechen") { showRejectSheet = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Bestätigen") {
                            showRejectSheet = false
                            Task {
                                await vm.rejectTask(task, reason: rejectReason.isEmpty ? nil : rejectReason)
                                dismiss()
                            }
                        }
                    }
                }
            }
        }
    }
}
