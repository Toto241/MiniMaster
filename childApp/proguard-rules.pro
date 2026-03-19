# MiniMaster Child App ProGuard Rules

# Firebase SDK
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# FCM
-keep class com.google.firebase.messaging.** { *; }

# Accessibility Service
-keep class com.google.pairing.MiniMasterAccessibilityService { *; }
-keep class com.google.pairing.BlockingOverlayService { *; }

# WorkManager (HeartbeatWorker)
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }

# Kotlin Coroutines
-dontwarn kotlinx.coroutines.**
-keepclassmembers class kotlinx.coroutines.** { *; }

# Keep data classes used with Firestore / SharedPreferences
-keepclassmembers class com.google.pairing.data.** { *; }

# Prevent R8 from stripping Parcelable/Serializable
-keepclassmembers class * implements android.os.Parcelable { *; }
