import Foundation
import FirebaseFirestore

/// ViewModel managing the task review flow for the master parent.
@MainActor
final class TaskReviewViewModel: ObservableObject {

    @Published private(set) var pendingTasks: [TaskItem] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let db = Firestore.firestore()
    private let client = CloudFunctionsClient()
    private var listeners: [ListenerRegistration] = []

    // MARK: - Lifecycle

    func startListening(masterImei: String) {
        stopListening()
        isLoading = true

        // Listen to all children of this master for pending_approval tasks
        db.collection("children")
            .whereField("masterImei", isEqualTo: masterImei)
            .getDocuments { [weak self] snap, _ in
                guard let self else { return }
                let childIds = snap?.documents.map(\.documentID) ?? []
                for childId in childIds {
                    self.listenToChildTasks(childId: childId)
                }
                self.isLoading = false
            }
    }

    func stopListening() {
        listeners.forEach { $0.remove() }
        listeners.removeAll()
        pendingTasks.removeAll()
    }

    // MARK: - Actions

    func approveTask(_ task: TaskItem) async {
        do {
            try await client.approveTask(childId: task.childId, taskId: task.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func rejectTask(_ task: TaskItem, reason: String?) async {
        do {
            try await client.rejectTask(childId: task.childId, taskId: task.id, reason: reason)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Private

    private func listenToChildTasks(childId: String) {
        let listener = db.collection("children").document(childId).collection("tasks")
            .whereField("status", isEqualTo: "pending_approval")
            .addSnapshotListener { [weak self] snap, _ in
                guard let self else { return }
                let newTasks = snap?.documents.compactMap {
                    Self.taskItem(from: $0, childId: childId)
                } ?? []

                // Merge: remove existing tasks for this child, then append new batch
                pendingTasks.removeAll { $0.childId == childId }
                pendingTasks.append(contentsOf: newTasks)
                pendingTasks.sort { $0.completedAt ?? $0.createdAt > $1.completedAt ?? $1.createdAt }
            }
        listeners.append(listener)
    }

    private static func taskItem(from doc: QueryDocumentSnapshot, childId: String) -> TaskItem? {
        let d = doc.data()
        guard let description = d["description"] as? String,
              let statusRaw = d["status"] as? String,
              let status = TaskStatus(rawValue: statusRaw),
              let createdAtTs = d["createdAt"] as? Timestamp else { return nil }

        return TaskItem(
            id: doc.documentID,
            childId: childId,
            description: description,
            status: status,
            photoUrl: d["photoUrl"] as? String,
            createdAt: createdAtTs.dateValue(),
            updatedAt: (d["updatedAt"] as? Timestamp)?.dateValue() ?? createdAtTs.dateValue(),
            deadline: (d["deadline"] as? Timestamp)?.dateValue(),
            completedAt: (d["completedAt"] as? Timestamp)?.dateValue(),
            aiAnalysis: {
                guard let ai = d["aiAnalysis"] as? [String: Any] else { return nil }
                return AIAnalysis(
                    taskCompletion: ai["taskCompletion"] as? String,
                    confidence: ai["confidence"] as? Double,
                    summary: ai["summary"] as? String,
                    source: ai["source"] as? String
                )
            }()
        )
    }
}
