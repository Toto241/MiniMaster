package com.google.pairing

import androidx.compose.foundation.layout.*
import androidx.compose.material.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

@Composable
fun PairingScreen(viewModel: PairingViewModel = hiltViewModel()) {
    val pairingState by viewModel.pairingState.collectAsState()
    val childImei by viewModel.childImeiForDebug.collectAsState()
    var showDebugInfo by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.pairing_screen_title),
            style = MaterialTheme.typography.h5,
            modifier = Modifier.padding(bottom = 24.dp)
        )

        // Main status view
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
            when (val state = pairingState) {
                is PairingState.Idle -> {
                    Text(
                        text = "Waiting for pairing link...",
                        textAlign = TextAlign.Center
                    )
                }
                is PairingState.Loading -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Text(
                            text = "Pairing device...",
                            modifier = Modifier.padding(top = 16.dp)
                        )
                    }
                }
                is PairingState.Success -> {
                    Text(
                        text = "Pairing successful!",
                        color = MaterialTheme.colors.primary
                    )
                }
                is PairingState.Error -> {
                    Text(
                        text = state.message,
                        color = MaterialTheme.colors.error,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }

        // Debug section at the bottom
        Button(onClick = { showDebugInfo = !showDebugInfo }) {
            Text(if (showDebugInfo) "Hide Debug Info" else "Show Debug Info")
        }
        if (showDebugInfo) {
            DebugInfoView(pairingState = pairingState, childImei = childImei)
        }
    }
}

@Composable
fun DebugInfoView(pairingState: PairingState, childImei: String?) {
    Column(modifier = Modifier.padding(top = 16.dp), horizontalAlignment = Alignment.Start) {
        Text("---- DEBUG INFO ----", style = MaterialTheme.typography.caption)
        Text("Child IMEI: ${childImei ?: "Not set"}", style = MaterialTheme.typography.caption)
        val statusText = when(pairingState) {
            is PairingState.Idle -> "Idle"
            is PairingState.Loading -> "Loading"
            is PairingState.Success -> "Success"
            is PairingState.Error -> "Error: ${pairingState.message}"
        }
        Text("Pairing Status: $statusText", style = MaterialTheme.typography.caption)
    }
}
