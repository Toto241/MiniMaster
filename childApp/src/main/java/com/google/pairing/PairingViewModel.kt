package com.google.pairing

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import com.google.firebase.functions.ktx.functions
import com.google.firebase.ktx.Firebase
import kotlinx.coroutines.launch
import android.util.Log // Import Log
// Remove com.google.firebase.Timestamp and com.google.firebase.firestore.FirebaseFirestore if no longer needed
// import com.google.firebase.Timestamp // No longer needed for direct Firestore date comparison
// import com.google.firebase.firestore.FirebaseFirestore // No longer needed for direct Firestore access

class PairingViewModel(
    private val childIdRepository: ChildIdRepository
    // private val firestore: FirebaseFirestore // Firestore direct access removed
) : ViewModel() {

    private val functions = Firebase.functions("europe-west1") // Or your specific region

    private val _showExpiredCodeError = MutableLiveData<Boolean>()
    val showExpiredCodeError: LiveData<Boolean> = _showExpiredCodeError

    private val _showInvalidCodeError = MutableLiveData<Boolean>() // For missing/invalid expiresAt
    val showInvalidCodeError: LiveData<Boolean> = _showInvalidCodeError

    private val _showChildIdSaveError = MutableLiveData<Boolean>() // For errors during childId saving
    val showChildIdSaveError: LiveData<Boolean> = _showChildIdSaveError

    private val _isLoading = MutableLiveData<Boolean>(false) // Initialize with false
    val isLoading: LiveData<Boolean> = _isLoading

    // This function is now significantly simplified or can be removed if all logic moves to validatePairingCode.
    // For now, let's assume it's called after successful validation and childId retrieval.
    private fun handleSuccessfulValidation(childId: String) {
        viewModelScope.launch {
            _isLoading.value = true // Ensure loading state remains true during save
            _showChildIdSaveError.value = false
            try {
                childIdRepository.saveChildId(childId)
                Log.d("PairingViewModel", "ChildId $childId saved successfully.")
                // Navigation to LockScreen will be triggered by MainActivity observing childId
            } catch (e: Exception) {
                Log.e("PairingViewModel", "Failed to save childId $childId", e)
                _showChildIdSaveError.value = true
            } finally {
                _isLoading.value = false // Stop loading after save attempt
            }
        }
    }

    fun validatePairingCode(code: String) {
        _isLoading.value = true
        _showExpiredCodeError.value = false
        _showInvalidCodeError.value = false
        _showChildIdSaveError.value = false

        val data = hashMapOf("pairingCode" to code)

        functions.getHttpsCallable("validatePairingCode")
            .call(data)
            .continueWith { task ->
                // isLoading is set to false only after all processing (success or failure)
                // or handled within handleSuccessfulValidation if it's a long operation.
                // For simplicity, we'll set it false after the initial callback processing.

                if (task.isSuccessful) {
                    val result = task.result?.data as? Map<String, Any>
                    val childId = result?.get("childId") as? String
                    if (childId != null) {
                        // Code is valid, childId received.
                        // The pairingCode document is deleted server-side.
                        Log.d("PairingViewModel", "Cloud function success, childId: $childId")
                        handleSuccessfulValidation(childId)
                        // isLoading will be managed by handleSuccessfulValidation
                    } else {
                        Log.e("PairingViewModel", "Cloud function returned success but no childId or invalid format.")
                        _showInvalidCodeError.value = true
                        _isLoading.value = false // Stop loading on this path
                    }
                } else {
                    // Error calling the Cloud Function
                    val exception = task.exception
                    if (exception is FirebaseFunctionsException) {
                        val errorCode = exception.code
                        val errorMessage = exception.message
                        Log.e("PairingViewModel", "Cloud function error: Code: $errorCode, Message: $errorMessage", exception.details)
                        when (errorCode) {
                            FirebaseFunctionsException.Code.NOT_FOUND -> _showInvalidCodeError.value = true
                            FirebaseFunctionsException.Code.DEADLINE_EXCEEDED -> _showExpiredCodeError.value = true
                            FirebaseFunctionsException.Code.INVALID_ARGUMENT -> _showInvalidCodeError.value = true // If server uses this
                            else -> _showInvalidCodeError.value = true // Generic cloud function error
                        }
                    } else {
                        Log.e("PairingViewModel", "Non-FirebaseFunctionsException during cloud call: ", exception)
                        _showInvalidCodeError.value = true // Generic error
                    }
                    _isLoading.value = false // Stop loading on this path
                }
            }
    }
}
