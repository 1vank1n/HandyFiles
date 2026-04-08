import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface QueuedFile {
  id: string;
  path: string;
  filename: string;
  status: "queued" | "converting" | "transcribing" | "completed" | "error";
  result?: string;
  duration_ms?: number;
  error?: string;
  progress?: number;
  stage?: string;
}

export interface LogEntry {
  fileId: string;
  message: string;
  timestamp: number;
}

interface TranscriptionUpdate {
  file_id: string;
  status: string;
  text?: string;
  duration_ms?: number;
  error?: string;
}

interface ProgressUpdate {
  file_id: string;
  stage: string;
  progress: number;
}

interface LogUpdate {
  file_id: string;
  message: string;
}

interface TranscriptionStore {
  files: QueuedFile[];
  selectedFileId: string | null;
  logs: LogEntry[];

  addFiles: (paths: string[]) => Promise<void>;
  transcribeFile: (fileId: string) => Promise<void>;
  retranscribeFile: (fileId: string) => Promise<void>;
  transcribeAll: () => Promise<void>;
  selectFile: (fileId: string) => void;
  clearCompleted: () => Promise<void>;
  removeFile: (fileId: string) => void;
  clearLogs: () => void;
  initListeners: () => Promise<() => void>;
}

export const useTranscriptionStore = create<TranscriptionStore>((set, get) => ({
  files: [],
  selectedFileId: null,
  logs: [],

  addFiles: async (paths: string[]) => {
    try {
      const newFiles = await invoke<QueuedFile[]>("queue_files", { paths });
      set((state) => ({
        files: [...state.files, ...newFiles],
      }));

      if (newFiles.length > 0 && !get().selectedFileId) {
        set({ selectedFileId: newFiles[0].id });
      }
    } catch (e) {
      console.error("Queue failed:", e);
    }
  },

  transcribeFile: async (fileId: string) => {
    try {
      await invoke("transcribe_file", { fileId });
    } catch (e) {
      console.error("Transcription failed:", e);
    }
  },

  retranscribeFile: async (fileId: string) => {
    try {
      await invoke("reset_file_for_retranscribe", { fileId });
      set((state) => ({
        files: state.files.map((f) =>
          f.id === fileId
            ? { ...f, status: "queued" as const, result: undefined, duration_ms: undefined, error: undefined, progress: undefined, stage: undefined }
            : f,
        ),
      }));
      await invoke("transcribe_file", { fileId });
    } catch (e) {
      console.error("Re-transcription failed:", e);
    }
  },

  transcribeAll: async () => {
    const queued = get().files.filter((f) => f.status === "queued");
    for (const file of queued) {
      await get().transcribeFile(file.id);
    }
  },

  selectFile: (fileId: string) => {
    set({ selectedFileId: fileId });
  },

  clearCompleted: async () => {
    try {
      await invoke("clear_completed");
      set((state) => ({
        files: state.files.filter(
          (f) => f.status !== "completed" && f.status !== "error",
        ),
        selectedFileId:
          state.selectedFileId &&
          state.files.find((f) => f.id === state.selectedFileId)?.status !== "completed" &&
          state.files.find((f) => f.id === state.selectedFileId)?.status !== "error"
            ? state.selectedFileId
            : null,
      }));
    } catch (e) {
      console.error("Clear failed:", e);
    }
  },

  removeFile: (fileId: string) => {
    set((state) => ({
      files: state.files.filter((f) => f.id !== fileId),
      selectedFileId: state.selectedFileId === fileId ? null : state.selectedFileId,
    }));
  },

  clearLogs: () => set({ logs: [] }),

  initListeners: async () => {
    const unlistenUpdate = await listen<TranscriptionUpdate>(
      "transcription-update",
      (event) => {
        const { file_id, status, text, duration_ms, error } = event.payload;
        set((state) => ({
          files: state.files.map((f) =>
            f.id === file_id
              ? {
                  ...f,
                  status: status as QueuedFile["status"],
                  result: text ?? f.result,
                  duration_ms: duration_ms ?? f.duration_ms,
                  error: error ?? f.error,
                }
              : f,
          ),
        }));

        if (status === "completed") {
          set({ selectedFileId: file_id });
        }
      },
    );

    const unlistenProgress = await listen<ProgressUpdate>(
      "transcription-progress",
      (event) => {
        const { file_id, stage, progress } = event.payload;
        set((state) => ({
          files: state.files.map((f) =>
            f.id === file_id ? { ...f, progress, stage } : f,
          ),
        }));
      },
    );

    const unlistenLog = await listen<LogUpdate>(
      "transcription-log",
      (event) => {
        set((state) => ({
          logs: [
            ...state.logs,
            {
              fileId: event.payload.file_id,
              message: event.payload.message,
              timestamp: Date.now(),
            },
          ].slice(-200), // keep last 200 entries
        }));
      },
    );

    return () => {
      unlistenUpdate();
      unlistenProgress();
      unlistenLog();
    };
  },
}));
