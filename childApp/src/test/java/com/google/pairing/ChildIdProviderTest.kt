package com.google.pairing

import app.cash.turbine.test
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

@ExperimentalCoroutinesApi
class ChildIdProviderTest {

    private lateinit var mockChildIdRepository: ChildIdRepository
    private val testDispatcher = StandardTestDispatcher()
    private val testScope = TestScope(testDispatcher)

    @Before
    fun setUp() {
        mockChildIdRepository = mock()
    }

    @Test
    fun `childIdFlow emits null initially when repository emits null`() = testScope.runTest {
        // Configure repository to emit null initially
        whenever(mockChildIdRepository.getChildId()).thenReturn(flowOf(null))

        val childIdProvider = ChildIdProvider(mockChildIdRepository)

        // Check initial value directly (might be null due to immediate collection in init)
        // Depending on timing, the collect might have already run.
        // Using turbine is more robust for observing emissions.
        childIdProvider.childIdFlow.test {
            assertEquals(null, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `childIdFlow emits value from repository upon collection`() = testScope.runTest {
        val testId = "testChildId123"
        whenever(mockChildIdRepository.getChildId()).thenReturn(flowOf(testId))

        val childIdProvider = ChildIdProvider(mockChildIdRepository)

        childIdProvider.childIdFlow.test {
            assertEquals(testId, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `childIdFlow updates when repository flow updates`() = testScope.runTest {
        val initialId: String? = null
        val nextId = "updatedChildId456"
        val repositoryFlow = MutableStateFlow(initialId)
        whenever(mockChildIdRepository.getChildId()).thenReturn(repositoryFlow)

        val childIdProvider = ChildIdProvider(mockChildIdRepository)

        childIdProvider.childIdFlow.test {
            // Initial emission (or the first one after init's collect starts)
            assertEquals(initialId, awaitItem())

            // Simulate repository flow update
            repositoryFlow.value = nextId
            assertEquals(nextId, awaitItem())
            
            // Simulate another update
            repositoryFlow.value = null
            assertNull(awaitItem())

            repositoryFlow.value = "anotherId"
            assertEquals("anotherId", awaitItem())

            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `childIdFlow emits initial value from repository if repository flow already has a value`() = testScope.runTest {
        val initialRepoValue = "preExistingId"
        val repositoryFlow = MutableStateFlow(initialRepoValue) // Repository flow starts with a value
        whenever(mockChildIdRepository.getChildId()).thenReturn(repositoryFlow)

        val childIdProvider = ChildIdProvider(mockChildIdRepository)

        childIdProvider.childIdFlow.test {
            assertEquals(initialRepoValue, awaitItem()) // Should immediately get the pre-existing value
            cancelAndIgnoreRemainingEvents()
        }
    }
}
