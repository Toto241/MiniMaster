import { readFileSync } from "fs";
import * as path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

describe("Android child task-lock contract", () => {
  it("does not map missing task snapshots to a pending lock", () => {
    const taskModel = read("childApp/src/main/java/com/google/pairing/TaskModel.kt");
    const monitoringService = read("childApp/src/main/java/com/google/pairing/TaskMonitoringService.kt");
    const accessibilityService = read("childApp/src/main/java/com/google/pairing/child/MiniMasterAccessibilityService.kt");

    expect(taskModel).toContain("NONE(\"none\")");
    expect(taskModel).toContain("fun fromString(status: String?): TaskStatus");
    expect(taskModel).toContain("?: NONE");
    expect(monitoringService).toContain("putExtra(\"has_active_task\", task != null)");
    expect(monitoringService).toContain("task?.status ?: TaskStatus.NONE.value");
    expect(accessibilityService).toContain("private var currentTaskStatus: TaskStatus = TaskStatus.NONE");
    expect(accessibilityService).toContain("getBooleanExtra(\"has_active_task\", true)");
  });

  it("observes approved tasks so the unlock timer can start", () => {
    const repository = read("childApp/src/main/java/com/google/pairing/TaskRepository.kt");
    const monitoringService = read("childApp/src/main/java/com/google/pairing/TaskMonitoringService.kt");
    const taskModel = read("childApp/src/main/java/com/google/pairing/TaskModel.kt");

    expect(repository).not.toContain(".whereIn(\"status\"");
    expect(repository).toContain(".orderBy(\"createdAt\", com.google.firebase.firestore.Query.Direction.DESCENDING)");
    expect(repository).toContain(".limit(1)");
    expect(taskModel).toContain("val unlockDuration: Long? = null");
    expect(monitoringService).toContain("putExtra(\"unlock_duration\", task?.unlockDuration ?: 0L)");
  });

  it("keeps pending proof reviews locked and persists approved unlock windows", () => {
    const accessibilityService = read("childApp/src/main/java/com/google/pairing/child/MiniMasterAccessibilityService.kt");

    expect(accessibilityService).toContain("currentTaskStatus == TaskStatus.PENDING_APPROVAL");
    expect(accessibilityService).toContain("private const val TASK_LOCK_PREFS = \"task_lock_state\"");
    expect(accessibilityService).toContain("private const val KEY_UNLOCK_END_TIME = \"unlock_end_time\"");
    expect(accessibilityService).toContain("persistUnlockEndTime(unlockEndTime)");
    expect(accessibilityService).toContain(".putLong(KEY_UNLOCK_END_TIME, value)");
  });
});
