import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type WatchProgress = {
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  updatedAt: number;
};

type ExperienceState = {
  hydrated: boolean;
  likedIds: ReadonlySet<string>;
  savedIds: ReadonlySet<string>;
  voteChoices: Readonly<Record<string, string>>;
  watchProgress: Readonly<Record<string, WatchProgress>>;
  toggleLiked: (episodeId: string) => void;
  toggleSaved: (storyId: string) => void;
  selectVote: (episodeId: string, choice: string) => void;
  setWatchProgress: (episodeId: string, positionSeconds: number, durationSeconds: number, completed?: boolean) => void;
};

type PersistedExperience = {
  version: 1;
  likedIds: string[];
  savedIds: string[];
  voteChoices: Record<string, string>;
  watchProgress: Record<string, WatchProgress>;
};

const STORAGE_KEY = '@dramatic/experience/v1';
const ExperienceContext = createContext<ExperienceState | null>(null);

function toggleId(previous: ReadonlySet<string>, storyId: string): Set<string> {
  const next = new Set(previous);
  if (next.has(storyId)) next.delete(storyId);
  else next.add(storyId);
  return next;
}

function stringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0));
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0),
  );
}

function progressRecord(value: unknown): Record<string, WatchProgress> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, WatchProgress> = {};
  for (const [episodeId, progress] of Object.entries(value)) {
    if (!progress || typeof progress !== 'object' || Array.isArray(progress)) continue;
    const candidate = progress as Partial<WatchProgress>;
    if (!Number.isFinite(candidate.positionSeconds) || !Number.isFinite(candidate.durationSeconds)) continue;
    const durationSeconds = Math.max(0, Number(candidate.durationSeconds));
    result[episodeId] = {
      positionSeconds: Math.max(0, Math.min(Number(candidate.positionSeconds), durationSeconds || Number(candidate.positionSeconds))),
      durationSeconds,
      completed: candidate.completed === true,
      updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : 0,
    };
  }
  return result;
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [likedIds, setLikedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [savedIds, setSavedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [voteChoices, setVoteChoices] = useState<Record<string, string>>({});
  const [watchProgress, setWatchProgressState] = useState<Record<string, WatchProgress>>({});
  const persistenceQueue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then(value => {
        if (!active || !value) return;
        const saved = JSON.parse(value) as Partial<PersistedExperience>;
        if (saved.version !== 1) return;
        setLikedIds(stringSet(saved.likedIds));
        setSavedIds(stringSet(saved.savedIds));
        setVoteChoices(stringRecord(saved.voteChoices));
        setWatchProgressState(progressRecord(saved.watchProgress));
      })
      .catch(() => {
        // Corrupt or unavailable local storage should never prevent watching.
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const value: PersistedExperience = {
      version: 1,
      likedIds: [...likedIds],
      savedIds: [...savedIds],
      voteChoices,
      watchProgress,
    };
    persistenceQueue.current = persistenceQueue.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value)))
      .catch(() => undefined);
  }, [hydrated, likedIds, savedIds, voteChoices, watchProgress]);

  const toggleLiked = useCallback((episodeId: string) => setLikedIds(previous => toggleId(previous, episodeId)), []);
  const toggleSaved = useCallback((storyId: string) => setSavedIds(previous => toggleId(previous, storyId)), []);
  const selectVote = useCallback((episodeId: string, choice: string) => {
    setVoteChoices(previous => ({ ...previous, [episodeId]: choice }));
  }, []);
  const setWatchProgress = useCallback((episodeId: string, positionSeconds: number, durationSeconds: number, completed = false) => {
    if (!Number.isFinite(positionSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    const safePosition = Math.max(0, Math.min(positionSeconds, durationSeconds));
    const finished = completed || safePosition >= durationSeconds - 0.5;
    setWatchProgressState(previous => ({
      ...previous,
      [episodeId]: {
        positionSeconds: finished ? durationSeconds : safePosition,
        durationSeconds,
        completed: finished,
        updatedAt: Date.now(),
      },
    }));
  }, []);

  const value = useMemo(() => ({
    hydrated,
    likedIds,
    savedIds,
    voteChoices,
    watchProgress,
    toggleLiked,
    toggleSaved,
    selectVote,
    setWatchProgress,
  }), [hydrated, likedIds, savedIds, voteChoices, watchProgress, toggleLiked, toggleSaved, selectVote, setWatchProgress]);

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const state = useContext(ExperienceContext);
  if (!state) throw new Error('useExperience must be used inside ExperienceProvider');
  return state;
}
