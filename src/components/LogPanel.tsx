import { useRef, useEffect } from "react";
import { useTranscriptionStore } from "../stores/transcriptionStore";
import { useI18n } from "../lib/i18n";

export default function LogPanel({ onClose }: { onClose: () => void }) {
  const { logs, clearLogs } = useTranscriptionStore();
  const { t } = useI18n();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3">
        <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
          {t("logTitle")}
        </h3>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={clearLogs}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              {t("logClear")}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="max-h-40 overflow-y-auto px-3 pb-3 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
        {logs.length === 0 ? (
          <p className="py-2 text-center">{t("logEmpty")}</p>
        ) : (
          logs.map((log, i) => {
            const time = new Date(log.timestamp).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            return (
              <div key={i} className="py-0.5">
                <span className="text-[var(--text-muted)]/50">{time}</span>{" "}
                <span>{log.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
