package com.google.pairing

import androidx.lifecycle.MutableLiveData
import com.google.firebase.firestore.FirebaseFirestore
import org.mockito.kotlin.mock

// Concrete class for faking, not an abstract class if we are instantiating it.
// If PairingViewModel was an interface, this could implement it.
// Since PairingViewModel is a class, we extend it if methods need to be overridden
// or create a new class that mimics its LiveData properties for UI testing if we don't want to inherit.
// For simplicity in UI testing where we primarily control LiveData outputs,
// we can create a class that holds MutableLiveData similar to the real ViewModel.
// However, to test the call to `validatePairingCode`, we'd need a real ViewModel structure or a mock.

// Let's make a fake that extends PairingViewModel to allow easy LiveData manipulation
// and also allow mocking of its methods if needed for specific tests.
// This requires ChildIdRepository and FirebaseFirestore, which we can mock for the fake.
open class FakePairingViewModel(
    // Mocking dependencies for the parent class constructor
    private val mockChildIdRepository: ChildIdRepository = mock(),
    private val mockFirestore: FirebaseFirestore = mock()
) : PairingViewModel(mockChildIdRepository, mockFirestore) {

    val _isLoadingLiveData = MutableLiveData<Boolean>(false)
    override val isLoading = _isLoadingLiveData

    val _showExpiredCodeErrorLiveData = MutableLiveData<Boolean>(false)
    override val showExpiredCodeError = _showExpiredCodeErrorLiveData

    val _showInvalidCodeErrorLiveData = MutableLiveData<Boolean>(false)
    override val showInvalidCodeError = _showInvalidCodeErrorLiveData

    val _showChildIdSaveErrorLiveData = MutableLiveData<Boolean>(false)
    override val showChildIdSaveError = _showChildIdSaveErrorLiveData

    var validatePairingCodeCalledWith: String? = null
        private set

    // Override the real logic to prevent actual Firestore/repository calls
    // and allow direct manipulation of LiveData for UI testing.
    override fun validatePairingCode(code: String) {
        validatePairingCodeCalledWith = code
        // Simulate some behavior if needed, e.g., setting isLoading
        // For most UI tests, we'll set LiveData directly.
    }

    override fun onPairingSuccess(childId: String, pairingCode: String) {
        // Prevent real implementation during UI tests if this fake is used
    }

    fun clearAllErrors() {
        _showExpiredCodeErrorLiveData.postValue(false)
        _showInvalidCodeErrorLiveData.postValue(false)
        _showChildIdSaveErrorLiveData.postValue(false)
    }
}
