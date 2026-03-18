# Unit Tests for childApp

This directory is intended to hold the unit tests for the `childApp` module.

Current repository coverage in this module includes:

- `PairingViewModelTest`
- `AccessibilityServiceTest`
- `ChildIdProviderImplTest`
- `TaskStatusTest`

Additional coverage is still recommended for:

- repositories (`TaskRepository`, `OnboardingRepository`)
- background/runtime behavior (`HeartbeatWorker`, `RuleSyncService`)
- permission-loss and tamper-handling flows
