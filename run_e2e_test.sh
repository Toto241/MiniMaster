#!/bin/bash

# End-to-End Test Orchestration Script for Mini-Master
#
# This script automates the full pairing flow by:
# 1. Running the masterApp test to generate a real pairing token.
# 2. Extracting the token from device logs.
# 3. Launching the childApp with a deep link containing the token.
# 4. Running the childApp test to verify a successful pairing.
#
# REQUIREMENTS:
# - An Android device or emulator connected via adb.
# - The Firebase backend must be deployed and running.
# - Both masterApp and childApp must be installed on the device.
#
# USAGE:
# Make the script executable first:
#   chmod +x run_e2e_test.sh
# Then run it from the project root:
#   ./run_e2e_test.sh

set -e # Exit immediately if a command exits with a non-zero status.

echo "--- Starting Mini-Master E2E Test ---"

# --- Step 1: Clean up and prepare ---
echo "[1/5] Cleaning up device logs..."
adb logcat -c

# --- Step 2: Run masterApp test to generate a token ---
echo "[2/5] Running masterApp test to generate token..."
# We target the specific test class and method to avoid running other tests.
./gradlew :masterApp:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.minimaster.masterapp.MasterAppE2ETest#generateTokenAndLogIt

echo "masterApp test finished. Searching for token in logs..."

# --- Step 3: Extract the token from logcat ---
echo "[3/5] Extracting token from device logs..."
# We give it a few seconds to ensure logs are flushed and available.
sleep 3
TOKEN=$(adb logcat -d -s E2E_TEST:D | grep 'Token:' | tail -n 1 | awk '{print $NF}')

if [ -z "$TOKEN" ]; then
    echo "ERROR: Failed to retrieve token from logcat. Please check the masterApp test run."
    adb logcat -d -s E2E_TEST:D
    exit 1
fi

echo "Token successfully retrieved: $TOKEN"

# --- Step 4: Launch childApp with the deep link ---
echo "[4/5] Launching childApp with deep link..."
DEEP_LINK="minimaster://pair/$TOKEN"
PACKAGE_NAME="com.google.pairing"

# Stop the app first to ensure a clean launch
adb shell am force-stop "$PACKAGE_NAME"
sleep 1
# Launch via deep link
adb shell am start -a android.intent.action.VIEW -d "$DEEP_LINK" "$PACKAGE_NAME"

echo "childApp launched. Waiting a moment for it to initialize..."
sleep 5 # Give the app time to process the link and make the network call.

# --- Step 5: Run childApp test to verify the result ---
echo "[5/5] Running childApp test to verify pairing success..."
# We target the specific verification test.
./gradlew :childApp:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.google.pairing.DeepLinkE2ETest#verifySuccessfulPairingFromDeepLink_showsLockScreen

echo "--- E2E Test Finished Successfully! ---"
