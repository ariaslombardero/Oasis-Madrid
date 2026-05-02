import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Leaf, ChevronRight, Globe2 } from 'lucide-react';
import { useLang } from '../i18n/LangContext';

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

// ── helpers
const R = 1.5;
function latLngToVec3(latDeg: number, lngDeg: number, r: number): THREE.Vector3 {
  const lat = (latDeg * Math.PI) / 180;
  const lng = (lngDeg * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lng),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.sin(lng),
  );
}

// ── heat-point data (Madrid weather stations + surrounding zones)
const HEAT_POINTS = [
  { lat: 40.41, lng: -3.70, color: 0xD95F32, size: 0.07, speed: 2.8, phase: 0.0 },   // Centro — caliente
  { lat: 40.45, lng: -3.72, color: 0xC4956A, size: 0.05, speed: 2.3, phase: 1.0 },   // Retiro
  { lat: 40.48, lng: -3.75, color: 0xC4956A, size: 0.04, speed: 2.1, phase: 1.8 },   // Fuencarral
  { lat: 40.38, lng: -3.60, color: 0xD95F32, size: 0.04, speed: 2.5, phase: 0.5 },   // Vallecas
  { lat: 40.42, lng: -3.83, color: 0x52C7A7, size: 0.04, speed: 2.0, phase: 2.1 },   // Casa de Campo — fresco
  { lat: 40.50, lng: -3.82, color: 0x52C7A7, size: 0.035, speed: 1.9, phase: 0.9 },  // Pozuelo
  { lat: 40.44, lng: -3.69, color: 0xFFC107, size: 0.038, speed: 2.4, phase: 1.4 },  // Chamberí
  { lat: 40.35, lng: -3.73, color: 0xD95F32, size: 0.038, speed: 2.6, phase: 2.5 },  // Villaverde
];

function buildScene(canvas: HTMLCanvasElement) {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x09160f, 1);
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0, 0.4, 4.2);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
  dirLight.position.set(-4, 2, 3);
  scene.add(dirLight);
  const pointLight = new THREE.PointLight(0x52C7A7, 0.35, 20);
  pointLight.position.set(3, 1, 3);
  scene.add(pointLight);

  // Globe group (starts rotated so Spain faces camera)
  const globeGroup = new THREE.Group();
  globeGroup.rotation.set(0.05, -1.58, 0);
  scene.add(globeGroup);

  // Core sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(R, 48, 48),
    new THREE.MeshPhongMaterial({ color: 0x16382A, emissive: 0x09160F, specular: 0x3A9E78, shininess: 22 }),
  );
  globeGroup.add(sphere);

  // Wireframe overlay
  const wire = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.001, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0x52C7A7, wireframe: true, transparent: true, opacity: 0.045 }),
  );
  globeGroup.add(wire);

  // Atmosphere glow (back-face)
  const atmo1 = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.06, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x3A9E78, transparent: true, opacity: 0.07, side: THREE.BackSide }),
  );
  globeGroup.add(atmo1);

  const atmo2 = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.11, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x52C7A7, transparent: true, opacity: 0.025, side: THREE.BackSide }),
  );
  globeGroup.add(atmo2);

  // Stars (buffer geometry of random points)
  const starPositions = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const r = 80 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true }));
  scene.add(stars);

  // Heat points
  const heatMeshes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; speed: number; phase: number }[] = [];
  for (const p of HEAT_POINTS) {
    const mat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.6 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.size, 10, 10), mat);
    const pos = latLngToVec3(p.lat, p.lng, R * 1.012);
    mesh.position.copy(pos);
    globeGroup.add(mesh);
    heatMeshes.push({ mesh, mat, speed: p.speed, phase: p.phase });
  }

  // Resize handler
  const onResize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  // Animation loop
  let rafId: number;
  const clock = new THREE.Clock();
  const animate = () => {
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    globeGroup.rotation.y += 0.0007;

    for (const { mesh, mat, speed, phase } of heatMeshes) {
      const s = 1 + Math.sin(t * speed + phase) * 0.45;
      mesh.scale.setScalar(s);
      mat.opacity = 0.35 + Math.sin(t * speed + phase) * 0.35;
    }
    renderer.render(scene, camera);
  };
  animate();

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    renderer.dispose();
  };
}

// ── Component
interface IntroScreenProps {
  onEnter: () => void;
  currentTemp?: number;
}

export function IntroScreen({ onEnter, currentTemp }: IntroScreenProps) {
  const { lang, t, setLang } = useLang();
  const [exiting, setExiting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clock = useClock(lang);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      return buildScene(canvas);
    } catch (e) {
      console.warn('[IntroScreen] WebGL not available:', e);
    }
  }, []);

  const handleEnter = () => {
    setExiting(true);
    setTimeout(onEnter, 550);
  };

  return (
    <div className={`intro-screen${exiting ? ' exiting' : ''}`} role="main">
      {/* Three.js canvas (vanilla, no R3F) */}
      <canvas
        ref={canvasRef}
        className="intro-canvas"
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {/* CSS fallback orb visible through canvas clear color */}
      <div className="intro-fallback" aria-hidden>
        <div className="intro-fallback-orb" />
      </div>

      {/* Retiro aerial as subtle full-screen background watermark */}
      <div className="intro-bg-photo" aria-hidden>
        <img src="/retiro-aerial.jpg" alt="" />
      </div>

      {/* HTML overlay */}
      <div className="intro-overlay">
        <div className="intro-content">
          {/* Left: branding + CTA */}
          <div className="intro-left">
            <div className="intro-logo">
              <div className="intro-logo-ring">
                <Leaf size={30} strokeWidth={1.7} />
              </div>
              <h1 className="intro-title">OasisMadrid</h1>
              <p className="intro-tagline">{t.appTagline}</p>
              <p className="intro-hook">{t.introHook}</p>
            </div>

            {currentTemp !== undefined && currentTemp > 0 && (
              <div className="intro-temp">
                <span className="intro-temp-val">{currentTemp}°C</span>
                <span className="intro-temp-lbl">
                  {lang === 'es' ? 'Madrid ahora' : 'Madrid now'}
                </span>
                <span className="intro-clock">{clock}</span>
              </div>
            )}

            <div className="intro-actions">
              <button className="intro-cta" onClick={handleEnter}>
                {lang === 'es' ? 'Explorar Madrid' : 'Explore Madrid'}
                <ChevronRight size={18} strokeWidth={2.5} />
              </button>
              <button
                className="intro-lang-btn"
                onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
                aria-label="Switch language"
              >
                <Globe2 size={13} strokeWidth={2} />
                {lang === 'es' ? 'EN' : 'ES'}
              </button>
            </div>

            <p className="intro-foot">
              {lang === 'es'
                ? 'Datos en tiempo real · Ayuntamiento de Madrid'
                : 'Real-time data · Madrid City Council'}
            </p>
          </div>

          {/* Right: app screenshot */}
          <div className="intro-right" aria-hidden>
            <div className="intro-app-frame">
              <img src="/app-route.png" alt="" className="intro-app-img" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
