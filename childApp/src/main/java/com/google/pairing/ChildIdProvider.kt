package com.google.pairing

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ChildIdProvider @Inject constructor(
    private val childIdRepository: ChildIdRepository // Hilt wird dies injizieren
) {
    private val _childIdFlow = MutableStateFlow<String?>(null)
    val childIdFlow: StateFlow<String?> = _childIdFlow.asStateFlow()

    // Einen Scope für das Sammeln des Flows aus dem Repository erstellen.
    // Da dies ein Singleton ist, lebt der Scope so lange wie die App.
    // SupervisorJob sorgt dafür, dass das Scheitern einer Coroutine in diesem Scope
    // nicht den gesamten Scope und andere Coroutines darin beendet.
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        coroutineScope.launch {
            // Sammle den childId Flow vom Repository und aktualisiere den lokalen StateFlow.
            // Fehler im childIdRepository.getChildId() Flow würden hier die Coroutine beenden,
            // aber dank SupervisorJob nicht den gesamten Scope.
            // Eine robustere Implementierung könnte hier auch .catch{} verwenden.
            childIdRepository.getChildId().collect { childId ->
                _childIdFlow.value = childId
            }
        }
    }

    // Optional: Eine Methode, um den aktuellen Wert synchron abzufragen,
    // falls dies an wenigen, gut überlegten Stellen benötigt wird.
    // Der primäre Zugriff sollte aber über das Sammeln des childIdFlow erfolgen.
    // fun getCurrentChildId(): String? {
    //     return _childIdFlow.value
    // }
}
