import SwiftUI

/// Root navigation controller — shows login if unauthenticated, dashboard otherwise.
struct RootView: View {
    @EnvironmentObject var authService: AuthService

    var body: some View {
        Group {
            if authService.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.default, value: authService.isAuthenticated)
    }
}

/// Main tab bar shown after successful login.
struct MainTabView: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "house.fill") }
            PairingView()
                .tabItem { Label("Koppeln", systemImage: "link.badge.plus") }
            TaskListView()
                .tabItem { Label("Aufgaben", systemImage: "checklist") }
            SubscriptionView()
                .tabItem { Label("Abo", systemImage: "star.fill") }
        }
    }
}
