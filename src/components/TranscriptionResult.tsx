import { useTranscriptionStore } from "../stores/transcriptionStore";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useState } from "react";

export default function TranscriptionResult() {
  const { files, selectedFileId } = useTranscriptionStore();
  const [copied, setCopied] = useState(false);

  const file = files.find((f) => f.id === selectedFileId);
  if (!file || file.status !== "completed" || !file.result) return null;

  const handleCopy = async () => {
    try {
      await writeText(file.result!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

  const handleSave = async () => {
    try {
      const baseName = file.filename.replace(/\.[^.]+$/, "");
      const path = await save({
        title: "Сохранить транскрибацию",
        defaultPath: `${baseName}.txt`,
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (path) {
        await writeTextFile(path, file.result!);
      }
    } catch (e) {
      console.error("Save failed:", e);
    }
  };

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            Результат
          </h2>
          {file.duration_ms && (
            <span className="text-xs text-[var(--text-muted)]">
              {(file.duration_ms / 1000).toFixed(1)}с
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="rounded-md px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            {copied ? "Скопировано!" : "Копировать"}
          </button>
          <button
            onClick={handleSave}
            className="rounded-md px-3 py-1 text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
          >
            Сохранить
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg bg-[var(--bg-secondary)] p-4">
        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
          {file.result}
        </p>
      </div>
    </div>
  );
}
