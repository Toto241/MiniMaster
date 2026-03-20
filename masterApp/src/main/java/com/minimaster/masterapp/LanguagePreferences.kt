package com.minimaster.masterapp

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import java.util.Locale

private const val LANGUAGE_PREFS_NAME = "app_language"
private const val KEY_LANGUAGE_SELECTED = "language_selected"
private const val KEY_LANGUAGE_TAG = "language_tag"
private const val KEY_COUNTRY_CODE = "country_code"

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

fun saveMasterLanguageSelection(context: Context, languageTag: String, countryCode: String) {
    val normalizedCountryCode = countryCode.uppercase(Locale.ROOT)
    val prefs = context.getSharedPreferences(LANGUAGE_PREFS_NAME, Context.MODE_PRIVATE)
    prefs.edit()
        .putBoolean(KEY_LANGUAGE_SELECTED, true)
        .putString(KEY_LANGUAGE_TAG, languageTag)
        .putString(KEY_COUNTRY_CODE, normalizedCountryCode)
        .apply()
    AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(languageTag))
}

fun getSavedMasterLanguageTag(context: Context): String? {
    val prefs = context.getSharedPreferences(LANGUAGE_PREFS_NAME, Context.MODE_PRIVATE)
    return prefs.getString(KEY_LANGUAGE_TAG, null)
}

fun getSavedMasterCountryCode(context: Context): String? {
    val prefs = context.getSharedPreferences(LANGUAGE_PREFS_NAME, Context.MODE_PRIVATE)
    return prefs.getString(KEY_COUNTRY_CODE, null)?.uppercase(Locale.ROOT)
}
