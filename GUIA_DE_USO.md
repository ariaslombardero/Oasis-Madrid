# 🌳 OasisMadrid — Guía de uso (para probar paso a paso)

> Esta guía está pensada para que cualquier persona, sin conocimientos
> técnicos, pueda comprobar si la aplicación funciona correctamente y
> entender qué hace cada parte.

---

## 🎯 ¿Qué es OasisMadrid?

OasisMadrid es una aplicación web que te ayuda a **moverte por Madrid
buscando las rutas más frescas** durante los días calurosos. Usa
información pública del Ayuntamiento (estaciones meteorológicas, fuentes
de agua, parques) para mostrarte:

1. Dónde hace más calor en la ciudad (mapa de colores).
2. Dónde están las fuentes de agua operativas (para ti y para tu mascota).
3. Cuál es el mejor camino entre dos puntos si quieres evitar el calor.
4. Avisos cuando la temperatura es peligrosa.

---

## 🟢 Antes de empezar

Para probar la aplicación no es necesario instalar nada. OasisMadrid está completamente desplegada y funcional en la nube.

1. Abre tu navegador web favorito (recomendamos Chrome, Safari o Firefox).
2. Visita la dirección oficial: **[https://oasismadrid.vercel.app/](https://oasismadrid.vercel.app/)**

> Si solo ves una pantalla en blanco o de carga al principio, dale unos segundos: el backend podría estar descargando la última actualización de datos reales de Madrid.

---

## 🧪 Lista de pruebas (en orden)

Marca cada casilla cuando la prueba funcione. Si alguna falla, mira la
sección **"Si algo no funciona"** al final.

### ✅ Prueba 1 — La app carga

- [ ] Abro `https://oasismadrid.vercel.app/` y veo un mapa de Madrid centrado en Sol.
- [ ] En la parte superior pone **"🌳 OasisMadrid"**.
- [ ] En la parte inferior aparece una caja con cuadros de "Origen" y "Destino".

**Qué demuestra:** que el frontend (React + mapa) está funcionando y
hablando con el backend.

---

### ✅ Prueba 2 — El mapa térmico se ve

- [ ] Veo unos **círculos de colores** repartidos por Madrid (verde,
      amarillo, naranja, rojo).
- [ ] Pulso uno de los círculos y aparece una etiqueta con la temperatura,
      humedad y nivel de riesgo.

**Qué demuestra:** que la API está sirviendo los datos meteorológicos
en tiempo real (DS-01 + DS-02 de datos.madrid.es) y que el cálculo del
**Índice de Confort Térmico (ICT)** funciona.

> Los colores corresponden a:
> 🟢 confort · 🟡 leve · 🟠 moderado · 🔴 fuerte · 🟣 extremo

---

### ✅ Prueba 3 — Las fuentes aparecen

- [ ] En el mapa veo **puntos azules** (fuentes para beber).
- [ ] Si pulso el chip **🐕 Fuentes mascotas** abajo, aparecen también
      puntos verdes.
- [ ] Pulso un punto y veo el nombre de la fuente y su estado
      (EN_SERVICIO / AVERIA / etc.).
- [ ] Si pulso de nuevo el chip **💧 Fuentes beber** los puntos azules
      se ocultan.

**Qué demuestra:** que los datasets DS-04 (fuentes para beber) y
DS-05 (fuentes para mascotas) se están cargando correctamente y que las
capas del mapa son interactivas.

---

### ✅ Prueba 4 — Las zonas verdes se ven

- [ ] Veo manchas verdes semitransparentes en el mapa (Retiro, Casa de
      Campo, Madrid Río…).
- [ ] El chip **🌳 Zonas verdes** las activa y desactiva.

**Qué demuestra:** que el dataset DS-06 (Inventario de Zonas Verdes)
está en uso.

---

### ✅ Prueba 5 — Punto de información térmica

- [ ] Hago clic en cualquier sitio del mapa **lejos** de los círculos.
- [ ] En el panel de abajo aparece un cuadro **"Punto seleccionado"**
      con la temperatura aproximada y el nivel de riesgo.

**Qué demuestra:** que el algoritmo de **interpolación espacial IDW**
(estimar la temperatura entre estaciones) funciona y enriquece la
información con la cercanía a parques.

---

### ✅ Prueba 6 — Calcular una ruta fresca

1. En el cuadro **Origen** escribe `Sol` y pulsa fuera.
2. En **Destino** escribe `Retiro` y pulsa fuera (las direcciones se
   convierten en coordenadas usando OpenStreetMap).
3. Selecciona el perfil **🚶 General**.
4. Pulsa **"Calcular ruta fresca 🌿"**.

- [ ] Aparece una línea verde (ruta fresca) y otra naranja punteada
      (ruta rápida) sobre el mapa.
- [ ] Debajo aparece la **comparativa**: distancia, tiempo, temperatura
      media, % de sombra, número de fuentes en el camino.
- [ ] El resumen indica algo como *"Ahorra hasta X°C de exposición.
      Solo Y minutos más."*

**Qué demuestra:** que el motor de **rutas con pesos termodinámicos**
funciona — combina el grafo viario (OpenRouteService) con los pesos por
sombra, fuentes y temperatura del backend.



---

### ✅ Prueba 7 — Probar los 4 perfiles

Repite la prueba 6 cambiando el perfil:

- [ ] **🚶 General**: ruta equilibrada.
- [ ] **👴 Mayor**: prioriza sombra y fuentes muy cercanas.
- [ ] **🐕 Mascota**: añade fuentes para mascotas al cómputo.
- [ ] **♿ PMR**: penaliza pendientes (en MVP, mismo grafo; los datos
      de aceras llegarán en la fase 3).

**Qué demuestra:** que los pesos por perfil cambian el cálculo del
"coste fresco" y por tanto la ruta recomendada.

---

### ✅ Prueba 8 — Geolocalización

- [ ] Pulsa el botón **📡** junto al campo de origen.
- [ ] El navegador pide permiso y, si lo das, el origen se rellena con
      "Mi ubicación".

**Qué demuestra:** que la app puede usar la posición real del usuario
(útil cuando la usen ciudadanos en la calle).

---

### ✅ Prueba 9 — Aviso por calor

Si la temperatura media de Madrid supera 32°C (caso real en verano), o
los datos de respaldo del MVP la simulan, aparecerá:

- [ ] Un **banner amarillo / naranja / rojo** debajo de la cabecera
      avisando del calor.

**Qué demuestra:** que el sistema de **alertas locales** (umbral
sanitario) funciona. Cuando añadas la clave AEMET, también se
mostrarán los avisos oficiales por ola de calor.

---

### ✅ Prueba 10 — Modo accesibilidad

En la cabecera, arriba a la derecha:

- [ ] Pulsa **A+**: la letra crece (modo texto grande).
- [ ] Pulsa **◐**: la app pasa a modo alto contraste.

**Qué demuestra:** que la app cumple con criterios de **accesibilidad
universal** (WCAG 2.1) — un punto que valora explícitamente el jurado.

---

### ✅ Prueba 11 — Funciona en el móvil

- [ ] Reduce la ventana del navegador a tamaño móvil (o abre la app
      desde tu teléfono usando la IP del ordenador en la red local).
- [ ] El panel inferior se adapta como un *bottom sheet* y el mapa
      ocupa toda la pantalla.

**Qué demuestra:** diseño *mobile-first* — la app está pensada para
ser útil en la calle, no solo en escritorio.

---

## 🛠️ Si algo no funciona

| Síntoma | Probable causa | Cómo arreglarlo |
|---------|----------------|-----------------|
| La web carga en blanco o da error | Conexión a internet / caché | Refresca la página o prueba en una ventana de incógnito |
| Geocoder no encuentra direcciones | Servidor saturado | Espera unos minutos o busca por nombre conocido |
| El navegador bloquea geolocalización | Permiso denegado | Habilítalo en la barra de URL del navegador o elige el origen manualmente en el mapa |

---


