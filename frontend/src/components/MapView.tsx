import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map, Marker, Popup } from 'maplibre-gl';
import { useStore } from '../store/appStore';
import { api, reverseGeocode } from '../services/api';

// Estilo MapLibre con tiles raster gratuitos de OSM (sin API key necesaria).
const STYLE: any = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
              'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function colorForRisk(level: string | null) {
  switch (level) {
    case 'comfort': return '#4CAF50';
    case 'mild': return '#FFC107';
    case 'moderate': return '#FF7043';
    case 'high': return '#E53935';
    case 'extreme': return '#880E4F';
    default: return '#9e9e9e';
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const odMarkersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  const stations = useStore((s) => s.stations);
  const fountains = useStore((s) => s.fountains);
  const greenSpaces = useStore((s) => s.greenSpaces);
  const showDrink = useStore((s) => s.showDrinkFountains);
  const showPet = useStore((s) => s.showPetFountains);
  const showGreen = useStore((s) => s.showGreenSpaces);
  const showTree = useStore((s) => s.showTreeShade);
  const showFreshRoute = useStore((s) => s.showFreshRoute);
  const showStandardRoute = useStore((s) => s.showStandardRoute);
  const route = useStore((s) => s.route);
  const origin = useStore((s) => s.origin);
  const destination = useStore((s) => s.destination);
  const setOrigin = useStore((s) => s.setOrigin);
  const setPointThermal = useStore((s) => s.setPointThermal);

  // Auto-geolocation on first load if no origin set
  useEffect(() => {
    if (origin || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Mi ubicación' });
      },
      () => { /* silencioso si el usuario deniega */ },
      { timeout: 8000, maximumAge: 60000 },
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Init mapa
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [-3.7038, 40.4168],
      zoom: 12,
      attributionControl: { compact: true },
      locale: {
        'NavigationControl.ZoomIn': 'Acercar',
        'NavigationControl.ZoomOut': 'Alejar',
        'NavigationControl.ResetBearing': 'Orientar al norte',
        'GeolocateControl.FindMyLocation': 'Mi ubicación actual',
        'GeolocateControl.LocationNotAvailable': 'Ubicación no disponible',
        'FullscreenControl.Enter': 'Pantalla completa',
        'FullscreenControl.Exit': 'Salir de pantalla completa',
        'AttributionControl.ToggleAttribution': 'Mostrar atribución',
      },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'top-right');

    map.on('load', () => {
      // Capas vacías que rellenaremos cuando lleguen datos
      map.addSource('thermal-circles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'thermal-blur',
        type: 'circle',
        source: 'thermal-circles',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 50, 14, 110, 16, 220],
          'circle-color': ['get', 'color'],
          'circle-blur': 1.0,
          'circle-opacity': 0.45,
        },
      });
      map.addLayer({
        id: 'thermal-points',
        type: 'circle',
        source: 'thermal-circles',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });

      map.addSource('green-spaces', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'green-spaces-fill',
        type: 'circle',
        source: 'green-spaces',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            10, 8,
            14, 25,
            20, 80
          ],
          'circle-color': '#4CAF50',
          'circle-opacity': 0.25,
          'circle-stroke-color': '#2E7D32',
          'circle-stroke-width': 1,
        },
      });

      // Capa de sombra arbórea (clusters de árboles de los parques principales)
      map.addSource('tree-shade', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'tree-shade-layer',
        type: 'circle',
        source: 'tree-shade',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 6, 15, 16, 17, 28],
          'circle-color': '#2E7D32',
          'circle-opacity': 0.35,
          'circle-blur': 0.6,
        },
      });

      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'route-standard',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'standard'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#D32F2F', 'line-width': 5, 'line-opacity': 0.75, 'line-dasharray': [2, 1], 'line-offset': 3 },
      });
      map.addLayer({
        id: 'route-fresh',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'fresh'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1A7F64', 'line-width': 6, 'line-opacity': 0.95, 'line-offset': -3 },
      });

      // Fuentes clusters
      map.addSource('fountains', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
      map.addLayer({
        id: 'fountains-clusters',
        type: 'circle',
        source: 'fountains',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1565C0',
          'circle-radius': ['step', ['get', 'point_count'], 12, 10, 16, 50, 20],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      });
      map.addLayer({
        id: 'fountains-cluster-count',
        type: 'symbol',
        source: 'fountains',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Open Sans Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff'
        }
      });
      map.addLayer({
        id: 'fountains-unclustered',
        type: 'circle',
        source: 'fountains',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'type'], 'pet', '#FFC107', '#1565C0'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': ['match', ['get', 'status'], 'EN_SERVICIO', 1, 0.45]
        }
      });
      const drawEmoji = (emoji: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(emoji, 12, 13);
          return ctx.getImageData(0, 0, 24, 24);
        }
        return { width: 24, height: 24, data: new Uint8Array(24 * 24 * 4) };
      };

      if (!map.hasImage('emoji-drink')) map.addImage('emoji-drink', drawEmoji('💧'));
      if (!map.hasImage('emoji-pet')) map.addImage('emoji-pet', drawEmoji('🐾'));

      map.addLayer({
        id: 'fountains-unclustered-icon',
        type: 'symbol',
        source: 'fountains',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['match', ['get', 'type'], 'pet', 'emoji-pet', 'emoji-drink'],
          'icon-size': 0.75,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true
        }
      });
      
      // Popup events
      map.on('click', 'fountains-unclustered', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const coords = (f.geometry as any).coordinates;
        const props = f.properties;
        const typeLabel = props.type === 'pet' ? 'Fuente para mascotas' : 'Fuente de agua';
        const statusLabel = props.status === 'EN_SERVICIO' ? 'en servicio' : 'fuera de servicio';
        new maplibregl.Popup({ closeButton: true, offset: 12 })
          .setLngLat(coords)
          .setHTML(
            `<strong>${props.name ?? typeLabel}</strong><br/>
            ${typeLabel}<br/>
            Estado: ${statusLabel}<br/>${props.district ?? ''}`
          )
          .addTo(map);
      });
      map.on('mouseenter', 'fountains-unclustered', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'fountains-unclustered', () => { map.getCanvas().style.cursor = ''; });

      map.on('click', 'fountains-clusters', async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['fountains-clusters'] });
        const clusterId = features[0].properties.cluster_id;
        const source = map.getSource('fountains') as maplibregl.GeoJSONSource;
        try {
          const zoom = await source.getClusterExpansionZoom(clusterId);
          map.easeTo({
            center: (features[0].geometry as any).coordinates as [number, number],
            zoom: zoom
          });
        } catch (err) {
          // Ignore
        }
      });
      map.on('mouseenter', 'fountains-clusters', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'fountains-clusters', () => { map.getCanvas().style.cursor = ''; });

      // Click en mapa → ICT del punto
      map.on('click', async (e) => {
        try {
          const t = await api.thermalPoint(e.lngLat.lat, e.lngLat.lng);
          const address = await reverseGeocode(e.lngLat.lat, e.lngLat.lng);
          if (address) t.address = address;
          setPointThermal(t);
        } catch { /* ignore */ }
      });
      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [setPointThermal]);

  // Estaciones meteorológicas → capa térmica
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const features = stations
      .filter((s) => s.temperatureC !== null)
      .map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
        properties: {
          color: colorForRisk(s.riskLevel),
          name: s.name,
          temp: s.temperatureC,
          hum: s.humidityPct,
          ict: s.ict,
          risk: s.riskLevel,
          aqi: s.aqi,
        },
      }));
    const src = map.getSource('thermal-circles') as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features });
  }, [stations, mapReady]);

  // Click en estación
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: any) => {
      const f = e.features?.[0];
      if (!f) return;
      new maplibregl.Popup({ closeButton: true })
        .setLngLat(f.geometry.coordinates)
        .setHTML(
          `<strong>${f.properties.name}</strong><br/>
          <div style="font-size: 13px; line-height: 1.4;">
            Temp: ${f.properties.temp !== undefined && f.properties.temp !== 'undefined' ? `${f.properties.temp}°C` : '—'} · Humedad: ${f.properties.hum !== undefined && f.properties.hum !== 'undefined' ? `${f.properties.hum}%` : '—'}<br/>
            ICT: ${f.properties.ict !== undefined && f.properties.ict !== 'undefined' ? f.properties.ict : '—'} · Riesgo: ${f.properties.risk && f.properties.risk !== 'undefined' ? f.properties.risk : '—'}<br/>
            ICA: <strong>${f.properties.aqi !== undefined && f.properties.aqi !== 'undefined' ? f.properties.aqi : '—'}</strong> (1=Mejor, 5=Peor)
          </div>`
        )
        .addTo(map);
    };
    map.on('click', 'thermal-points', onClick);
    map.getCanvas().style.cursor = '';
    map.on('mouseenter', 'thermal-points', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'thermal-points', () => (map.getCanvas().style.cursor = ''));
    return () => {
      map.off('click', 'thermal-points', onClick);
    };
  }, []);

  // Zonas verdes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const features = showGreen
      ? greenSpaces.map((g) => {
          const area = g.area_m2 ?? 50000;
          const radiusM = Math.sqrt(area / Math.PI);
          return {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [g.centroid.lng, g.centroid.lat] },
            properties: { name: g.name, radiusM },
          };
        })
      : [];
    const src = map.getSource('green-spaces') as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features });
  }, [greenSpaces, showGreen, mapReady]);

  // Capa de sombra arbórea — usa las zonas verdes como proxy de ubicación de árboles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('tree-shade') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (!showTree || greenSpaces.length === 0) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    // Genera puntos de árbol sintéticos densificando el contorno de cada zona verde
    const features: any[] = [];
    for (const g of greenSpaces) {
      const areaM = g.area_m2 ?? 20000;
      // Número de puntos proporcional al área (máx 40 por zona para no saturar)
      const count = Math.min(40, Math.max(4, Math.round(areaM / 3000)));
      const radius = Math.sqrt(areaM / Math.PI) / 111320; // grados aprox
      for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / count;
        const r = radius * (0.3 + Math.random() * 0.7);
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [
              g.centroid.lng + r * Math.cos(angle),
              g.centroid.lat + r * Math.sin(angle),
            ],
          },
          properties: {},
        });
      }
    }
    src.setData({ type: 'FeatureCollection', features });
  }, [greenSpaces, showTree, mapReady]);

  // Fuentes a la fuente GeoJSON 'fountains'
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('fountains') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    
    // Sort so drink fountains are processed first, pet fountains second.
    // That way, if they overlap, the pet fountain gets the offset.
    const filtered = fountains
      .filter((f) => (f.type === 'drink' && showDrink) || (f.type === 'pet' && showPet))
      .sort((a, b) => a.type === 'drink' ? -1 : 1);

    const seenCoords = new Set<string>();
    
    const features = filtered.map(f => {
      let lng = f.lng;
      let lat = f.lat;
      const coordKey = `${lng.toFixed(5)},${lat.toFixed(5)}`;
      
      if (seenCoords.has(coordKey)) {
        // Offset slightly to avoid exact overlap (approx 4 meters)
        // This prevents the droplet and paw emojis from blending together visually.
        lng += 0.00004;
        lat -= 0.00004;
      }
      seenCoords.add(coordKey);

      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        properties: { 
          id: f.id, 
          name: f.name, 
          type: f.type, 
          status: f.status, 
          district: f.district 
        }
      };
    });
    src.setData({ type: 'FeatureCollection', features });
  }, [fountains, showDrink, showPet, mapReady]);

  // Origen / destino
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    odMarkersRef.current.forEach((m) => m.remove());
    odMarkersRef.current = [];
    if (origin) {
      const el = document.createElement('div');
      el.textContent = 'A';
      el.style.cssText = `width: 28px; height: 28px; border-radius: 50%; background: #1A7F64; color: white;
        display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;
        border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);`;
      const m = new Marker({ element: el }).setLngLat([origin.lng, origin.lat]).addTo(map);
      odMarkersRef.current.push(m);
    }
    if (destination) {
      const el = document.createElement('div');
      el.textContent = 'B';
      el.style.cssText = `width: 28px; height: 28px; border-radius: 50%; background: #D32F2F; color: white;
        display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;
        border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);`;
      const m = new Marker({ element: el }).setLngLat([destination.lng, destination.lat]).addTo(map);
      odMarkersRef.current.push(m);
    }
  }, [origin, destination]);

  // Rutas
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = map.getSource('routes') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (!route) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    const features = [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: route.standard.coordinates },
        properties: { kind: 'standard' },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: route.fresh.coordinates },
        properties: { kind: 'fresh' },
      },
    ];
    src.setData({ type: 'FeatureCollection', features });
    // Encajar bbox
    const all = [...route.standard.coordinates, ...route.fresh.coordinates];
    const lons = all.map((c) => c[0]);
    const lats = all.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: { top: 80, right: 60, bottom: 340, left: 60 }, duration: 600 },
    );
  }, [route, mapReady]);

  // Visibilidad de rutas según estado del panel
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('route-fresh'))
      map.setLayoutProperty('route-fresh', 'visibility', showFreshRoute ? 'visible' : 'none');
    if (map.getLayer('route-standard'))
      map.setLayoutProperty('route-standard', 'visibility', showStandardRoute ? 'visible' : 'none');
  }, [showFreshRoute, showStandardRoute, mapReady]);

  return <div ref={containerRef} className="map" aria-label="Mapa de Madrid con índice de confort térmico" />;
}
