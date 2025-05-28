package com.google.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.Text // Keep Text for now, will add Button, TextField later
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
// For a complete screen, you'd also have imports for TextField, Button, etc.
// and a ViewModel instance passed in to observe states like showExpiredCodeError.

@Composable
fun PairingScreen() {
    // In a real app, you would observe LiveData from a ViewModel here
    // For example:
    // val viewModel: PairingViewModel = viewModel()
    // val showExpiredError by viewModel.showExpiredCodeError.observeAsState(false)
    // val showInvalidError by viewModel.showInvalidCodeError.observeAsState(false)

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = stringResource(R.string.pairing_screen_title))

        // Placeholder for where error messages would be displayed
        // if (showExpiredError) {
        //     Text(text = stringResource(R.string.error_code_expired))
        // }
        // if (showInvalidError) {
        //     Text(text = stringResource(R.string.error_invalid_code))
        // }
        // Input field and button would also use stringResource for labels/text
        // e.g. TextField(value = "", onValueChange = {}, label = { Text(stringResource(R.string.pairing_code_input_label)) })
        // e.g. Button(onClick = {}) { Text(stringResource(R.string.pairing_button_text)) }
    }
}

@Preview(showBackground = true)
@Composable
fun PairingScreenPreview() {
    PairingScreen()
}
