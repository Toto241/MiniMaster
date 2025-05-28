package com.google.pairing

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import android.util.Log // Import Log

class PairingViewModel(
    private val childIdRepository: ChildIdRepository,
    private val firestore: FirebaseFirestore // Added FirebaseFirestore dependency
) : ViewModel() {

    private val _showExpiredCodeError = MutableLiveData<Boolean>()
    val showExpiredCodeError: LiveData<Boolean> = _showExpiredCodeError

    private val _showInvalidCodeError = MutableLiveData<Boolean>() // For missing/invalid expiresAt
    val showInvalidCodeError: LiveData<Boolean> = _showInvalidCodeError

    private val _showChildIdSaveError = MutableLiveData<Boolean>() // For errors during childId saving
    val showChildIdSaveError: LiveData<Boolean> = _showChildIdSaveError

    private val _isLoading = MutableLiveData<Boolean>(false) // Initialize with false
    val isLoading: LiveData<Boolean> = _isLoading

    // Simulate a successful pairing event
    fun onPairingSuccess(childId: String, pairingCode: String) { // Added pairingCode parameter
        viewModelScope.launch {
            _isLoading.value = true // Start loading for saving and deleting
            _showChildIdSaveError.value = false // Reset error state
            try {
                // Save childId locally
                childIdRepository.saveChildId(childId)

                // After successfully saving childId, delete the pairing code from Firestore
                try {
                    firestore.collection("pairingCodes").document(pairingCode).delete().await()
                    Log.d("PairingViewModel", "Pairing code $pairingCode deleted successfully.")
                } catch (e: Exception) {
                    // Log error if deleting pairing code fails, but pairing is still "successful" locally
                    Log.e("PairingViewModel", "Error deleting pairing code $pairingCode: ${e.message}", e)
                    // Optionally, set a specific LiveData for this kind of error if UI needs to react
                    // No user-facing error here as childId saving was successful.
                }

            } catch (e: Exception) {
                // Log error if saving childId fails
                Log.e("PairingViewModel", "Error saving childId: ${e.message}", e)
                _showChildIdSaveError.value = true // Set error state for UI
            } finally {
                _isLoading.value = false // Stop loading
            }
        }
    }

    fun validatePairingCode(code: String) {
        viewModelScope.launch {
            _isLoading.value = true // Start loading
            _showExpiredCodeError.value = false // Reset error states
            _showInvalidCodeError.value = false // Reset error states
            _showChildIdSaveError.value = false // Reset error states
            try {
                val documentSnapshot = firestore.collection("pairingCodes").document(code).get().await()
                if (documentSnapshot.exists()) {
                    val expiresAt = documentSnapshot.getTimestamp("expiresAt")
                    val childId = documentSnapshot.getString("childId") // Get childId from document

                    if (expiresAt != null && childId != null) {
                        if (Timestamp.now().seconds > expiresAt.seconds) {
                            _showExpiredCodeError.value = true
                        } else {
                            // Code is valid and not expired, proceed with pairing by calling onPairingSuccess
                            onPairingSuccess(childId, code) // Pass childId and code
                        }
                    } else {
                        // expiresAt field is missing, not a Timestamp, or childId is missing
                        _showInvalidCodeError.value = true
                    }
                } else {
                    // Document does not exist
                    _showInvalidCodeError.value = true
                }
            } catch (e: Exception) {
                // Handle other exceptions, e.g., network issues
                Log.e("PairingViewModel", "Error validating pairing code: ${e.message}", e)
                _showInvalidCodeError.value = true
            } finally {
                // isLoading is handled by onPairingSuccess if validation is successful,
                // or here if validation fails directly.
                if (_showExpiredCodeError.value == true || _showInvalidCodeError.value == true) {
                    _isLoading.value = false // Stop loading if validation failed directly
                }
            }
        }
    }
}
