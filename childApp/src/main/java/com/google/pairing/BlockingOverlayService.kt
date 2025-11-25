package com.google.pairing

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.core.app.NotificationCompat

/**
 * A Foreground Service that displays a system-wide overlay to block access to restricted apps.
 * This approach is more robust than starting an Activity, as it cannot be easily swiped away.
 */
class BlockingOverlayService : Service() {

    private lateinit var windowManager: WindowManager
    private var overlayView: View? = null
    private var blockedPackageName: String? = null

    companion object {
        private const val CHANNEL_ID = "BlockingOverlayChannel"
        private const val NOTIFICATION_ID = 1001
        const val EXTRA_BLOCKED_PACKAGE = "blocked_package"
        const val ACTION_SHOW_OVERLAY = "com.google.pairing.SHOW_OVERLAY"
        const val ACTION_HIDE_OVERLAY = "com.google.pairing.HIDE_OVERLAY"
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW_OVERLAY -> {
                val pkg = intent.getStringExtra(EXTRA_BLOCKED_PACKAGE)
                showOverlay(pkg)
            }
            ACTION_HIDE_OVERLAY -> {
                hideOverlay()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    private fun showOverlay(packageName: String?) {
        if (overlayView != null) return // Overlay already showing

        blockedPackageName = packageName
        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        // Ideally inflate a layout XML, but for simplicity creating programmatically or assuming layout exists.
        // Let's create a simple view programmatically to avoid resource issues in this environment
        val view = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#CC000000")) // Semi-transparent black
            setPadding(32, 32, 32, 32)
        }

        val title = TextView(this).apply {
            text = "Access Restricted"
            textSize = 24f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 16)
        }

        val message = TextView(this).apply {
            text = "This app is currently blocked by your parents."
            textSize = 16f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 32)
        }

        val button = Button(this).apply {
            text = "Go Back"
            setOnClickListener {
                // Trigger global back action via AccessibilityService (communicated via broadcast or shared pref)
                // For now, we just minimize the overlay which effectively unblocks if the user went home
                // But the AccessibilityService will re-trigger if they stay in the app.
                // Best practice: Launch Home Screen
                val homeIntent = Intent(Intent.ACTION_MAIN)
                homeIntent.addCategory(Intent.CATEGORY_HOME)
                homeIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                startActivity(homeIntent)
                hideOverlay()
                stopSelf()
            }
        }

        view.addView(title)
        view.addView(message)
        view.addView(button)
        overlayView = view

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
                WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                    WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )

        try {
            windowManager.addView(overlayView, params)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun hideOverlay() {
        if (overlayView != null) {
            try {
                windowManager.removeView(overlayView)
            } catch (e: Exception) {
                e.printStackTrace()
            }
            overlayView = null
        }
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Blocking Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("MiniMaster Protection")
            .setContentText("Monitoring usage...")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
