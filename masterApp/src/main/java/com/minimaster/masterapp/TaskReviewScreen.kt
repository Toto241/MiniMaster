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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage

/**
 * A screen for reviewing tasks that children have marked as complete.
 *
 * This screen displays a list of tasks that are in the "pending_approval" state.
 * Each item shows the task description, the child who completed it, and the photo proof.
 * The master user can then approve the task.
 *
 * @param viewModel The [DashboardViewModel] that provides the list of reviewable tasks and handles the approval action.
 * @param onBack A callback to navigate back to the previous screen.
 */
@Composable
fun TaskReviewScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    onBack: () -> Unit
) {
    val tasksToReview by viewModel.reviewableTasks.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(stringResource(R.string.review_completed_tasks)) })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            if (tasksToReview.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.no_tasks_to_review), style = MaterialTheme.typography.h6)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(tasksToReview) { task ->
                        TaskReviewItem(
                            task = task,
                            onApproveClick = { viewModel.approveTask(task.childId, task.taskId) },
                            onRejectClick = { viewModel.rejectTask(task.childId, task.taskId) }
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text(stringResource(R.string.back_to_dashboard))
            }
        }
    }
}

/**
 * A Composable that displays a single task awaiting review.
 *
 * It shows the task details and the photo proof in a [Card]. An "Approve" button
 * allows the user to confirm the task's completion.
 *
 * @param task The [ReviewableTask] data to display.
 * @param onApproveClick A callback invoked when the "Approve" button is clicked.
 * @param onRejectClick A callback invoked when the "Reject" button is clicked.
 */
@Composable
fun TaskReviewItem(
    task: ReviewableTask,
    onApproveClick: () -> Unit,
    onRejectClick: () -> Unit
) {
    Card(elevation = 4.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(stringResource(R.string.child_label, task.childId), style = MaterialTheme.typography.caption)
            Spacer(modifier = Modifier.height(4.dp))
            Text(task.description, style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(8.dp))
            AsyncImage(
                model = task.photoUrl,
                contentDescription = stringResource(R.string.proof_for_task, task.description),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp),
                contentScale = ContentScale.Crop
            )
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally)
            ) {
                OutlinedButton(onClick = onRejectClick) {
                    Text(stringResource(R.string.reject_task))
                }
                Button(onClick = onApproveClick) {
                    Text(stringResource(R.string.approve_task))
                }
            }
        }
    }
}
