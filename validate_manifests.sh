#!/bin/bash

# Validate Android manifest files for common syntax issues
# This script helps prevent build failures due to malformed XML

set -e

echo "🔍 Validating Android manifest files..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

has_errors=0

# Function to check a single manifest file
check_manifest() {
    local manifest="$1"
    
    if [ ! -f "$manifest" ]; then
        echo -e "${YELLOW}⚠️  Warning: $manifest not found${NC}"
        return 0
    fi
    
    echo "Checking $manifest..."
    
    # Check for JavaScript-style comments in XML
    if grep -q "{/\*\|/\*}" "$manifest"; then
        echo -e "${RED}❌ ERROR: Found JavaScript-style comments in $manifest${NC}"
        echo "   XML files should use <!-- comment --> syntax, not {/* comment */}"
        echo "   Found at lines:"
        grep -n "{/\*\|/\*}" "$manifest"
        has_errors=1
        return 1
    fi
    
    # Check for other common XML issues
    if grep -q "< /" "$manifest"; then
        echo -e "${YELLOW}⚠️  Warning: Found space before closing tag slash in $manifest${NC}"
        grep -n "< /" "$manifest"
    fi
    
    echo -e "${GREEN}✓ $manifest syntax appears valid${NC}"
    return 0
}

# Check all Android manifest files
check_manifest "masterApp/src/main/AndroidManifest.xml"
check_manifest "childApp/src/main/AndroidManifest.xml"

if [ $has_errors -eq 0 ]; then
    echo -e "${GREEN}🎉 All manifest files validated successfully!${NC}"
    exit 0
else
    echo -e "${RED}💥 Validation failed with errors. Please fix the issues above.${NC}"
    exit 1
fi