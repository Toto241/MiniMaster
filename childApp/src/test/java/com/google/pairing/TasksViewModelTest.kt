package com.google.pairing

import android.net.Uri
import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.google.android.gms.tasks.Tasks
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.EventListener
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.QuerySnapshot
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableReference
import com.google.firebase.functions.HttpsCallableResult
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageReference
import com.google.firebase.storage.UploadTask
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TasksViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var mockFirestore: FirebaseFirestore
    private lateinit var mockStorage: FirebaseStorage
    private lateinit var mockFunctions: FirebaseFunctions
    private lateinit var mockChildIdRepository: ChildIdRepository
    private lateinit var mockCollectionRef: CollectionReference
    private lateinit var mockDocumentRef: DocumentReference
    private lateinit var mockQuery: Query
    private lateinit var mockListenerRegistration: ListenerRegistration
    private lateinit var viewModel: TasksViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        
        mockFirestore = mockk()
        mockStorage = mockk()
        mockFunctions = mockk()
        mockChildIdRepository = mockk()
        mockCollectionRef = mockk()
        mockDocumentRef = mockk()
        mockQuery = mockk()
        mockListenerRegistration = mockk()

        // Setup firestore mocking chain
        every { mockFirestore.collection("children") } returns mockCollectionRef
        every { mockCollectionRef.document(any()) } returns mockDocumentRef
        every { mockDocumentRef.collection("tasks") } returns mockCollectionRef
        every { mockCollectionRef.orderBy("createdAt", Query.Direction.DESCENDING) } returns mockQuery
        every { mockQuery.addSnapshotListener(any<EventListener<QuerySnapshot>>()) } returns mockListenerRegistration

        // Default: no child ID available
        every { mockChildIdRepository.getChildId() } returns flowOf(null)

        viewModel = TasksViewModel(mockFirestore, mockStorage, mockFunctions, mockChildIdRepository)
    }

    @Test
    fun `initial tasks state is empty`() {
        assertTrue(viewModel.tasks.value.isEmpty())
    }

    @Test
    fun `loadTasks does nothing when child ID is null`() = runTest {
        // Given
        every { mockChildIdRepository.getChildId() } returns flowOf(null)

        // When
        val newViewModel = TasksViewModel(mockFirestore, mockStorage, mockFunctions, mockChildIdRepository)
        advanceUntilIdle()

        // Then
        assertTrue(newViewModel.tasks.value.isEmpty())
        // Verify that addSnapshotListener was not called
        verify(exactly = 0) { mockQuery.addSnapshotListener(any<EventListener<QuerySnapshot>>()) }
    }

    @Test
    fun `loadTasks does nothing when child ID is empty`() = runTest {
        // Given
        every { mockChildIdRepository.getChildId() } returns flowOf("")

        // When
        val newViewModel = TasksViewModel(mockFirestore, mockStorage, mockFunctions, mockChildIdRepository)
        advanceUntilIdle()

        // Then
        assertTrue(newViewModel.tasks.value.isEmpty())
        verify(exactly = 0) { mockQuery.addSnapshotListener(any<EventListener<QuerySnapshot>>()) }
    }

    @Test
    fun `loadTasks sets up snapshot listener when child ID exists`() = runTest {
        // Given
        val childId = "test-child-123"
        every { mockChildIdRepository.getChildId() } returns flowOf(childId)

        // When
        val newViewModel = TasksViewModel(mockFirestore, mockStorage, mockFunctions, mockChildIdRepository)
        advanceUntilIdle()

        // Then
        verify { mockFirestore.collection("children") }
        verify { mockCollectionRef.document(childId) }
        verify { mockDocumentRef.collection("tasks") }
        verify { mockCollectionRef.orderBy("createdAt", Query.Direction.DESCENDING) }
        verify { mockQuery.addSnapshotListener(any<EventListener<QuerySnapshot>>()) }
    }

    @Test
    fun `completeTaskWithPhoto fails when child ID is null`() = runTest {
        // Given
        val taskId = "test-task-123"
        val mockUri = mockk<Uri>()
        every { mockChildIdRepository.getChildId() } returns flowOf(null)

        // When
        viewModel.completeTaskWithPhoto(taskId, mockUri)
        advanceUntilIdle()

        // Then - Should not call any storage or functions operations
        verify(exactly = 0) { mockStorage.reference }
        verify(exactly = 0) { mockFunctions.getHttpsCallable(any()) }
    }

    @Test
    fun `completeTaskWithPhoto fails when child ID is empty`() = runTest {
        // Given
        val taskId = "test-task-123"
        val mockUri = mockk<Uri>()
        every { mockChildIdRepository.getChildId() } returns flowOf("")

        // When
        viewModel.completeTaskWithPhoto(taskId, mockUri)
        advanceUntilIdle()

        // Then
        verify(exactly = 0) { mockStorage.reference }
        verify(exactly = 0) { mockFunctions.getHttpsCallable(any()) }
    }

    @Test
    fun `completeTaskWithPhoto success uploads photo and calls function`() = runTest {
        // Given
        val childId = "test-child-123"
        val taskId = "test-task-456"
        val photoUrl = "https://firebase.storage.com/photo.jpg"
        val mockUri = mockk<Uri>()

        every { mockChildIdRepository.getChildId() } returns flowOf(childId)

        // Mock storage operations
        val mockStorageRef = mockk<StorageReference>()
        val mockPhotoRef = mockk<StorageReference>()
        val mockUploadTask = mockk<UploadTask>()
        val mockUploadTaskSnapshot = mockk<UploadTask.TaskSnapshot>()
        
        every { mockStorage.reference } returns mockStorageRef
        every { mockStorageRef.child("proofs/$childId/$taskId.jpg") } returns mockPhotoRef
        every { mockPhotoRef.putFile(mockUri) } returns mockUploadTask
        every { mockUploadTask.await() } returns mockUploadTaskSnapshot
        every { mockPhotoRef.downloadUrl } returns Tasks.forResult(Uri.parse(photoUrl))

        // Mock functions operations
        val mockHttpsCallable = mockk<HttpsCallableReference>()
        val mockResult = mockk<HttpsCallableResult>()
        every { mockFunctions.getHttpsCallable("completeTask") } returns mockHttpsCallable
        every { mockHttpsCallable.call(any()) } returns Tasks.forResult(mockResult)

        // When
        viewModel.completeTaskWithPhoto(taskId, mockUri)
        advanceUntilIdle()

        // Then
        verify { mockPhotoRef.putFile(mockUri) }
        verify { 
            mockHttpsCallable.call(
                match<HashMap<String, String>> { data ->
                    data["childImei"] == childId &&
                    data["taskId"] == taskId &&
                    data["photoUrl"] == photoUrl
                }
            )
        }
    }

    @Test
    fun `completeTaskWithPhoto handles storage upload failure`() = runTest {
        // Given
        val childId = "test-child-123"
        val taskId = "test-task-456"
        val mockUri = mockk<Uri>()
        
        every { mockChildIdRepository.getChildId() } returns flowOf(childId)

        // Mock storage failure
        val mockStorageRef = mockk<StorageReference>()
        val mockPhotoRef = mockk<StorageReference>()
        val mockUploadTask = mockk<UploadTask>()
        
        every { mockStorage.reference } returns mockStorageRef
        every { mockStorageRef.child("proofs/$childId/$taskId.jpg") } returns mockPhotoRef
        every { mockPhotoRef.putFile(mockUri) } returns mockUploadTask
        every { mockUploadTask.await() } throws Exception("Storage upload failed")

        // When
        viewModel.completeTaskWithPhoto(taskId, mockUri)
        advanceUntilIdle()

        // Then - Should handle exception gracefully without calling functions
        verify { mockPhotoRef.putFile(mockUri) }
        verify(exactly = 0) { mockFunctions.getHttpsCallable(any()) }
    }

    @Test
    fun `completeTaskWithPhoto handles function call failure`() = runTest {
        // Given
        val childId = "test-child-123"
        val taskId = "test-task-456"
        val photoUrl = "https://firebase.storage.com/photo.jpg"
        val mockUri = mockk<Uri>()

        every { mockChildIdRepository.getChildId() } returns flowOf(childId)

        // Mock successful storage operations
        val mockStorageRef = mockk<StorageReference>()
        val mockPhotoRef = mockk<StorageReference>()
        val mockUploadTask = mockk<UploadTask>()
        val mockUploadTaskSnapshot = mockk<UploadTask.TaskSnapshot>()
        
        every { mockStorage.reference } returns mockStorageRef
        every { mockStorageRef.child("proofs/$childId/$taskId.jpg") } returns mockPhotoRef
        every { mockPhotoRef.putFile(mockUri) } returns mockUploadTask
        every { mockUploadTask.await() } returns mockUploadTaskSnapshot
        every { mockPhotoRef.downloadUrl } returns Tasks.forResult(Uri.parse(photoUrl))

        // Mock function failure
        val mockHttpsCallable = mockk<HttpsCallableReference>()
        every { mockFunctions.getHttpsCallable("completeTask") } returns mockHttpsCallable
        every { mockHttpsCallable.call(any()) } returns Tasks.forException(Exception("Function call failed"))

        // When
        viewModel.completeTaskWithPhoto(taskId, mockUri)
        advanceUntilIdle()

        // Then - Should handle exception gracefully
        verify { mockPhotoRef.putFile(mockUri) }
        verify { mockHttpsCallable.call(any()) }
    }
}