package com.minimaster.masterapp

import androidx.compose.foundation.layout.*
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun CreateTaskScreen(
    onTaskCreate: (description: String, deadline: Long) -> Unit,
    onBack: () -> Unit
) {
    var description by remember { mutableStateOf("") }
    // In a real app, this would use a DatePickerDialog.
    // For simplicity, we'll use a text field for the deadline in milliseconds.
    var deadline by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Create New Task") })
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
                label = { Text("Task Description") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))
            OutlinedTextField(
                value = deadline,
                onValueChange = { deadline = it },
                label = { Text("Deadline (Unix Timestamp)") },
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
                Text("Create Task")
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onBack) {
                Text("Cancel")
            }
        }
    }
}
