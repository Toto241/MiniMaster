import SwiftUI
import PhotosUI
import UIKit

/// Sheet that lets the child pick a photo as proof for a task and uploads it.
///
/// Mirrors the Android proof-submission flow: pick → compress/validate →
/// upload to Firebase Storage (`proofs/{childId}/{taskId}/`) → call the
/// `completeTask` Cloud Function so the parent can review it.
///
/// The heavy lifting (compression, 256 B–5 MB validation, Storage upload and
/// the `completeTask` call) is delegated to the shared `PhotoProofService`.
struct TaskProofView: View {

    let childId: String
    let task: ChildTask
    /// Called after a successful upload so the parent view can refresh.
    var onSubmitted: () -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var proofService = PhotoProofService()

    @State private var selectedItem: PhotosPickerItem?
    @State private var image: UIImage?
    @State private var errorMessage: String?
    @State private var showError = false

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("childMain.proof.task")) {
                    Text(task.description)
                        .font(.body)
                }

                Section(header: Text("childMain.proof.photo")) {
                    if let image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(maxHeight: 240)
                            .cornerRadius(8)
                    }
                    PhotosPicker(
                        selection: $selectedItem,
                        matching: .images,
                        photoLibrary: .shared()
                    ) {
                        Label(
                            image == nil ? "childMain.proof.picker" : "childMain.proof.pickerChange",
                            systemImage: "photo.on.rectangle"
                        )
                    }
                }

                if proofService.isUploading {
                    Section {
                        ProgressView(value: proofService.uploadProgress) {
                            Text("childMain.proof.uploading")
                        }
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        Label("childMain.proof.button", systemImage: "paperplane.fill")
                    }
                    .disabled(image == nil || proofService.isUploading)
                }
            }
            .navigationTitle("childMain.proof.navTitle")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("childMain.proof.cancel") { dismiss() }
                        .disabled(proofService.isUploading)
                }
            }
            .onChange(of: selectedItem) { _, newItem in
                Task { await loadImage(from: newItem) }
            }
            .alert("childMain.proof.error.title", isPresented: $showError) {
                Button("childMain.proof.error.ok", role: .cancel) {}
            } message: {
                Text(errorMessage ?? NSLocalizedString("childMain.proof.error.generic", comment: ""))
            }
            .interactiveDismissDisabled(proofService.isUploading)
        }
    }

    // MARK: - Actions

    private func loadImage(from item: PhotosPickerItem?) async {
        guard let item else { return }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let loaded = UIImage(data: data) else {
                throw PhotoProofError.imageLoadFailed
            }
            image = loaded
        } catch {
            present(error)
        }
    }

    private func submit() async {
        guard let image else { return }
        do {
            _ = try await proofService.uploadProof(image: image, childId: childId, taskId: task.id)
            onSubmitted()
            dismiss()
        } catch {
            present(error)
        }
    }

    private func present(_ error: Error) {
        errorMessage = error.localizedDescription
        showError = true
    }
}
