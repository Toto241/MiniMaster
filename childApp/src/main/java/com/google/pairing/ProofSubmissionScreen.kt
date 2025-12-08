package com.google.pairing

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import android.widget.Toast
import coil.compose.rememberImagePainter
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.File

/**
 * A Composable screen for submitting proof (photo) for a task.
 *
 * This screen allows the child to take a photo using the camera and upload it
 * as proof of task completion.
 *
 * @param onProofSubmitted Callback invoked when the proof is successfully submitted.
 * @param taskViewModel The ViewModel to access current task data.
 */
@Composable
fun ProofSubmissionScreen(
    onProofSubmitted: () -> Unit,
    taskViewModel: TaskViewModel = viewModel()
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var imageUri by remember { mutableStateOf<Uri?>(null) }
    var isUploading by remember { mutableStateOf(false) }
    val currentTask by taskViewModel.currentTask.collectAsState()

    // Launcher for the camera app
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
        onResult = { success ->
            if (success) {
                // Image was successfully captured, imageUri is set
            }
        }
    )
    // Temporäre Datei für die Kamera-Aufnahme
        val tempImageFile = remember { 
        val timeStamp: String = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
        File(context.cacheDir, "proof_temp.jpg") 
    }
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Task: ${currentTask?.title ?: "Unknown"}", style = MaterialTheme.typography.h5)
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = "Description: ${currentTask?.description ?: "None"}")
        Spacer(modifier = Modifier.height(32.dp))

        if (imageUri != null) {
            Image(
                painter = rememberImagePainter(imageUri),
                contentDescription = "Proof Preview",
                modifier = Modifier
                    .size(200.dp)
                    .fillMaxWidth(),
                contentScale = ContentScale.Crop
            )
            Spacer(modifier = Modifier.height(16.dp))
        }

        Button(
            onClick = {
                // Erstellt eine temporäre URI für die Kamera-App
                                imageUri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    tempImageFile
                )
                cameraLauncher.launch(imageUri)
            },
            enabled = !isUploading
        ) {
            Text("Take Photo Proof")
        }

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                currentTask?.let { task ->
                    imageUri?.let { uri ->
                        coroutineScope.launch {
                            isUploading = true
                            val success = uploadProofAndSubmit(task.taskId, uri, context)
                            isUploading = false
                            if (success) {
                                Toast.makeText(context, "Proof submitted successfully!", Toast.LENGTH_SHORT).show()
                                onProofSubmitted()
                            } else {
                                Toast.makeText(context, "Failed to submit proof. Please try again.", Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                }
            },
            enabled = imageUri != null && !isUploading
        ) {
            if (isUploading) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White)
            } else {
                Text("Submit Proof")
            }
        }
    }
}

/**
 * Uploads the photo to Firebase Storage and calls the Cloud Function.
 *
 * @param taskId The ID of the task being completed.
 * @param uri The URI of the photo to upload.
 * @return True if successful, false otherwise.
 */
suspend fun uploadProofAndSubmit(taskId: String, uri: Uri, context: android.content.Context): Boolean {
    val storageRef = FirebaseStorage.getInstance().reference
    val proofRef = storageRef.child("task_proofs/${taskId}/${System.currentTimeMillis()}.jpg")

    return try {
        val uploadTask = proofRef.putFile(uri).await()
        val downloadUrl = uploadTask.storage.downloadUrl.await().toString()
                        // Use the actual ChildIdProvider implementation
        val childIdProvider = ChildIdProviderImpl(context)
        val taskRepository = TaskRepository(
            FirebaseFirestore.getInstance(),
            FirebaseFunctions.getInstance(),
            childIdProvider
        )
        
        // Ruft die Cloud Function auf
        taskRepository.submitTaskProof(taskId, downloadUrl)
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }
}
