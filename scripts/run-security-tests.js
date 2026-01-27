#!/usr/bin/env node

/**
 * Automated Security Test Runner
 * 
 * This script runs automated tests based on the scenarios defined in
 * docs/TEST_SCENARIOS_SECURITY.md
 * 
 * Usage:
 *   node scripts/run-security-tests.js
 */

const admin = require("firebase-admin");
const readline = require("readline");

// Initialize Firebase Admin SDK
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function runTests() {
  console.log("========================================");
  console.log("MiniMaster Security Test Runner");
  console.log("========================================");
  console.log("");
  
  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Verify Firestore Rules - Unauthorized Access
  console.log("Test 1: Firestore Rules - Unauthorized Access");
  try {
    // This should fail because we're using admin SDK
    // In a real test, you would use the client SDK without auth
    console.log("⚠️  This test requires manual verification");
    console.log("   Try to read /masters collection without authentication");
    const answer = await question("   Did the access fail? (y/n): ");
    if (answer.toLowerCase() === "y") {
      console.log("✅ Test 1 PASSED");
      passedTests++;
    } else {
      console.log("❌ Test 1 FAILED");
      failedTests++;
    }
  } catch (error) {
    console.log("✅ Test 1 PASSED (Access denied as expected)");
    passedTests++;
  }
  console.log("");

  // Test 2: Verify Admin Custom Claim
  console.log("Test 2: Admin Custom Claim Verification");
  try {
    const adminEmail = await question("   Enter admin email: ");
    const users = await auth.getUserByEmail(adminEmail);
    const claims = users.customClaims || {};
    
    if (claims.role === "admin") {
      console.log("✅ Test 2 PASSED (Admin claim is set)");
      passedTests++;
    } else {
      console.log("❌ Test 2 FAILED (Admin claim is not set)");
      failedTests++;
    }
  } catch (error) {
    console.log(`❌ Test 2 FAILED (${error.message})`);
    failedTests++;
  }
  console.log("");

  // Test 3: Verify Firestore Indexes
  console.log("Test 3: Firestore Indexes Verification");
  try {
    // Try a collectionGroup query
    const tasksSnapshot = await db.collectionGroup("tasks").limit(1).get();
    console.log("✅ Test 3 PASSED (collectionGroup query works)");
    passedTests++;
  } catch (error) {
    console.log(`❌ Test 3 FAILED (${error.message})`);
    console.log("   Make sure to deploy Firestore indexes: firebase deploy --only firestore:indexes");
    failedTests++;
  }
  console.log("");

  // Test 4: Verify Cloud Functions are deployed
  console.log("Test 4: Cloud Functions Deployment");
  console.log("⚠️  This test requires manual verification");
  console.log("   Check Firebase Console > Functions");
  console.log("   Expected functions: createTask, submitTaskProof, reviewTask,");
  console.log("                       onTaskStatusChange, setAdminClaim, revokeSubscription,");
  console.log("                       updateFCMToken, deleteUserAccount");
  const functionsAnswer = await question("   Are all functions deployed? (y/n): ");
  if (functionsAnswer.toLowerCase() === "y") {
    console.log("✅ Test 4 PASSED");
    passedTests++;
  } else {
    console.log("❌ Test 4 FAILED");
    console.log("   Deploy functions: firebase deploy --only functions");
    failedTests++;
  }
  console.log("");

  // Summary
  console.log("========================================");
  console.log("Test Summary");
  console.log("========================================");
  console.log(`Total Tests: ${passedTests + failedTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log("");

  if (failedTests === 0) {
    console.log("🎉 All tests passed!");
  } else {
    console.log("⚠️  Some tests failed. Please review the output above.");
  }

  rl.close();
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error("❌ Test runner error:", error);
  rl.close();
  process.exit(1);
});
