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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import java.util.Locale

@Composable
fun TasksScreen(
    viewModel: TasksViewModel = hiltViewModel(),
    onCompleteTaskClick: (String) -> Unit // Pass task ID up
) {
    val tasks by viewModel.tasks.collectAsState()

    Column(modifier = Modifier
        .fillMaxSize()
        .padding(16.dp)) {
        Text("Your Tasks", style = MaterialTheme.typography.h4)
        Spacer(modifier = Modifier.height(16.dp))
        if (tasks.isEmpty()) {
            Text("No tasks for now, good job!")
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
                Text(
                    text = "Status: ${task.status.replace('_', ' ').replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() }}",
                    style = MaterialTheme.typography.caption,
                    color = when (task.status) {
                        "pending" -> Color.Red
                        "pending_approval" -> Color(0xFFFFA500) // Orange
                        "approved" -> Color.Green
                        else -> Color.Gray
                    },
                    fontWeight = FontWeight.Bold
                )
            }
            if (task.status == "pending") {
                Button(onClick = onCompleteClick) {
                    Text("Complete")
                }
            }
        }
    }
}
