import { useTranscriptionStore, QueuedFile } from "../stores/transcriptionStore";

const statusLabels: Record<QueuedFile["status"], string> = {
  queued: "В очереди",
  converting: "Конвертация...",
  transcribing: "Транскрибация...",
  completed: "Готово",
  error: "Ошибка",
};

const statusColors: Record<QueuedFile["status"], string> = {
  queued: "text-[var(--text-muted)]",
  converting: "text-[var(--accent)]",
  transcribing: "text-[var(--accent)]",
  completed: "text-[var(--success)]",
  error: "text-[var(--error)]",
};

function FileItem({ file }: { file: QueuedFile }) {
  const { selectFile, selectedFileId, removeFile } = useTranscriptionStore();
  const isSelected = selectedFileId === file.id;
  const isProcessing = file.status === "converting" || file.status === "transcribing";

  return (
    <div
      onClick={() => selectFile(file.id)}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-pointer transition-colors ${
        isSelected
          ? "bg-[var(--bg-tertiary)]"
          : "hover:bg-[var(--bg-tertiary)]/50"
      }`}
    >
      <span className="truncate flex-1 text-[var(--text-primary)]">
        {file.filename}
      </span>

      {isProcessing && (
        <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      )}

      <span className={`text-xs whitespace-nowrap ${statusColors[file.status]}`}>
        {file.status === "error" && file.error
          ? file.error.slice(0, 30)
          : statusLabels[file.status]}
      </span>

      {(file.status === "completed" || file.status === "error" || file.status === "queued") && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeFile(file.id);
          }}
          className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function FileQueue() {
  const { files, transcribeAll, clearCompleted } = useTranscriptionStore();

  if (files.length === 0) return null;

  const hasQueued = files.some((f) => f.status === "queued");
  const hasCompleted = files.some(
    (f) => f.status === "completed" || f.status === "error",
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">
          Файлы ({files.length})
        </h2>
        <div className="flex gap-2">
          {hasQueued && (
            <button
              onClick={transcribeAll}
              className="rounded-md px-3 py-1 text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
            >
              Транскрибировать все
            </button>
          )}
          {hasCompleted && (
            <button
              onClick={clearCompleted}
              className="rounded-md px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              Очистить
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-0.5 rounded-lg bg-[var(--bg-secondary)] p-2">
        {files.map((file) => (
          <FileItem key={file.id} file={file} />
        ))}
      </div>
    </div>
  );
}
