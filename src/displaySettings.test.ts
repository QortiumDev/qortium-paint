import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DISPLAY_SETTINGS,
  applyDisplaySettings,
  getDisplaySettingsUpdateFromMessage,
  getInitialDisplaySettings,
  normalizeAccent,
  normalizeTextSize,
  normalizeTheme,
  subscribeToDisplaySettings,
  type QdnDisplaySettings,
} from './displaySettings';

type MutableHost = Window & {
  _qdnAccent?: unknown;
  _qdnTextSize?: unknown;
  _qdnTheme?: unknown;
};

const host = window as MutableHost;

afterEach(() => {
  delete host._qdnAccent;
  delete host._qdnTextSize;
  delete host._qdnTheme;

  const root = document.documentElement;

  delete root.dataset.accent;
  delete root.dataset.textSize;
  delete root.dataset.theme;
  root.style.colorScheme = '';
});

describe('normalizers', () => {
  it('accepts known values case-insensitively and rejects junk', () => {
    expect(normalizeTheme(' DARK ')).toBe('dark');
    expect(normalizeTheme('solarized')).toBeNull();
    expect(normalizeTheme(7)).toBeNull();

    expect(normalizeAccent('Blue')).toBe('blue');
    expect(normalizeAccent('magenta')).toBeNull();

    expect(normalizeTextSize('extra-large')).toBe('extra-large');
    expect(normalizeTextSize('gigantic')).toBeNull();
  });
});

describe('getInitialDisplaySettings', () => {
  it('falls back to defaults when nothing is injected', () => {
    expect(getInitialDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });

  it('reads Home-injected window globals', () => {
    host._qdnTheme = 'dark';
    host._qdnAccent = 'purple';
    host._qdnTextSize = 'large';

    expect(getInitialDisplaySettings()).toEqual({
      accent: 'purple',
      textSize: 'large',
      theme: 'dark',
    });
  });

  it('ignores invalid injected values', () => {
    host._qdnTheme = 'chartreuse';
    host._qdnAccent = 42;

    expect(getInitialDisplaySettings()).toEqual(DEFAULT_DISPLAY_SETTINGS);
  });
});

describe('applyDisplaySettings', () => {
  it('stamps data attributes and color-scheme onto <html>', () => {
    applyDisplaySettings({ accent: 'teal', textSize: 'small', theme: 'dark' });

    const root = document.documentElement;

    expect(root.dataset.theme).toBe('dark');
    expect(root.dataset.accent).toBe('teal');
    expect(root.dataset.textSize).toBe('small');
    expect(root.style.colorScheme).toBe('dark');
    expect(root.getAttribute('data-text-size')).toBe('small');
  });
});

describe('getDisplaySettingsUpdateFromMessage', () => {
  const current: QdnDisplaySettings = { ...DEFAULT_DISPLAY_SETTINGS };

  it('handles THEME_CHANGED / ACCENT_CHANGED / TEXT_SIZE_CHANGED', () => {
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'dark' }, current)).toEqual({
      ...current,
      theme: 'dark',
    });
    expect(getDisplaySettingsUpdateFromMessage({ action: 'ACCENT_CHANGED', accent: 'red' }, current)).toEqual({
      ...current,
      accent: 'red',
    });
    expect(
      getDisplaySettingsUpdateFromMessage({ action: 'TEXT_SIZE_CHANGED', textSize: 'huge' }, current),
    ).toEqual({ ...current, textSize: 'huge' });
  });

  it('merges DISPLAY_SETTINGS_CHANGED, keeping current values for gaps', () => {
    expect(
      getDisplaySettingsUpdateFromMessage({ action: 'DISPLAY_SETTINGS_CHANGED', theme: 'dark' }, current),
    ).toEqual({ ...current, theme: 'dark' });
  });

  it('returns null for unrelated or invalid messages', () => {
    expect(getDisplaySettingsUpdateFromMessage(null, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'SOMETHING_ELSE' }, current)).toBeNull();
    expect(getDisplaySettingsUpdateFromMessage({ action: 'THEME_CHANGED', theme: 'nope' }, current)).toBeNull();
    expect(
      getDisplaySettingsUpdateFromMessage(
        { action: 'THEME_CHANGED', theme: 'dark', requestedHandler: 'CORE' },
        current,
      ),
    ).toBeNull();
  });
});

describe('subscribeToDisplaySettings', () => {
  it('notifies on Home *_CHANGED window messages and stops after unsubscribe', () => {
    const seen: QdnDisplaySettings[] = [];
    const unsubscribe = subscribeToDisplaySettings((settings) => seen.push(settings));

    window.dispatchEvent(new MessageEvent('message', { data: { action: 'THEME_CHANGED', theme: 'dark' } }));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.theme).toBe('dark');

    // Sequential updates build on the previous state.
    window.dispatchEvent(new MessageEvent('message', { data: { action: 'ACCENT_CHANGED', accent: 'pink' } }));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ ...DEFAULT_DISPLAY_SETTINGS, theme: 'dark', accent: 'pink' });

    // Irrelevant messages are ignored.
    window.dispatchEvent(new MessageEvent('message', { data: { hello: 'world' } }));
    expect(seen).toHaveLength(2);

    unsubscribe();
    window.dispatchEvent(new MessageEvent('message', { data: { action: 'THEME_CHANGED', theme: 'light' } }));
    expect(seen).toHaveLength(2);
  });
});
