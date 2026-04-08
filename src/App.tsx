import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useModelStore } from "./stores/modelStore";
import { useTranscriptionStore } from "./stores/transcriptionStore";
import DropZone from "./components/DropZone";
import ModelSelector from "./components/ModelSelector";
import FileQueue from "./components/FileQueue";
import TranscriptionResult from "./components/TranscriptionResult";
import SettingsPanel from "./components/SettingsPanel";
import LogPanel from "./components/LogPanel";
import { useI18n } from "./lib/i18n";

const APP_VERSION = __APP_VERSION__;

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

  const { t } = useI18n();
  const { fetchModels, selectedModelId, language } =
    useModelStore();
  const { addFiles, transcribeFile, files } =
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

  const listenersInitRef = useRef(false);
  useEffect(() => {
    if (listenersInitRef.current) return;
    listenersInitRef.current = true;

    fetchModels();

    let cleanupModel: (() => void) | null = null;
    let cleanupTranscription: (() => void) | null = null;

    useModelStore.getState().initListeners().then((fn) => { cleanupModel = fn; });
    useTranscriptionStore.getState().initListeners().then((fn) => { cleanupTranscription = fn; });

    return () => {
      cleanupModel?.();
      cleanupTranscription?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <div className="flex h-full flex-col">
      {/* Header — fixed top */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          HandyFiles
          <span className="ml-1.5 text-xs font-normal text-[var(--text-muted)]">v{APP_VERSION}</span>
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
            {t("settings")}
          </button>
          <button
            onClick={() => { setShowModels(!showModels); setShowSettings(false); }}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              showModels
                ? "bg-[var(--bg-tertiary)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`}
          >
            {t("models")}
          </button>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 flex flex-col gap-3">
        {/* Settings panel */}
        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

        {/* Model selector panel */}
        {showModels && <ModelSelector />}

        {/* Drop Zone */}
        <DropZone isDragging={isDragging} onFiles={handleFileDrop} />

        {/* No model warning */}
        {!selectedModelId && hasFiles && (
          <div className="rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/30 px-4 py-2.5 text-sm text-[var(--error)]">
            {t("selectModelWarning")}{" "}
            <button
              onClick={() => { setShowModels(true); setShowSettings(false); }}
              className="underline hover:no-underline"
            >
              {t("openModels")}
            </button>
          </div>
        )}

        {/* File Queue */}
        <FileQueue />

        {/* Transcription Result */}
        <TranscriptionResult />
      </div>

      {/* Status Bar — fixed bottom */}
      <div className="shrink-0 flex items-center gap-2 text-xs text-[var(--text-muted)] px-4 py-2 border-t border-[var(--border-color)]">
        <span>
          {selectedModel ? selectedModel.name : t("modelNotSelected")}
        </span>
        <span>·</span>
        <span>{LANGUAGE_NAMES[language] ?? language}</span>
        {isProcessing && (
          <>
            <span>·</span>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 border border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[var(--accent)]">{t("processing")}</span>
            </div>
          </>
        )}
        <button
          onClick={() => setShowLog(!showLog)}
          className={`ml-auto transition-colors ${showLog ? "text-[var(--text-secondary)]" : "hover:text-[var(--text-secondary)]"}`}
        >
          {t("log")}
        </button>
      </div>

      {/* Log Panel — fixed overlay above status bar */}
      {showLog && (
        <div className="fixed bottom-8 left-0 right-0 z-50 px-2">
          <LogPanel onClose={() => setShowLog(false)} />
        </div>
      )}
    </div>
  );
}

export default App;
