package com.google.pairing

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.Text
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
 */
@Composable
fun LockScreen(childId: String, onNavigateToTasks: () -> Unit) {
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
