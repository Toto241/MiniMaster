import SwiftUI
import PhotosUI
import UIKit

/// Sheet that lets the child pick a photo as proof for a task and uploads it.
///
/// The actual upload + task completion is delegated to the shared
/// `PhotoProofService` (`iosSharedServices/PhotoProofService.swift`), which is
/// added to this app target in Xcode (same module, no `import` needed). That
/// service pins the storage path `proofs/{childId}/{taskId}/…` and the
/// `completeTask` contract (`{ taskId, photoUrl }`) — both asserted by
/// `test/photo-proof-contract.test.ts`, so this view must not re-implement them.
///
/// Mirrors the Android child proof flow (camera/gallery → Firebase Storage →
/// `completeTask` → parent review).
struct TaskProofView: View {

    let task: ChildTask
    let childId: String
    /// Called after a successful upload so the caller can refresh the task list.
    var onCompleted: () -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var proofService = PhotoProofService()

    @State private var selectedItem: PhotosPickerItem?
    @State private var previewImage: UIImage?
    @State private var localError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("childMain.proof.section")) {
                    Text(task.description)
                        .font(.body)
                }

                Section {
                    PhotosPicker(
                        selection: $selectedItem,
                        matching: .images,
                        photoLibrary: .shared()
                    ) {
                        Label("childMain.proof.pick", systemImage: "photo.on.rectangle")
                    }
                    .disabled(proofService.isUploading)

                    if let previewImage {
                        Image(uiImage: previewImage)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 220)
                            .cornerRadius(8)
                            .accessibilityLabel(Text("childMain.proof.preview"))
                    }
                }

                if proofService.isUploading {
                    Section {
                        ProgressView(value: proofService.uploadProgress) {
                            Text("childMain.proof.uploading")
                        }
                    }
                }

                if let message = errorMessage {
                    Section {
                        Text(message)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("childMain.proof.navTitle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("childMain.proof.cancel") { dismiss() }
                        .disabled(proofService.isUploading)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("childMain.proof.submit") {
                        Task { await submit() }
                    }
                    .disabled(previewImage == nil || proofService.isUploading)
                }
            }
            .onChange(of: selectedItem) { _, newItem in
                Task { await loadPreview(newItem) }
            }
            // Prevent a swipe-to-dismiss from aborting an in-flight upload.
            .interactiveDismissDisabled(proofService.isUploading)
        }
    }

    // MARK: - Helpers

    private var errorMessage: String? {
        if let localError { return localError }
        if let err = proofService.error { return err.localizedDescription }
        return nil
    }

    private func loadPreview(_ item: PhotosPickerItem?) async {
        localError = nil
        guard let item else { previewImage = nil; return }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data) else {
                // Drop any previously-loaded image so a failed re-pick can never be
                // submitted as proof for the wrong photo.
                previewImage = nil
                localError = NSLocalizedString("childMain.proof.error.load", comment: "")
                return
            }
            previewImage = image
        } catch {
            previewImage = nil
            localError = error.localizedDescription
        }
    }

    private func submit() async {
        guard let image = previewImage else { return }
        localError = nil
        do {
            _ = try await proofService.uploadProof(image: image, childId: childId, taskId: task.id)
            onCompleted()
            dismiss()
        } catch {
            localError = error.localizedDescription
        }
    }
}
