package com.google.pairing

import androidx.compose.foundation.layout.*
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.runtime.livedata.observeAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.firebase.firestore.ktx.firestore // Required for Preview if ViewModel has Firestore default arg
import com.google.firebase.ktx.Firebase // Required for Preview if ViewModel has Firestore default arg


@Composable
fun PairingScreen(pairingViewModel: PairingViewModel = viewModel()) {
    var pairingCode by remember { mutableStateOf("") }
    val isLoading by pairingViewModel.isLoading.observeAsState(false)
    val showExpiredCodeError by pairingViewModel.showExpiredCodeError.observeAsState(false)
    val showInvalidCodeError by pairingViewModel.showInvalidCodeError.observeAsState(false)
    val showChildIdSaveError by pairingViewModel.showChildIdSaveError.observeAsState(false)

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

        OutlinedTextField(
            value = pairingCode,
            onValueChange = { pairingCode = it },
            label = { Text(stringResource(R.string.pairing_code_input_label)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            enabled = !isLoading
        )

        Spacer(modifier = Modifier.height(16.dp))

        if (isLoading) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = {
                    if (pairingCode.isNotBlank()) {
                        pairingViewModel.validatePairingCode(pairingCode)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading && pairingCode.isNotBlank()
            ) {
                Text(stringResource(R.string.pairing_button_text))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (showExpiredCodeError) {
            Text(
                text = stringResource(R.string.error_code_expired),
                color = MaterialTheme.colors.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        if (showInvalidCodeError) {
            Text(
                text = stringResource(R.string.error_invalid_code),
                color = MaterialTheme.colors.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
        if (showChildIdSaveError) {
            Text(
                text = stringResource(R.string.error_saving_child_id),
                color = MaterialTheme.colors.error,
                modifier = Modifier.padding(top = 8.dp)
            )
        }
    }
}

@Preview(showBackground = true)
@Composable
fun PairingScreenPreview() {
    // For the preview to work with a ViewModel that takes arguments (like ChildIdRepository and Firestore),
    // you might need to provide fake/mock instances or use a library for previewing ViewModels.
    // A simple way is to have default arguments in the ViewModel constructor for preview purposes,
    // or pass a manually created ViewModel instance here.

    // Assuming PairingViewModel has default arguments for its dependencies for previewing:
    // Option 1: ViewModel with default arguments (not shown here, but if it had them)
    // PairingScreen(pairingViewModel = viewModel())

    // Option 2: Create a fake ViewModel for preview (more complex setup)
    // This requires ChildIdRepository and FirebaseFirestore instances.
    // For simplicity, if the ViewModel can be instantiated without real dependencies (e.g. nullable or default fake ones),
    // that would be easier.
    // For now, we'll assume the default viewModel() call might work if Hilt or similar is set up,
    // or if the ViewModel has parameterless constructor (which it doesn't).

    // Let's try to provide a basic ViewModel instance.
    // This will likely fail if ChildIdRepository itself needs a valid Context.
    // For a true preview, more setup is needed.
    // For now, this preview might not render correctly without proper DI or fakes.
    val context = androidx.compose.ui.platform.LocalContext.current
    val fakeChildIdRepository = ChildIdRepository(context)
    // The Firebase.firestore call requires Firebase to be initialized.
    // Firebase.initializeApp(context) // This can be problematic in previews.
    // val fakeFirestore = Firebase.firestore

    // PairingScreen(pairingViewModel = PairingViewModel(fakeChildIdRepository, fakeFirestore))

    // Simplest preview: Just call PairingScreen, it will use the default viewModel()
    // which might fail if dependencies are not properly provided at preview time.
    // For this task, the runtime functionality is more important than a perfect preview.
    PairingScreen()
}
