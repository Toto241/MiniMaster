package com.google.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.Button
import androidx.compose.material.Card
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.pairing.ui.DecisionTracePanel
import java.util.Locale

/**
 * A Composable screen that displays a list of tasks assigned to the child.
 *
 * This screen observes the list of tasks from the [TasksViewModel] and displays
 * them in a [LazyColumn]. It provides a callback to handle the completion of a task,
 * which typically involves taking a photo.
 *
 * @param viewModel The [TasksViewModel] instance, provided by Hilt.
 * @param onCompleteTaskClick A callback function that is invoked with the task ID
 * when the user clicks the "Complete" button on a pending task.
 */
@Composable
fun TasksScreen(
    viewModel: TasksViewModel = hiltViewModel(),
    onCompleteTaskClick: (String) -> Unit // Pass task ID up
) {
    val tasks by viewModel.tasks.collectAsState()

    Column(modifier = Modifier
        .fillMaxSize()
        .padding(16.dp)) {
        Text(stringResource(R.string.your_tasks_title), style = MaterialTheme.typography.h4)
        Spacer(modifier = Modifier.height(16.dp))
        DecisionTracePanel()
        Spacer(modifier = Modifier.height(16.dp))
        if (tasks.isEmpty()) {
            Text(stringResource(R.string.no_tasks_for_now))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(tasks) { task ->
                    TaskItem(
                        task = task,
                        onCompleteClick = { onCompleteTaskClick(task.id) }
                    )
                }
            }
        }
    }
}

/**
 * A Composable that displays a single task item in a [Card].
 *
 * It shows the task description and its current status, formatted and color-coded.
 * A "Complete" button is shown only if the task status is "ASSIGNED" (pending).
 *
 * @param task The [Task] object to display.
 * @param onCompleteClick A callback function to be invoked when the "Complete" button is clicked.
 */
@Composable
fun TaskItem(task: Task, onCompleteClick: () -> Unit) {
    Card(elevation = 4.dp, modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = task.description, style = MaterialTheme.typography.body1)
                Spacer(modifier = Modifier.height(4.dp))

                // Format status for display
                val displayStatus = task.status.replace('_', ' ')
                    .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }

                Text(
                    text = stringResource(R.string.task_status_format, displayStatus),
                    style = MaterialTheme.typography.caption,
                    color = when (task.status) {
                        "pending" -> Color.Red
                        "pending_approval" -> Color(0xFFFFA500) // Orange
                        "approved" -> Color.Green
                        "rejected" -> Color.Red
                        else -> Color.Gray
                    },
                    fontWeight = FontWeight.Bold
                )
            }
            // Show complete button only if status is pending
            if (task.status == "pending") {
                Button(onClick = onCompleteClick) {
                    Text(stringResource(R.string.task_complete_button))
                }
            }
        }
    }
}
