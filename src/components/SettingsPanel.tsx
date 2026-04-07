import { useModelStore } from "../stores/modelStore";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface FfmpegStatus {
  available: boolean;
  path: string | null;
}

const LANGUAGES = [
  { code: "ru", name: "Русский" },
  { code: "en", name: "English" },
  { code: "uk", name: "Українська" },
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "es", name: "Español" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "auto", name: "Авто" },
];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { language, setLanguage } = useModelStore();
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null);

  useEffect(() => {
    invoke<FfmpegStatus>("get_ffmpeg_status").then(setFfmpegStatus);
  }, []);

  return (
    <div className="flex flex-col gap-4 rounded-xl bg-[var(--bg-secondary)] p-4 border border-[var(--border-color)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
          Настройки
        </h3>
        <button
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Language */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          Язык транскрибации
        </label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>

      {/* FFmpeg Status */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          FFmpeg
        </label>
        {ffmpegStatus ? (
          ffmpegStatus.available ? (
            <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2">
              <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
              <span className="text-xs text-[var(--text-secondary)]">
                {ffmpegStatus.path}
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/30 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--error)]" />
                <span className="text-xs text-[var(--error)]">
                  FFmpeg не найден
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)]">
                Установите через терминал:
              </p>
              <code className="text-xs bg-[var(--bg-primary)] rounded px-2 py-1 text-[var(--text-secondary)] select-all">
                brew install ffmpeg
              </code>
            </div>
          )
        ) : (
          <div className="rounded-lg bg-[var(--bg-tertiary)] px-3 py-2 text-xs text-[var(--text-muted)]">
            Проверка...
          </div>
        )}
      </div>
    </div>
  );
}
