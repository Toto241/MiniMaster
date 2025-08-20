package com.google.pairing

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import java.io.IOException

@ExperimentalCoroutinesApi
class ChildIdRepositoryTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var mockDataStore: DataStore<Preferences>

    // Define the same key used in the repository
    private val childIdKey = stringPreferencesKey("child_id")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        mockDataStore = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `saveChildId successfully edits preferences`() = runTest {
        val childId = "testId"
        val mockPreferences: Preferences = mock()
        val mockMutablePreferences: Preferences.MutablePreferences = mock()

        // Mock the DataStore edit operation
        whenever(mockDataStore.edit(any())).doAnswer { invocation ->
            val editor = invocation.getArgument<suspend (Preferences.MutablePreferences) -> Unit>(0)
            // Execute the lambda to test the logic
            editor(mockMutablePreferences)
            flowOf(mockPreferences) // Return the updated preferences
        }

        // Create repository with the injected DataStore (as it would be with Hilt)
        val repoUnderTest = ChildIdRepository(mockDataStore)

        // Call saveChildId
        repoUnderTest.saveChildId(childId)

        // Verify the DataStore edit was called
        verify(mockDataStore).edit(any())
        
        // Verify the preference was set (by capturing and executing the lambda)
        verify(mockMutablePreferences)[childIdKey] = childId
    }


    @Test
    fun `getChildId successfully retrieves id`() = runTest {
        val testId = "retrieveTestId"
        val mockPreferences: Preferences = mock()
        
        // Mock the DataStore data flow
        whenever(mockDataStore.data).thenReturn(flowOf(mockPreferences))
        whenever(mockPreferences[childIdKey]).thenReturn(testId)

        // Create repository with the injected DataStore 
        val repoUnderTest = ChildIdRepository(mockDataStore)

        // Call getChildId and collect the result
        val result = repoUnderTest.getChildId().first()

        // Verify the result
        assertEquals(testId, result)
        verify(mockDataStore).data
    }

    @Test
    fun `getChildId with empty datastore returns null`() = runTest {
        whenever(mockDataStore.data).thenReturn(flowOf(emptyPreferences()))

        val repoUnderTest = ChildIdRepository(mockDataStore)
        val retrievedId = repoUnderTest.getChildId().first()
        assertNull(retrievedId)
    }

    @Test(expected = IOException::class)
    fun `saveChildId propagates IOException from datastore edit`() = runTest {
        val childId = "testId"
        whenever(mockDataStore.edit(any())).thenReturn(flow { throw IOException("Disk error") })

        val repoUnderTest = ChildIdRepository(mockDataStore)
        repoUnderTest.saveChildId(childId) // This should throw IOException
    }

    @Test
    fun `getChildId propagates IOException from datastore data flow`() = runTest {
        whenever(mockDataStore.data).thenReturn(flow { throw IOException("Disk error") })

        val repoUnderTest = ChildIdRepository(mockDataStore)
        try {
            repoUnderTest.getChildId().first() // Collect the flow to trigger the exception
            assertTrue("Exception was not thrown", false) // Should not reach here
        } catch (e: IOException) {
            assertEquals("Disk error", e.message)
        }
    }
}
