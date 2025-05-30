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
// This requires ChildIdRepository and FirebaseFunctions (not Firestore directly anymore for this VM).
// We use default mocks here, but in Hilt tests, these will be provided by Hilt or @BindValue.
import com.google.firebase.functions.FirebaseFunctions // Import FirebaseFunctions

open class FakePairingViewModel(
    // Mocking dependencies for the parent class constructor
    private val injectedChildIdRepository: ChildIdRepository = mock(),
    private val injectedFunctions: FirebaseFunctions = mock() // Changed from Firestore to Functions
) : PairingViewModel(injectedChildIdRepository, injectedFunctions) { // Pass to super constructor

    val _isLoadingLiveData = MutableLiveData<Boolean>(false)
    // Expose the original LiveData from the parent, but allow tests to post to our MutableLiveData
    // This requires the parent LiveData to be 'open' or to have a public setter, which is not ideal.
    // A better way for fakes is to override the LiveData property entirely if possible,
    // or manage state internally and update the real LiveData if the parent's LiveData is final.

    // For simplicity, we'll override the LiveData properties in the Fake to have full control.
    // This means the Fake's LiveData are distinct from the parent's if not careful.
    // The @BindValue in Hilt test will replace the entire ViewModel, so these overrides are what the UI sees.
    override val isLoading = _isLoadingLiveData // This hides the parent's isLoading

    val _showExpiredCodeErrorLiveData = MutableLiveData<Boolean>(false)
    override val showExpiredCodeError = _showExpiredCodeErrorLiveData

    val _showInvalidCodeErrorLiveData = MutableLiveData<Boolean>(false)
    override val showInvalidCodeError = _showInvalidCodeErrorLiveData

    val _showChildIdSaveErrorLiveData = MutableLiveData<Boolean>(false)
    override val showChildIdSaveError = _showChildIdSaveErrorLiveData

    var validatePairingCodeCalledWith: String? = null
        private set
    var childIdSaved: String? = null // To verify what childId was "saved"

    companion object {
        const val MAGIC_TEST_CODE_SUCCESS = "123456"
        const val TEST_CHILD_ID_HAPPY_PATH = "testChildId_happyPath"
        const val MAGIC_TEST_CODE_EXPIRED = "654321"
        const val MAGIC_TEST_CODE_INVALID = "987654"
        const val MAGIC_TEST_CODE_SAVE_ERROR = "789012"
    }

    // Override the real logic to simulate cloud function calls for UI testing.
    override fun validatePairingCode(code: String) {
        validatePairingCodeCalledWith = code
        _isLoadingLiveData.postValue(true)
        _showExpiredCodeErrorLiveData.postValue(false)
        _showInvalidCodeErrorLiveData.postValue(false)
        _showChildIdSaveErrorLiveData.postValue(false)

        // Simulate a small delay like a network call
        // In a real test, you might use IdlingResource or coroutine test dispatchers
        // For a fake, direct LiveData manipulation is often enough.

        when (code) {
            MAGIC_TEST_CODE_SUCCESS -> {
                // Simulate successful validation and then successful save
                // The actual saveChildId will be called on the (potentially mocked) repository
                // by the real `handleSuccessfulValidation` method in the parent class.
                // We need to call the parent's `handleSuccessfulValidation` or replicate its effect.
                // For simplicity, we directly simulate the outcome of saving.
                // This means the parent's handleSuccessfulValidation is effectively bypassed for this fake success path.
                childIdSaved = TEST_CHILD_ID_HAPPY_PATH // Simulate that this ID would be saved
                // To trigger navigation, the actual ChildIdRepository needs to emit this value,
                // which MainActivity observes. So, the injected ChildIdRepository in the test
                // needs to be a mock that we can control.
                // Here, we just ensure the ViewModel state is as if saving happened.
                _isLoadingLiveData.postValue(false) // Assuming save is quick for the fake
            }
            MAGIC_TEST_CODE_EXPIRED -> {
                _showExpiredCodeErrorLiveData.postValue(true)
                _isLoadingLiveData.postValue(false)
            }
            MAGIC_TEST_CODE_INVALID -> {
                _showInvalidCodeErrorLiveData.postValue(true)
                _isLoadingLiveData.postValue(false)
            }
            MAGIC_TEST_CODE_SAVE_ERROR -> {
                // Simulate successful cloud validation but error during saveChildId
                childIdSaved = "childIdForSaveError" // This ID would have been returned by cloud function
                _showChildIdSaveErrorLiveData.postValue(true) // This is the key outcome
                _isLoadingLiveData.postValue(false)
            }
            else -> {
                // Default behavior for other codes if needed, e.g., generic invalid
                _showInvalidCodeErrorLiveData.postValue(true)
                _isLoadingLiveData.postValue(false)
            }
        }
    }

    // onPairingSuccess is now private in PairingViewModel (became handleSuccessfulValidation)
    // We don't need to override it here if validatePairingCode above handles the logic for faking.
    // If we were to call super.validatePairingCode() and only mock the functions call,
    // then onPairingSuccess would be relevant. But here we are faking the whole validation outcome.

    fun clearAllErrors() {
        _showExpiredCodeErrorLiveData.postValue(false)
        _showInvalidCodeErrorLiveData.postValue(false)
        _showChildIdSaveErrorLiveData.postValue(false)
    }
}
