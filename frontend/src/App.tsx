import { useEffect, useState } from 'react';
import { Leaf, Type, Sun, Moon, Globe2, HelpCircle } from 'lucide-react';
import { MapView } from './components/MapView';
import { BottomSheet } from './components/BottomSheet';
import { AlertBanner } from './components/AlertBanner';
import { Legend } from './components/Legend';
import { IntroScreen } from './components/IntroScreen';
import { HelpModal } from './components/HelpModal';
import { api } from './services/api';
import { useStore } from './store/appStore';
import { LangProvider, useLang } from './i18n/LangContext';

function useClock(lang: string) {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  );
  useEffect(() => {
    const tick = () => setTime(
      new Date().toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
    );
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [lang]);
  return time;
}

// Loads data immediately (even during intro)
function DataFetcher() {
  const setStations   = useStore((s) => s.setStations);
  const setFountains  = useStore((s) => s.setFountains);
  const setGreenSpaces = useStore((s) => s.setGreenSpaces);
  const setAlerts     = useStore((s) => s.setAlerts);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const [w, fDrink, fPet, g, a] = await Promise.all([
          api.weather(),
          api.fountains('drink'),
          api.fountains('pet'),
          api.greenSpaces(),
          api.alerts(),
        ]);
        if (!alive) return;
        setStations(w.stations);
        setFountains([...fDrink.fountains, ...fPet.fountains]);
        setGreenSpaces(g.greenSpaces);
        setAlerts(a.alerts, a.averageTempC);
      } catch (err) {
        console.error('Error cargando datos del backend', err);
      }
    };
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(interval); };
  }, [setStations, setFountains, setGreenSpaces, setAlerts]);

  return null;
}

function AppMap() {
  const largeText    = useStore((s) => s.largeText);
  const highContrast = useStore((s) => s.highContrast);
  const darkMode     = useStore((s) => s.darkMode);
  const toggleA11y   = useStore((s) => s.toggleA11y);
  const { lang, t, setLang } = useLang();
  const [showHelp, setShowHelp] = useState(false);
  const clock = useClock(lang);

  const cls = [
    'app',
    largeText    ? 'a11y-large'    : '',
    highContrast ? 'a11y-contrast' : '',
    darkMode     ? 'dark'          : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <header className="header">
        <div className="header-brand">
          <Leaf size={22} strokeWidth={2} className="brand-icon" />
          <div>
            <h1 className="brand-name">{t.appName}</h1>
            <span className="brand-tag">{t.appTagline}</span>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="lang-btn"
            onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
            aria-label="Switch language / Cambiar idioma"
            title="ES / EN"
          >
            <Globe2 size={13} strokeWidth={2} />
            {lang === 'es' ? 'EN' : 'ES'}
          </button>
          <button
            className={`icon-btn ${darkMode ? 'active' : ''}`}
            onClick={() => toggleA11y('darkMode')}
            aria-pressed={darkMode}
            aria-label={t.darkMode}
            title={t.darkMode}
          >
            {darkMode ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
          </button>
          <button
            className={`icon-btn ${largeText ? 'active' : ''}`}
            onClick={() => toggleA11y('largeText')}
            aria-pressed={largeText}
            aria-label={t.largeText}
            title={t.largeText}
          >
            <Type size={14} strokeWidth={2.5} />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowHelp(true)}
            aria-label={t.helpBtn}
            title={t.helpBtn}
          >
            <HelpCircle size={15} strokeWidth={2} />
          </button>
        </div>
      </header>
      <MapView />
      <AlertBanner />
      <Legend />
      <BottomSheet />
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function AppRoot() {
  const averageTempC = useStore((s) => s.averageTempC);
  // Skip intro if already visited this session
  const [showIntro, setShowIntro] = useState(
    () => sessionStorage.getItem('oasis_intro_shown') !== '1',
  );

  const handleEnter = () => {
    sessionStorage.setItem('oasis_intro_shown', '1');
    setShowIntro(false);
  };

  return (
    <>
      <DataFetcher />
      {showIntro
        ? <IntroScreen onEnter={handleEnter} currentTemp={averageTempC} />
        : <AppMap />}
    </>
  );
}

export default function App() {
  return (
    <LangProvider>
      <AppRoot />
    </LangProvider>
  );
}
