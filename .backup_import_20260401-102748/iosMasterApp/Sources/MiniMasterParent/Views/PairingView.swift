import SwiftUI
import CoreImage.CIFilterBuiltins

/// QR-Code Pairing screen — generates a pairing link and displays it as a QR code.
/// The child device scans the code to pair.
struct PairingView: View {

    private let client = CloudFunctionsClient()

    @State private var qrImage: UIImage?
    @State private var pairingToken: String?
    @State private var pairingCode: String?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedTab = 0

    var body: some View {
        Form {
            Picker("Methode", selection: $selectedTab) {
                Text("QR-Code").tag(0)
                Text("6-stelliger Code").tag(1)
            }
            .pickerStyle(.segmented)
            .listRowBackground(Color.clear)

            if selectedTab == 0 {
                qrSection
            } else {
                codeSection
            }
        }
        .navigationTitle("Gerät verbinden")
    }

    // MARK: QR Section

    private var qrSection: some View {
        Group {
            if let img = qrImage {
                Section {
                    Image(uiImage: img)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(maxWidth: 250)
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                Section("Token") {
                    Text(pairingToken ?? "–")
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
            } else {
                Section {
                    Button { Task { await generateQR() } } label: {
                        if isLoading {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Label("QR-Code erstellen", systemImage: "qrcode")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isLoading)
                }
            }
            errorSection
        }
    }

    // MARK: Code Section

    private var codeSection: some View {
        Group {
            if let code = pairingCode {
                Section("Pairing-Code (24 h gültig)") {
                    Text(code)
                        .font(.system(size: 40, weight: .bold, design: .monospaced))
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                Button("Neuen Code erzeugen") {
                    pairingCode = nil
                    Task { await generateCode() }
                }
            } else {
                Section {
                    Button { Task { await generateCode() } } label: {
                        if isLoading {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Label("Code erstellen", systemImage: "number.circle")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isLoading)
                }
            }
            errorSection
        }
    }

    private var errorSection: some View {
        Group {
            if let err = errorMessage {
                Section {
                    Text(err).foregroundStyle(.red).font(.caption)
                }
            }
        }
    }

    // MARK: Actions

    private func generateQR() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let token = try await client.generatePairingLink()
            pairingToken = token
            let deepLink = "minimaster://pair?token=\(token)"
            qrImage = generateQRCode(from: deepLink)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func generateCode() async {
        // The master's IMEI comes from the AuthService — here we pass a placeholder
        // In production wire up via @EnvironmentObject AuthService
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        // NOTE: replace "master_imei_placeholder" with the real masterImei from AuthService
        Task { @MainActor in
            // dummy call – in production pass real childId or show input field
            errorMessage = "Bitte childId im Pairing-Flow angeben (Demo-Platzhalter)."
        }
    }

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let outputImage = filter.outputImage,
              let cgImage = context.createCGImage(outputImage, from: outputImage.extent)
        else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
