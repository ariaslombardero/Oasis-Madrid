import { Router } from 'express';
import axios from 'axios';
import { joinedStationReadings, getFreshness } from '../services/madridData.js';
import { computeIct, classifyRisk } from '../services/thermalIndex.js';

export const weatherRouter = Router();

// Open-Meteo weather codes → simple icon slug
const WMO_ICON: Record<number, string> = {
  0: 'sunny', 1: 'mostly-sunny', 2: 'partly-cloudy', 3: 'cloudy',
  45: 'foggy', 48: 'foggy',
  51: 'drizzle', 53: 'drizzle', 55: 'drizzle',
  61: 'rain', 63: 'rain', 65: 'heavy-rain',
  71: 'snow', 73: 'snow', 75: 'heavy-snow',
  80: 'showers', 81: 'showers', 82: 'heavy-showers',
  95: 'thunderstorm', 96: 'thunderstorm', 99: 'thunderstorm',
};

weatherRouter.get('/forecast', async (_req, res) => {
  try {
    const params = new URLSearchParams({
      latitude: '40.4168',
      longitude: '-3.7038',
      daily: 'temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max',
      hourly: 'temperature_2m,weathercode',
      timezone: 'Europe/Madrid',
      forecast_days: '1',
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const r = await axios.get(url, { timeout: 10000 });
    const d = r.data as any;
    const daily = d.daily;
    const hourly = d.hourly;

    // Build hourly array for today (24 slots)
    const hours: { hour: number; tempC: number; icon: string }[] = [];
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    for (let i = 0; i < (hourly.time?.length ?? 0); i++) {
      const t: string = hourly.time[i];
      if (!t.startsWith(todayStr)) continue;
      const hour = new Date(t).getHours();
      hours.push({
        hour,
        tempC: Math.round(hourly.temperature_2m[i] * 10) / 10,
        icon: WMO_ICON[hourly.weathercode[i]] ?? 'partly-cloudy',
      });
    }

    res.json({
      date: daily.time?.[0] ?? todayStr,
      maxTempC: Math.round(daily.temperature_2m_max?.[0] * 10) / 10,
      minTempC: Math.round(daily.temperature_2m_min?.[0] * 10) / 10,
      icon: WMO_ICON[daily.weathercode?.[0]] ?? 'partly-cloudy',
      precipPct: daily.precipitation_probability_max?.[0] ?? 0,
      hours,
    });
  } catch (err) {
    res.status(502).json({ error: 'forecast unavailable', detail: (err as Error).message });
  }
});

// Monthly historical averages for Madrid (°C) — source: AEMET 1991-2020 normals
// Index 0 = January … 11 = December
const MADRID_MONTHLY_AVG = [6.6, 8.0, 10.8, 13.3, 17.9, 22.9, 25.9, 25.6, 21.3, 15.7, 10.2, 7.2];

weatherRouter.get('/historical-context', (_req, res) => {
  const stations = joinedStationReadings().filter((s) => s.reading?.temperatureC != null);
  if (!stations.length) return res.status(503).json({ error: 'no data yet' });

  const avg = stations.reduce((a, s) => a + (s.reading!.temperatureC ?? 0), 0) / stations.length;
  const month = new Date().getMonth(); // 0-based
  const historical = MADRID_MONTHLY_AVG[month];
  const diff = Math.round((avg - historical) * 10) / 10;

  res.json({
    currentAvgC: Math.round(avg * 10) / 10,
    historicalAvgC: historical,
    diffC: diff,         // positive = hotter than average
    month,
  });
});

weatherRouter.get('/current', (_req, res) => {
  const stations = joinedStationReadings();
  const data = stations.map((s) => {
    const r = s.reading;
    const t = r?.temperatureC ?? null;
    const h = r?.humidityPct ?? null;
    const v = r?.windSpeedMs ?? 0;
    let ict: number | null = null;
    let risk: string | null = null;
    if (t !== null && h !== null) {
      ict = Math.round(computeIct(t, h, v) * 10) / 10;
      risk = classifyRisk(ict);
    }
    return {
      id: s.id,
      name: s.name,
      district: s.district,
      lat: s.lat,
      lng: s.lng,
      temperatureC: t,
      humidityPct: h,
      windSpeedMs: r?.windSpeedMs ?? null,
      solarRadiationWm2: r?.solarRadiationWm2 ?? null,
      measuredAt: r?.measuredAt ?? null,
      ict,
      riskLevel: risk,
    };
  });
  res.json({ stations: data, freshness: getFreshness() });
});
