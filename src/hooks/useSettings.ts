import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_EXPORT, type ExportOptions } from '../lib/export';

export interface Settings {
  /** Optional CORS proxy, e.g. "https://my-proxy.example/?url={url}". */
  proxyTemplate: string;
  theme: 'system' | 'light' | 'dark';
  exportOptions: ExportOptions;
  hideArchived: boolean;
}

const KEY = 'racklibrary.settings';

const DEFAULTS: Settings = {
  proxyTemplate: '',
  theme: 'system',
  exportOptions: DEFAULT_EXPORT,
  hideArchived: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed, exportOptions: { ...DEFAULT_EXPORT, ...parsed.exportOptions } };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable (private mode etc.); settings just won't persist.
    }
  }, [settings]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const updateExport = useCallback(
    (patch: Partial<ExportOptions>) => setSettings((s) => ({ ...s, exportOptions: { ...s.exportOptions, ...patch } })),
    [],
  );
  return { settings, update, updateExport };
}
