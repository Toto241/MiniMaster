package com.google.pairing

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject // Required if ChildIdRepository is injected directly into Activity

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    // ChildIdRepository is now typically injected into a ViewModel,
    // or if needed here, can be injected directly by Hilt.
    // For observing childId, it's better to do this via a ViewModel.
    // Let's assume ChildIdRepository is still needed here for collecting the Flow directly.
    // However, direct field injection in Activities is common.
    @Inject // Field injection (alternative to constructor injection for Activities)
    lateinit var childIdRepository: ChildIdRepository
    // Note: Field injection requires the variable to be non-private.
    // Or, it can be private if only used by methods within this class after onCreate.

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // childIdRepository = ChildIdRepository(applicationContext) // Manual instantiation removed

        // If childIdRepository is field injected, it's available after super.onCreate().
        // It's generally recommended to collect flows from a ViewModel associated with the Activity/Fragment's lifecycle.
        // For this example, we'll keep the direct collection in the Activity as per the original structure,
        // but now using the Hilt-injected repository.

        lifecycleScope.launch {
            childIdRepository.getChildId().collect { childId ->
                setContent {
                    // The PairingScreen will get its own Hilt-injected ViewModel via viewModel()
                    if (!childId.isNullOrEmpty()) {
                        LockScreen(childId = childId)
                    } else {
                        PairingScreen() // PairingViewModel is obtained via viewModel() within PairingScreen
                    }
                }
            }
        }
    }
}
