import { useState } from 'react';
import {
  MapPin, Navigation, Target, User, PersonStanding, PawPrint, Accessibility,
  Leaf, Thermometer, Droplets, Trees, TriangleAlert, Zap, Route, Compass, Footprints,
  Clock, ExternalLink, ArrowUpDown, Plus, X,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { useStore } from '../store/appStore';
import { api } from '../services/api';
import type { GeocodeSuggestion } from '../services/api';
import { useLang } from '../i18n/LangContext';
import { ExplorePanel } from './ExplorePanel';
import { ForecastCard } from './ForecastCard';
import { AddressInput } from './AddressInput';
import { WalkPanel } from './WalkPanel';
import type { UserProfile } from '../types';

type IconComponent = React.ComponentType<LucideProps>;
type ProfileDef = { id: UserProfile; Icon: IconComponent; labelKey: keyof { general: string; elderly: string; pet: string; pmr: string } };
const PROFILES: ProfileDef[] = [
  { id: 'general', Icon: User           as IconComponent, labelKey: 'general' },
  { id: 'elderly', Icon: PersonStanding as IconComponent, labelKey: 'elderly' },
  { id: 'pet',     Icon: PawPrint       as IconComponent, labelKey: 'pet'     },
  { id: 'pmr',     Icon: Accessibility  as IconComponent, labelKey: 'pmr'     },
];

const RISK_COLOR: Record<string, string> = {
  comfort: 'var(--thermal-comfort)',
  mild: 'var(--thermal-mild)',
  moderate: 'var(--thermal-moderate)',
  high: 'var(--thermal-high)',
  extreme: 'var(--thermal-extreme)',
};

function fmtDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
function fmtArrival(durationS: number, lang: string): string {
  const t = new Date(Date.now() + durationS * 1000);
  return t.toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
}

function buildMapsUrls(
  origin: { lat: number; lng: number } | null,
  destination: { lat: number; lng: number } | null,
) {
  if (!origin || !destination) return null;
  const o = `${origin.lat},${origin.lng}`;
  const d = `${destination.lat},${destination.lng}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=walking`,
    waze:   `https://waze.com/ul?ll=${destination.lat},${destination.lng}&navigate=yes&from=${o}`,
    apple:  `maps://maps.apple.com/?saddr=${o}&daddr=${d}&dirflg=w`,
  };
}

export function BottomSheet() {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<'plan' | 'walk' | 'explore'>('plan');

  const profile               = useStore((s) => s.profile);
  const setProfile            = useStore((s) => s.setProfile);
  const origin                = useStore((s) => s.origin);
  const destination           = useStore((s) => s.destination);
  const setOrigin             = useStore((s) => s.setOrigin);
  const setDestination        = useStore((s) => s.setDestination);
  const route                 = useStore((s) => s.route);
  const setRoute              = useStore((s) => s.setRoute);
  const loading               = useStore((s) => s.loadingRoute);
  const setLoading            = useStore((s) => s.setLoadingRoute);
  const pointThermal          = useStore((s) => s.pointThermal);
  const showDrink             = useStore((s) => s.showDrinkFountains);
  const showPet               = useStore((s) => s.showPetFountains);
  const showGreen             = useStore((s) => s.showGreenSpaces);
  const showTree              = useStore((s) => s.showTreeShade);
  const toggleLayer           = useStore((s) => s.toggleLayer);
  const showFreshRoute        = useStore((s) => s.showFreshRoute);
  const showStandardRoute     = useStore((s) => s.showStandardRoute);
  const toggleRouteVisibility = useStore((s) => s.toggleRouteVisibility);
  const waypoints             = useStore((s) => s.waypoints);
  const addWaypoint           = useStore((s) => s.addWaypoint);
  const removeWaypoint        = useStore((s) => s.removeWaypoint);
  const setWaypoint           = useStore((s) => s.setWaypoint);

  const clearAllApp           = useStore((s) => s.clearAll);

  const [originText, setOriginText]     = useState('');
  const [destText, setDestText]         = useState('');
  const [waypointTexts, setWaypointTexts] = useState<string[]>([]);
  const [error, setError]               = useState<string | null>(null);

  const hasWaypoints = waypoints.length > 0;
  const getLabel = (idx: number) =>
    hasWaypoints ? String.fromCharCode(65 + idx) : undefined; // A, B, C…

  const handleClear = () => {
    clearAllApp();
    setOriginText('');
    setDestText('');
    setWaypointTexts([]);
    setError(null);
  };

  const useGeolocation = () => {
    if (!navigator.geolocation) { setError(t.noGeolocation); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: t.useMyLocation });
        setOriginText(t.useMyLocation);
      },
      () => setError(t.locationError),
    );
  };

  const pickOrigin = (s: GeocodeSuggestion) => { setOrigin({ lat: s.lat, lng: s.lng, label: s.label }); setOriginText(s.label); };
  const pickDest   = (s: GeocodeSuggestion) => { setDestination({ lat: s.lat, lng: s.lng, label: s.label }); setDestText(s.label); };
  const pickWp = (idx: number) => (s: GeocodeSuggestion) => {
    setWaypoint(idx, { lat: s.lat, lng: s.lng, label: s.label });
  };

  const swapRoute = () => {
    const tmpCoord = origin;
    setOrigin(destination);
    setDestination(tmpCoord);
    const tmpText = originText;
    setOriginText(destText);
    setDestText(tmpText);
  };

  const handleAddWaypoint = () => {
    addWaypoint();
    setWaypointTexts((prev) => [...prev, '']);
  };

  const handleRemoveWaypoint = (idx: number) => {
    removeWaypoint(idx);
    setWaypointTexts((prev) => prev.filter((_, i) => i !== idx));
  };

  const computeRoute = async () => {
    setError(null);
    if (!origin || !destination) { setError(t.noOriginDest); return; }
    setLoading(true);
    try {
      const validWps = waypoints
        .filter((w) => w.lat !== 0 || w.lng !== 0)
        .map((w) => [w.lng, w.lat] as [number, number]);
      const r = await api.freshRoute(
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
        profile,
        validWps.length ? validWps : undefined,
      );
      setRoute(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const originLabel  = getLabel(0);
  const destLabel    = getLabel(1 + waypoints.length);

  return (
    <div className="bottom-sheet" role="region" aria-label="Panel de planificación">
      <div className="sheet-handle" aria-hidden />

      {/* Tab bar */}
      <div className="tab-row" role="tablist">
        <button className={`tab-btn ${tab === 'plan'    ? 'active' : ''}`} role="tab" aria-selected={tab === 'plan'}    onClick={() => setTab('plan')}>
          <Route size={13} strokeWidth={2} /> {t.planRoute}
        </button>
        <button className={`tab-btn ${tab === 'walk'    ? 'active' : ''}`} role="tab" aria-selected={tab === 'walk'}    onClick={() => setTab('walk')}>
          <Footprints size={13} strokeWidth={2} /> {t.suggestWalk}
        </button>
        <button className={`tab-btn ${tab === 'explore' ? 'active' : ''}`} role="tab" aria-selected={tab === 'explore'} onClick={() => setTab('explore')}>
          <Compass size={13} strokeWidth={2} /> {t.exploreMadrid}
        </button>
      </div>

      {tab === 'explore' && <ExplorePanel />}
      {tab === 'walk'    && <WalkPanel />}
      {tab === 'plan' && <>

      <ForecastCard />

      <p className="sheet-section-title">{t.whereAreYouGoing}</p>

      {/* Origin + Destination: grid layout para simetría */}
      <div className="od-layout">
        <div className="od-inputs">
          {/* Origin */}
          <div className="input-row">
            <span className="wp-label">A</span>
            <AddressInput
              placeholder={t.originPlaceholder}
              ariaLabel={t.originPlaceholder}
              value={originText}
              onChange={setOriginText}
              onSelect={pickOrigin}
            >
              <MapPin size={15} strokeWidth={2} />
            </AddressInput>
          </div>

          {/* Waypoints */}
          {waypoints.map((_, idx) => (
            <div key={idx} className="input-row wp-row">
              <span className="wp-label">{String.fromCharCode(66 + idx)}</span>
              <AddressInput
                placeholder={t.addStop}
                ariaLabel={t.addStop}
                value={waypointTexts[idx] ?? ''}
                onChange={(v) => setWaypointTexts((prev) => prev.map((t, i) => i === idx ? v : t))}
                onSelect={pickWp(idx)}
              >
                <MapPin size={15} strokeWidth={2} />
              </AddressInput>
              <button className="geo-btn remove-wp" onClick={() => handleRemoveWaypoint(idx)} aria-label={t.removeStop}>
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>
          ))}

          {/* Destination */}
          <div className="input-row">
            <span className="wp-label od-label-dest">{String.fromCharCode(66 + waypoints.length)}</span>
            <AddressInput
              placeholder={t.destPlaceholder}
              ariaLabel={t.destPlaceholder}
              value={destText}
              onChange={setDestText}
              onSelect={pickDest}
            >
              <Target size={15} strokeWidth={2} />
            </AddressInput>
          </div>
        </div>

        {/* Right column: geo + swap stacked, same height as two input rows */}
        <div className="od-actions">
          <button className="geo-btn" onClick={useGeolocation} aria-label={t.useMyLocation} title={t.useMyLocation}>
            <Navigation size={16} strokeWidth={2} />
          </button>
          <button className="swap-btn" onClick={swapRoute} aria-label={t.swapRoute} title={t.swapRoute}>
            <ArrowUpDown size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <button className="add-stop-btn" onClick={handleAddWaypoint} aria-label={t.addStop}>
        <Plus size={13} strokeWidth={2.5} /> {t.addStop}
      </button>

      {/* Profile selector */}
      <div className="profile-row" role="radiogroup" aria-label="Perfil de usuario">
        {PROFILES.map(({ id, Icon, labelKey }) => (
          <button
            key={id}
            className={`profile-btn ${profile === id ? 'active' : ''}`}
            onClick={() => setProfile(id)}
            aria-pressed={profile === id}
            role="radio"
            aria-checked={profile === id}
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{t.profiles[labelKey]}</span>
          </button>
        ))}
      </div>

      <button className="cta" onClick={computeRoute} disabled={loading || !origin || !destination}>
        {loading
          ? t.calculating
          : <><Leaf size={16} strokeWidth={2} /> {t.calculateRoute}</>}
      </button>

      {error && (
        <div className="error-msg" role="alert">
          <TriangleAlert size={13} strokeWidth={2} />
          {error}
        </div>
      )}

      {/* Route results — Fresca PRIMERO, luego rápida */}
      {route && (
        <>
          <div className="section-divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="sheet-section-title" style={{ margin: 0 }}>{t.routeComparison}</p>
            <button 
              onClick={handleClear} 
              style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px' }}
              aria-label={t.clearRoute}
            >
              <X size={13} strokeWidth={2} /> {t.clearRoute}
            </button>
          </div>
          <div className="route-results">

            {/* Ruta fresca — primero */}
            <div
              className={`route-card fresh clickable ${showFreshRoute ? 'route-active' : 'route-inactive'}`}
              onClick={() => toggleRouteVisibility('fresh')}
              role="button"
              aria-pressed={showFreshRoute}
              title={showFreshRoute ? 'Ocultar en mapa' : 'Mostrar en mapa'}
            >
              <div className="header-row">
                <span className="badge fresh-badge">{t.freshRoute} ✦</span>
                <span className="time-label">
                  {fmtDist(route.fresh.distanceM)} · {Math.round(route.fresh.durationS / 60)} min
                </span>
              </div>
              <div className="stats">
                <span className="stat">
                  <Thermometer size={12} strokeWidth={2} />
                  <strong>{route.fresh.avgTempC}°C</strong> {t.avgTemp}
                </span>
                <span className="stat">
                  <Trees size={12} strokeWidth={2} />
                  {t.shade} <strong>{Math.round(route.fresh.shadeScore * 100)}%</strong>
                </span>
                <span className="stat">
                  <Droplets size={12} strokeWidth={2} />
                  <strong>{route.fresh.fountainCount}</strong> {t.fountainsLabel}
                </span>
                <span className="stat arrival-stat">
                  <Clock size={12} strokeWidth={2} />
                  {lang === 'es' ? 'Llegada' : 'Arrival'} <strong>{fmtArrival(route.fresh.durationS, lang)}</strong>
                </span>
              </div>
              <div className="route-note">
                {route.comparison.tempDiffC > 0
                  ? <><Zap size={11} strokeWidth={2} /> {t.savesUpTo} {route.comparison.tempDiffC}{t.ofExposure}</>
                  : t.sameTodayMsg}
                {route.comparison.timeDiffMin > 0 && (
                  <> {t.onlyMin} {route.comparison.timeDiffMin} {t.minMore}</>
                )}
              </div>

            </div>

            {/* Ruta rápida — segundo */}
            <div
              className={`route-card clickable ${showStandardRoute ? 'route-active standard-active' : 'route-inactive'}`}
              onClick={() => toggleRouteVisibility('standard')}
              role="button"
              aria-pressed={showStandardRoute}
              title={showStandardRoute ? 'Ocultar en mapa' : 'Mostrar en mapa'}
            >
              <div className="header-row">
                <span className="badge">{t.quickRoute}</span>
                <span className="time-label">
                  {fmtDist(route.standard.distanceM)} · {Math.round(route.standard.durationS / 60)} min
                </span>
              </div>
              <div className="stats">
                <span className="stat">
                  <Thermometer size={12} strokeWidth={2} />
                  <strong>{route.standard.avgTempC}°C</strong> {t.avgTemp}
                </span>
                <span className="stat">
                  <Trees size={12} strokeWidth={2} />
                  {t.shade} <strong>{Math.round(route.standard.shadeScore * 100)}%</strong>
                </span>
                <span className="stat">
                  <Droplets size={12} strokeWidth={2} />
                  <strong>{route.standard.fountainCount}</strong> {t.fountainsLabel}
                </span>
                <span className="stat arrival-stat">
                  <Clock size={12} strokeWidth={2} />
                  {lang === 'es' ? 'Llegada' : 'Arrival'} <strong>{fmtArrival(route.standard.durationS, lang)}</strong>
                </span>
              </div>

            </div>
          </div>

          {/* Abrir en navegador externo */}
          {(() => {
            const urls = buildMapsUrls(origin, destination);
            if (!urls) return null;
            return (
              <div className="open-in-maps">
                <span className="open-in-maps-label">
                  <ExternalLink size={12} strokeWidth={2} /> {t.openInMaps}
                </span>
                <div className="open-in-maps-btns">
                  <a href={urls.google} target="_blank" rel="noopener noreferrer" className="maps-btn">
                    {t.openGoogleMaps}
                  </a>
                  <a href={urls.waze} target="_blank" rel="noopener noreferrer" className="maps-btn">
                    {t.openWaze}
                  </a>
                  <a href={urls.apple} target="_blank" rel="noopener noreferrer" className="maps-btn">
                    {t.openAppleMaps}
                  </a>
                </div>
              </div>
            );
          })()}

          {!route.orsConfigured && (
            <div className="demo-notice">
              {t.demoModeMsg} <code>ORS_API_KEY</code> {t.demoModeMsg2} <code>.env</code> {t.demoModeMsg3}
            </div>
          )}
        </>
      )}

      {/* Thermal point click info */}
      {pointThermal && !route && (
        <>
          <div className="section-divider" />
          <p className="sheet-section-title">{t.selectedPoint}</p>
          <div className="thermal-card">
            <div className="thermal-dot" style={{ background: RISK_COLOR[pointThermal.riskLevel] }} />
            <div>
              <div className="label">{t.riskLevels[pointThermal.riskLevel as keyof typeof t.riskLevels]}</div>
              <div className="value">{pointThermal.temperatureC}°C · ICT {pointThermal.ict}</div>
            </div>
          </div>
        </>
      )}

      <div className="section-divider" />

      {/* Layer toggles */}
      <p className="sheet-section-title">{t.mapLayers}</p>
      <div className="toggle-row">
        <button className={`chip ${showDrink ? 'active' : ''}`} onClick={() => toggleLayer('drink')}>
          <Droplets size={13} strokeWidth={2} /> {t.drinkFountains}
        </button>
        <button className={`chip ${showPet ? 'active' : ''}`} onClick={() => toggleLayer('pet')}>
          <PawPrint size={13} strokeWidth={2} /> {t.petFountains}
        </button>
        <button className={`chip ${showGreen ? 'active' : ''}`} onClick={() => toggleLayer('green')}>
          <Trees size={13} strokeWidth={2} /> {t.greenSpaces}
        </button>
        <button className={`chip ${showTree ? 'active' : ''}`} onClick={() => toggleLayer('tree')}>
          <Trees size={13} strokeWidth={2} /> {t.treeShade}
        </button>
      </div>

      <div className="footer-note">{t.dataSource}</div>

      </>}
    </div>
  );
}
