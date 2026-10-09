# ResQGrid - Disaster Risk Intelligence & Response Platform

**SIH 2026 Problem Statement 26191** — Intelligent Identification of Hazard-Based Red Zones, Carrying Capacity Assessment, and Immediate Relocation Needs for Vulnerable Habitations.

## Overview

ResQGrid is a lightweight disaster risk intelligence platform that:

- **Identifies hazards in real time** from keyless global feeds — **Open-Meteo** (weather models), **GloFAS / Copernicus** (river flood forecasting), **USGS** (earthquakes), **NASA EONET** (active disasters) — plus government sources (IMD, NDMA SACHET, CWC) whenever credentials are configured, all with clear source attribution
- **Calculates an explainable ResQGrid Risk Index** (0–100) from five transparent factors
- **Identifies high-risk zones** ("ResQGrid Identified High-Risk Zones" — not official government red zones)
- **Assesses vulnerable habitations** with nearest shelter/hospital distances
- **Maps emergency resources** via OpenStreetMap (availability shown only when provided by source)
- **Plans AI-scored evacuations**: OSRM road alternatives ranked by live hazard exposure, corridor rainfall, elevation and length — supervised by a government officer with checkpoint clearances
- **Recommends relocation actions** — always labeled "Risk-based recommendation — verify with local authorities"

## Data Honesty Principles

- Never fabricates live disaster alerts, population numbers, or resource availability
- Demo data is clearly labeled `DEMO DATA` and never presented as live government data
- Unavailable data shows "Data unavailable" / "Not provided by source"
- Every data card shows source + timestamp + LIVE/CACHED status

## Architecture

```
ResQGrid/
├── backend/          # Node.js + Express + TypeScript
│   └── src/
│       ├── index.ts              # Express app + API routes
│       ├── types.ts              # Shared types (HazardAlert, RiskZone, etc.)
│       ├── services/
│       │   ├── openMeteoService.ts # REAL-TIME weather hazards (heavy rain, thunderstorm, heat, gale winds) — keyless
│       │   ├── glofasService.ts    # REAL-TIME river flood forecasting via Copernicus GloFAS — keyless
│       │   ├── usgsService.ts      # REAL-TIME earthquake epicenters (USGS feed) — keyless
│       │   ├── eonetService.ts     # REAL-TIME NASA EONET disaster events (floods, cyclones) — keyless
│       │   ├── imdService.ts     # IMD weather/warnings integration (optional API key)
│       │   ├── ndmaService.ts    # NDMA SACHET alerts integration (optional API key)
│       │   ├── cwcService.ts     # CWC flood forecasts integration (optional API key)
│       │   ├── resourceService.ts # OSM Overpass emergency resources (multi-mirror failover)
│       │   ├── evacuationService.ts # AI evacuation planner — OSRM routes scored vs live feeds
│       │   ├── riskEngine.ts     # Explainable risk scoring
│       │   └── demoData.ts       # Clearly-labeled demo dataset
│       └── utils/cache.ts        # In-memory caching with TTL
└── frontend/         # React + TypeScript + Vite + Tailwind CSS
    └── src/
        ├── components/           # Layout, DisasterMap (Leaflet), UI primitives
        ├── pages/                # Dashboard, RiskMap, Alerts, RiskAnalysis, Resources, Evacuation, About
        ├── api/client.ts         # Normalized API client
        └── utils/format.ts       # Formatting helpers
```

### API Routes

| Route | Description |
|-------|-------------|
| `GET /api/health` | Health check + demo mode status |
| `GET /api/alerts` | All active alerts (IMD + NDMA + CWC) |
| `GET /api/weather?location=` | Current weather for location |
| `GET /api/risk?location=&lat=&lon=` | Risk assessment for location |
| `GET /api/risk-zones` | Identified high-risk zones |
| `GET /api/vulnerable` | Vulnerable habitations |
| `GET /api/resources?lat=&lon=&radius=` | Nearby emergency resources |
| `GET /api/evacuation/plan?lat=&lon=&radiusKm=` | AI-ranked safest evacuation corridors to nearest relief centres (optional `destLat/destLon/destName`) |
| `GET /api/sources` | Data source status |

## Quick Start

```bash
# Install all dependencies (workspaces)
npm install

# Run both backend (port 4000) and frontend (port 5173)
npm run dev

# Or run individually
npm run dev:backend
npm run dev:frontend
```

Open http://localhost:5173 in your browser.

## Real-Time Data Sources (no API keys required)

| Source | What it provides | Coverage |
|--------|------------------|----------|
| **Open-Meteo** | Thunderstorm / very-heavy-rain (IMD thresholds) / heat-wave / gale-wind alerts at 56 Indian districts | Live model data, ~15 min refresh |
| **GloFAS (Copernicus EC)** | River discharge anomaly detection (z-score vs. own 30-day baseline) at 28 major river stations (Ganga, Yamuna, Brahmaputra, Kosi, Godavari, Krishna, Narmada, …) | 5 km grid, updates twice daily |
| **USGS** | M4+ earthquakes in the India region with exact epicenters | Updates every minute |
| **NASA EONET** | Active floods, cyclones, severe storms, wildfires aggregated from authoritative agencies | Continuous |

These feeds power `/api/alerts`, `/api/risk-zones`, `/api/vulnerable` and the map automatically. IMD / NDMA / CWC keys remain optional enhancements.

## Configuration

Copy `.env.example` to `.env`:

```env
DEMO_MODE=false     # false = real-time data only; true = merge clearly-labeled demo points too
PORT=4000
IMD_API_KEY=        # Optional — IMD credentials
NDMA_API_KEY=       # Optional — NDMA SACHET credentials
CWC_API_KEY=        # Optional — CWC credentials
```

When API keys are absent, those sources return empty results and display as unavailable — no fake data is substituted.

## Risk Index Methodology

| Factor | Weight |
|--------|--------|
| Hazard Score (active alerts severity) | 30% |
| Exposure Score | 20% |
| Vulnerability Score | 15% |
| Resource Accessibility | 15% |
| Infrastructure Risk | 20% |

Classification: 0–20 LOW · 21–40 MODERATE · 41–60 HIGH · 61–80 VERY HIGH · 81–100 CRITICAL

## Tech Stack

React 18 · TypeScript · Vite · Tailwind CSS · Leaflet · Lucide Icons · Express · Node.js