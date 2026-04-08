import { open } from "@tauri-apps/plugin-dialog";
import { useI18n } from "../lib/i18n";

interface DropZoneProps {
  isDragging: boolean;
  onFiles: (paths: string[]) => void;
}

function DropZone({ isDragging, onFiles }: DropZoneProps) {
  const { t } = useI18n();

  const handleClick = async () => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Media",
          extensions: [
            "mp4", "mkv", "mov", "avi", "webm",
            "mp3", "wav", "flac", "ogg", "m4a", "aac", "wma",
          ],
        },
      ],
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      onFiles(paths);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`
        flex flex-col items-center justify-center cursor-pointer
        rounded-xl border-2 border-dashed
        transition-all duration-200 ease-out
        min-h-[180px]
        ${
          isDragging
            ? "border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]"
            : "border-[var(--border-color)] bg-[var(--bg-secondary)] hover:border-[var(--text-muted)]"
        }
      `}
    >
      <svg
        className={`mb-3 h-10 w-10 transition-colors ${
          isDragging ? "text-[var(--accent)]" : "text-[var(--text-muted)]"
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
        />
      </svg>

      <p
        className={`text-sm font-medium transition-colors ${
          isDragging ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {t("dropTitle")}
      </p>

      <p className="mt-1 text-xs text-[var(--text-muted)]">
        {t("dropSubtitle")} · mp4 · mp3 · wav · m4a · mkv · webm
      </p>
    </div>
  );
}

export default DropZone;
