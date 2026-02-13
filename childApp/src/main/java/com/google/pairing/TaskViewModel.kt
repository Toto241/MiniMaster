package com.google.pairing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * A [ViewModel] that provides the current (most recent non-approved) task for the child device.
 *
 * This ViewModel is used by the [LockScreen] and [ProofSubmissionScreen] to observe the
 * current active task in real-time via Firestore snapshot listeners.
 *
 * @property taskRepository The repository for task data operations.
 */
@HiltViewModel
class TaskViewModel @Inject constructor(
    private val taskRepository: TaskRepository
) : ViewModel() {

    private val _currentTask = MutableStateFlow<TaskModel?>(null)
    /** A [StateFlow] emitting the current active task, or null if there is none. */
    val currentTask: StateFlow<TaskModel?> = _currentTask.asStateFlow()

    init {
        viewModelScope.launch {
            taskRepository.observeCurrentTask().collect { task ->
                _currentTask.value = task
            }
        }
    }
}
