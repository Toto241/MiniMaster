package com.google.pairing.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Qualifier
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers

/**
 * A Dagger Hilt qualifier annotation to distinguish the I/O dispatcher from other
 * [CoroutineDispatcher] instances. This allows for specific injection of the dispatcher
 * intended for background, disk, or network operations.
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class IoDispatcher

/**
 * Hilt module that provides Coroutine Dispatchers.
 *
 * This module is used to inject dispatchers into classes, which is a best practice
 * for testing. It allows replacing the real dispatchers with test dispatchers in unit tests.
 */
@Module
@InstallIn(SingletonComponent::class)
object DispatchersModule {
    /**
     * Provides the [Dispatchers.IO] dispatcher.
     * @return The I/O [CoroutineDispatcher].
     */
    @Provides
    @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher = Dispatchers.IO
}