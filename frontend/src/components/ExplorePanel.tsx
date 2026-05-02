import { Thermometer, TrendingUp, TrendingDown, Minus, Droplets, PawPrint, Trees } from 'lucide-react';
import { useStore } from '../store/appStore';
import { useLang } from '../i18n/LangContext';
import type { WeatherStation } from '../types';

// AEMET Madrid-Retiro historical monthly averages (°C)
const MONTHLY_AVG = [6.6, 8.1, 10.9, 13.3, 17.5, 22.1, 25.3, 25.0, 20.5, 15.0, 9.9, 7.1];

const RISK_DOT: Record<string, string> = {
  comfort:  'var(--thermal-comfort)',
  mild:     'var(--thermal-mild)',
  moderate: 'var(--thermal-moderate)',
  high:     'var(--thermal-high)',
  extreme:  'var(--thermal-extreme)',
};

function stationLabel(s: WeatherStation) {
  return s.name || s.district || s.id;
}

export function ExplorePanel() {
  const { t } = useLang();
  const stations    = useStore((s) => s.stations);
  const averageTempC = useStore((s) => s.averageTempC);
  const showDrink   = useStore((s) => s.showDrinkFountains);
  const showPet     = useStore((s) => s.showPetFountains);
  const showGreen   = useStore((s) => s.showGreenSpaces);
  const toggleLayer = useStore((s) => s.toggleLayer);

  const monthIdx = new Date().getMonth();
  const historicalAvg = MONTHLY_AVG[monthIdx];
  const diff = averageTempC > 0 ? +(averageTempC - historicalAvg).toFixed(1) : null;
  const monthName = t.monthNames[monthIdx];

  const withTemp = stations.filter((s) => s.temperatureC !== null);
  const sorted   = [...withTemp].sort((a, b) => (a.temperatureC ?? 99) - (b.temperatureC ?? 99));
  const coolest  = sorted.slice(0, 5);
  const hottest  = sorted.slice(-5).reverse();

  return (
    <div className="explore-panel">

      {/* Historical comparison card */}
      {diff !== null && (
        <div className={`historical-card ${diff > 1 ? 'above' : diff < -1 ? 'below' : 'normal'}`}>
          <div className="historical-icon">
            {diff > 0.5
              ? <TrendingUp  size={18} strokeWidth={2} />
              : diff < -0.5
                ? <TrendingDown size={18} strokeWidth={2} />
                : <Minus size={18} strokeWidth={2} />}
          </div>
          <div className="historical-text">
            <span className="historical-value">
              {diff > 0 ? '+' : ''}{diff}°C
            </span>
            <span className="historical-label">
              {t.vsHistorical} {monthName} ({historicalAvg}°C)
            </span>
          </div>
        </div>
      )}

      {withTemp.length === 0 && (
        <p className="explore-empty">{t.noStationsYet}</p>
      )}

      {coolest.length > 0 && (
        <>
          <p className="sheet-section-title">{t.coolestNow}</p>
          <div className="ranking-list">
            {coolest.map((s, i) => (
              <div key={s.id} className="ranking-item">
                <span className="rank-pos">{i + 1}</span>
                <span
                  className="rank-dot"
                  style={{ background: RISK_DOT[s.riskLevel ?? 'comfort'] }}
                />
                <span className="rank-name">{stationLabel(s)}</span>
                <span className="rank-temp">
                  <Thermometer size={11} strokeWidth={2} />
                  {s.temperatureC}°C
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {hottest.length > 0 && (
        <>
          <p className="sheet-section-title">{t.hottestNow}</p>
          <div className="ranking-list">
            {hottest.map((s, i) => (
              <div key={s.id} className="ranking-item">
                <span className="rank-pos">{i + 1}</span>
                <span
                  className="rank-dot"
                  style={{ background: RISK_DOT[s.riskLevel ?? 'comfort'] }}
                />
                <span className="rank-name">{stationLabel(s)}</span>
                <span className="rank-temp">
                  <Thermometer size={11} strokeWidth={2} />
                  {s.temperatureC}°C
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-divider" />
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
      </div>

      <div className="footer-note">{t.dataSource}</div>
    </div>
  );
}
