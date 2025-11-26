package com.google.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.Button
import androidx.compose.material.CircularProgressIndicator
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel

/**
 * A Composable screen that represents the main "home" screen of the child app
 * when the device is not locked or when it is task-locked.
 *
 * It handles the display of the lock state, including the task lock screen
 * where a child must complete a task to unlock the device.
 *
 * @param childId The unique identifier for the child device.
 * @param onNavigateToTasks A callback function to be invoked when the user clicks the "View Tasks" button.
 * @param taskViewModel The [TaskViewModel] instance, used to observe current task status.
 */
@Composable
fun LockScreen(
    childId: String,
    onNavigateToTasks: () -> Unit,
    taskViewModel: TaskViewModel = viewModel()
) {
    val currentTask by taskViewModel.currentTask.collectAsState()
    val isTaskLock = currentTask != null && (currentTask!!.status == TaskStatus.ASSIGNED.value || currentTask!!.status == TaskStatus.REJECTED.value || currentTask!!.status == TaskStatus.SUBMITTED.value)

    if (isTaskLock) {
        TaskLockScreenContent(task = currentTask!!)
    } else {
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
}

/**
 * Content to display when the device is locked due to an assigned task.
 *
 * @param task The [TaskModel] causing the lock.
 */
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
        Text(text = "Task Required", style = MaterialTheme.typography.h4, color = Color.Red)
        Spacer(modifier = Modifier.height(24.dp))

        Text(text = "Title: ${task.title}", style = MaterialTheme.typography.h6)
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = "Description: ${task.description}", style = MaterialTheme.typography.body1)
        Spacer(modifier = Modifier.height(32.dp))

        when (TaskStatus.fromString(task.status)) {
            TaskStatus.ASSIGNED, TaskStatus.REJECTED -> {
                Text(
                    text = if (task.status == TaskStatus.REJECTED.value)
                        "Proof rejected. Please submit again."
                    else
                        "To unlock the device, please complete this task.",
                    color = Color.Red
                )
                Spacer(modifier = Modifier.height(16.dp))
                Button(onClick = { showProofSubmission = true }) {
                    Text("Submit Proof")
                }
            }
            TaskStatus.SUBMITTED -> {
                Text(text = "Proof submitted. Waiting for parent approval.", color = Color.Blue)
                Spacer(modifier = Modifier.height(16.dp))
                CircularProgressIndicator()
            }
            else -> {
                // Should not happen as the AccessibilityService removes the lock on APPROVED
                Text(text = "Status: ${task.status}")
            }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun LockScreenPreview() {
    LockScreen(childId = "sampleChildId", onNavigateToTasks = {})
}
