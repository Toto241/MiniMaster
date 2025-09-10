package com.google.pairing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A singleton provider class responsible for supplying the child device's unique ID.
 *
 * This class acts as a centralized source of truth for the child's ID. It retrieves the ID
 * from the [ChildIdRepository] and exposes it as a [StateFlow], allowing other parts of the
 * application to reactively observe changes to the ID (e.g., after initial pairing).
 *
 * The use of a [SupervisorJob] ensures that any failures in the upstream data flow
 * do not cancel the provider's scope, making it resilient.
 *
 * @property childIdRepository The repository responsible for persisting and retrieving the child ID.
 */
@Singleton
class ChildIdProvider @Inject constructor(
    private val childIdRepository: ChildIdRepository
) {
    private val _childIdFlow = MutableStateFlow<String?>(null)
    /**
     * A hot [StateFlow] that emits the current child ID. It is null if the device has not been paired yet.
     * UI components and other services can collect this flow to get real-time updates.
     */
    val childIdFlow: StateFlow<String?> = _childIdFlow.asStateFlow()

    /**
     * A dedicated coroutine scope for this provider. Since the provider is a singleton,
     * this scope will live as long as the application.
     */
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        coroutineScope.launch {
            // Collect the child ID from the repository and update the local StateFlow.
            // This ensures that any component observing childIdFlow gets the latest value.
            childIdRepository.getChildId().collect { childId ->
                _childIdFlow.value = childId
            }
        }
    }
}
