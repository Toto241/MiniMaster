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
    data class Success(val secretKey: String) : RegistrationState()
    data class Error(val message: String) : RegistrationState()
}

@HiltViewModel
class MasterViewModel @Inject constructor(
    private val functions: FirebaseFunctions
) : ViewModel() {

    private val _registrationState = MutableStateFlow<RegistrationState>(RegistrationState.Idle)
    val registrationState: StateFlow<RegistrationState> = _registrationState.asStateFlow()

    fun registerDevice(imei: String) {
        viewModelScope.launch {
            _registrationState.value = RegistrationState.Loading

            val data = hashMapOf("imei" to imei)

            try {
                val result = functions.getHttpsCallable("registerMasterDevice").call(data).await()
                val secretKey = (result.data as? Map<String, Any>)?.get("secretKey") as? String
                if (secretKey != null) {
                    _registrationState.value = RegistrationState.Success("Success! Your secret key is: $secretKey")
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
}
