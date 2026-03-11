# 🎲 TrueRandom for Spotify

Reproduce tus playlists de Spotify con una distribución verdaderamente uniforme. Cada canción se escucha aproximadamente el mismo número de veces a lo largo del tiempo.

## ¿Qué es TrueRandom?

A diferencia del modo **Shuffle** de Spotify (que aleatoriza canciones de forma independiente en cada reproducción), **TrueRandom** mantiene un conteo de reproducciones por canción y prioriza las canciones menos escuchadas usando un algoritmo de **weighted random**.

## Características

- 🔗 **Conexión con Spotify** via OAuth PKCE (sin servidor)
- 📋 **Ver playlists** del usuario
- 🎲 **Modo TrueRandom** — reproducciones balanceadas con weighted random
- 📊 **Estadísticas** por canción por playlist
- ⚙️ **Tolerancia ajustable** — controla qué tan "estricto" es el balanceo
- 🧹 **Limpiar estadísticas** — empezar de cero
- 🐛 **Debug mode** — logs detallados del algoritmo en la consola del navegador
- 🔊 **Spotify Connect** — controla la reproducción en cualquier dispositivo (teléfono, bocina, etc.)

## Requisitos

- Cuenta **Spotify Premium**
- Una **Spotify App** registrada en [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

## Setup

### 1. Crear una Spotify App

1. Ve a [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Crea una nueva app
3. En **Redirect URIs**, agrega: `http://localhost:5173/#/callback` (desarrollo) y tu URL de producción
4. Copia el **Client ID**

### 2. Configurar el proyecto

```bash
git clone <repo-url>
cd TrueRandom
cp .env.example .env
```

Edita `.env` y agrega tu Client ID:

```
VITE_SPOTIFY_CLIENT_ID=tu_client_id_aqui
```

### 3. Instalar y ejecutar

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en tu navegador.

## Algoritmo TrueRandom

1. Calcula el **promedio** de reproducciones de todas las canciones
2. Calcula el **umbral** = promedio + tolerancia
3. Selecciona **candidatas**: canciones con conteo < umbral
4. Asigna **pesos**: peso = umbral - conteo (más atrasada = más probabilidad)
5. **Weighted random** entre candidatas
6. Reproduce y incrementa el conteo

### Edge Cases

- **Nueva canción**: Se inicializa al promedio actual (no tiene que "ponerse al día")
- **Canción eliminada**: Se ignora, no afecta el promedio
- **Conteos por playlist**: Una canción en múltiples playlists tiene conteos independientes

## Deploy a GitHub Pages

```bash
npm run build
```

El output está en `dist/`. Configura GitHub Pages para servir desde ese directorio o usa GitHub Actions.

## Tech Stack

- React 19 + Vite 7
- React Router (HashRouter)
- Spotify Web API + OAuth PKCE
- localStorage para persistencia
- 100% client-side (sin servidor)
