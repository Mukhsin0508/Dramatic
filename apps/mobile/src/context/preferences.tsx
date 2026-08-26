import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type CaptionSize = 'Small' | 'Standard' | 'Large';
export type PlaybackQuality = 'Automatic' | 'Data saver' | 'Highest available';

type Preferences = {
  autoplay: boolean;
  captions: boolean;
  captionSize: CaptionSize;
  dataSaver: boolean;
  episodeAlerts: boolean;
  playbackQuality: PlaybackQuality;
  setAutoplay: (value: boolean) => void;
  setCaptions: (value: boolean) => void;
  setCaptionSize: (value: CaptionSize) => void;
  setDataSaver: (value: boolean) => void;
  setEpisodeAlerts: (value: boolean) => void;
  setPlaybackQuality: (value: PlaybackQuality) => void;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [autoplay, setAutoplay] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [captionSize, setCaptionSize] = useState<CaptionSize>('Standard');
  const [dataSaver, setDataSaver] = useState(false);
  const [episodeAlerts, setEpisodeAlerts] = useState(true);
  const [playbackQuality, setPlaybackQuality] = useState<PlaybackQuality>('Automatic');

  const value = useMemo(() => ({
    autoplay,
    captions,
    captionSize,
    dataSaver,
    episodeAlerts,
    playbackQuality,
    setAutoplay,
    setCaptions,
    setCaptionSize,
    setDataSaver,
    setEpisodeAlerts,
    setPlaybackQuality,
  }), [autoplay, captions, captionSize, dataSaver, episodeAlerts, playbackQuality]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error('usePreferences must be used inside PreferencesProvider');
  return preferences;
}
