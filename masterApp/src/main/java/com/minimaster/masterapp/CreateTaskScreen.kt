package com.minimaster.masterapp

import androidx.compose.foundation.layout.*
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp

/**
 * A Composable screen for creating a new task for a child device.
 *
 * This screen provides a simple form with fields for the task description and deadline.
 * The deadline input is simplified to a text field for a UNIX timestamp for this
 * example, but a production app would use a proper Date/Time picker dialog.
 *
 * @param onTaskCreate A callback invoked with the description and deadline when the
 * "Create Task" button is clicked and the inputs are valid.
 * @param onBack A callback to navigate back to the previous screen.
 */
@Composable
fun CreateTaskScreen(
    onTaskCreate: (description: String, deadline: Long) -> Unit,
    onBack: () -> Unit
) {
    var description by remember { mutableStateOf("") }
    // A real app should use a DatePickerDialog for a better user experience.
    var deadline by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(stringResource(R.string.create_new_task)) })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text(stringResource(R.string.task_description)) },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(
                value = deadline,
                onValueChange = { deadline = it },
                label = { Text(stringResource(R.string.deadline_unix)) },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(32.dp))
            Button(
                onClick = {
                    val deadlineLong = deadline.toLongOrNull()
                    if (description.isNotBlank() && deadlineLong != null) {
                        onTaskCreate(description, deadlineLong)
                    }
                },
                enabled = description.isNotBlank() && deadline.toLongOrNull() != null
            ) {
                Text(stringResource(R.string.create_task))
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onBack) {
                Text(stringResource(R.string.cancel))
            }
        }
    }
}
