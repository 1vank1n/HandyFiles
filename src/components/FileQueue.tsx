import { useTranscriptionStore, QueuedFile } from "../stores/transcriptionStore";

const stageLabels: Record<string, string> = {
  decoding: "Декодирование",
  resampling: "Ресемплинг",
  transcribing: "Транскрибация",
};

const statusLabels: Record<QueuedFile["status"], string> = {
  queued: "В очереди",
  converting: "Декодирование...",
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
  const { selectFile, selectedFileId, removeFile, retranscribeFile, cancelTranscription } = useTranscriptionStore();
  const isSelected = selectedFileId === file.id;
  const isProcessing = file.status === "converting" || file.status === "transcribing";
  const hasProgress = isProcessing && file.progress !== undefined;

  const stageLabel = file.stage ? stageLabels[file.stage] ?? file.stage : null;

  return (
    <div
      onClick={() => selectFile(file.id)}
      className={`flex flex-col gap-1 rounded-md px-3 py-2 cursor-pointer transition-colors ${
        isSelected
          ? "bg-[var(--bg-tertiary)]"
          : "hover:bg-[var(--bg-tertiary)]/50"
      }`}
    >
      <div className="flex items-center gap-3 text-sm">
        <span className="truncate flex-1 text-[var(--text-primary)]">
          {file.filename}
        </span>

        {isProcessing && !hasProgress && (
          <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        )}

        <span className={`text-xs whitespace-nowrap ${statusColors[file.status]}`}>
          {isProcessing && stageLabel
            ? `${stageLabel}${hasProgress ? ` ${Math.round(file.progress! * 100)}%` : "..."}`
            : file.status === "error" && file.error
              ? file.error.slice(0, 30)
              : statusLabels[file.status]}
        </span>

        {isProcessing && (
          <button
            onClick={(e) => { e.stopPropagation(); cancelTranscription(file.id); }}
            className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
            title="Отменить"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" />
            </svg>
          </button>
        )}

        {(file.status === "completed" || file.status === "error") && (
          <button
            onClick={(e) => { e.stopPropagation(); retranscribeFile(file.id); }}
            className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            title="Повторить транскрибацию"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M20.016 14.644v4.992" />
            </svg>
          </button>
        )}

        {(file.status === "completed" || file.status === "error" || file.status === "queued") && (
          <button
            onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
            className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
            title="Удалить из очереди"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Progress bar */}
      {hasProgress && (
        <div className="h-1 rounded-full bg-[var(--bg-primary)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${Math.round(file.progress! * 100)}%` }}
          />
        </div>
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
