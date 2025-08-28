package com.minimaster.masterapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.Card
import androidx.compose.material.MaterialTheme
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

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    onNavigateToCreateTask: (String) -> Unit,
    onNavigateToReview: () -> Unit,
    onNavigateToSubscription: () -> Unit
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
                Button(onClick = onNavigateToReview) {
                    Text(stringResource(R.string.review_tasks))
                }
                Spacer(modifier = Modifier.width(8.dp))
                Button(onClick = onNavigateToSubscription) {
                    Text(stringResource(R.string.go_premium))
                }
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(children) { child ->
                ChildDeviceItem(
                    child = child,
                    onLockToggle = { isLocked ->
                        viewModel.setDeviceLocked(child.id, isLocked)
                    },
                    onCreateTaskClick = { onNavigateToCreateTask(child.id) }
                )
            }
        }
    }
}

@Composable
fun ChildDeviceItem(
    child: ChildDevice,
    onLockToggle: (Boolean) -> Unit,
    onCreateTaskClick: () -> Unit
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
                    Switch(
                        checked = child.isLocked,
                        onCheckedChange = onLockToggle
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
            Button(onClick = onCreateTaskClick, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                Text(stringResource(R.string.create_task))
            }
        }
    }
}
