# MiniMaster Parent App ProGuard Rules

# Firebase SDK
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Google Play Billing
-keep class com.android.vending.billing.** { *; }

# Hilt / Dagger
-dontwarn dagger.hilt.**
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**
-keepclassmembers class kotlinx.coroutines.** { *; }

# Compose
-dontwarn androidx.compose.**

# Keep data classes used with Firestore
-keepclassmembers class com.minimaster.masterapp.data.** { *; }

# Prevent R8 from stripping Parcelable/Serializable
-keepclassmembers class * implements android.os.Parcelable { *; }
