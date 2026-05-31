package com.google.pairing

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseAuth
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
 * A [ViewModel] responsible for the business logic of pairing the child device
 * with a master account.
 */
@HiltViewModel
class PairingViewModel @Inject constructor(
    private val childIdRepository: ChildIdRepository,
    private val functions: FirebaseFunctions,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : ViewModel() {

    private var firebaseAuth: FirebaseAuth? = null
    private fun auth(): FirebaseAuth = firebaseAuth ?: FirebaseAuth.getInstance().also { firebaseAuth = it }

    private val _pairingState = MutableStateFlow<PairingState>(PairingState.Idle)
    val pairingState: StateFlow<PairingState> = _pairingState.asStateFlow()

    private val _stableDeviceIdForDebug = MutableStateFlow<String?>(null)
    val stableDeviceIdForDebug: StateFlow<String?> = _stableDeviceIdForDebug.asStateFlow()

    /**
     * Validates a pairing token using the authenticated child flow.
     *
     * @param token The pairing token received from the deep link or manual entry.
     * @param stableDeviceId Optional app-scoped device identifier for debug display only.
     */
    fun validateToken(token: String, stableDeviceId: String? = null) {
        _stableDeviceIdForDebug.value = stableDeviceId?.takeIf { it.isNotBlank() }

        viewModelScope.launch(ioDispatcher) {
            _pairingState.value = PairingState.Loading

            try {
                val auth = auth()
                val firebaseUser = auth.currentUser ?: auth.signInAnonymously().await().user
                if (firebaseUser == null) {
                    _pairingState.value = PairingState.Error("Firebase authentication failed.")
                    return@launch
                }

                val data = hashMapOf(
                    "pairingToken" to token
                )

                val result = functions.getHttpsCallable("pairAuthenticatedChild").call(data).await()
                val payload = result.getData() as? Map<String, Any>
                val childId = payload?.get("childId") as? String

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

    internal fun setFirebaseAuthForTesting(auth: FirebaseAuth) {
        this.firebaseAuth = auth
    }
}
