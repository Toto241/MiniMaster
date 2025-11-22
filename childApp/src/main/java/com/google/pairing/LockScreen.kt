package com.google.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.Text
import androidx.compose.material.CircularProgressIndicator
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material.Button
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * A Composable screen that represents the main "home" screen of the child app
 * when the device is not locked.
 *
 * This screen displays a welcome message and provides a button to navigate to the
 * tasks screen. In a more complete application, this screen would likely be replaced
 * by the device's actual home screen, with the lock functionality implemented as an
 * overlay.
 *
 * @param childId The unique identifier for the child device, displayed in the message.
 * @param onNavigateToTasks A callback function to be invoked when the user clicks the
 * "View Tasks" button.
 @Composable
fun LockScreen(
    taskViewModel: TaskViewModel = viewModel()
) {
    val currentTask by taskViewModel.currentTask.collectAsState()
    val isTaskLock = currentTask != null && (currentTask!!.status == TaskStatus.ASSIGNED.value || currentTask!!.status == TaskStatus.REJECTED.value || currentTask!!.status == TaskStatus.SUBMITTED.value)

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (isTaskLock) {
            TaskLockScreenContent(task = currentTask!!)
        } else {
            // Bestehende LockScreen Logik (z.B. Zeitlimit)
            Text(text = "Gerät gesperrt", style = MaterialTheme.typography.h4)
            Spacer(modifier = Modifier.height(16.dp))
            Text(text = "Bitte warten Sie, bis die Sperrzeit abgelaufen ist.")
        }
    }
}

@Composable
fun TaskLockScreenContent(task: TaskModel) {
    var showProofSubmission by remember { mutableStateOf(false) }

    if (showProofSubmission) {
        ProofSubmissionScreen(onProofSubmitted = { showProofSubmission = false })
        return
    }

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
        modifier = Modifier.fillMaxSize().padding(32.dp)
    ) {
        Text(text = "Aufgabe erforderlich", style = MaterialTheme.typography.h4, color = Color.Red)
        Spacer(modifier = Modifier.height(24.dp))

        Text(text = "Titel: ${task.title}", style = MaterialTheme.typography.h6)
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = "Beschreibung: ${task.description}", style = MaterialTheme.typography.body1)
        Spacer(modifier = Modifier.height(32.dp))

        when (TaskStatus.fromString(task.status)) {
            TaskStatus.ASSIGNED, TaskStatus.REJECTED -> {
                Text(text = if (task.status == TaskStatus.REJECTED.value) "Nachweis abgelehnt. Bitte erneut einreichen." else "Um das Gerät freizuschalten, erledige bitte diese Aufgabe.", color = Color.Red)
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = { showProofSubmission = true }) {
                    Text("Nachweis einreichen")
                }
            }
            TaskStatus.SUBMITTED -> {
                Text(text = "Nachweis eingereicht. Warte auf Genehmigung durch die Eltern.", color = Color.Blue)
                Spacer(modifier = Modifier.height(16.dp))
                CircularProgressIndicator()
            }
            else -> {
                // Sollte nicht passieren, da der AccessibilityService die Sperre bei APPROVED aufhebt
                Text(text = "Fehlerhafter Status: ${task.status}")
            }
        }
    }
}childId: String, onNavigateToTasks: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = stringResource(R.string.lock_screen_title))
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = stringResource(R.string.lock_screen_message, childId))
        Spacer(modifier = Modifier.height(32.dp))
        Button(onClick = onNavigateToTasks) {
            Text(text = stringResource(R.string.view_tasks_button))
        }
    }
}

@Preview(showBackground = true)
@Composable
fun LockScreenPreview() {
    LockScreen(childId = "sampleChildId", onNavigateToTasks = {})
}
