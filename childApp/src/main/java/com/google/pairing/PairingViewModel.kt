package com.google.pairing

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import com.google.pairing.di.IoDispatcher
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Represents the different states of the device pairing process.
 * This sealed class is used to drive the UI in [PairingScreen].
 */
sealed class PairingState {
    /** The initial state before any pairing attempt has been made. */
    object Idle : PairingState()
    /** The state when the pairing token is currently being validated with the backend. */
    object Loading : PairingState()
    /** The state when the device has been successfully paired. */
    object Success : PairingState()
    /** The state when an error has occurred during pairing. */
    data class Error(val message: String) : PairingState()
}

/**
 * A [ViewModel] responsible for the business logic of pairing the child device
 * with a master account.
 *
 * It communicates with the Firebase backend to validate a pairing token and, upon
 * success, saves the returned child ID using the [ChildIdRepository].
 *
 * @property childIdRepository The repository for persisting the child ID.
 * @property functions The Firebase Functions instance for making backend calls.
 * @property ioDispatcher The coroutine dispatcher for background operations.
 */
@HiltViewModel
class PairingViewModel @Inject constructor(
    private val childIdRepository: ChildIdRepository,
    private val functions: FirebaseFunctions,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {

    private val _pairingState = MutableStateFlow<PairingState>(PairingState.Idle)
    /**
     * A [StateFlow] representing the current state of the pairing process.
     * The UI observes this flow to show loading indicators, success messages, or error alerts.
     */
    val pairingState: StateFlow<PairingState> = _pairingState.asStateFlow()

    private val _childImeiForDebug = MutableStateFlow<String?>(null)
    /** A [StateFlow] that holds the child's IMEI, primarily for debugging purposes. */
    val childImeiForDebug: StateFlow<String?> = _childImeiForDebug.asStateFlow()

    /**
     * Initiates the token validation process.
     *
     * It calls the `validatePairingToken` cloud function with the provided token and the
     * device's IMEI. The ViewModel's state is updated based on the outcome of this call.
     *
     * @param token The pairing token received from the deep link.
     * @param childImei The unique identifier (e.g., IMEI) of the child device.
     */
    fun validateToken(token: String, childImei: String) {
        _childImeiForDebug.value = childImei

        viewModelScope.launch(ioDispatcher) {
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
                    "Error (
                    ${e.code}): ${e.message}"
                } else {
                    e.message ?: "An unknown error occurred."
                }
                Log.e("PairingViewModel", "Error validating token: $errorMessage", e)
                _pairingState.value = PairingState.Error(errorMessage)
            }
        }
    }
}