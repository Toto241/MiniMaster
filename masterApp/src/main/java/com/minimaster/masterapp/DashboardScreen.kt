package com.minimaster.masterapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.Button
import androidx.compose.material.Card
import androidx.compose.material.MaterialTheme
import androidx.compose.material.OutlinedButton
import androidx.compose.material.Switch
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import java.util.concurrent.TimeUnit

/**
 * The main dashboard screen for the master application.
 *
 * This screen displays a list of all paired child devices and provides navigation buttons
 * to other sections of the app like task review and subscriptions.
 *
 * @param viewModel The [DashboardViewModel] instance for accessing data and business logic.
 * @param onNavigateToCreateTask A callback to navigate to the task creation screen for a specific child.
 * @param onNavigateToReview A callback to navigate to the screen for reviewing completed tasks.
 * @param onNavigateToSubscription A callback to navigate to the subscription management screen.
 */
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    onNavigateToCreateTask: (String) -> Unit,
    onNavigateToReview: () -> Unit,
    onNavigateToSubscription: () -> Unit,
    onNavigateToUsageRules: (String) -> Unit = {}
) {
    val children by viewModel.children.collectAsState()

    Column(modifier = Modifier
        .fillMaxSize()
        .padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(stringResource(R.string.paired_devices), style = MaterialTheme.typography.h4)
            Row {
                Button(onClick = onNavigateToReview) { Text(stringResource(R.string.review_tasks)) }
                Spacer(modifier = Modifier.width(8.dp))
                Button(onClick = onNavigateToSubscription) { Text(stringResource(R.string.go_premium)) }
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(children) { child ->
                ChildDeviceItem(
                    child = child,
                    onLockToggle = { isLocked -> viewModel.setDeviceLocked(child.id, isLocked) },
                    onCreateTaskClick = { onNavigateToCreateTask(child.id) },
                    onUsageRulesClick = { onNavigateToUsageRules(child.id) }
                )
            }
        }
    }
}

/**
 * A Composable that displays a single child device in a [Card].
 *
 * It shows the child's ID, online status, and provides a [Switch] to remotely lock or
 * unlock the device. It also includes a button to create a new task for this specific child.
 *
 * @param child The [ChildDevice] data to display.
 * @param onLockToggle A callback invoked with the new state when the lock switch is toggled.
 * @param onCreateTaskClick A callback invoked when the "Create Task" button is clicked.
 */
@Composable
fun ChildDeviceItem(
    child: ChildDevice,
    onLockToggle: (Boolean) -> Unit,
    onCreateTaskClick: () -> Unit,
    onUsageRulesClick: () -> Unit = {}
) {
    Card(elevation = 4.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = stringResource(R.string.child_id_label, child.id), style = MaterialTheme.typography.h6)
                    Spacer(modifier = Modifier.height(4.dp))
                    val isOnline = child.lastSeen?.let {
                        val now = System.currentTimeMillis() / 1000
                        (now - it) < TimeUnit.MINUTES.toSeconds(20)
                    } ?: false
                    Text(
                        text = if (isOnline) stringResource(R.string.device_online) else stringResource(R.string.device_offline),
                        color = if (isOnline) Color.Green else Color.Gray
                    )
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(stringResource(R.string.device_locked))
                    Switch(checked = child.isLocked, onCheckedChange = onLockToggle)
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)
            ) {
                Button(onClick = onCreateTaskClick) {
                    Text(stringResource(R.string.create_task))
                }
                OutlinedButton(onClick = onUsageRulesClick) {
                    Text(stringResource(R.string.usage_rules))
                }
            }
        }
    }
}
