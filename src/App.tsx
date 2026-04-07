import { useState, useEffect, useCallback } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import DropZone from "./components/DropZone";

function App() {
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileDrop = useCallback((paths: string[]) => {
    const supported = paths.filter((p) => {
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      return [
        "mp4", "mkv", "mov", "avi", "webm",
        "mp3", "wav", "flac", "ogg", "m4a", "aac", "wma",
      ].includes(ext);
    });
    if (supported.length > 0) {
      setDroppedFiles((prev) => [...prev, ...supported]);
    }
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

  return (
    <div className="flex h-full flex-col p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          HandyFiles
        </h1>
        <button
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          Settings
        </button>
      </div>

      {/* Drop Zone */}
      <DropZone isDragging={isDragging} />

      {/* File List Placeholder */}
      {droppedFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Файлы ({droppedFiles.length})
          </h2>
          <div className="flex flex-col gap-1 rounded-lg bg-[var(--bg-secondary)] p-3">
            {droppedFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <span className="text-[var(--text-muted)]">
                  {file.includes("/") ? "📄" : "📄"}
                </span>
                <span className="truncate">
                  {file.split("/").pop()}
                </span>
                <span className="ml-auto text-xs text-[var(--text-muted)]">
                  В очереди
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="mt-auto flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span>Модель: не выбрана</span>
        <span>·</span>
        <span>Язык: Русский</span>
      </div>
    </div>
  );
}

export default App;
