package com.google.pairing

import androidx.compose.foundation.layout.*
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

/**
 * A Composable screen that handles the device pairing process.
 *
 * This screen is displayed when the app is opened but not yet paired with a master device.
 * It primarily waits for a deep link to be received, which contains the pairing token.
 * It also provides a text field for manual entry of a pairing code, though the primary
 * flow is via deep link. The UI reacts to the [PairingState] from the [PairingViewModel].
 *
 * @param viewModel The [PairingViewModel] instance, typically provided by Hilt.
 */
@Composable
fun PairingScreen(viewModel: PairingViewModel = hiltViewModel()) {
    val pairingState by viewModel.pairingState.collectAsState()
    val childImei by viewModel.childImeiForDebug.collectAsState()
    var pairingCode by remember { mutableStateOf("") }
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

        // This text field is for manual pairing, which is a secondary flow.
        OutlinedTextField(
            value = pairingCode,
            onValueChange = { pairingCode = it },
            label = { Text(stringResource(R.string.pairing_code_input_label)) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
                .testTag("PairingCodeTextField"),
            singleLine = true
        )

        Button(
            onClick = {
                // The IMEI is retrieved and passed for validation.
                // In a real app, this might be handled differently for privacy.
                val imei = childImei ?: ""
                viewModel.validateToken(pairingCode, imei)
            },
            enabled = pairingCode.isNotBlank() && pairingState !is PairingState.Loading,
            modifier = Modifier
                .fillMaxWidth()
                .testTag("PairingButton")
        ) {
            Text(stringResource(R.string.pairing_button_text))
        }

        // The central area of the screen displays the current status of the pairing process.
        Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
            when (val state = pairingState) {
                is PairingState.Idle -> {
                    Text(
                        text = stringResource(R.string.pairing_status_idle),
                        textAlign = TextAlign.Center
                    )
                }
                is PairingState.Loading -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Text(
                            text = stringResource(R.string.pairing_status_loading),
                            modifier = Modifier.padding(top = 16.dp)
                        )
                    }
                }
                is PairingState.Success -> {
                    Text(
                        text = stringResource(R.string.pairing_status_success),
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

        // A collapsible section for showing debug information.
        Button(onClick = { showDebugInfo = !showDebugInfo }) {
            Text(if (showDebugInfo) "Hide Debug Info" else "Show Debug Info")
        }
        if (showDebugInfo) {
            DebugInfoView(pairingState = pairingState, childImei = childImei)
        }
    }
}

/**
 * A simple Composable for displaying debug information about the pairing process.
 *
 * @param pairingState The current [PairingState] to display.
 * @param childImei The child's IMEI, if available.
 */
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
