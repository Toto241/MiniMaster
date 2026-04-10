package com.google.pairing.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.Card
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.pairing.core.trace.DecisionTrace
import com.google.pairing.data.repositories.LocalDecisionTraceRepository
import java.text.DateFormat
import java.util.Date

@Composable
fun DecisionTracePanel(
    modifier: Modifier = Modifier,
    maxItems: Int = 5,
) {
    val context = LocalContext.current
    var traces by remember { mutableStateOf<List<DecisionTrace>>(emptyList()) }

    LaunchedEffect(context, maxItems) {
        traces = LocalDecisionTraceRepository(context).listRecent(maxItems)
    }

    Card(modifier = modifier.fillMaxWidth(), elevation = 2.dp) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Decision Trace", style = MaterialTheme.typography.h6)
            if (traces.isEmpty()) {
                Text("Noch keine deterministischen Entscheidungen protokolliert.")
            } else {
                traces.forEach { trace ->
                    Text(
                        text = "${trace.action.name} · ${trace.reason}",
                        fontWeight = FontWeight.Bold,
                    )
                    Text("Regel: ${trace.ruleId} · Event: ${trace.eventType.name}")
                    Text(DateFormat.getDateTimeInstance().format(Date(trace.timestamp)))
                    Spacer(modifier = Modifier.height(4.dp))
                }
            }
        }
    }
}