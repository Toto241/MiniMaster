package com.google.pairing

import androidx.compose.ui.test.assertDoesNotExist
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

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

        composeTestRule.onNodeWithText("Complete").assertDoesNotExist()
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
