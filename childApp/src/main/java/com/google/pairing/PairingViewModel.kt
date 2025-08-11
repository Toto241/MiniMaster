package com.google.pairing

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

sealed class PairingState {
    object Idle : PairingState()
    object Loading : PairingState()
    object Success : PairingState()
    data class Error(val message: String) : PairingState()
}

@HiltViewModel
class PairingViewModel @Inject constructor(
    private val childIdRepository: ChildIdRepository,
    private val functions: FirebaseFunctions
) : ViewModel() {

    private val _pairingState = MutableStateFlow<PairingState>(PairingState.Idle)
    val pairingState: StateFlow<PairingState> = _pairingState.asStateFlow()
    
    private val _childImeiForDebug = MutableStateFlow<String?>(null)
    val childImeiForDebug: StateFlow<String?> = _childImeiForDebug.asStateFlow()

    fun validateToken(token: String, childImei: String) {
        _childImeiForDebug.value = childImei // Store for debug view

        viewModelScope.launch {
            _pairingState.value = PairingState.Loading

            val data = hashMapOf(
                "pairingToken" to token,
                "childImei" to childImei
            )

            try {
                val result = functions.getHttpsCallable("validatePairingToken").call(data).await()
                val childId = (result.data as? Map<String, Any>)?.get("childId") as? String

                if (childId != null) {
                    childIdRepository.saveChildId(childId)
                    _pairingState.value = PairingState.Success
                } else {
                    _pairingState.value = PairingState.Error("Backend returned no childId.")
                }
            } catch (e: Exception) {
                val errorMessage = if (e is FirebaseFunctionsException) {
                    "Error (${e.code}): ${e.message}"
                } else {
                    e.message ?: "An unknown error occurred."
                }
                Log.e("PairingViewModel", "Error validating token: $errorMessage", e)
                _pairingState.value = PairingState.Error(errorMessage)
            }
        }
    }
}
