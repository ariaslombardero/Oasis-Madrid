import { useState } from 'react';
import { Timer, Navigation, Leaf, Thermometer, Trees, Droplets, TriangleAlert, MapPin, Search } from 'lucide-react';
import { api, type GeocodeSuggestion } from '../services/api';
import { AddressInput } from './AddressInput';
import { useStore } from '../store/appStore';
import { useLang } from '../i18n/LangContext';
import type { ScoredRoute, UserProfile } from '../types';

const DURATIONS = [15, 30, 45, 60, 90] as const;

type OriginMode = 'location' | 'custom';

interface WalkResult {
  route: ScoredRoute;
  profile: UserProfile;
  targetDistanceM: number;
  orsConfigured: boolean;
}

export function WalkPanel() {
  const { t, lang } = useLang();
  const [duration, setDuration] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WalkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originMode, setOriginMode] = useState<OriginMode>('location');

  const profile    = useStore((s) => s.profile);
  const origin     = useStore((s) => s.origin);
  const setOrigin  = useStore((s) => s.setOrigin);
  const setRoute   = useStore((s) => s.setRoute);

  const [geoError, setGeoError] = useState<string | null>(null);
  const [customText, setCustomText] = useState('');

  const useGeolocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) { setGeoError(t.noGeolocation); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: t.useMyLocation });
      },
      () => setGeoError(t.locationError),
    );
  };

  const pickCustomOrigin = (s: GeocodeSuggestion) => {
    setOrigin({ lat: s.lat, lng: s.lng, label: s.label });
  };

  const switchMode = (mode: OriginMode) => {
    setOriginMode(mode);
    setResult(null);
    setError(null);
    setGeoError(null);
    // Reset origin when switching mode so user starts fresh
    if (mode === 'custom') {
      setCustomText('');
    }
  };

  const handleWalk = async () => {
    setError(null);
    if (!origin) { setError(t.locationError); return; }
    setLoading(true);
    try {
      const res = await api.walk([origin.lng, origin.lat], duration, profile);
      setResult(res as WalkResult);
      // Inject the walk route into the map
      setRoute({
        standard: res.route,
        fresh: res.route,
        profile: res.profile,
        comparison: { timeDiffMin: 0, tempDiffC: 0, fountainsExtra: 0 },
        orsConfigured: res.orsConfigured,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="walk-panel">
      <p className="sheet-section-title">{t.walkDuration}</p>

      <div className="duration-row">
        {DURATIONS.map((d) => (
          <button
            key={d}
            className={`duration-chip ${duration === d ? 'active' : ''}`}
            onClick={() => { setDuration(d); setResult(null); }}
            aria-pressed={duration === d}
          >
            <Timer size={12} strokeWidth={2} />
            {d}'
          </button>
        ))}
      </div>

      {/* Origin mode selector */}
      <div className="walk-origin-toggle">
        <button
          className={`walk-mode-btn ${originMode === 'location' ? 'active' : ''}`}
          onClick={() => switchMode('location')}
        >
          <Navigation size={13} strokeWidth={2} />
          {t.walkFromLocation}
        </button>
        <button
          className={`walk-mode-btn ${originMode === 'custom' ? 'active' : ''}`}
          onClick={() => switchMode('custom')}
        >
          <Search size={13} strokeWidth={2} />
          {t.walkFromCustom}
        </button>
      </div>

      {/* Location mode: geolocation prompt */}
      {originMode === 'location' && !origin && (
        <div className="walk-geo-prompt">
          <p className="walk-hint">
            <MapPin size={13} strokeWidth={2} />
            {lang === 'es' ? 'Necesitas tu ubicación para generar el paseo' : 'Your location is needed to generate a walk'}
          </p>
          <button className="walk-geo-btn" onClick={useGeolocation}>
            <Navigation size={14} strokeWidth={2} />
            {t.useMyLocation}
          </button>
          {geoError && (
            <div className="error-msg" role="alert">
              <TriangleAlert size={13} strokeWidth={2} /> {geoError}
            </div>
          )}
        </div>
      )}

      {/* Location mode: already located */}
      {originMode === 'location' && origin && (
        <div className="walk-origin-info">
          <MapPin size={13} strokeWidth={2} />
          <span className="walk-origin-label">{origin.label}</span>
        </div>
      )}

      {/* Custom mode: address input with autocomplete */}
      {originMode === 'custom' && (
        <div className="walk-custom-origin">
          <AddressInput
            placeholder={t.walkOriginPlaceholder}
            ariaLabel={t.walkFromCustom}
            value={customText}
            onChange={setCustomText}
            onSelect={pickCustomOrigin}
          >
            <MapPin size={15} strokeWidth={2} />
          </AddressInput>
          {origin && customText && (
            <div className="walk-origin-info">
              <MapPin size={13} strokeWidth={2} />
              <span className="walk-origin-label">{origin.label}</span>
            </div>
          )}
        </div>
      )}

      <button
        className="cta"
        onClick={handleWalk}
        disabled={loading || !origin}
      >
        {loading
          ? t.calculating
          : <><Leaf size={16} strokeWidth={2} /> {t.walkBtn}</>}
      </button>

      {error && (
        <div className="error-msg" role="alert">
          <TriangleAlert size={13} strokeWidth={2} /> {error}
        </div>
      )}

      {result && (
        <>
          <div className="section-divider" />
          <p className="sheet-section-title">{t.walkResultTitle}</p>
          <div className="route-card fresh">
            <div className="header-row">
              <span className="badge">{duration} min</span>
              <span className="time-label">
                {Math.round(result.route.distanceM)} m
              </span>
            </div>
            <div className="stats">
              <span className="stat">
                <Thermometer size={12} strokeWidth={2} />
                <strong>{result.route.avgTempC}°C</strong> {t.avgTemp}
              </span>
              <span className="stat">
                <Trees size={12} strokeWidth={2} />
                {t.shade} <strong>{Math.round(result.route.shadeScore * 100)}%</strong>
              </span>
              <span className="stat">
                <Droplets size={12} strokeWidth={2} />
                <strong>{result.route.fountainCount}</strong> {t.fountainsLabel}
              </span>
            </div>
          </div>
          {!result.orsConfigured && (
            <div className="demo-notice">
              {t.demoModeMsg} <code>ORS_API_KEY</code> {t.demoModeMsg2} <code>.env</code> {t.demoModeMsg3}
            </div>
          )}
        </>
      )}
    </div>
  );
}
