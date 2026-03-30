import Foundation

/// Task lifecycle model – mirrors the backend Firestore schema.
struct TaskItem: Identifiable, Codable {
    let id: String          // Firestore document ID
    let childId: String
    var description: String
    var status: TaskStatus
    var photoUrl: String?
    var createdAt: Date
    var updatedAt: Date
    var deadline: Date?
    var completedAt: Date?
    var aiAnalysis: AIAnalysis?
}

enum TaskStatus: String, Codable, CaseIterable {
    case pending
    case pendingApproval = "pending_approval"
    case approved
    case rejected

    var displayName: String {
        switch self {
        case .pending:          return "Offen"
        case .pendingApproval:  return "Warte auf Prüfung"
        case .approved:         return "Genehmigt"
        case .rejected:         return "Abgelehnt"
        }
    }
}

struct AIAnalysis: Codable {
    var taskCompletion: String?   // "completed" | "unclear" | "not_completed"
    var confidence: Double?
    var summary: String?
    var source: String?           // "gemini" | "fallback"
}
