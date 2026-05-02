import { useEffect, useState } from 'react';
import { Thermometer, Droplets, Sun, Cloud, CloudRain, CloudSnow, Zap, Wind, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api, type DayForecast, type HistoricalContext } from '../services/api';
import { useLang } from '../i18n/LangContext';
import { useStore } from '../store/appStore';

const ICON_MAP: Record<string, React.ReactNode> = {
  'sunny':          <Sun  size={16} strokeWidth={1.8} />,
  'mostly-sunny':   <Sun  size={16} strokeWidth={1.8} />,
  'partly-cloudy':  <Cloud size={16} strokeWidth={1.8} />,
  'cloudy':         <Cloud size={16} strokeWidth={1.8} />,
  'foggy':          <Wind  size={16} strokeWidth={1.8} />,
  'drizzle':        <CloudRain size={16} strokeWidth={1.8} />,
  'rain':           <CloudRain size={16} strokeWidth={1.8} />,
  'heavy-rain':     <CloudRain size={16} strokeWidth={1.8} />,
  'showers':        <CloudRain size={16} strokeWidth={1.8} />,
  'heavy-showers':  <CloudRain size={16} strokeWidth={1.8} />,
  'snow':           <CloudSnow size={16} strokeWidth={1.8} />,
  'heavy-snow':     <CloudSnow size={16} strokeWidth={1.8} />,
  'thunderstorm':   <Zap  size={16} strokeWidth={1.8} />,
};

function WeatherIcon({ icon, size = 16 }: { icon: string; size?: number }) {
  const node = ICON_MAP[icon];
  if (!node) return <Sun size={size} strokeWidth={1.8} />;
  return <>{node}</>;
}

// Show only daytime hours (7–22)
const DAYTIME = [7, 9, 11, 13, 15, 17, 19, 21];

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

const MONTH_NAMES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function ForecastCard() {
  const { t, lang } = useLang();
  const [forecast, setForecast] = useState<DayForecast | null>(null);
  const [historical, setHistorical] = useState<HistoricalContext | null>(null);
  const averageTempC = useStore((s) => s.averageTempC);
  const clock = useClock(lang);

  useEffect(() => {
    api.forecast().then(setForecast).catch(() => {});
    api.historicalContext().then(setHistorical).catch(() => {});
  }, []);

  if (!forecast) return null;

  const now = new Date();
  // Capitalize only the first letter; everything else lowercase (fixes "Sábado, 2 De Mayo" → "Sábado, 2 de mayo")
  const rawDay = now.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const dayName = rawDay.charAt(0).toUpperCase() + rawDay.slice(1).toLowerCase();

  const dayHours = forecast.hours.filter((h) => DAYTIME.includes(h.hour));
  const currentHourData = forecast.hours.find((h) => h.hour === now.getHours());

  return (
    <div className="forecast-card">
      <div className="forecast-date-row">
        <span className="forecast-day">{dayName}</span>
        <div className="forecast-summary">
          <WeatherIcon icon={forecast.icon} size={14} />
          <span className="forecast-max">
            <Thermometer size={11} strokeWidth={2} />
            {t.maxTemp} {forecast.maxTempC}°
          </span>
          <span className="forecast-min">{t.minTemp} {forecast.minTempC}°</span>
          {forecast.precipPct > 20 && (
            <span className="forecast-rain">
              <Droplets size={11} strokeWidth={2} />
              {forecast.precipPct}% {t.rainChance}
            </span>
          )}
        </div>
      </div>

      {/* Hora actual + temperatura actual — prominente */}
      <div className="forecast-now">
        <div className="forecast-now-time">{clock}</div>
        {averageTempC > 0 && (
          <div className="forecast-now-temp">
            <WeatherIcon icon={currentHourData?.icon ?? forecast.icon} size={20} />
            <span>{averageTempC.toFixed(1)}°C</span>
          </div>
        )}
      </div>

      {/* F13 — Contexto histórico */}
      {historical && Math.abs(historical.diffC) >= 0.3 && (
        <div className={`historical-hint ${historical.diffC > 0 ? 'above' : 'below'}`}>
          {historical.diffC > 2 ? <TrendingUp size={12} strokeWidth={2} /> :
           historical.diffC < -2 ? <TrendingDown size={12} strokeWidth={2} /> :
           <Minus size={12} strokeWidth={2} />}
          <span>
            {lang === 'es'
              ? `${Math.abs(historical.diffC)}°C ${historical.diffC > 0 ? 'por encima' : 'por debajo'} de la media de ${MONTH_NAMES_ES[historical.month]} (${historical.historicalAvgC}°C)`
              : `${Math.abs(historical.diffC)}°C ${historical.diffC > 0 ? 'above' : 'below'} ${MONTH_NAMES_EN[historical.month]} average (${historical.historicalAvgC}°C)`
            }
          </span>
        </div>
      )}

      {dayHours.length > 0 && (
        <div className="forecast-hours">
          {dayHours.map((h) => (
            <div key={h.hour} className={`forecast-hour ${h.hour === now.getHours() ? 'now' : ''}`}>
              <span className="fh-time">{h.hour}h</span>
              <WeatherIcon icon={h.icon} size={13} />
              <span className="fh-temp">{h.tempC}°</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
