#!/bin/bash

# MiniMaster Automated Deployment Script
# This script deploys all components of the MiniMaster project to Firebase

set -e  # Exit on error

echo "========================================="
echo "MiniMaster Deployment Script"
echo "========================================="
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed."
    echo "Please install it with: npm install -g firebase-tools"
    exit 1
fi

echo "✅ Firebase CLI is installed"
echo ""

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ You are not logged in to Firebase."
    echo "Please run: firebase login"
    exit 1
fi

echo "✅ You are logged in to Firebase"
echo ""

# Confirm deployment
read -p "This will deploy Functions, Firestore Rules, and Hosting. Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "========================================="
echo "Step 1: Deploying Firestore Security Rules"
echo "========================================="
firebase deploy --only firestore:rules
echo "✅ Firestore Rules deployed"
echo ""

echo "========================================="
echo "Step 2: Deploying Firestore Indexes"
echo "========================================="
firebase deploy --only firestore:indexes
echo "✅ Firestore Indexes deployed"
echo ""

echo "========================================="
echo "Step 3: Deploying Cloud Functions"
echo "========================================="
firebase deploy --only functions
echo "✅ Cloud Functions deployed"
echo ""

echo "========================================="
echo "Step 4: Deploying Hosting (Web-Control & Admin Panel)"
echo "========================================="
firebase deploy --only hosting
echo "✅ Hosting deployed"
echo ""

echo "========================================="
echo "🎉 Deployment Complete!"
echo "========================================="
echo ""
echo "Next Steps:"
echo "1. Create the first admin user in Firebase Console"
echo "2. Call the setAdminClaim function to grant admin privileges"
echo "3. Update Firebase config in admin-panel/app.js and web-control/app.js"
echo "4. Run the security tests from docs/TEST_SCENARIOS_SECURITY.md"
echo ""
echo "For detailed instructions, see docs/DEPLOYMENT_GUIDE.md"
