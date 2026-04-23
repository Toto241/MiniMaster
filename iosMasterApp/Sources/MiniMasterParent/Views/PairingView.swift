import SwiftUI

/// Generates a pairing code or deep-link URL so the parent can link a child device.
struct PairingView: View {

    @EnvironmentObject private var authService: AuthService
    private let client = CloudFunctionsClient()

    @State private var pairingCode: String?
    @State private var pairingLink: String?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showShareSheet = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Neues Gerät koppeln") {
                    Text("Erstelle einen 6-stelligen Code oder einen Kopplungslink. Das Kind-Gerät kann damit mit deinem Konto verbunden werden.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button(action: generatePairingCode) {
                        HStack {
                            Image(systemName: "number")
                            Text("6-stelligen Code erstellen")
                        }
                    }
                    .disabled(isLoading)

                    Button(action: generatePairingLink) {
                        HStack {
                            Image(systemName: "link")
                            Text("Kopplungslink erstellen")
                        }
                    }
                    .disabled(isLoading)
                }

                if isLoading {
                    Section {
                        HStack {
                            Spacer()
                            ProgressView("Wird erstellt…")
                            Spacer()
                        }
                    }
                }

                if let code = pairingCode {
                    Section("Pairing-Code") {
                        HStack {
                            Text(code)
                                .font(.title.monospacedDigit())
                                .textSelection(.enabled)
                            Spacer()
                            Button("Kopieren") {
                                UIPasteboard.general.string = code
                            }
                            .font(.caption)
                        }
                    }
                }

                if let link = pairingLink {
                    Section("Kopplungslink") {
                        Text(link)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)

                        Button("Teilen…") {
                            showShareSheet = true
                        }
                    }
                }

                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Gerät koppeln")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showShareSheet) {
                if let link = pairingLink, let url = URL(string: link) {
                    ShareSheet(activityItems: [url])
                }
            }
        }
    }

    // MARK: - Actions

    private func generatePairingCode() {
        isLoading = true
        errorMessage = nil
        pairingCode = nil
        pairingLink = nil
        Task {
            do {
                let code = try await client.createPairingCode()
                await MainActor.run {
                    pairingCode = code
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }

    private func generatePairingLink() {
        isLoading = true
        errorMessage = nil
        pairingCode = nil
        pairingLink = nil
        Task {
            do {
                let link = try await client.generatePairingLink()
                await MainActor.run {
                    pairingLink = link
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}

// MARK: - Share Sheet Wrapper

private struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]
    let applicationActivities: [UIActivity]? = nil

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: applicationActivities)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

#Preview {
    PairingView()
        .environmentObject(AuthService())
}
