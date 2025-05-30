package com.google.pairing

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue // This might not be needed anymore if not directly observing a state here
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var childIdProvider: ChildIdProvider // Changed from ChildIdRepository to ChildIdProvider

    // private val viewModel: PairingViewModel by viewModels() // Example if ViewModel were directly used in Activity

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Manual instantiation of ChildIdRepository or ChildIdProvider removed.
        // childIdProvider is injected by Hilt.

        lifecycleScope.launch {
            // Collect the childIdFlow from the injected ChildIdProvider
            childIdProvider.childIdFlow.collect { childId ->
                setContent {
                    // App-Theme could be applied here at the root of setContent
                    // e.g., YourAppTheme { ... }
                    if (!childId.isNullOrEmpty()) {
                        LockScreen(childId = childId)
                    } else {
                        // PairingViewModel is obtained via viewModel() within PairingScreen composable
                        // which Hilt manages.
                        PairingScreen()
                    }
                }
            }
        }
    }
}
