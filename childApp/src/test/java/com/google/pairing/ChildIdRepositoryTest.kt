package com.google.pairing

import android.content.Context
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
import kotlinx.coroutines.test.TestCoroutineDispatcher
import kotlinx.coroutines.test.TestCoroutineScope
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runBlockingTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.junit.Assert.assertEquals
import kotlinx.coroutines.flow.first

@ExperimentalCoroutinesApi
class ChildIdRepositoryTest {

    private val testDispatcher = TestCoroutineDispatcher()
    private val testScope = TestCoroutineScope(testDispatcher)

    private lateinit var mockDataStore: DataStore<Preferences>

    // Define the same key used in the repository
    private val childIdKey = stringPreferencesKey("child_id")

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        mockDataStore = mock()
    }

        repository = ChildIdRepository(mockContext) // This will use the real extension if not careful
                                                    // We rely on mocking `edit` and `data` on `mockDataStore`
                                                    // and assume `mockContext.dataStore` would return it.
                                                    // This part is conceptually tricky without DI.
                                                    // Let's assume `repository.dataStore` (if it were a public property)
                                                    // is our `mockDataStore`.
                                                    // The tests below will mock `mockDataStore.edit` and `mockDataStore.data`.
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        testDispatcher.cleanupTestCoroutines()
        testScope.cleanupTestCoroutines()
    }

    // Remove the unused helper method and unused variables
    // private fun linkMockDataStoreToRepo() - no longer needed with DI approach


    @Test
    fun `saveChildId successfully edits preferences`() = testDispatcher.runBlockingTest {
        val childId = "testId"
        val mockPreferences: Preferences = mock()
        val mockMutablePreferences: Preferences.MutablePreferences = mock()

        // Mock the DataStore edit operation
        whenever(mockDataStore.edit(any())).doAnswer { invocation ->
            val editor = invocation.getArgument<suspend (Preferences.MutablePreferences) -> Unit>(0)
            // Execute the lambda to test the logic
            testScope.launch { editor(mockMutablePreferences) }
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
    fun `getChildId successfully retrieves id`() = testDispatcher.runBlockingTest {
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
        val childId = "testId"
        val mockPreferences: Preferences = mock {
            on { get(childIdKey) } doAnswer { childId }
        }
        whenever(mockDataStore.data).thenReturn(flowOf(mockPreferences))

        val retrievedId = repository.getChildId().first()
        assertEquals(childId, retrievedId)
    }

    @Test
    fun `getChildId with empty datastore returns null`() = testDispatcher.runBlockingTest {
        linkMockDataStoreToRepo()
        whenever(mockDataStore.data).thenReturn(flowOf(emptyPreferences()))

        val retrievedId = repository.getChildId().first()
        assertNull(retrievedId)
    }

    @Test(expected = IOException::class)
    fun `saveChildId propagates IOException from datastore edit`() = testDispatcher.runBlockingTest {
        linkMockDataStoreToRepo()
        val childId = "testId"
        whenever(mockDataStore.edit(any())).thenReturn(flow { throw IOException("Disk error") })

        repository.saveChildId(childId) // This should throw IOException
    }

    @Test
    fun `getChildId propagates IOException from datastore data flow`() = testDispatcher.runBlockingTest {
        linkMockDataStoreToRepo()
        whenever(mockDataStore.data).thenReturn(flow { throw IOException("Disk error") })

        try {
            repository.getChildId().first() // Collect the flow to trigger the exception
            assertTrue("Exception was not thrown", false) // Should not reach here
        } catch (e: IOException) {
            assertEquals("Disk error", e.message)
        }
    }
}
