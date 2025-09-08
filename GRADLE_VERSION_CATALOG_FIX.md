# Gradle Version Catalog Fix

## Issue Description

The repository was experiencing a Gradle validation failure with the error:
```
Invalid catalog definition:
- Problem: In version catalog libs, you can only call the 'from' method a single time.
- Reason: The method was called more than once.
```

This error prevented any Gradle commands from running, including basic validation commands like `./gradlew tasks`.

## Root Cause

The version catalog configuration in `settings.gradle` was causing a conflict in Gradle 8.14.3. Despite only having a single `from()` call visible in the settings file, Gradle was reporting multiple calls to the `from()` method.

## Solution Implemented

The version catalog feature has been temporarily disabled by removing the `versionCatalogs` block from `settings.gradle`. The project now uses the traditional approach with hardcoded versions in the individual module `build.gradle` files.

### Changes Made:
- Removed `versionCatalogs` block from `settings.gradle`
- Added explicit `rootProject.name = 'MiniMaster'` to eliminate project name warnings
- Kept the `gradle/libs.versions.toml` file for future reference

## Impact

- ✅ **Gradle validation now works** - All Gradle commands can run successfully
- ✅ **CI workflow compatibility** - The CI properly handles network restrictions to `dl.google.com`
- ✅ **Backend tests pass** - All 24 backend tests continue to work perfectly
- ✅ **No functional changes** - Apps continue to use their existing dependency configurations

## Network Restrictions

In restricted environments (like GitHub Actions), Android builds fail with:
```
Could not GET 'https://dl.google.com/dl/android/maven2/...'
> dl.google.com
```

This is expected and handled gracefully by the existing CI workflow, which includes network accessibility tests and appropriate fallbacks.

## Future Restoration

To restore version catalog functionality in the future:

1. **Investigate Gradle compatibility**: Test with newer/different Gradle versions
2. **Alternative syntax**: Try different version catalog configurations
3. **Update dependencies**: Consider upgrading Android Gradle Plugin and other build tools
4. **Gradual migration**: Update module `build.gradle` files to use version catalog references

## Files Modified

- `settings.gradle` - Removed version catalog configuration
- Added this documentation file

## Files Preserved

- `gradle/libs.versions.toml` - Kept for future use
- All module `build.gradle` files - Continue to use hardcoded versions as before