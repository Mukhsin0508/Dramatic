import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type Preferences = {
  hydrated: boolean;
  autoplay: boolean;
  setAutoplay: (value: boolean) => void;
};

type PersistedPreferences = {
  version: 1;
  autoplay: boolean;
};

const STORAGE_KEY = '@dramatic/preferences/v1';
const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [autoplay, setAutoplayState] = useState(true);
  const persistenceQueue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (!active || !value) return;
        const saved = JSON.parse(value) as Partial<PersistedPreferences>;
        if (saved.version !== 1) return;
        if (typeof saved.autoplay === 'boolean') setAutoplayState(saved.autoplay);
      })
      .catch(() => {
        // A damaged preference should not keep the app from opening.
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const value: PersistedPreferences = { version: 1, autoplay };
    persistenceQueue.current = persistenceQueue.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value)))
      .catch(() => undefined);
  }, [autoplay, hydrated]);

  const setAutoplay = useCallback((value: boolean) => setAutoplayState(value), []);
  const value = useMemo(() => ({
    hydrated,
    autoplay,
    setAutoplay,
  }), [autoplay, hydrated, setAutoplay]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error('usePreferences must be used inside PreferencesProvider');
  return preferences;
}
