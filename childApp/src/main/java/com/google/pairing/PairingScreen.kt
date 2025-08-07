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

@Composable
fun PairingScreen(viewModel: PairingViewModel = hiltViewModel()) {
    val pairingState by viewModel.pairingState.collectAsState()

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

        when (val state = pairingState) {
            is PairingState.Idle -> {
                Text(
                    text = "Waiting for pairing link...",
                    textAlign = TextAlign.Center
                )
            }
            is PairingState.Loading -> {
                CircularProgressIndicator()
                Text(
                    text = "Pairing device...",
                    modifier = Modifier.padding(top = 16.dp)
                )
            }
            is PairingState.Success -> {
                // This state is transient, as successful pairing will trigger navigation
                // to the LockScreen. We can show a temporary success message.
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
}
