import { useEffect, useMemo, useState } from "react";

export const SETTINGS_EVENT = "sentina:dashboard-settings-updated";

export const SETTINGS_KEYS = {
  operations: "sentina.settings.operations",
  sustainability: "sentina.settings.sustainability",
  soc: "sentina.settings.soc",
  exhibitor: "sentina.settings.exhibitor",
};

const DEFAULTS = {
  operations: {
    refreshInterval: "15",
    exportFormat: "xlsx",
  },
  sustainability: {
    refreshInterval: "30",
    exportFormat: "xlsx",
  },
  soc: {
    refreshInterval: "15",
    exportFormat: "xlsx",
  },
  exhibitor: {
    refreshInterval: "60",
    exportFormat: "xlsx",
  },
};

function normalizeSection(section) {
  return DEFAULTS[section] ? section : "operations";
}

export function getDefaultDashboardSettings(section) {
  return { ...DEFAULTS[normalizeSection(section)] };
}

export function readDashboardSettings(section) {
  const resolved = normalizeSection(section);
  const defaults = getDefaultDashboardSettings(resolved);

  try {
    const raw = localStorage.getItem(SETTINGS_KEYS[resolved]);
    if (!raw) return defaults;

    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      refreshInterval: String(parsed?.refreshInterval || defaults.refreshInterval),
      exportFormat: String(parsed?.exportFormat || defaults.exportFormat).toLowerCase(),
    };
  } catch {
    return defaults;
  }
}

export function writeDashboardSettings(section, nextSettings) {
  const resolved = normalizeSection(section);
  const next = {
    ...getDefaultDashboardSettings(resolved),
    ...nextSettings,
    refreshInterval: String(
      nextSettings?.refreshInterval || DEFAULTS[resolved].refreshInterval
    ),
    exportFormat: String(
      nextSettings?.exportFormat || DEFAULTS[resolved].exportFormat
    ).toLowerCase(),
  };

  try {
    localStorage.setItem(SETTINGS_KEYS[resolved], JSON.stringify(next));
  } catch {
    // ignore storage errors
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(SETTINGS_EVENT, {
        detail: { section: resolved, settings: next },
      })
    );
  }

  return next;
}

export function subscribeDashboardSettings(section, callback) {
  const resolved = normalizeSection(section);

  const handleStorage = (event) => {
    if (!event.key || event.key === SETTINGS_KEYS[resolved]) {
      callback(readDashboardSettings(resolved));
    }
  };

  const handleCustom = (event) => {
    if (!event.detail?.section || event.detail.section === resolved) {
      callback(readDashboardSettings(resolved));
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(SETTINGS_EVENT, handleCustom);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(SETTINGS_EVENT, handleCustom);
  };
}

export function useDashboardSettings(section) {
  const resolved = useMemo(() => normalizeSection(section), [section]);
  const [settings, setSettings] = useState(() => readDashboardSettings(resolved));

  useEffect(() => {
    setSettings(readDashboardSettings(resolved));
    return subscribeDashboardSettings(resolved, setSettings);
  }, [resolved]);

  return settings;
}

export function getDashboardRefreshMs(settingsOrSection) {
  const settings =
    typeof settingsOrSection === "string"
      ? readDashboardSettings(settingsOrSection)
      : settingsOrSection;

  const seconds = Number(settings?.refreshInterval);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 15000;
}
