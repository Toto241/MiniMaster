package com.google.pairing

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import android.graphics.PixelFormat
import android.os.Build
import android.view.WindowManager

@RunWith(AndroidJUnit4::class)
class CommissioningChildUiFlowTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun phase2_2_pendingTask_showsAndTriggersCompleteButton() {
        var completeClicked = false

        composeTestRule.setContent {
            TaskItem(
                task = Task(
                    id = "task-1",
                    description = "Bring out trash",
                    status = "pending"
                ),
                onCompleteClick = { completeClicked = true }
            )
        }

        composeTestRule.onNodeWithText("Complete").assertIsDisplayed().performClick()
        assertTrue("Complete callback must be triggered", completeClicked)
    }

    @Test
    fun phase2_3_pendingApprovalTask_hidesCompleteButton() {
        composeTestRule.setContent {
            TaskItem(
                task = Task(
                    id = "task-2",
                    description = "Homework",
                    status = "pending_approval"
                ),
                onCompleteClick = {}
            )
        }

        composeTestRule.onAllNodesWithText("Complete").assertCountEquals(0)
    }

    @Test
    fun phase3_2_taskLock_pendingTask_showsProofSubmission() {
        composeTestRule.setContent {
            TaskLockScreenContent(
                task = TaskModel(
                    taskId = "task-3",
                    description = "Clean room",
                    status = TaskStatus.PENDING.value
                )
            )
        }

        composeTestRule.onNodeWithText("Task Required").assertIsDisplayed()
        composeTestRule.onNodeWithText("Submit Proof").assertIsDisplayed()
    }

    @Test
    fun phase3_2_blockingOverlay_enforcesFullScreenMessageAndLayout() {
        val params = BlockingOverlayService.createOverlayLayoutParams()
        val message = BlockingOverlayService.buildOverlayMessage("com.example.blocked")

        assertEquals(WindowManager.LayoutParams.MATCH_PARENT, params.width)
        assertEquals(WindowManager.LayoutParams.MATCH_PARENT, params.height)
        assertEquals(PixelFormat.TRANSLUCENT, params.format)
        assertTrue(params.flags and WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN != 0)
        assertTrue(params.flags and WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED != 0)
        assertEquals(
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            } else {
                WindowManager.LayoutParams.TYPE_PHONE
            },
            params.type,
        )
        assertTrue(message.contains("com.example.blocked"))
        assertTrue(message.contains("blocked by your parents"))
        assertEquals("Access Restricted", BlockingOverlayService.OVERLAY_TITLE)
        assertEquals("Go Back", BlockingOverlayService.OVERLAY_BUTTON_TEXT)
    }

    @Test
    fun phase3_3_taskLock_pendingApproval_showsWaitingState() {
        composeTestRule.setContent {
            TaskLockScreenContent(
                task = TaskModel(
                    taskId = "task-4",
                    description = "Wash dishes",
                    status = TaskStatus.PENDING_APPROVAL.value
                )
            )
        }

        composeTestRule
            .onNodeWithText("Proof submitted. Waiting for parent approval.")
            .assertIsDisplayed()
    }
}
