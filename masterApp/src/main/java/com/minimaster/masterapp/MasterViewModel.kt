package com.minimaster.masterapp

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

sealed class RegistrationState {
    object Idle : RegistrationState()
    object Loading : RegistrationState()
    data class Success(val successMessage: String) : RegistrationState()
    data class Error(val message: String) : RegistrationState()
}

sealed class LinkGenerationState {
    object Idle : LinkGenerationState()
    object Loading : LinkGenerationState()
    data class Success(val pairingToken: String) : LinkGenerationState()
    data class Error(val message: String) : LinkGenerationState()
}

@HiltViewModel
class MasterViewModel @Inject constructor(
    private val functions: FirebaseFunctions
) : ViewModel() {

    private var imei: String? = null
    private var secretKey: String? = null

    private val _registrationState = MutableStateFlow<RegistrationState>(RegistrationState.Idle)
    val registrationState: StateFlow<RegistrationState> = _registrationState.asStateFlow()

    private val _linkGenerationState = MutableStateFlow<LinkGenerationState>(LinkGenerationState.Idle)
    val linkGenerationState: StateFlow<LinkGenerationState> = _linkGenerationState.asStateFlow()

    fun registerDevice(imei: String) {
        viewModelScope.launch {
            _registrationState.value = RegistrationState.Loading

            val data = hashMapOf("imei" to imei)

            try {
                val result = functions.getHttpsCallable("registerMasterDevice").call(data).await()
                val key = (result.data as? Map<String, Any>)?.get("secretKey") as? String
                if (key != null) {
                    // Store credentials for later use
                    this@MasterViewModel.imei = imei
                    this@MasterViewModel.secretKey = key
                    _registrationState.value = RegistrationState.Success("Device registered successfully!")
                } else {
                     _registrationState.value = RegistrationState.Error("Backend returned no secret key.")
                }
            } catch (e: Exception) {
                val errorMessage = if (e is FirebaseFunctionsException) {
                    "Error (${e.code}): ${e.message}"
                } else {
                    e.message ?: "An unknown error occurred."
                }
                _registrationState.value = RegistrationState.Error(errorMessage)
            }
        }
    }

    fun generateLink() {
        val currentImei = imei
        val currentSecret = secretKey
        if (currentImei == null || currentSecret == null) {
            _linkGenerationState.value = LinkGenerationState.Error("Device not registered yet.")
            return
        }

        viewModelScope.launch {
            _linkGenerationState.value = LinkGenerationState.Loading
            val data = hashMapOf("imei" to currentImei, "secretKey" to currentSecret)

            try {
                val result = functions.getHttpsCallable("generatePairingLink").call(data).await()
                val token = (result.data as? Map<String, Any>)?.get("pairingToken") as? String
                if (token != null) {
                    _linkGenerationState.value = LinkGenerationState.Success("Pairing Token: $token")
                } else {
                    _linkGenerationState.value = LinkGenerationState.Error("Backend returned no token.")
                }
            } catch (e: Exception) {
                 val errorMessage = if (e is FirebaseFunctionsException) {
                    "Error (${e.code}): ${e.message}"
                } else {
                    e.message ?: "An unknown error occurred."
                }
                _linkGenerationState.value = LinkGenerationState.Error(errorMessage)
            }
        }
    }
}
