import SwiftUI
import FirebaseCore
import FirebaseMessaging
import FamilyControls

/// Entry point for the MiniMaster Child iOS app.
///
/// On first launch the user must grant FamilyControls authorization
/// (requires the `com.apple.developer.family-controls` entitlement and
/// must be triggered from a child's enrolled device in Screen Time).
@main
struct MiniMasterChildApp: App {

    @UIApplicationDelegateAdaptor(ChildAppDelegate.self) var delegate

    @StateObject private var env = ChildAppEnvironment()

    var body: some Scene {
        WindowGroup {
            ChildRootView()
                .environmentObject(env.authService)
                .environmentObject(env.policyStore)
                .environmentObject(env.syncService)
                .environmentObject(env.blockingManager)
        }
    }
}

// MARK: - AppDelegate

final class ChildAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate,
                               MessagingDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        application.registerForRemoteNotifications()
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    /// Forward refreshed FCM token to [ChildAuthService] for backend registration.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        NotificationCenter.default.post(
            name: .childFcmTokenRefreshed,
            object: nil,
            userInfo: ["token": token]
        )
    }
}

extension Notification.Name {
    static let childFcmTokenRefreshed = Notification.Name("ChildFCMTokenRefreshed")
}

// MARK: - Root View

struct ChildRootView: View {
    @EnvironmentObject var authService: ChildAuthService

    var body: some View {
        Group {
            if authService.isPaired {
                MainChildView()
            } else {
                ChildPairingView()
            }
        }
        .animation(.default, value: authService.isPaired)
    }
}

    // MARK: - Dependency Container

    /// Creates and wires all app-level dependencies in the correct order.
    @MainActor
    final class ChildAppEnvironment: ObservableObject {
        let policyStore = PolicyStore()
        let blockingManager = AppBlockingManager()
        let client = ChildCloudFunctionsClient()

        lazy var syncService: CommandSyncService = {
            CommandSyncService(client: client, policyStore: policyStore, blockingManager: blockingManager)
        }()

        lazy var authService: ChildAuthService = {
            ChildAuthService(client: client, syncService: syncService)
        }()
    }
