import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BottomNav, ToastHost, type Tab } from './components/ui';
import { UpdateBanner } from './components/UpdateBanner';
import { canShareFiles, downloadText, serializeBackup, shareText } from './lib/backup';
import { isEarned, lastPlayableDay, milestones, streakStats } from './lib/engine';
import { toast } from './lib/feedback';
import { useMediaQuery, useToday } from './lib/hooks';
import { actions, currentSealed, getState, lock, onSaveError, useStore } from './lib/store';
import type { ISODate } from './lib/dates';
import type { Theme } from './lib/types';
import { InsightsScreen } from './screens/Insights';
import { LockScreen } from './screens/Lock';
import { RewardsScreen } from './screens/Rewards';
import { SettingsScreen } from './screens/Settings';
import { Setup } from './screens/Setup';
import { TodayScreen } from './screens/Today';

const THEME_KEY = 'bitacora.theme';

function readThemePref(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'dark' || t === 'light' ? t : 'system';
  } catch {
    return 'system';
  }
}

function useTheme(theme: Theme) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    const dark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0D1412' : '#EEF3F1');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* sin preferencia guardada */
    }
  }, [theme, prefersDark]);
}

export function App() {
  const { phase, state } = useStore();
  const today = useToday();
  const [tab, setTab] = useState<Tab>('hoy');
  const [selected, setSelected] = useState<ISODate>(today);
  const [curtain, setCurtain] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const lastToday = useRef(today);

  useTheme(state?.settings.theme ?? readThemePref());
  useEffect(() => onSaveError((m) => toast(m, 'error')), []);

  // Bloqueo automático y cortina de privacidad al salir de la app.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        setCurtain(true);
        return;
      }
      const minutes = getState()?.settings.autoLockMinutes ?? 1;
      if (hiddenAt.current !== null && Date.now() - hiddenAt.current >= minutes * 60_000) lock();
      hiddenAt.current = null;
      setCurtain(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (phase === 'unlocked') setSelected(today);
    if (phase !== 'unlocked') setTab('hoy');
  }, [phase]);

  useEffect(() => {
    if (lastToday.current !== today) {
      setSelected((sel) => (sel === lastToday.current ? today : sel));
      lastToday.current = today;
    }
  }, [today]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const curtainEl = curtain ? (
    <div className="curtain" aria-hidden="true">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
    </div>
  ) : null;

  if (phase === 'loading') return <div className="app" aria-busy="true" />;
  if (phase === 'setup')
    return (
      <>
        <Setup today={today} />
        <ToastHost />
      </>
    );
  if (phase === 'locked' || !state)
    return (
      <>
        <LockScreen />
        <ToastHost />
      </>
    );

  const s = state.settings;
  const playable = lastPlayableDay(s, today);
  const sel = today < s.startDate ? today : selected < s.startDate ? s.startDate : selected > playable ? playable : selected;
  const best = streakStats(s, state.days, today).best;
  const pending = milestones(s.cycleLength).filter((_, i) => isEarned(i + 1, best) && !state.rewards[String(i + 1)]?.claimedAt).length;

  const quickBackup = async () => {
    try {
      const sealed = await currentSealed();
      if (!sealed) return;
      const json = serializeBackup(sealed);
      if (canShareFiles()) {
        if ((await shareText(json)) === 'cancelled') return;
      } else downloadText(json);
      actions.markBackup();
      toast('Respaldo cifrado listo.', 'success');
    } catch {
      toast('No se pudo crear el respaldo.', 'error');
    }
  };

  return (
    <>
      <div className="app">
        <UpdateBanner />
        {tab === 'hoy' && (
          <TodayScreen
            state={state}
            today={today}
            selected={sel}
            onSelect={setSelected}
            onGo={(t) => setTab(t)}
            onBackup={() => void quickBackup()}
          />
        )}
        {tab === 'premios' && <RewardsScreen state={state} today={today} />}
        {tab === 'analisis' && (
          <InsightsScreen
            state={state}
            today={today}
            onOpenDay={(d) => {
              setSelected(d);
              setTab('hoy');
            }}
          />
        )}
        {tab === 'ajustes' && <SettingsScreen state={state} today={today} />}
      </div>
      <BottomNav tab={tab} onChange={setTab} rewardsPending={pending} />
      <ToastHost />
      {curtainEl}
    </>
  );
}
