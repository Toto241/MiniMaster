package com.google.pairing

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var childIdRepository: ChildIdRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        childIdRepository = ChildIdRepository(applicationContext)

        lifecycleScope.launch {
            childIdRepository.getChildId().collect { childId ->
                setContent {
                    if (!childId.isNullOrEmpty()) {
                        LockScreen(childId = childId)
                    } else {
                        PairingScreen()
                    }
                }
            }
        }
    }
}
