import SwiftUI

/// Entry screen shown to an unpaired child device.
/// Accepts a 6-digit code from the parent app (or optionally a deep-link
/// URL that carries the token as a query parameter).
struct ChildPairingView: View {

    @EnvironmentObject private var authService: ChildAuthService
    @EnvironmentObject private var blockingManager: AppBlockingManager

    @State private var code = ""
    @State private var isLoading = false
    @FocusState private var codeFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 32) {
                header
                codeField
                pairButton
                errorText
            }
            .padding()
            .navigationTitle("childPairing.navTitle")
            .navigationBarTitleDisplayMode(.large)
        }
        .onOpenURL { url in handleDeepLink(url) }
    }

    // MARK: - Subviews

    private var header: some View {
        VStack(spacing: 8) {
            Image(systemName: "lock.shield")
                .font(.system(size: 60))
                .foregroundColor(.accentColor)
            Text("childPairing.header.title")
                .font(.title2.bold())
            Text("childPairing.header.description")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
        }
    }

    private var codeField: some View {
        VStack(spacing: 12) {
            TextField("childPairing.field.code", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .font(.title.monospacedDigit())
                .multilineTextAlignment(.center)
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)
                .focused($codeFocused)
                .onChange(of: code) { _, newValue in
                    // Enforce 6 digits only
                    let filtered = String(newValue.filter(\.isNumber).prefix(6))
                    if filtered != newValue { code = filtered }
                    if filtered.count == 6 { codeFocused = false }
                }

            Text(String(format: NSLocalizedString("childPairing.digits", comment: ""), code.count))
                .font(.caption)
                .foregroundColor(.secondary)
        }
    }

    private var pairButton: some View {
        Button(action: pair) {
            HStack {
                Spacer(minLength: 0)
                Group {
                    if isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("childPairing.button.connect")
                            .fontWeight(.semibold)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding()
            .background(code.count == 6 ? Color.accentColor : Color.gray)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
        .disabled(code.count != 6 || isLoading)
    }

    private var errorText: some View {
        Group {
            if let error = authService.error {
                Text(error.localizedDescription)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .font(.subheadline)
            }
        }
    }

    // MARK: - Actions

    private func pair() {
        isLoading = true
        Task {
            await authService.pairWithCode(code)
            if authService.isPaired {
                await blockingManager.requestAuthorization()
            }
            await MainActor.run { isLoading = false }
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value else {
            return
        }
        isLoading = true
        Task {
            await authService.pairWithToken(token)
            if authService.isPaired {
                await blockingManager.requestAuthorization()
            }
            await MainActor.run { isLoading = false }
        }
    }
}

#Preview {
    ChildPairingView()
        .environmentObject(ChildAuthService(
            client: ChildCloudFunctionsClient(),
            syncService: CommandSyncService(
                client: ChildCloudFunctionsClient(),
                policyStore: PolicyStore(),
                blockingManager: AppBlockingManager()
            )
        ))
        .environmentObject(AppBlockingManager())
}
