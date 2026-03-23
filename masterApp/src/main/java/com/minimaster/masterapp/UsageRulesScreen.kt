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
import androidx.compose.ui.res.stringResource
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
    val rulesSavedMessage = stringResource(R.string.rules_saved_successfully)

    LaunchedEffect(state.error) {
        state.error?.let {
            scaffoldState.snackbarHostState.showSnackbar(it)
            viewModel.errorShown()
        }
    }

    LaunchedEffect(state.saveSuccess) {
        if (state.saveSuccess) {
            scaffoldState.snackbarHostState.showSnackbar(rulesSavedMessage)
            viewModel.errorShown()
        }
    }

    Scaffold(
        scaffoldState = scaffoldState,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.usage_rules)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = stringResource(R.string.usage_rules_back))
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
            Text(stringResource(R.string.daily_screen_time_limit), style = MaterialTheme.typography.h6)
            var dailyLimitText by remember { mutableStateOf(if (state.dailyLimitMinutes > 0) state.dailyLimitMinutes.toString() else "") }
            OutlinedTextField(
                value = dailyLimitText,
                onValueChange = {
                    dailyLimitText = it
                    val minutes = it.toIntOrNull() ?: 0
                    viewModel.updateDailyLimit(minutes)
                },
                label = { Text(stringResource(R.string.minutes_per_day)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth()
            )

            Divider()

            // Section: Allowed Time Window
            Text(stringResource(R.string.allowed_time_window), style = MaterialTheme.typography.h6)
            Text(
                stringResource(R.string.allowed_time_window_description),
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
                    label = { Text(stringResource(R.string.start_time_label)) },
                    placeholder = { Text("08:00") },
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = endTime,
                    onValueChange = {
                        endTime = it
                        viewModel.updateAllowedEndTime(it)
                    },
                    label = { Text(stringResource(R.string.end_time_label)) },
                    placeholder = { Text("20:00") },
                    modifier = Modifier.weight(1f)
                )
            }

            Divider()

            // Section: Per-App Limits
            Text(stringResource(R.string.per_app_time_limits), style = MaterialTheme.typography.h6)
            Text(
                stringResource(R.string.per_app_time_limits_description),
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
                        Text(stringResource(R.string.minutes_per_day_short, minutes), style = MaterialTheme.typography.caption)
                    }
                    IconButton(onClick = { viewModel.removePerAppLimit(pkg) }) {
                        Icon(Icons.Default.Delete, contentDescription = stringResource(R.string.remove_limit))
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
                    label = { Text(stringResource(R.string.package_name)) },
                    modifier = Modifier.weight(2f)
                )
                OutlinedTextField(
                    value = newLimit,
                    onValueChange = { newLimit = it },
                    label = { Text(stringResource(R.string.minutes_short)) },
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
                    Text(stringResource(R.string.add))
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
                Text(stringResource(R.string.save_rules))
            }
        }
    }
}
