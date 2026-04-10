package com.minimaster.masterapp.data.repositories

import com.google.firebase.functions.FirebaseFunctions
import com.minimaster.masterapp.core.rules.UsageRuleDraft
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UsageRuleRepository @Inject constructor(
    private val functions: FirebaseFunctions,
) {
    suspend fun saveRules(childId: String, draft: UsageRuleDraft) {
        functions.getHttpsCallable("setUsageRules").call(
            hashMapOf(
                "childId" to childId,
                "usageRules" to draft.toCallablePayload(),
            )
        ).await()
    }
}