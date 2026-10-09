# ResQGrid — Disaster Risk Intelligence & Response Platform

Intelligent identification of hazard-based red zones, carrying-capacity assessment, and immediate relocation needs for vulnerable habitations.

## Overview

ResQGrid is a lightweight disaster risk intelligence platform that:

- **Identifies hazards in real time** from keyless global feeds — **Open-Meteo** (weather models), **GloFAS / Copernicus** (river flood forecasting), **USGS** (earthquakes), **NASA EONET** (active disasters) — plus government sources (IMD, NDMA SACHET, CWC) whenever credentials are configured, all with clear source attribution
- **Calculates an explainable ResQGrid Risk Index** (0–100) for any location, scored from hazards active within 150 km
- **Identifies high-risk zones** ("ResQGrid Identified High-Risk Zones" — not official government red zones)
- **Assesses vulnerable habitations** and ranks them by risk
- **Maps emergency resources** — hospitals, ambulances, fire and police stations, shelters, relief centres and rescue units — via OpenStreetMap, with call and directions shortcuts
- **Plans scored evacuations**: OSRM road alternatives ranked by live hazard exposure, corridor rainfall, elevation and length — supervised by a government officer with checkpoint clearances and a copyable briefing
- **Coordinates rescue requests**: citizens report people in need; each request is cross-checked against nearby hazard feeds, assessed for risk, matched with nearby volunteers and tracked to resolution
- **Recommends relocation actions** — always labelled as risk-based recommendations to verify with local authorities

## Features

| Page | What it does |
|------|--------------|
| **Login** | Sign in with an email address or a 10-digit Indian mobile number (format-validated) |
| **Profile** | First-time onboarding for name, contact details, role, organisation, state and city; editable later from the sidebar |
| **Dashboard** | Alert counts, national risk map, most severe alerts and top vulnerable habitations |
| **Risk Map** | Toggleable layers for alerts, risk zones, vulnerable habitations and emergency resources, with a zone details panel and legend |
| **Alerts** | Severity filters with counts, text filter, most-severe-first ordering and an alert details dialog |
| **Risk Analysis** | Assess any location, see contributing factors and nearby alerts, browse zones and vulnerable habitations |
| **Resources** | Facilities near any location by radius and type |
| **Evacuation** | Origin from an active alert or a search, ranked safe corridors on a map, officer approval and checkpoint log |
| **Rescue** | Submit a request, get a verification and safety assessment, assign a volunteer and move it through to resolved |
| **About** | Capabilities, live data source status, methodology and limitations |

Every location search suggests all state/UT capitals and major cities as you type; any other village, town or district is geocoded on the server.

### Development-phase login

Authentication is currently a **development stub**: any correctly formatted email or Indian mobile number signs in with the password **`123456`**, which is shown on the login screen. Sessions and profiles are stored in the browser (`localStorage`). This gates the UI only and is **not real security** — replace it with server-side authentication before production.

## Data Honesty Principles

- Never fabricates live disaster alerts, population numbers, or resource availability
- Demo data is clearly labelled `DEMO DATA` and never presented as live government data
- Unavailable data shows "Data unavailable" / "Not provided by source"
- Failed lookups report the real cause (e.g. "OpenStreetMap mirrors are busy") instead of showing an empty result

## Architecture

```
ResQGrid/
├── backend/          # Node.js + Express + TypeScript
│   └── src/
│       ├── index.ts              # Express app + API routes
│       ├── env.ts                # Loads .env (backend/ or repo root) before anything else
│       ├── types.ts              # Shared types (HazardAlert, RiskZone, RescueRequest, …)
│       ├── services/
│       │   ├── openMeteoService.ts  # REAL-TIME weather hazards (heavy rain, thunderstorm, heat, gale winds) — keyless
│       │   ├── glofasService.ts     # REAL-TIME river flood forecasting via Copernicus GloFAS — keyless
│       │   ├── usgsService.ts       # REAL-TIME earthquake epicentres (USGS feed) — keyless
│       │   ├── eonetService.ts      # REAL-TIME NASA EONET disaster events (floods, cyclones) — keyless
│       │   ├── imdService.ts        # IMD weather/warnings integration (optional API key)
│       │   ├── ndmaService.ts       # NDMA SACHET alerts integration (optional API key)
│       │   ├── cwcService.ts        # CWC flood forecasts integration (optional API key)
│       │   ├── geocodeService.ts    # Place search — Nominatim with Open-Meteo fallback
│       │   ├── resourceService.ts   # OSM Overpass emergency resources (parallel mirrors + Nominatim fallback)
│       │   ├── evacuationService.ts # Evacuation planner — OSRM routes scored against live feeds
│       │   ├── rescueService.ts     # Rescue requests, verification, volunteer matching
│       │   ├── riskEngine.ts        # Explainable risk scoring
│       │   └── demoData.ts          # Clearly-labelled demo dataset
│       └── utils/cache.ts        # In-memory caching with TTL
└── frontend/         # React + TypeScript + Vite + Tailwind CSS
    └── src/
        ├── auth.tsx              # Development-phase login, session and profile storage, route guard
        ├── components/           # Layout, DisasterMap (Leaflet), shared UI (search, states, modal, …)
        ├── data/cities.ts        # State/UT capitals and major cities for search suggestions
        ├── pages/                # Login, Profile, Dashboard, RiskMap, Alerts, RiskAnalysis,
        │                         # Resources, Evacuation, Rescue, About
        ├── api/client.ts         # API client with readable errors
        └── utils/format.ts       # Formatting helpers and the shared risk/severity colour scale
```

### API Routes

| Route | Description |
|-------|-------------|
| `GET /api/health` | Health check + demo mode status |
| `GET /api/alerts` | All active alerts from live feeds and configured government sources |
| `GET /api/weather?location=` | Current weather for a location |
| `GET /api/geocode?q=` | Resolve a place name to coordinates |
| `GET /api/risk?location=&lat=&lon=` | Risk assessment for a location (geocoded when lat/lon are omitted) |
| `GET /api/risk-zones` | Identified high-risk zones, highest risk first |
| `GET /api/vulnerable` | Vulnerable habitations |
| `GET /api/resources?lat=&lon=&radius=` | Nearby emergency resources |
| `GET /api/evacuation/plan?lat=&lon=&radiusKm=` | Ranked safest evacuation corridors to nearby relief centres (optional `destLat/destLon/destName`) |
| `POST /api/rescue/request` | Submit a rescue request and receive its assessment |
| `GET /api/rescue/nearby?lat=&lon=&radius=` | Open requests and available volunteers nearby |
| `GET /api/rescue/:id` | A rescue request with its activity log |
| `POST /api/rescue/:id/accept` | Assign a volunteer to a request |
| `PATCH /api/rescue/:id/status` | Move a request to a new status |
| `POST /api/rescue/:id/route` | Evacuation routes from a request's location |
| `POST /api/rescue/verify` | Re-run verification for a request |
| `GET /api/sources` | Data source status |

Rescue requests and volunteers are held in server memory and reset when the backend restarts.

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

Open http://localhost:5173 and sign in with any valid email or mobile number and the password `123456`.

## Real-Time Data Sources (no API keys required)

| Source | What it provides | Coverage |
|--------|------------------|----------|
| **Open-Meteo** | Thunderstorm / very-heavy-rain (IMD thresholds) / heat-wave / gale-wind alerts at 56 Indian districts | Live model data, ~15 min refresh |
| **GloFAS (Copernicus EC)** | River discharge anomaly detection (z-score vs. own 30-day baseline) at 28 major river stations (Ganga, Yamuna, Brahmaputra, Kosi, Godavari, Krishna, Narmada, …) | 5 km grid, updates twice daily |
| **USGS** | M4+ earthquakes in the India region with exact epicentres | Updates every minute |
| **NASA EONET** | Active floods, cyclones, severe storms, wildfires aggregated from authoritative agencies | Continuous |
| **OpenStreetMap** | Emergency facilities (Overpass), place search (Nominatim) and map tiles | Continuous |
| **OSRM** | Drivable evacuation routes | Public demo server by default |

These feeds power alerts, risk zones, vulnerable habitations and the maps automatically. IMD / NDMA / CWC keys remain optional enhancements.

## Configuration

Copy `.env.example` to `.env` (in the repository root or in `backend/`):

```env
DEMO_MODE=false     # false = real-time data only; true = merge clearly-labelled demo points too
PORT=4000
IMD_API_KEY=        # Optional — IMD credentials
NDMA_API_KEY=       # Optional — NDMA SACHET credentials
CWC_API_KEY=        # Optional — CWC credentials
OSRM_BASE_URL=      # Optional — self-hosted OSRM server (defaults to router.project-osrm.org)
```

When API keys are absent, those sources return empty results and display as "Not configured" — no fake data is substituted.

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
