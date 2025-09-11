package com.minimaster.masterapp.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStoreFile
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ktx.firestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.ktx.functions
import com.google.firebase.ktx.Firebase
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.ktx.storage
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

private const val USER_PREFERENCES_NAME = "master_settings"

/**
 * Hilt Module that provides singleton instances of app-level dependencies for the Master App.
 *
 * This object is installed in the [SingletonComponent], meaning that any dependency
 * provided here will have a single instance created for the entire application lifecycle.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    /**
     * Provides a singleton instance of [DataStore<Preferences>].
     * DataStore is used for persisting the master app's settings and credentials.
     *
     * @param appContext The application context, provided by Hilt.
     * @return A singleton [DataStore] instance.
     */
    @Provides
    @Singleton
    fun provideDataStore(@ApplicationContext appContext: Context): DataStore<Preferences> {
        return PreferenceDataStoreFactory.create(
            produceFile = { appContext.preferencesDataStoreFile(USER_PREFERENCES_NAME) }
        )
    }

    /**
     * Provides a singleton instance of [FirebaseFunctions].
     * It is configured to use the "europe-west1" region.
     * @return A configured [FirebaseFunctions] instance.
     */
    @Provides
    @Singleton
    fun provideFirebaseFunctions(): FirebaseFunctions {
        return Firebase.functions("europe-west1")
    }

    /**
     * Provides a singleton instance of [FirebaseFirestore].
     * @return The default [FirebaseFirestore] instance.
     */
    @Provides
    @Singleton
    fun provideFirebaseFirestore(): FirebaseFirestore {
        return Firebase.firestore
    }

    /**
     * Provides a singleton instance of [FirebaseStorage].
     * @return The default [FirebaseStorage] instance.
     */
    @Provides
    @Singleton
    fun provideFirebaseStorage(): FirebaseStorage {
        return Firebase.storage
    }
}
