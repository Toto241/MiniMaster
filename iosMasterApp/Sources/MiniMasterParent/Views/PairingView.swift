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
                Section(header: Text("pairing.section.new")) {
                    Text("pairing.description")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button(action: generatePairingCode) {
                        HStack {
                            Image(systemName: "number")
                            Text("pairing.button.code")
                        }
                    }
                    .disabled(isLoading)

                    Button(action: generatePairingLink) {
                        HStack {
                            Image(systemName: "link")
                            Text("pairing.button.link")
                        }
                    }
                    .disabled(isLoading)
                }

                if isLoading {
                    Section {
                        HStack {
                            Spacer()
                            ProgressView("pairing.loading")
                            Spacer()
                        }
                    }
                }

                if let code = pairingCode {
                    Section(header: Text("pairing.section.code")) {
                        HStack {
                            Text(code)
                                .font(.title.monospacedDigit())
                                .textSelection(.enabled)
                            Spacer()
                            Button("pairing.button.copy") {
                                UIPasteboard.general.string = code
                            }
                            .font(.caption)
                        }
                    }
                }

                if let link = pairingLink {
                    Section(header: Text("pairing.section.link")) {
                        Text(link)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)

                        Button("pairing.button.share") {
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
            .navigationTitle("pairing.navTitle")
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
