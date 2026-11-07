import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConfettiHost } from './components/Confetti';
import { BottomNav, ToastHost, type Tab } from './components/ui';
import { UpdateBanner, useServiceWorker } from './components/UpdateBanner';
import { canShareFiles, downloadBackupText, serializeBackup, shareBackupText } from './lib/backup';
import { lastPlayableDay, streakStats, weeklyPcts } from './lib/engine';
import { toast } from './lib/feedback';
import { useMediaQuery, useToday } from './lib/hooks';
import { claimable, grandStatus, pendingChests, steps, withClaims } from './lib/rewards';
import { actions, currentBackup, getState, lock, onSaveError, useStore } from './lib/store';
import { teamFor, writeShare } from './lib/team';
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
  const sw = useServiceWorker();
  const { phase, state, hasBio } = useStore();
  const today = useToday();
  const [tab, setTab] = useState<Tab>('hoy');
  const [selected, setSelected] = useState<ISODate>(today);
  const [curtain, setCurtain] = useState(false);
  const hiddenAt = useRef<number | null>(null);
  const lastToday = useRef(today);

  useTheme(state?.settings.theme ?? readThemePref());
  useEffect(() => onSaveError((m) => toast(m, 'error')), []);

  // Semana victoriosa: publica solo tus porcentajes semanales (números) para que Val Q los lea.
  useEffect(() => {
    if (!state) return;
    writeShare({ start: state.settings.startDate, weeks: weeklyPcts(state.settings, state.days, today), grandClaimed: Boolean(state.claims.grand) });
  }, [state, today]);

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
    else setTab('hoy');
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const updateBanner = <UpdateBanner needRefresh={sw.needRefresh} onUpdate={sw.update} />;

  if (phase === 'loading') return <div className="app" aria-busy="true" />;
  if (phase === 'setup')
    return (
      <>
        <Setup today={today} updateBanner={updateBanner} />
        <ToastHost />
      </>
    );
  if (phase === 'locked' || !state)
    return (
      <>
        <LockScreen hasBio={hasBio} updateBanner={updateBanner} />
        <ToastHost />
      </>
    );

  const s = state.settings;
  const playable = lastPlayableDay(s, today);
  const sel = today < s.startDate ? today : selected < s.startDate ? s.startDate : selected > playable ? playable : selected;
  const list = withClaims(steps(s, streakStats(s, state.days, today).best), state);
  const badge = claimable(list).length + pendingChests(list, state).length + (grandStatus(s, state, today, teamFor(s, state.days, today).victories).kind === 'available' ? 1 : 0);

  const quickBackup = async () => {
    try {
      const rec = await currentBackup();
      if (!rec) return;
      const text = serializeBackup(rec);
      if (canShareFiles()) {
        if ((await shareBackupText(text)) === 'cancelled') return;
      } else downloadBackupText(text);
      actions.markBackup();
      toast('Respaldo listo.', 'success');
    } catch {
      toast('No se pudo crear el respaldo. Prueba desde Ajustes → Respaldo.', 'error');
    }
  };

  return (
    <>
      <div className="app">
        {updateBanner}
        {tab === 'hoy' && (
          <TodayScreen
            state={state}
            today={today}
            hasBio={hasBio}
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
        {tab === 'ajustes' && <SettingsScreen state={state} today={today} hasBio={hasBio} />}
      </div>
      <BottomNav tab={tab} onChange={setTab} rewardsPending={badge} />
      <ToastHost />
      <ConfettiHost />
      {curtain && (
        <div className="curtain" aria-hidden="true">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
        </div>
      )}
    </>
  );
}
