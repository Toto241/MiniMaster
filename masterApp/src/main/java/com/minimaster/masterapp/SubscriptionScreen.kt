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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

/**
 * A screen that displays available subscription products and allows the user to purchase them.
 *
 * It observes product details from the [SubscriptionViewModel] and launches the
 * Google Play Billing purchase flow when a user decides to subscribe. It also
 * triggers purchase verification for any new, unacknowledged purchases.
 *
 * @param viewModel The [SubscriptionViewModel] for handling billing logic.
 */
@Composable
fun SubscriptionScreen(
    viewModel: SubscriptionViewModel = hiltViewModel()
) {
    val productDetails by viewModel.productDetails.collectAsState()
    val purchase by viewModel.purchaseStatus.collectAsState()
    val activity = LocalContext.current as Activity

    // When a new purchase is completed, this effect triggers its verification.
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
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.loading_subscription))
                }
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

/**
 * A Composable that displays a single subscription product in a [Card].
 *
 * It shows the product's name, description, and price, along with a button to initiate
 * the purchase flow.
 *
 * @param product The [com.android.billingclient.api.ProductDetails] object to display.
 * @param onSubscribeClick A callback invoked when the subscribe button is clicked.
 */
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
            // This assumes a simple subscription model with one base plan.
            val price = product.subscriptionOfferDetails?.firstOrNull()?.pricingPhases?.pricingPhaseList?.firstOrNull()?.formattedPrice
            Button(onClick = onSubscribeClick) {
                Text(stringResource(R.string.subscribe_for_price, price ?: "Price not available"))
            }
        }
    }
}
