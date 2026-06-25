import Foundation
import FirebaseStorage
import FirebaseFunctions
import UIKit
import PhotosUI

/// Handles photo selection, upload to Firebase Storage, and task completion.
@MainActor
final class PhotoProofService: ObservableObject {

    @Published private(set) var isUploading = false
    @Published private(set) var uploadProgress: Double = 0
    @Published private(set) var lastUploadedUrl: String?
    @Published private(set) var error: Error?

    private let storage = Storage.storage()
    private let functions = Functions.functions()

    // MARK: - Photo Selection

    /// Presents a PHPickerViewController and returns the selected UIImage.
    /// Caller is responsible for presenting the picker.
    func createPicker(filter: PHPickerFilter = .images,
                      limit: Int = 1) -> PHPickerViewController {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = filter
        config.selectionLimit = limit
        config.preferredAssetRepresentationMode = .current

        let picker = PHPickerViewController(configuration: config)
        return picker
    }

    /// Extracts UIImage from a PHPickerResult.
    func loadImage(from result: PHPickerResult) async throws -> UIImage {
        return try await withCheckedThrowingContinuation { continuation in
            if result.itemProvider.canLoadObject(ofClass: UIImage.self) {
                result.itemProvider.loadObject(ofClass: UIImage.self) { object, error in
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }
                    guard let image = object as? UIImage else {
                        continuation.resume(throwing: PhotoProofError.imageLoadFailed)
                        return
                    }
                    continuation.resume(returning: image)
                }
            } else {
                continuation.resume(throwing: PhotoProofError.unsupportedMedia)
            }
        }
    }

    // MARK: - Upload & Completion

    /// Uploads a photo proof for a task and marks the task as completed.
    /// - Parameters:
    ///   - image: The photo to upload.
    ///   - childId: The child's device ID.
    ///   - taskId: The task ID.
    /// - Returns: The public download URL of the uploaded photo.
    @discardableResult
    func uploadProof(image: UIImage, childId: String, taskId: String) async throws -> String {
        isUploading = true
        uploadProgress = 0
        defer { isUploading = false }

        // 1. Compress and strip metadata (Privacy / EXIF-GPS defense)
        guard let jpegData = image.jpegData(compressionQuality: 0.85) else {
            throw PhotoProofError.compressionFailed
        }

        // 2. Validate size (256 B – 5 MB, aligned with storage.rules and completeTask)
        let size = jpegData.count
        guard size >= 256 else {
            throw PhotoProofError.tooSmall
        }
        guard size <= 5 * 1024 * 1024 else {
            throw PhotoProofError.tooLarge
        }

        // 3. Upload to Firebase Storage
        let path = "proofs/\(childId)/\(taskId)/\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
        let ref = storage.reference().child(path)

        let metadata = StorageMetadata()
        metadata.contentType = "image/jpeg"

        _ = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let uploadTask = ref.putData(jpegData, metadata: metadata) { _, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }

            uploadTask.observe(.progress) { [weak self] snapshot in
                guard let self, let progress = snapshot.progress else { return }
                let fraction = Double(progress.completedUnitCount) / Double(max(progress.totalUnitCount, 1))
                Task { @MainActor in self.uploadProgress = fraction }
            }
        }

        // 4. Get download URL
        let downloadURL = try await ref.downloadURL()
        let urlString = downloadURL.absoluteString

        // 5. Call completeTask Cloud Function. If it fails, best-effort delete the
        //    object we just uploaded so a retry does not orphan blobs (each retry
        //    writes a new timestamped path) and Storage costs stay bounded.
        do {
            _ = try await functions.httpsCallable("completeTask").call([
                "taskId": taskId,
                "photoUrl": urlString
            ])
        } catch {
            try? await ref.delete()
            throw error
        }

        lastUploadedUrl = urlString
        return urlString
    }

    /// Convenience: upload + complete in one call.
    func completeTaskWithPhoto(image: UIImage, childId: String, taskId: String) async {
        do {
            _ = try await uploadProof(image: image, childId: childId, taskId: taskId)
        } catch {
            self.error = error
        }
    }
}

// MARK: - Errors

enum PhotoProofError: LocalizedError {
    case imageLoadFailed
    case unsupportedMedia
    case compressionFailed
    case tooSmall
    case tooLarge
    case uploadFailed

    var errorDescription: String? {
        switch self {
        case .imageLoadFailed:     return "Das Bild konnte nicht geladen werden."
        case .unsupportedMedia:    return "Nur Bilder werden unterstützt."
        case .compressionFailed:   return "Bildkomprimierung fehlgeschlagen."
        case .tooSmall:            return "Das Bild ist zu klein (min. 256 Bytes)."
        case .tooLarge:            return "Das Bild ist zu groß (max. 5 MB)."
        case .uploadFailed:        return "Upload fehlgeschlagen."
        }
    }
}
