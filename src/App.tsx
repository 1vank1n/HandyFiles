import { useState, useEffect, useCallback } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useModelStore } from "./stores/modelStore";
import { useTranscriptionStore } from "./stores/transcriptionStore";
import DropZone from "./components/DropZone";
import ModelSelector from "./components/ModelSelector";
import FileQueue from "./components/FileQueue";
import TranscriptionResult from "./components/TranscriptionResult";

const SUPPORTED_EXTENSIONS = [
  "mp4", "mkv", "mov", "avi", "webm",
  "mp3", "wav", "flac", "ogg", "m4a", "aac", "wma",
];

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [showModels, setShowModels] = useState(false);

  const { fetchModels, initListeners: initModelListeners, selectedModelId, language } =
    useModelStore();
  const { addFiles, initListeners: initTranscriptionListeners, files } =
    useTranscriptionStore();

  const handleFileDrop = useCallback(
    (paths: string[]) => {
      const supported = paths.filter((p) => {
        const ext = p.split(".").pop()?.toLowerCase() ?? "";
        return SUPPORTED_EXTENSIONS.includes(ext);
      });
      if (supported.length > 0) {
        addFiles(supported);
      }
    },
    [addFiles],
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

  return (
    <div className="flex h-full flex-col p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          HandyFiles
        </h1>
        <button
          onClick={() => setShowModels(!showModels)}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            showModels
              ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          }`}
        >
          {showModels ? "Закрыть" : "Модели"}
        </button>
      </div>

      {/* Model selector panel */}
      {showModels && <ModelSelector />}

      {/* Drop Zone */}
      <DropZone isDragging={isDragging} />

      {/* No model warning */}
      {!selectedModelId && hasFiles && (
        <div className="rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/30 px-4 py-2.5 text-sm text-[var(--error)]">
          Выберите модель для транскрибации.{" "}
          <button
            onClick={() => setShowModels(true)}
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

      {/* Status Bar */}
      <div className="mt-auto flex items-center gap-2 text-xs text-[var(--text-muted)] pt-2 border-t border-[var(--border-color)]">
        <span>
          Модель:{" "}
          {selectedModel ? selectedModel.name : "не выбрана"}
        </span>
        <span>·</span>
        <span>Язык: {language === "ru" ? "Русский" : language}</span>
      </div>
    </div>
  );
}

export default App;
