package com.minimaster.masterapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage

@Composable
fun TaskReviewScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    onBack: () -> Unit
) {
    val tasksToReview by viewModel.reviewableTasks.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Review Completed Tasks") })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            if (tasksToReview.isEmpty()) {
                Text("No tasks to review.", style = MaterialTheme.typography.h6)
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    items(tasksToReview) { task ->
                        TaskReviewItem(
                            task = task,
                            onApproveClick = {
                                viewModel.approveTask(task.childId, task.taskId)
                            }
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.weight(1f))
            Button(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text("Back to Dashboard")
            }
        }
    }
}

@Composable
fun TaskReviewItem(
    task: ReviewableTask,
    onApproveClick: () -> Unit
) {
    Card(elevation = 4.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Child: ${task.childId}", style = MaterialTheme.typography.caption)
            Spacer(modifier = Modifier.height(4.dp))
            Text(task.description, style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(8.dp))
            AsyncImage(
                model = task.photoUrl,
                contentDescription = "Proof for ${task.description}",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
                contentScale = ContentScale.Crop
            )
            Spacer(modifier = Modifier.height(16.dp))
            Button(
                onClick = onApproveClick,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            ) {
                Text("Approve Task")
            }
        }
    }
}
