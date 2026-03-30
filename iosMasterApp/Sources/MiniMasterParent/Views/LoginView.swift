import SwiftUI

/// Login & Master-Device registration screen.
struct LoginView: View {
    @EnvironmentObject var authService: AuthService

    @State private var imei = ""
    @State private var deviceName = ""
    @State private var isRegistering = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Gerät registrieren") {
                    TextField("Geräte-ID (IMEI / UUID)", text: $imei)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Gerätename (optional)", text: $deviceName)
                }
                Section {
                    Button {
                        guard !imei.isEmpty else { return }
                        isRegistering = true
                        Task {
                            await authService.registerAndLogin(
                                imei: imei,
                                deviceName: deviceName.isEmpty ? nil : deviceName
                            )
                            isRegistering = false
                        }
                    } label: {
                        if isRegistering {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Registrieren & Anmelden")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(imei.isEmpty || isRegistering)
                }
                if let error = authService.error {
                    Section {
                        Text(error.localizedDescription)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("MiniMaster")
        }
    }
}
