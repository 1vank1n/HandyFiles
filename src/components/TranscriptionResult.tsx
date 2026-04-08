import { useTranscriptionStore } from "../stores/transcriptionStore";
import { useI18n } from "../lib/i18n";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

export default function TranscriptionResult() {
  const { files, selectedFileId, retranscribeFile } = useTranscriptionStore();
  const { t } = useI18n();
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
        title: t("saveTranscription"),
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
    <div className="flex flex-col gap-2 flex-1 min-h-0 pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">
            {t("result")}
          </h2>
          {file.duration_ms && (
            <span className="text-xs text-[var(--text-muted)]">
              {(file.duration_ms / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {file.is_video && (
            <button
              onClick={async () => {
                const baseName = file.filename.replace(/\.[^.]+$/, "");
                const path = await save({
                  title: t("saveAudioTrack"),
                  defaultPath: `${baseName}.wav`,
                  filters: [{ name: "WAV Audio", extensions: ["wav"] }],
                });
                if (path) {
                  try {
                    await invoke("export_audio", { fileId: file.id, outputPath: path });
                  } catch (e) {
                    console.error("Export failed:", e);
                  }
                }
              }}
              className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              title={t("saveAudioTrack")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z" />
              </svg>
            </button>
          )}
          <button
            onClick={() => retranscribeFile(file.id)}
            className="rounded-md px-3 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title={t("retry")}
          >
            {t("retry")}
          </button>
          <button
            onClick={handleCopy}
            className="rounded-md px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            {copied ? t("copied") : t("copy")}
          </button>
          <button
            onClick={handleSave}
            className="rounded-md px-3 py-1 text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
          >
            {t("save")}
          </button>
        </div>
      </div>
      <div className="min-h-[120px] max-h-[400px] overflow-y-auto rounded-lg bg-[var(--bg-secondary)] p-4">
        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
          {file.result}
        </p>
      </div>
    </div>
  );
}
