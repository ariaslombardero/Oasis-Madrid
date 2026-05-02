// Datos de respaldo basados en la red municipal real de Madrid.
// Se usan SOLO cuando datos.madrid.es no responde, para garantizar que el
// MVP siga siendo demostrable. Coordenadas WGS84 (EPSG:4326).

import type { WeatherStation, WeatherReading, Fountain, GreenSpace } from './madridData.js';

export const fallbackStations: WeatherStation[] = [
  { id: '108', name: 'Retiro', district: 'Retiro', lat: 40.4118, lng: -3.6824 },
  { id: '4', name: 'Pza. de España', district: 'Centro', lat: 40.4239, lng: -3.7128 },
  { id: '24', name: 'Casa de Campo', district: 'Moncloa-Aravaca', lat: 40.4196, lng: -3.7475 },
  { id: '58', name: 'Parque Juan Carlos I', district: 'Barajas', lat: 40.4659, lng: -3.6131 },
  { id: '102', name: 'Barajas', district: 'Barajas', lat: 40.4773, lng: -3.5807 },
  { id: '8', name: 'Escuelas Aguirre', district: 'Salamanca', lat: 40.4216, lng: -3.6824 },
  { id: '38', name: 'Cuatro Caminos', district: 'Tetuán', lat: 40.4456, lng: -3.7074 },
  { id: '11', name: 'Vallecas', district: 'Puente de Vallecas', lat: 40.3881, lng: -3.6517 },
  { id: '54', name: 'Ensanche Vallecas', district: 'Villa de Vallecas', lat: 40.3729, lng: -3.6121 },
  { id: '16', name: 'Arturo Soria', district: 'Ciudad Lineal', lat: 40.4407, lng: -3.6396 },
  { id: '57', name: 'Mendez Álvaro', district: 'Arganzuela', lat: 40.3982, lng: -3.6868 },
  { id: '36', name: 'Moratalaz', district: 'Moratalaz', lat: 40.4076, lng: -3.6452 },
];

const now = new Date().toISOString();
// Lecturas de respaldo con temperaturas neutras (≈ media anual de Madrid).
// No simulan una ola de calor para evitar alertas falsas al arrancar.
// Se reemplazan con datos reales en cuanto el primer cron de ingesta termina (~30 s).
export const fallbackReadings: WeatherReading[] = [
  { stationId: '108', measuredAt: now, temperatureC: 18.2, humidityPct: 55, windSpeedMs: 2.1, solarRadiationWm2: 320 },
  { stationId: '4',   measuredAt: now, temperatureC: 19.1, humidityPct: 50, windSpeedMs: 1.4, solarRadiationWm2: 340 },
  { stationId: '24',  measuredAt: now, temperatureC: 17.8, humidityPct: 58, windSpeedMs: 2.6, solarRadiationWm2: 300 },
  { stationId: '58',  measuredAt: now, temperatureC: 18.5, humidityPct: 52, windSpeedMs: 3.2, solarRadiationWm2: 310 },
  { stationId: '102', measuredAt: now, temperatureC: 18.0, humidityPct: 53, windSpeedMs: 3.5, solarRadiationWm2: 305 },
  { stationId: '8',   measuredAt: now, temperatureC: 19.3, humidityPct: 49, windSpeedMs: 1.8, solarRadiationWm2: 350 },
  { stationId: '38',  measuredAt: now, temperatureC: 18.8, humidityPct: 51, windSpeedMs: 2.0, solarRadiationWm2: 330 },
  { stationId: '11',  measuredAt: now, temperatureC: 17.5, humidityPct: 60, windSpeedMs: 1.6, solarRadiationWm2: 290 },
  { stationId: '54',  measuredAt: now, temperatureC: 17.2, humidityPct: 61, windSpeedMs: 1.9, solarRadiationWm2: 285 },
  { stationId: '16',  measuredAt: now, temperatureC: 18.9, humidityPct: 50, windSpeedMs: 2.2, solarRadiationWm2: 335 },
  { stationId: '57',  measuredAt: now, temperatureC: 18.4, humidityPct: 54, windSpeedMs: 1.7, solarRadiationWm2: 315 },
  { stationId: '36',  measuredAt: now, temperatureC: 18.1, humidityPct: 55, windSpeedMs: 2.0, solarRadiationWm2: 320 },
];

export const fallbackFountains: Fountain[] = [
  { id: 'f1', name: 'Retiro - Estanque', district: 'Retiro', lat: 40.4150, lng: -3.6841, status: 'EN_SERVICIO', type: 'drink' },
  { id: 'f2', name: 'Sol', district: 'Centro', lat: 40.4170, lng: -3.7038, status: 'EN_SERVICIO', type: 'drink' },
  { id: 'f3', name: 'Plaza Mayor', district: 'Centro', lat: 40.4155, lng: -3.7074, status: 'EN_SERVICIO', type: 'drink' },
  { id: 'f4', name: 'Madrid Río - Puente Toledo', district: 'Arganzuela', lat: 40.4014, lng: -3.7187, status: 'EN_SERVICIO', type: 'drink' },
  { id: 'f5', name: 'Templo de Debod', district: 'Moncloa-Aravaca', lat: 40.4239, lng: -3.7177, status: 'EN_SERVICIO', type: 'drink' },
  { id: 'f6', name: 'Parque del Oeste', district: 'Moncloa-Aravaca', lat: 40.4318, lng: -3.7212, status: 'EN_SERVICIO', type: 'drink' },
  { id: 'f7', name: 'Parque de Berlín', district: 'Chamartín', lat: 40.4585, lng: -3.6731, status: 'AVERIA', type: 'drink' },
  { id: 'f8', name: 'Parque Juan Carlos I', district: 'Barajas', lat: 40.4659, lng: -3.6131, status: 'EN_SERVICIO', type: 'drink' },
  { id: 'f9', name: 'Madrid Río - Matadero', district: 'Arganzuela', lat: 40.3925, lng: -3.6968, status: 'EN_SERVICIO', type: 'drink' },
  { id: 'f10', name: 'Parque Lineal Manzanares', district: 'Usera', lat: 40.3766, lng: -3.7087, status: 'EN_SERVICIO', type: 'drink' },
];

export const fallbackPetFountains: Fountain[] = [
  { id: 'p1', name: 'Retiro - Acceso O\'Donnell', district: 'Retiro', lat: 40.4192, lng: -3.6790, status: 'EN_SERVICIO', type: 'pet' },
  { id: 'p2', name: 'Madrid Río - Pradera', district: 'Arganzuela', lat: 40.4031, lng: -3.7165, status: 'EN_SERVICIO', type: 'pet' },
  { id: 'p3', name: 'Parque Juan Carlos I', district: 'Barajas', lat: 40.4671, lng: -3.6122, status: 'EN_SERVICIO', type: 'pet' },
  { id: 'p4', name: 'Casa de Campo - Lago', district: 'Moncloa-Aravaca', lat: 40.4174, lng: -3.7407, status: 'EN_SERVICIO', type: 'pet' },
  { id: 'p5', name: 'Dehesa de la Villa', district: 'Moncloa-Aravaca', lat: 40.4548, lng: -3.7193, status: 'EN_SERVICIO', type: 'pet' },
];

export const fallbackGreenSpaces: GreenSpace[] = [
  { id: 'gs1', name: 'Parque del Retiro', district: 'Retiro', area_m2: 1180000, centroid: { lat: 40.4150, lng: -3.6824 } },
  { id: 'gs2', name: 'Casa de Campo', district: 'Moncloa-Aravaca', area_m2: 17220000, centroid: { lat: 40.4196, lng: -3.7475 } },
  { id: 'gs3', name: 'Madrid Río', district: 'Arganzuela', area_m2: 1200000, centroid: { lat: 40.3960, lng: -3.7170 } },
  { id: 'gs4', name: 'Parque Juan Carlos I', district: 'Barajas', area_m2: 1600000, centroid: { lat: 40.4659, lng: -3.6131 } },
  { id: 'gs5', name: 'Parque del Oeste', district: 'Moncloa-Aravaca', area_m2: 980000, centroid: { lat: 40.4318, lng: -3.7212 } },
  { id: 'gs6', name: 'Dehesa de la Villa', district: 'Moncloa-Aravaca', area_m2: 700000, centroid: { lat: 40.4548, lng: -3.7193 } },
  { id: 'gs7', name: 'Parque Lineal del Manzanares', district: 'Usera', area_m2: 760000, centroid: { lat: 40.3766, lng: -3.7087 } },
  { id: 'gs8', name: 'Parque de Berlín', district: 'Chamartín', area_m2: 80000, centroid: { lat: 40.4585, lng: -3.6731 } },
  { id: 'gs9', name: 'Parque Tierno Galván', district: 'Arganzuela', area_m2: 450000, centroid: { lat: 40.3920, lng: -3.6794 } },
  { id: 'gs10', name: 'Parque de las Avenidas', district: 'Salamanca', area_m2: 25000, centroid: { lat: 40.4347, lng: -3.6680 } },
  { id: 'gs11', name: 'Quinta de los Molinos', district: 'San Blas-Canillejas', area_m2: 250000, centroid: { lat: 40.4360, lng: -3.6230 } },
  { id: 'gs12', name: 'Parque Pradolongo', district: 'Usera', area_m2: 240000, centroid: { lat: 40.3744, lng: -3.7000 } },
];
