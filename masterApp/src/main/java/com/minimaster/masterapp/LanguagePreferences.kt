package com.minimaster.masterapp

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

private const val LANGUAGE_PREFS_NAME = "app_language"
private const val KEY_LANGUAGE_SELECTED = "language_selected"
private const val KEY_LANGUAGE_TAG = "language_tag"

fun applySavedMasterLocale(context: Context) {
    val prefs = context.getSharedPreferences(LANGUAGE_PREFS_NAME, Context.MODE_PRIVATE)
    val tag = prefs.getString(KEY_LANGUAGE_TAG, null)
    if (!tag.isNullOrBlank()) {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
    }
}

fun hasMasterLanguageSelection(context: Context): Boolean {
    val prefs = context.getSharedPreferences(LANGUAGE_PREFS_NAME, Context.MODE_PRIVATE)
    return prefs.getBoolean(KEY_LANGUAGE_SELECTED, false)
}

fun saveMasterLanguageSelection(context: Context, languageTag: String) {
    val prefs = context.getSharedPreferences(LANGUAGE_PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit()
        .putBoolean(KEY_LANGUAGE_SELECTED, true)
        .putString(KEY_LANGUAGE_TAG, languageTag)
        .apply()
    AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(languageTag))
}
