package com.minimaster.masterapp

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

/**
 * Screen for configuring usage rules for a child device.
 * Supports global daily limit, allowed time window, and per-app limits.
 */
@Composable
fun UsageRulesScreen(
    viewModel: UsageRulesViewModel = hiltViewModel(),
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsState()
    val scaffoldState = rememberScaffoldState()

    LaunchedEffect(state.error) {
        state.error?.let {
            scaffoldState.snackbarHostState.showSnackbar(it)
            viewModel.errorShown()
        }
    }

    LaunchedEffect(state.saveSuccess) {
        if (state.saveSuccess) {
            scaffoldState.snackbarHostState.showSnackbar("Rules saved successfully")
            viewModel.errorShown()
        }
    }

    Scaffold(
        scaffoldState = scaffoldState,
        topBar = {
            TopAppBar(
                title = { Text("Usage Rules") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Section: Daily Limit
            Text("Daily Screen Time Limit", style = MaterialTheme.typography.h6)
            var dailyLimitText by remember { mutableStateOf(if (state.dailyLimitMinutes > 0) state.dailyLimitMinutes.toString() else "") }
            OutlinedTextField(
                value = dailyLimitText,
                onValueChange = {
                    dailyLimitText = it
                    val minutes = it.toIntOrNull() ?: 0
                    viewModel.updateDailyLimit(minutes)
                },
                label = { Text("Minutes per day (0 = unlimited)") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )

            Divider()

            // Section: Allowed Time Window
            Text("Allowed Time Window", style = MaterialTheme.typography.h6)
            Text(
                "Set a time window when the device can be used. Outside this window, all apps are blocked.",
                style = MaterialTheme.typography.caption
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                var startTime by remember { mutableStateOf(state.allowedStartTime) }
                var endTime by remember { mutableStateOf(state.allowedEndTime) }

                OutlinedTextField(
                    value = startTime,
                    onValueChange = {
                        startTime = it
                        viewModel.updateAllowedStartTime(it)
                    },
                    label = { Text("Start (HH:MM)") },
                    placeholder = { Text("08:00") },
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = endTime,
                    onValueChange = {
                        endTime = it
                        viewModel.updateAllowedEndTime(it)
                    },
                    label = { Text("End (HH:MM)") },
                    placeholder = { Text("20:00") },
                    modifier = Modifier.weight(1f)
                )
            }

            Divider()

            // Section: Per-App Limits
            Text("Per-App Time Limits", style = MaterialTheme.typography.h6)
            Text(
                "Set individual time limits for specific apps.",
                style = MaterialTheme.typography.caption
            )

            state.perAppLimits.forEach { (pkg, minutes) ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(pkg, style = MaterialTheme.typography.body1)
                        Text("$minutes min/day", style = MaterialTheme.typography.caption)
                    }
                    IconButton(onClick = { viewModel.removePerAppLimit(pkg) }) {
                        Icon(Icons.Default.Delete, contentDescription = "Remove limit")
                    }
                }
            }

            // Add new per-app limit
            var newPkg by remember { mutableStateOf("") }
            var newLimit by remember { mutableStateOf("") }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                OutlinedTextField(
                    value = newPkg,
                    onValueChange = { newPkg = it },
                    label = { Text("Package name") },
                    modifier = Modifier.weight(2f)
                )
                OutlinedTextField(
                    value = newLimit,
                    onValueChange = { newLimit = it },
                    label = { Text("Min") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f)
                )
                Button(
                    onClick = {
                        val limit = newLimit.toIntOrNull()
                        if (newPkg.isNotBlank() && limit != null && limit > 0) {
                            viewModel.addPerAppLimit(newPkg.trim(), limit)
                            newPkg = ""
                            newLimit = ""
                        }
                    }
                ) {
                    Text("Add")
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Save Button
            Button(
                onClick = { viewModel.saveRules() },
                enabled = !state.isSaving,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (state.isSaving) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text("Save Rules")
            }
        }
    }
}
