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

    // Simulate a successful pairing event
    fun onPairingSuccess(childId: String, pairingCode: String) { // Added pairingCode parameter
        viewModelScope.launch {
            try {
                // Save childId locally
                childIdRepository.saveChildId(childId)

                // After successfully saving childId, delete the pairing code from Firestore
                firestore.collection("pairingCodes").document(pairingCode).delete().await()
                Log.d("PairingViewModel", "Pairing code $pairingCode deleted successfully.")

            } catch (e: Exception) {
                // Log error if saving childId fails
                Log.e("PairingViewModel", "Error saving childId or deleting pairing code $pairingCode: ${e.message}", e)
                // If deleting the pairing code fails, we log the error.
                // The pairing is still considered successful at this point because childId was saved.
                // We can also check specifically for firestore.collection...delete() failure if needed
                // by separating the try-catch blocks or checking the exception type.
                // For now, any exception in the block will be caught here.
            }
        }
    }

    fun validatePairingCode(code: String) {
        viewModelScope.launch {
            _showExpiredCodeError.value = false // Reset error states
            _showInvalidCodeError.value = false // Reset error states
            try {
                val documentSnapshot = firestore.collection("pairingCodes").document(code).get().await()
                if (documentSnapshot.exists()) {
                    val expiresAt = documentSnapshot.getTimestamp("expiresAt")
                    if (expiresAt != null) {
                        if (Timestamp.now().seconds > expiresAt.seconds) {
                            _showExpiredCodeError.value = true
                        } else {
                            // Code is valid and not expired, proceed with pairing flow (not shown here)
                        }
                    } else {
                        // expiresAt field is missing or not a Timestamp
                        _showInvalidCodeError.value = true
                    }
                } else {
                    // Document does not exist
                    _showInvalidCodeError.value = true
                }
            } catch (e: Exception) {
                // Handle other exceptions, e.g., network issues
                _showInvalidCodeError.value = true
            }
        }
    }
}
