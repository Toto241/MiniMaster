package com.minimaster.masterapp

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@Composable
fun SubscriptionScreen(
    viewModel: SubscriptionViewModel = hiltViewModel()
) {
    val productDetails by viewModel.productDetails.collectAsState()
    val purchase by viewModel.purchaseStatus.collectAsState()
    val activity = LocalContext.current as Activity

    // When a new purchase is detected, verify it.
    LaunchedEffect(purchase) {
        purchase?.let {
            if (!it.isAcknowledged) {
                viewModel.verifyPurchase(it)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text(stringResource(R.string.get_premium)) })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
        ) {
            if (productDetails.isEmpty()) {
                Text(stringResource(R.string.loading_subscription))
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(productDetails) { product ->
                        ProductItem(
                            product = product,
                            onSubscribeClick = {
                                viewModel.launchPurchaseFlow(activity, product)
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ProductItem(
    product: com.android.billingclient.api.ProductDetails,
    onSubscribeClick: () -> Unit
) {
    Card(elevation = 4.dp, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = product.name, style = MaterialTheme.typography.h6)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = product.description, style = MaterialTheme.typography.body2)
            Spacer(modifier = Modifier.height(8.dp))
            // This assumes a monthly/yearly subscription with one pricing phase.
            val price = product.subscriptionOfferDetails?.firstOrNull()?.pricingPhases?.pricingPhaseList?.firstOrNull()?.formattedPrice
            Button(onClick = onSubscribeClick) {
                Text(stringResource(R.string.subscribe_for_price, price ?: ""))
            }
        }
    }
}
