import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  engine: string;
  size_mb: number;
  is_downloaded: boolean;
  is_downloading: boolean;
  download_progress: number;
}

interface DownloadProgress {
  model_id: string;
  progress: number;
  downloaded_bytes: number;
  total_bytes: number;
  speed_bps: number;
}

interface ModelStore {
  models: ModelInfo[];
  selectedModelId: string | null;
  language: string;
  loading: boolean;

  fetchModels: () => Promise<void>;
  downloadModel: (modelId: string) => Promise<void>;
  deleteModel: (modelId: string) => Promise<void>;
  selectModel: (modelId: string) => Promise<void>;
  setLanguage: (language: string) => Promise<void>;
  initListeners: () => Promise<() => void>;
}

export const useModelStore = create<ModelStore>((set, get) => ({
  models: [],
  selectedModelId: null,
  language: "ru",
  loading: false,

  fetchModels: async () => {
    set({ loading: true });
    try {
      const models = await invoke<ModelInfo[]>("get_models");
      const selectedModelId = await invoke<string | null>("get_selected_model");
      const language = await invoke<string>("get_language");
      set({ models, selectedModelId, language, loading: false });
    } catch (e) {
      console.error("Failed to fetch models:", e);
      set({ loading: false });
    }
  },

  downloadModel: async (modelId: string) => {
    // Mark as downloading locally
    set((state) => ({
      models: state.models.map((m) =>
        m.id === modelId ? { ...m, is_downloading: true, download_progress: 0 } : m,
      ),
    }));
    try {
      await invoke("download_model", { modelId });
    } catch (e) {
      console.error("Download failed:", e);
      set((state) => ({
        models: state.models.map((m) =>
          m.id === modelId ? { ...m, is_downloading: false } : m,
        ),
      }));
    }
  },

  deleteModel: async (modelId: string) => {
    try {
      await invoke("delete_model", { modelId });
      // If deleted model was selected, deselect
      if (get().selectedModelId === modelId) {
        set({ selectedModelId: null });
      }
      await get().fetchModels();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  },

  selectModel: async (modelId: string) => {
    try {
      await invoke("select_model", { modelId });
      set({ selectedModelId: modelId });
    } catch (e) {
      console.error("Select failed:", e);
    }
  },

  setLanguage: async (language: string) => {
    try {
      await invoke("set_language", { language });
      set({ language });
    } catch (e) {
      console.error("Set language failed:", e);
    }
  },

  initListeners: async () => {
    const unlistenProgress = await listen<DownloadProgress>(
      "model-download-progress",
      (event) => {
        set((state) => ({
          models: state.models.map((m) =>
            m.id === event.payload.model_id
              ? { ...m, download_progress: event.payload.progress }
              : m,
          ),
        }));
      },
    );

    const unlistenComplete = await listen<{ model_id: string }>(
      "model-download-complete",
      (event) => {
        set((state) => ({
          models: state.models.map((m) =>
            m.id === event.payload.model_id
              ? { ...m, is_downloaded: true, is_downloading: false, download_progress: 1 }
              : m,
          ),
        }));
        // Auto-select if no model selected
        if (!get().selectedModelId) {
          get().selectModel(event.payload.model_id);
        }
      },
    );

    const unlistenError = await listen<{ model_id: string; error: string }>(
      "model-download-error",
      (event) => {
        console.error("Download error:", event.payload.error);
        set((state) => ({
          models: state.models.map((m) =>
            m.id === event.payload.model_id
              ? { ...m, is_downloading: false, download_progress: 0 }
              : m,
          ),
        }));
      },
    );

    return () => {
      unlistenProgress();
      unlistenComplete();
      unlistenError();
    };
  },
}));
