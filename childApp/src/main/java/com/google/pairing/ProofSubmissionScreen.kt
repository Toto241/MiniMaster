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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.rememberImagePainter
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.File

/**
 * Composable-Screen zur Einreichung des Nachweises (Foto) für eine Aufgabe.
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

    // Launcher für die Kamera-App
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
        onResult = { success ->
            if (success) {
                // Bild wurde erfolgreich aufgenommen, imageUri ist gesetzt
            }
        }
    )

    // Temporäre Datei für die Kamera-Aufnahme
    val tempImageFile = remember { File(context.cacheDir, "proof_temp.jpg") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Aufgabe: ${currentTask?.title ?: "Unbekannt"}", style = MaterialTheme.typography.h5)
        Spacer(modifier = Modifier.height(8.dp))
        Text(text = "Beschreibung: ${currentTask?.description ?: "Keine"}")
        Spacer(modifier = Modifier.height(32.dp))

        if (imageUri != null) {
            Image(
                painter = rememberImagePainter(imageUri),
                contentDescription = "Vorschau des Nachweises",
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
                imageUri = Uri.fromFile(tempImageFile)
                cameraLauncher.launch(imageUri)
            },
            enabled = !isUploading
        ) {
            Text("Foto als Nachweis aufnehmen")
        }

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                currentTask?.let { task ->
                    imageUri?.let { uri ->
                        coroutineScope.launch {
                            isUploading = true
                            val success = uploadProofAndSubmit(task.taskId, uri)
                            isUploading = false
                            if (success) {
                                onProofSubmitted()
                            } else {
                                // Fehlerbehandlung
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
                Text("Nachweis einreichen")
            }
        }
    }
}

/**
 * Lädt das Foto in Firebase Storage hoch und ruft die Cloud Function auf.
 */
suspend fun uploadProofAndSubmit(taskId: String, uri: Uri): Boolean {
    val storageRef = FirebaseStorage.getInstance().reference
    val proofRef = storageRef.child("task_proofs/${taskId}/${System.currentTimeMillis()}.jpg")

    return try {
        val uploadTask = proofRef.putFile(uri).await()
        val downloadUrl = uploadTask.storage.downloadUrl.await().toString()

        // Ruft die Cloud Function auf
        val taskRepository = TaskRepository(
            FirebaseFirestore.getInstance(),
            FirebaseFunctions.getInstance(),
            // Hier müsste der ChildIdProvider injiziert werden, für dieses Beispiel nehmen wir eine vereinfachte Instanz an
            object : ChildIdProvider { override fun getChildId(): String = "current_child_id" }
        )
        taskRepository.submitTaskProof(taskId, downloadUrl)
    } catch (e: Exception) {
        e.printStackTrace()
        false
    }
}
