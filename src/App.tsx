import { useState, useEffect, useCallback } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useModelStore } from "./stores/modelStore";
import { useTranscriptionStore } from "./stores/transcriptionStore";
import DropZone from "./components/DropZone";
import ModelSelector from "./components/ModelSelector";
import FileQueue from "./components/FileQueue";
import TranscriptionResult from "./components/TranscriptionResult";
import SettingsPanel from "./components/SettingsPanel";
import LogPanel from "./components/LogPanel";

const SUPPORTED_EXTENSIONS = [
  "mp4", "mkv", "mov", "avi", "webm",
  "mp3", "wav", "flac", "ogg", "m4a", "aac", "wma",
];

const LANGUAGE_NAMES: Record<string, string> = {
  ru: "Русский",
  en: "English",
  uk: "Українська",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  auto: "Авто",
};

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [showModels, setShowModels] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const { fetchModels, initListeners: initModelListeners, selectedModelId, language } =
    useModelStore();
  const { addFiles, transcribeFile, initListeners: initTranscriptionListeners, files } =
    useTranscriptionStore();

  const handleFileDrop = useCallback(
    async (paths: string[]) => {
      const supported = paths.filter((p) => {
        const ext = p.split(".").pop()?.toLowerCase() ?? "";
        return SUPPORTED_EXTENSIONS.includes(ext);
      });
      if (supported.length > 0) {
        await addFiles(supported);

        // Auto-transcribe if model is selected
        if (selectedModelId) {
          // Get fresh state after addFiles
          const store = useTranscriptionStore.getState();
          const queued = store.files.filter((f) => f.status === "queued");
          for (const file of queued) {
            transcribeFile(file.id);
          }
        }
      }
    },
    [addFiles, transcribeFile, selectedModelId],
  );

  useEffect(() => {
    fetchModels();
    const cleanups: (() => void)[] = [];

    initModelListeners().then((fn) => cleanups.push(fn));
    initTranscriptionListeners().then((fn) => cleanups.push(fn));

    return () => cleanups.forEach((fn) => fn());
  }, [fetchModels, initModelListeners, initTranscriptionListeners]);

  useEffect(() => {
    const webview = getCurrentWebview();
    const unlisten = webview.onDragDropEvent((event) => {
      if (event.payload.type === "over") {
        setIsDragging(true);
      } else if (event.payload.type === "drop") {
        setIsDragging(false);
        handleFileDrop(event.payload.paths);
      } else if (event.payload.type === "leave") {
        setIsDragging(false);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleFileDrop]);

  const selectedModel = useModelStore((s) =>
    s.models.find((m) => m.id === s.selectedModelId),
  );

  const hasFiles = files.length > 0;
  const isProcessing = files.some(
    (f) => f.status === "converting" || f.status === "transcribing",
  );

  return (
    <div className="flex h-full flex-col p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          HandyFiles
        </h1>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setShowSettings(!showSettings); setShowModels(false); }}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              showSettings
                ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`}
          >
            Настройки
          </button>
          <button
            onClick={() => { setShowModels(!showModels); setShowSettings(false); }}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              showModels
                ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`}
          >
            Модели
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {/* Model selector panel */}
      {showModels && <ModelSelector />}

      {/* Drop Zone */}
      <DropZone isDragging={isDragging} />

      {/* No model warning */}
      {!selectedModelId && hasFiles && (
        <div className="rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/30 px-4 py-2.5 text-sm text-[var(--error)]">
          Выберите модель для транскрибации.{" "}
          <button
            onClick={() => { setShowModels(true); setShowSettings(false); }}
            className="underline hover:no-underline"
          >
            Открыть модели
          </button>
        </div>
      )}

      {/* File Queue */}
      <FileQueue />

      {/* Transcription Result */}
      <TranscriptionResult />

      {/* Log Panel */}
      {showLog && <LogPanel onClose={() => setShowLog(false)} />}

      {/* Status Bar */}
      <div className="mt-auto flex items-center gap-2 text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-color)]">
        <span>
          {selectedModel ? selectedModel.name : "Модель не выбрана"}
        </span>
        <span>·</span>
        <span>{LANGUAGE_NAMES[language] ?? language}</span>
        {isProcessing && (
          <>
            <span>·</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 border border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[var(--accent)]">Обработка</span>
            </div>
          </>
        )}
        <button
          onClick={() => setShowLog(!showLog)}
          className={`ml-auto transition-colors ${showLog ? "text-[var(--text-secondary)]" : "hover:text-[var(--text-secondary)]"}`}
        >
          Лог
        </button>
      </div>
    </div>
  );
}

export default App;
