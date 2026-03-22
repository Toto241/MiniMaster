package com.minimaster.masterapp

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodes
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.onFirst
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CommissioningMasterUiFlowTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun phase2_1_createTaskForm_submitsValidInput() {
        var submittedDescription: String? = null
        var submittedDeadline: Long? = null

        composeTestRule.setContent {
            CreateTaskScreen(
                onTaskCreate = { description, deadline ->
                    submittedDescription = description
                    submittedDeadline = deadline
                },
                onBack = {}
            )
        }

        composeTestRule.onNodeWithText("Task Description").assertIsDisplayed()
        composeTestRule.onNodeWithText("Deadline (Unix Timestamp)").assertIsDisplayed()

        composeTestRule
            .onNodeWithText("Task Description")
            .performTextInput("Commissioning task")

        val futureDeadline = (System.currentTimeMillis() + 3600_000).toString()
        composeTestRule
            .onNodeWithText("Deadline (Unix Timestamp)")
            .performTextInput(futureDeadline)

        composeTestRule.onNodeWithText("Create Task").assertIsEnabled().performClick()

        assertEquals("Commissioning task", submittedDescription)
        assertEquals(futureDeadline.toLong(), submittedDeadline)
    }

    @Test
    fun phase2_3_taskReviewItem_triggersApproveAction() {
        var approveClicked = false

        composeTestRule.setContent {
            TaskReviewItem(
                task = ReviewableTask(
                    taskId = "task-1",
                    childId = "child-1",
                    description = "Upload proof",
                    photoUrl = "https://example.com/proof.jpg"
                ),
                onApproveClick = { approveClicked = true }
            )
        }

        composeTestRule.onNodeWithText("Approve Task").assertIsDisplayed().performClick()
        assertTrue("Approve callback must be triggered", approveClicked)
    }

    @Test
    fun phase3_1_childCard_triggersCreateTaskAction() {
        var createTaskClicked = false

        composeTestRule.setContent {
            ChildDeviceItem(
                child = ChildDevice(id = "child-commissioning", isLocked = false, lastSeen = null),
                onLockToggle = {},
                onCreateTaskClick = { createTaskClicked = true },
                onUsageRulesClick = {}
            )
        }

        composeTestRule.onNodeWithText("Create Task").assertIsDisplayed().performClick()
        assertTrue("Create task callback must be triggered", createTaskClicked)
    }

    @Test
    fun phase3_3_childCard_lockSwitch_togglesState() {
        var toggledState: Boolean? = null

        composeTestRule.setContent {
            ChildDeviceItem(
                child = ChildDevice(id = "child-lock", isLocked = false, lastSeen = null),
                onLockToggle = { toggledState = it },
                onCreateTaskClick = {},
                onUsageRulesClick = {}
            )
        }

        composeTestRule.onAllNodes(isToggleable()).onFirst().performClick()
        assertEquals(true, toggledState)
    }
}
