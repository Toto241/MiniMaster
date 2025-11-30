#!/bin/bash

# Update Firebase Config Script
# This script helps you update the Firebase configuration in the web apps

echo "========================================="
echo "Firebase Config Update Script"
echo "========================================="
echo ""
echo "Please provide your Firebase project configuration."
echo "You can find this in Firebase Console > Project Settings > General"
echo ""

read -p "API Key: " apiKey
read -p "Auth Domain: " authDomain
read -p "Project ID: " projectId
read -p "Storage Bucket: " storageBucket
read -p "Messaging Sender ID: " messagingSenderId
read -p "App ID: " appId

echo ""
echo "Updating admin-panel/app.js..."

# Create the config object
config="const firebaseConfig = {
    apiKey: \"$apiKey\",
    authDomain: \"$authDomain\",
    projectId: \"$projectId\",
    storageBucket: \"$storageBucket\",
    messagingSenderId: \"$messagingSenderId\",
    appId: \"$appId\"
};"

# Update admin-panel/app.js
sed -i '/const firebaseConfig = {/,/};/c\'"$config" admin-panel/app.js

echo "✅ admin-panel/app.js updated"

# Update web-control/app.js
sed -i '/const firebaseConfig = {/,/};/c\'"$config" web-control/app.js

echo "✅ web-control/app.js updated"

echo ""
echo "========================================="
echo "🎉 Firebase config updated successfully!"
echo "========================================="
echo ""
echo "The configuration has been updated in:"
echo "  - admin-panel/app.js"
echo "  - web-control/app.js"
echo ""
echo "You can now deploy the hosting:"
echo "  firebase deploy --only hosting"
