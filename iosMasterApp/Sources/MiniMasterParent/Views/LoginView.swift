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
                Section(header: Text("login.section.register")) {
                    TextField("login.field.imei", text: $imei)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("login.imeiField")
                    TextField("login.field.deviceName", text: $deviceName)
                        .accessibilityIdentifier("login.deviceNameField")
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
                            Text("login.button.register")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(imei.isEmpty || isRegistering)
                    .accessibilityIdentifier("login.registerButton")
                }
                if let error = authService.error {
                    Section {
                        Text(error.localizedDescription)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("login.navTitle")
        }
    }
}
