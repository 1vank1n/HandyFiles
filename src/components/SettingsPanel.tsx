import { useModelStore } from "../stores/modelStore";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

interface DecoderStatus {
  native_formats: string[];
  ffmpeg_available: boolean;
  ffmpeg_path: string | null;
  ffmpeg_formats: string[];
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
  const [decoder, setDecoder] = useState<DecoderStatus | null>(null);

  useEffect(() => {
    invoke<DecoderStatus>("get_decoder_status").then(setDecoder);
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

      {/* Decoder Status */}
      {decoder && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            Декодер аудио
          </label>
          <div className="flex flex-col gap-2 rounded-lg bg-[var(--bg-tertiary)] px-3 py-2.5">
            {/* Native decoder */}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
              <span className="text-xs text-[var(--text-secondary)]">
                Встроенный (Symphonia)
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] pl-4">
              {decoder.native_formats.join(", ")}
            </p>

            {/* FFmpeg fallback */}
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${
                decoder.ffmpeg_available ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"
              }`} />
              <span className="text-xs text-[var(--text-secondary)]">
                FFmpeg (доп. форматы)
              </span>
              {!decoder.ffmpeg_available && (
                <span className="text-[10px] text-[var(--text-muted)]">
                  — не установлен
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)] pl-4">
              {decoder.ffmpeg_available
                ? `${decoder.ffmpeg_formats.join(", ")} · ${decoder.ffmpeg_path}`
                : `${decoder.ffmpeg_formats.join(", ")} · brew install ffmpeg`
              }
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
