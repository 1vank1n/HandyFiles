import { useModelStore, ModelInfo } from "../stores/modelStore";

function formatSize(mb: number): string {
  if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatProgress(progress: number): string {
  return `${Math.round(progress * 100)}%`;
}

function ModelRow({ model }: { model: ModelInfo }) {
  const { downloadModel, deleteModel, selectModel, selectedModelId } =
    useModelStore();

  const isSelected = selectedModelId === model.id;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
        isSelected
          ? "bg-[var(--accent)]/10 border border-[var(--accent)]/30"
          : "hover:bg-[var(--bg-tertiary)] border border-transparent"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {model.name}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {formatSize(model.size_mb)}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)] truncate">
          {model.description}
        </p>
        {model.is_downloading && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
                style={{ width: `${model.download_progress * 100}%` }}
              />
            </div>
            <span className="text-xs text-[var(--accent)]">
              {formatProgress(model.download_progress)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {model.is_downloaded ? (
          <>
            {!isSelected && (
              <button
                onClick={() => selectModel(model.id)}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
              >
                Выбрать
              </button>
            )}
            {isSelected && (
              <span className="rounded-md px-2.5 py-1 text-xs font-medium text-[var(--success)]">
                Активна
              </span>
            )}
            <button
              onClick={() => deleteModel(model.id)}
              className="rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
            >
              Удалить
            </button>
          </>
        ) : model.is_downloading ? (
          <span className="text-xs text-[var(--text-muted)]">Загрузка...</span>
        ) : (
          <button
            onClick={() => downloadModel(model.id)}
            className="rounded-md px-3 py-1 text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
          >
            Скачать
          </button>
        )}
      </div>
    </div>
  );
}

export default function ModelSelector() {
  const { models } = useModelStore();

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-1">
        Модели
      </h3>
      <div className="flex flex-col gap-1 rounded-lg bg-[var(--bg-secondary)] p-2">
        {models.map((model) => (
          <ModelRow key={model.id} model={model} />
        ))}
      </div>
    </div>
  );
}
