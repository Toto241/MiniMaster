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

/**
 * Represents the different states of the master device registration process.
 */
sealed class RegistrationState {
    /** The initial state before any registration attempt. */
    object Idle : RegistrationState()
    /** The state when registration is in progress. */
    object Loading : RegistrationState()
    /** The state when registration has succeeded. */
    data class Success(val successMessage: String) : RegistrationState()
    /** The state when an error has occurred during registration. */
    data class Error(val message: String) : RegistrationState()
}

/**
 * Represents the different states of the pairing link generation process.
 */
sealed class LinkGenerationState {
    /** The initial state before any link generation attempt. */
    object Idle : LinkGenerationState()
    /** The state when link generation is in progress. */
    object Loading : LinkGenerationState()
    /** The state when the link has been successfully generated. */
    data class Success(val pairingToken: String) : LinkGenerationState()
    /** The state when an error has occurred during link generation. */
    data class Error(val message: String) : LinkGenerationState()
}

/**
 * A data class holding the master device's credentials for debugging purposes.
 */
data class DebugState(
    val imei: String? = null,
    val secretKey: String? = null
)

data class ActiveLegalPolicies(
    val country: String,
    val locale: String,
    val termsVersion: String,
    val privacyVersion: String,
    val termsUrl: String,
    val privacyUrl: String
)

sealed class LegalConsentState {
    object Unknown : LegalConsentState()
    object Checking : LegalConsentState()
    object Ready : LegalConsentState()
    data class Required(val policies: ActiveLegalPolicies) : LegalConsentState()
    data class Error(val message: String) : LegalConsentState()
}

/**
 * A [ViewModel] that manages the initial registration of the master device and the
 * generation of pairing links for child devices.
 *
 * @property functions The [FirebaseFunctions] instance for backend calls.
 * @property credentialsRepository The repository for persisting master credentials.
 */
@HiltViewModel
class MasterViewModel @Inject constructor(
    private val functions: FirebaseFunctions,
    private val credentialsRepository: MasterCredentialsRepository
) : ViewModel() {

    private val _registrationState = MutableStateFlow<RegistrationState>(RegistrationState.Idle)
    /** A [StateFlow] representing the current state of the device registration process. */
    val registrationState: StateFlow<RegistrationState> = _registrationState.asStateFlow()

    private val _linkGenerationState = MutableStateFlow<LinkGenerationState>(LinkGenerationState.Idle)
    /** A [StateFlow] representing the current state of the pairing link generation process. */
    val linkGenerationState: StateFlow<LinkGenerationState> = _linkGenerationState.asStateFlow()

    private val _debugState = MutableStateFlow(DebugState())
    /** A [StateFlow] holding the current credentials for debugging display. */
    val debugState: StateFlow<DebugState> = _debugState.asStateFlow()

    private val _legalConsentState = MutableStateFlow<LegalConsentState>(LegalConsentState.Unknown)
    /** A [StateFlow] representing whether legal re-consent must be collected before app usage. */
    val legalConsentState: StateFlow<LegalConsentState> = _legalConsentState.asStateFlow()

    init {
        checkRegistrationStatus()
    }

    /**
     * Checks the [credentialsRepository] to see if the device is already registered.
     * If credentials exist, it updates the [registrationState] to [RegistrationState.Success].
     */
    private fun checkRegistrationStatus() {
        viewModelScope.launch {
            credentialsRepository.getCredentials.collect { (imei, secret) ->
                _debugState.value = DebugState(imei = imei, secretKey = secret)
                if (!imei.isNullOrEmpty() && !secret.isNullOrEmpty()) {
                    _registrationState.value = RegistrationState.Success("Device already registered.")
                }
            }
        }
    }

    /**
     * Registers the device with the backend using its IMEI.
     * On success, it saves the returned secret key to the [credentialsRepository].
     * @param imei The unique identifier of the device to register.
     */
    fun registerDevice(imei: String) {
        viewModelScope.launch {
            _registrationState.value = RegistrationState.Loading
            val data = hashMapOf("imei" to imei)
            try {
                val result = functions.getHttpsCallable("registerMasterDevice").call(data).await()
                val key = (result.getData() as? Map<String, Any>)?.get("secretKey") as? String
                if (key != null) {
                    credentialsRepository.saveCredentials(imei, key)
                    _debugState.value = DebugState(imei = imei, secretKey = key)
                    _registrationState.value = RegistrationState.Success("Device registered successfully!")
                } else {
                     _registrationState.value = RegistrationState.Error("Backend returned no secret key.")
                }
            } catch (e: Exception) {
                val errorMessage = if (e is FirebaseFunctionsException) "Error (${e.code}): ${e.message}" else e.message ?: "An unknown error occurred."
                _registrationState.value = RegistrationState.Error(errorMessage)
            }
        }
    }

    /**
     * Generates a single-use pairing link (token) by calling a Firebase Function.
     * Requires the device to be registered first.
     */
    fun generateLink() {
        val currentState = debugState.value
        val currentImei = currentState.imei
        val currentSecret = currentState.secretKey

        if (currentImei == null || currentSecret == null) {
            _linkGenerationState.value = LinkGenerationState.Error("Device not registered yet.")
            return
        }

        viewModelScope.launch {
            _linkGenerationState.value = LinkGenerationState.Loading
            val data = hashMapOf("imei" to currentImei, "secretKey" to currentSecret)

            try {
                val result = functions.getHttpsCallable("generatePairingLink").call(data).await()
                val token = (result.getData() as? Map<String, Any>)?.get("pairingToken") as? String
                if (token != null) {
                    _linkGenerationState.value = LinkGenerationState.Success(token)
                } else {
                    _linkGenerationState.value = LinkGenerationState.Error("Backend returned no token.")
                }
            } catch (e: Exception) {
                 val errorMessage = if (e is FirebaseFunctionsException) "Error (${e.code}): ${e.message}" else e.message ?: "An unknown error occurred."
                _linkGenerationState.value = LinkGenerationState.Error(errorMessage)
            }
        }
    }

    /**
     * Checks backend legal policy state for the current country/locale and determines
     * whether explicit consent is required before allowing app usage.
     */
    fun refreshLegalConsentStatus(country: String, locale: String) {
        viewModelScope.launch {
            _legalConsentState.value = LegalConsentState.Checking
            val data = hashMapOf(
                "country" to country,
                "locale" to locale
            )

            try {
                val result = functions.getHttpsCallable("needsLegalReconsent").call(data).await()
                val payload = result.data as? Map<*, *> ?: run {
                    _legalConsentState.value = LegalConsentState.Error("Invalid legal status response.")
                    return@launch
                }

                val requires = payload["requiresReconsent"] as? Boolean ?: false
                val terms = payload["terms"] as? Map<*, *>
                val privacy = payload["privacy"] as? Map<*, *>

                val termsVersion = terms?.get("version") as? String ?: ""
                val privacyVersion = privacy?.get("version") as? String ?: ""
                val termsUrl = terms?.get("contentUrl") as? String ?: ""
                val privacyUrl = privacy?.get("contentUrl") as? String ?: ""

                if (requires) {
                    _legalConsentState.value = LegalConsentState.Required(
                        ActiveLegalPolicies(
                            country = country,
                            locale = locale,
                            termsVersion = termsVersion,
                            privacyVersion = privacyVersion,
                            termsUrl = termsUrl,
                            privacyUrl = privacyUrl
                        )
                    )
                } else {
                    _legalConsentState.value = LegalConsentState.Ready
                }
            } catch (e: Exception) {
                val errorMessage = if (e is FirebaseFunctionsException) {
                    "Error (${e.code}): ${e.message}"
                } else {
                    e.message ?: "An unknown error occurred while checking legal consent."
                }
                _legalConsentState.value = LegalConsentState.Error(errorMessage)
            }
        }
    }

    /**
     * Records explicit legal consent for the currently active terms/privacy versions.
     */
    fun acceptLegalPolicies(
        country: String,
        locale: String,
        policies: ActiveLegalPolicies,
        appVersion: String
    ) {
        viewModelScope.launch {
            _legalConsentState.value = LegalConsentState.Checking
            val data = hashMapOf(
                "country" to country,
                "locale" to locale,
                "termsVersion" to policies.termsVersion,
                "privacyVersion" to policies.privacyVersion,
                "consentSource" to "master_app",
                "appVersion" to appVersion
            )

            try {
                functions.getHttpsCallable("recordLegalConsent").call(data).await()
                _legalConsentState.value = LegalConsentState.Ready
            } catch (e: Exception) {
                val errorMessage = if (e is FirebaseFunctionsException) {
                    "Error (${e.code}): ${e.message}"
                } else {
                    e.message ?: "An unknown error occurred while saving legal consent."
                }
                _legalConsentState.value = LegalConsentState.Error(errorMessage)
            }
        }
    }
}
