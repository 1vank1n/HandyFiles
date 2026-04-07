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
}

interface TranscriptionUpdate {
  file_id: string;
  status: string;
  text?: string;
  duration_ms?: number;
  error?: string;
}

interface TranscriptionStore {
  files: QueuedFile[];
  selectedFileId: string | null;

  addFiles: (paths: string[]) => Promise<void>;
  transcribeFile: (fileId: string) => Promise<void>;
  transcribeAll: () => Promise<void>;
  selectFile: (fileId: string) => void;
  clearCompleted: () => Promise<void>;
  removeFile: (fileId: string) => void;
  initListeners: () => Promise<() => void>;
}

export const useTranscriptionStore = create<TranscriptionStore>((set, get) => ({
  files: [],
  selectedFileId: null,

  addFiles: async (paths: string[]) => {
    try {
      const newFiles = await invoke<QueuedFile[]>("queue_files", { paths });
      set((state) => ({
        files: [...state.files, ...newFiles],
      }));

      // Auto-select first added file
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

  initListeners: async () => {
    const unlisten = await listen<TranscriptionUpdate>(
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

        // Auto-select completed file
        if (status === "completed") {
          set({ selectedFileId: file_id });
        }
      },
    );

    return unlisten;
  },
}));
