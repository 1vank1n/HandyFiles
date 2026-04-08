import { create } from "zustand";

export type UILocale = "en" | "ru";

const translations = {
  en: {
    // Header
    settings: "Settings",
    models: "Models",

    // Drop zone
    dropTitle: "Drop audio or video",
    dropSubtitle: "or click to browse",

    // File queue
    files: "Files",
    clear: "Clear",
    transcribeAll: "Transcribe all",
    statusQueued: "Queued",
    statusConverting: "Decoding...",
    statusTranscribing: "Transcribing",
    statusCompleted: "Done",
    statusError: "Error",
    stageDecoding: "Decoding",
    stageResampling: "Resampling",
    stageTranscribing: "Transcribing",
    cancelled: "Cancelled",

    // Result
    result: "Result",
    retry: "Retry",
    copy: "Copy",
    copied: "Copied!",
    save: "Save",
    saveTranscription: "Save transcription",
    saveAudioTrack: "Save audio track (WAV)",

    // Settings
    settingsTitle: "Settings",
    transcriptionLanguage: "Transcription language",
    uiLanguage: "Interface language",
    decoder: "Audio decoder",
    builtIn: "Built-in (Symphonia)",
    ffmpegExtra: "FFmpeg (extra formats)",
    ffmpegNotInstalled: "not installed",
    ffmpegNotFound: "FFmpeg not found",
    installVia: "Install via terminal:",

    // Models
    modelsTitle: "Models",
    download: "Download",
    downloading: "Downloading...",
    select: "Select",
    active: "Active",
    delete: "Delete",

    // Status bar
    modelNotSelected: "No model selected",
    processing: "Processing",
    log: "Log",
    logTitle: "Log",
    logClear: "Clear",
    logEmpty: "Empty",

    // Warnings
    selectModelWarning: "Select a model for transcription.",
    openModels: "Open models",

    // Transcription languages
    langAuto: "Auto",
  },
  ru: {
    settings: "Настройки",
    models: "Модели",

    dropTitle: "Перетащите аудио или видео",
    dropSubtitle: "или нажмите для выбора",

    files: "Файлы",
    clear: "Очистить",
    transcribeAll: "Транскрибировать все",
    statusQueued: "В очереди",
    statusConverting: "Декодирование...",
    statusTranscribing: "Транскрибация",
    statusCompleted: "Готово",
    statusError: "Ошибка",
    stageDecoding: "Декодирование",
    stageResampling: "Ресемплинг",
    stageTranscribing: "Транскрибация",
    cancelled: "Отменено",

    result: "Результат",
    retry: "Повторить",
    copy: "Копировать",
    copied: "Скопировано!",
    save: "Сохранить",
    saveTranscription: "Сохранить транскрибацию",
    saveAudioTrack: "Скачать аудио дорожку (WAV)",

    settingsTitle: "Настройки",
    transcriptionLanguage: "Язык транскрибации",
    uiLanguage: "Язык интерфейса",
    decoder: "Декодер аудио",
    builtIn: "Встроенный (Symphonia)",
    ffmpegExtra: "FFmpeg (доп. форматы)",
    ffmpegNotInstalled: "не установлен",
    ffmpegNotFound: "FFmpeg не найден",
    installVia: "Установите через терминал:",

    modelsTitle: "Модели",
    download: "Скачать",
    downloading: "Загрузка...",
    select: "Выбрать",
    active: "Активна",
    delete: "Удалить",

    modelNotSelected: "Модель не выбрана",
    processing: "Обработка",
    log: "Лог",
    logTitle: "Лог",
    logClear: "Очистить",
    logEmpty: "Пусто",

    selectModelWarning: "Выберите модель для транскрибации.",
    openModels: "Открыть модели",

    langAuto: "Авто",
  },
} as const;

type TranslationKey = keyof (typeof translations)["en"];

interface I18nStore {
  locale: UILocale;
  setLocale: (locale: UILocale) => void;
  t: (key: TranslationKey) => string;
}

const STORAGE_KEY = "handyfiles-ui-locale";

function loadLocale(): UILocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ru") return saved;
  } catch {}
  return "en";
}

export const useI18n = create<I18nStore>((set, get) => ({
  locale: loadLocale(),

  setLocale: (locale: UILocale) => {
    localStorage.setItem(STORAGE_KEY, locale);
    set({ locale });
  },

  t: (key: TranslationKey) => {
    const loc = get().locale;
    return translations[loc][key] ?? translations.en[key] ?? key;
  },
}));
