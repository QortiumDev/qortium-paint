// Reads Qortium Home's injected display settings (window._qdnTheme,
// _qdnAccent, _qdnTextSize — plus matching query params for gateway use) and
// stamps them onto <html> as data-* attributes that app.css consumes.
// Ported from qortium-notify's displaySettings.ts, minus language/i18n:
// qortium-paint is English-only in v1. Keep this module dependency-free.

export const TEXT_SIZE_VALUES = ['extra-small', 'small', 'medium', 'large', 'extra-large', 'huge'] as const;
export const ACCENT_OPTIONS = ['green', 'blue', 'orange', 'purple', 'red', 'teal', 'cyan', 'pink', 'yellow'] as const;

export type QdnTheme = 'dark' | 'light';
export type QdnTextSize = (typeof TEXT_SIZE_VALUES)[number];
export type QdnAccent = (typeof ACCENT_OPTIONS)[number];

export type QdnDisplaySettings = {
  accent: QdnAccent;
  textSize: QdnTextSize;
  theme: QdnTheme;
};

export const DEFAULT_DISPLAY_SETTINGS: QdnDisplaySettings = {
  accent: 'green',
  textSize: 'medium',
  theme: 'light',
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

export function normalizeTheme(value: unknown): QdnTheme | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === 'dark' || normalized === 'light' ? normalized : null;
}

export function normalizeTextSize(value: unknown): QdnTextSize | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return TEXT_SIZE_VALUES.includes(normalized as QdnTextSize) ? (normalized as QdnTextSize) : null;
}

export function normalizeAccent(value: unknown): QdnAccent | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return ACCENT_OPTIONS.includes(normalized as QdnAccent) ? (normalized as QdnAccent) : null;
}

export function getInitialDisplaySettings(): QdnDisplaySettings {
  const hostWindow = typeof window === 'undefined' ? null : window;
  const query = typeof window === 'undefined' ? null : new URLSearchParams(window.location?.search ?? '');

  return {
    accent: normalizeAccent(query?.get('accent') ?? hostWindow?._qdnAccent) ?? DEFAULT_DISPLAY_SETTINGS.accent,
    textSize:
      normalizeTextSize(query?.get('textSize') ?? query?.get('text-size')) ??
      normalizeTextSize(hostWindow?._qdnTextSize) ??
      DEFAULT_DISPLAY_SETTINGS.textSize,
    theme: normalizeTheme(query?.get('theme') ?? hostWindow?._qdnTheme) ?? DEFAULT_DISPLAY_SETTINGS.theme,
  };
}

export function applyDisplaySettings(settings: QdnDisplaySettings) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;

  root.dataset.accent = settings.accent;
  root.dataset.textSize = settings.textSize;
  root.dataset.theme = settings.theme;
  root.style.colorScheme = settings.theme;
}

// Exported for tests. Parses one of Home's *_CHANGED window messages into an
// updated settings object, or null when the message is not one of ours.
export function getDisplaySettingsUpdateFromMessage(
  data: unknown,
  current: QdnDisplaySettings,
): QdnDisplaySettings | null {
  if (!isObject(data) || typeof data.action !== 'string') {
    return null;
  }

  if ('requestedHandler' in data && data.requestedHandler !== 'UI') {
    return null;
  }

  switch (data.action) {
    case 'ACCENT_CHANGED': {
      const accent = normalizeAccent(data.accent ?? data.qdnAccent);

      return accent ? { ...current, accent } : null;
    }
    case 'DISPLAY_SETTINGS_CHANGED': {
      return {
        accent: normalizeAccent(data.accent ?? data.qdnAccent) ?? current.accent,
        textSize: normalizeTextSize(data.textSize ?? data.qdnTextSize) ?? current.textSize,
        theme: normalizeTheme(data.theme ?? data.qdnTheme) ?? current.theme,
      };
    }
    case 'TEXT_SIZE_CHANGED': {
      const textSize = normalizeTextSize(data.textSize ?? data.qdnTextSize);

      return textSize ? { ...current, textSize } : null;
    }
    case 'THEME_CHANGED': {
      const theme = normalizeTheme(data.theme ?? data.qdnTheme);

      return theme ? { ...current, theme } : null;
    }
    default:
      return null;
  }
}

export function subscribeToDisplaySettings(listener: (settings: QdnDisplaySettings) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let current = getInitialDisplaySettings();

  const onMessage = (event: MessageEvent) => {
    const next = getDisplaySettingsUpdateFromMessage(event.data, current);

    if (next) {
      current = next;
      listener(next);
    }
  };

  window.addEventListener('message', onMessage);

  return () => {
    window.removeEventListener('message', onMessage);
  };
}
