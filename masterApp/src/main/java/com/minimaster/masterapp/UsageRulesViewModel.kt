package com.minimaster.masterapp

import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

data class UsageRulesState(
    val dailyLimitMinutes: Int = 0,
    val allowedStartTime: String = "",
    val allowedEndTime: String = "",
    val perAppLimits: Map<String, Int> = emptyMap(),
    val isSaving: Boolean = false,
    val saveSuccess: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class UsageRulesViewModel @Inject constructor(
    private val functions: FirebaseFunctions,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    val childId: String = savedStateHandle["childId"] ?: ""

    private val _state = MutableStateFlow(UsageRulesState())
    val state: StateFlow<UsageRulesState> = _state.asStateFlow()

    private val TAG = "UsageRulesViewModel"

    fun updateDailyLimit(minutes: Int) {
        _state.value = _state.value.copy(dailyLimitMinutes = minutes)
    }

    fun updateAllowedStartTime(time: String) {
        _state.value = _state.value.copy(allowedStartTime = time)
    }

    fun updateAllowedEndTime(time: String) {
        _state.value = _state.value.copy(allowedEndTime = time)
    }

    fun addPerAppLimit(packageName: String, limitMinutes: Int) {
        val updated = _state.value.perAppLimits.toMutableMap()
        updated[packageName] = limitMinutes
        _state.value = _state.value.copy(perAppLimits = updated)
    }

    fun removePerAppLimit(packageName: String) {
        val updated = _state.value.perAppLimits.toMutableMap()
        updated.remove(packageName)
        _state.value = _state.value.copy(perAppLimits = updated)
    }

    fun errorShown() {
        _state.value = _state.value.copy(error = null, saveSuccess = false)
    }


    fun saveRules() {
        if (childId.isEmpty()) {
            _state.value = _state.value.copy(error = "No child selected.")
            return
        }

        viewModelScope.launch {
            _state.value = _state.value.copy(isSaving = true, error = null)

            val current = _state.value
            val usageRules = mutableMapOf<String, Any>()

            if (current.dailyLimitMinutes > 0) {
                usageRules["dailyLimitSeconds"] = current.dailyLimitMinutes * 60
            }

            if (current.allowedStartTime.isNotEmpty() && current.allowedEndTime.isNotEmpty()) {
                usageRules["allowedHours"] = mapOf(
                    "start" to current.allowedStartTime,
                    "end" to current.allowedEndTime
                )
            }

            if (current.perAppLimits.isNotEmpty()) {
                val appLimitsSeconds = mutableMapOf<String, Any>()
                current.perAppLimits.forEach { (pkg, minutes) ->
                    appLimitsSeconds[pkg] = minutes * 60
                }
                usageRules["appLimits"] = appLimitsSeconds
            }

            val data = hashMapOf(
                "childId" to childId,
                "usageRules" to usageRules
            )

            try {
                functions.getHttpsCallable("setUsageRules").call(data).await()
                _state.value = _state.value.copy(isSaving = false, saveSuccess = true)
                Log.d(TAG, "Usage rules saved for child $childId")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save usage rules", e)
                _state.value = _state.value.copy(
                    isSaving = false,
                    error = "Failed to save rules: ${e.message}"
                )
            }
        }
    }
}
