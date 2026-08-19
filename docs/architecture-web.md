# Architectuur — Web Frontend (apps/web)

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive | **Taal:** TypeScript 5.7.2 (strict)

---

## Overzicht

De web frontend is een React 18.3 Single Page Application gebouwd met Vite 6, Ant Design 5 als UI library, Zustand 5 voor state management en Konva voor canvas-gebaseerde annotatie. De applicatie ondersteunt logoherkenning, training data management, model beheer en interactieve annotatie.

---

## Entry Points

| Bestand | Doel |
|---------|------|
| `src/main.tsx` | React DOM root mount |
| `src/App.tsx` | Router configuratie, providers, code splitting |

---

## Routing Structuur

```
/ (RootLayout — ErrorBoundary, I18next, AntD Theme, BackendStatus)
├── / (AppLayout — Header, Navigation, Connection Status)
│   ├── /                    → HomePage
│   ├── /dashboard           → DashboardPage
│   ├── /recognize           → RecognitionInterface
│   ├── /training            → TrainingPage
│   ├── /training/pipeline   → TrainingPipelinePage
│   └── /models              → ModelsPage
└── /training/annotate/:imageId → AnnotationPage (full-screen, geen header)
```

Alle pagina's gebruiken `React.lazy()` met `Suspense` fallback (Ant Design `Spin`).

---

## State Management (Zustand Stores)

| Store | Bestand | State | Persistentie |
|-------|---------|-------|-------------|
| **recognitionStore** | `stores/recognitionStore.ts` | Huidige afbeelding, resultaten, verwerking, geschiedenis (max 10) | Laatste 5 history items |
| **trainingStore** | `stores/trainingStore.ts` | Afbeeldingen, selectie, filters, categorieën, annotaties, upload voortgang | viewMode + sort |
| **modelStore** | `stores/modelStore.ts` | Training jobs, modellen, actief model, selectie | Geen |
| **uploadStore** | `stores/uploadStore.ts` | Upload Map (fileId→progress), tellers (active/completed/failed) | Geen |
| **websocketStore** | `stores/websocketStore.ts` | Verbindingsstatus, reconnect pogingen, laatste bericht | Geen |
| **themeStore** | `stores/themeStore.ts` | Theme (light/dark), isDarkMode | LocalStorage |
| **uiStore** | `stores/uiStore.ts` | Theme, taal, sidebar, modal stack, notificaties (max 10) | theme, language, sidebar |

**Middleware:** Immer (immutable updates), devtools, persist (selectief).

---

## API Client Laag

### Services

| Service | Bestand | Base URL | Endpoints |
|---------|---------|----------|-----------|
| **modelService** | `services/modelService.ts` | `/api/v1` | Training jobs CRUD, models CRUD, activatie, download, vergelijking |
| **trainingService** | `services/trainingService.ts` | `/api/v1` | Images CRUD, categorieën CRUD, annotaties CRUD, smart-detect, review |
| **dashboardService** | `services/dashboardService.ts` | `/api/v1` | Stats ophalen, demo data, polling |
| **healthCheck** | `services/healthCheck.ts` | `/health` | API health, WebSocket health, gecombineerde check |

**HTTP Client:** Axios met timeout 30s, fallback naar demo data bij fout.

### WebSocket (Socket.IO)

| Configuratie | Waarde |
|-------------|--------|
| Transport | polling → websocket (upgrade) |
| Timeout | 30.000ms |
| Reconnect | Handmatig (niet automatisch) |
| Events | UPLOAD_PROGRESS, RECOGNIZE, RECOGNITION_START/PROGRESS/COMPLETE/ERROR |

**Hook:** `useWebSocket` — health check vóór verbinding, reconnect tracking via Zustand.

---

## Component Hiërarchie

### Layout
```
App.tsx (RouterProvider)
└── RootLayout (providers)
    ├── ErrorBoundary
    ├── I18nextProvider
    ├── ConfigProvider (Ant Design theme)
    ├── ThemeProvider
    ├── BackendStatusProvider → OfflineBanner
    └── Outlet
        ├── AppLayout (header + nav + status)
        │   └── Outlet (pagina content)
        └── AnnotationPage (full-screen)
```

### Pagina Componenten

| Pagina | Functionaliteit |
|--------|----------------|
| **HomePage** | Landing met 2 CTAs (Herkenning + Training), stats, quick links |
| **RecognitionInterface** | ImageUploader → BoundingBoxCanvas → ResultsDisplay → ExportDialog |
| **AnnotationPage** | AnnotationCanvas (Konva), keyboard shortcuts, undo/redo |
| **TrainingPage** | ImageLibrary + BatchUploader + CategoryManager (tabs), bulk acties |
| **DashboardPage** | Stats cards, recente activiteit tabel, 30s auto-refresh |
| **ModelsPage** | Models tabel, details/vergelijking modals, metrics/loss curves |
| **TrainingPipelinePage** | Training job aanmaken, configuratie, voortgang monitoring |

---

## Canvas Integratie (Konva)

### AnnotationCanvas (Training)
- **Tools:** Bounding box tekenen, selectie, smart-click (ML-powered)
- **Interacties:** Klik+sleep voor bbox, drag om te verplaatsen, handles om te vergroten/verkleinen
- **Coördinaten:** Pixel ↔ genormaliseerd (0-1 bereik)
- **Zoom:** 50-400% via CSS scaling
- **Kleuren:** Categorie-gebaseerd

### BoundingBoxCanvas (Herkenning)
- Alleen-lezen visualisatie van detectieresultaten
- Selecteerbare resultaat-boxen (highlight bij klik)

---

## i18n Configuratie

| Instelling | Waarde |
|-----------|--------|
| Library | i18next + react-i18next |
| Detectie | Browser language detector |
| Fallback | Engels (en) |
| Talen | en, es, fr, de, ja, zh |
| Namespaces | `translation` (default), `recognition` |

---

## Custom Hooks

| Hook | Functionaliteit |
|------|----------------|
| `useWebSocket` | Socket.IO verbinding met health checks |
| `useTheme` | Theme store context consumer |
| `useDebounce` | Debounced state voor zoek/filters |
| `useLocalStorage` | Persistent component state |
| `useOnScreen` | Intersection Observer voor zichtbaarheid |
| `useMediaQuery` | Responsive breakpoint detectie |
| `useAccessibility` | WCAG 2.1 setup (axe-core integratie) |

---

## Contexts

### BackendStatusContext
- Gecentraliseerde backend health checking
- Parallelle API + WebSocket checks
- Aparte status per service (API kan werken zonder WS)
- Polling interval: 30s, timeout: 5s

---

## Build Configuratie (Vite)

| Instelling | Waarde |
|-----------|--------|
| Target | ES2022 |
| Dev Server | Port 5173 |
| Proxy | `/api/*` → backend, `/ws/*` → WebSocket |
| Chunk Splitting | react-vendor, antd-vendor, i18n-vendor, canvas-vendor, export-vendor |
| Minificatie | Terser (console drops) |
| Source Maps | Aan |
| PWA | VitePWA met workbox, auto-update |
| Test Coverage | 90% drempel |

---

## Prestatie-optimalisaties

1. **Code Splitting** — React.lazy() voor alle pagina's
2. **Zustand Slicing** — Minimale re-renders
3. **Memoization** — useMemo/useCallback in RecognitionInterface, AnnotationCanvas
4. **Virtual Scrolling** — react-window in ImageLibrary
5. **Lazy Loading** — Afbeeldingen met thumbnail URLs
6. **Bundle Splitting** — 5 vendor chunks
7. **Terser** — Console drops in productie

---

## Toegankelijkheid (WCAG 2.1 AA)

- axe-core integratie via `@axe-core/react`
- Semantische HTML met correcte heading hiërarchie
- Keyboard navigatie (uitgebreide shortcuts in AnnotationPage)
- ARIA attributen (`aria-label`, `aria-live`, `role`)
- Kleurcontrast conform WCAG AA standaarden

---

## Type Definities

| Bestand | Inhoud |
|---------|--------|
| `types/api.types.ts` | ApiResponse, ApiError, PaginatedResponse, HttpMethod |
| `types/training.types.ts` | TrainingImage, Category, Annotation, TrainingJob, ModelVersion |
| `types/recognition.ts` | RecognitionResult, UploadedImage, RecognitionRequest |
| `types/websocket.types.ts` | WebSocketEvent enum, RecognitionStage, WebSocketMessage |
| `types/logo.types.ts` | LogoDetection, RecognitionStatus, UploadStatus |
| `types/component.types.ts` | Component prop types |
| `types/store.types.ts` | Zustand store types |

---

## Utilities

| Bestand | Functionaliteit |
|---------|----------------|
| `utils/export.ts` | JSON/CSV/PDF export (jspdf + papaparse) |
| `utils/format.ts` | Datum/nummer/bytes formatting (dayjs) |
| `utils/image.ts` | Afbeelding laden, croppen, resizen, EXIF |
| `utils/validation.ts` | Bestandstype/grootte/dimensie validatie |
| `utils/performance.ts` | Performance API wrapper, mark/measure |

---

## Constanten

| Constante | Waarde |
|-----------|--------|
| API Base URL | `http://localhost:8000` (dev) |
| WS Base URL | `ws://localhost:8000` (dev) |
| Max Bestandsgrootte | 10MB |
| Upload Chunk Size | 1MB |
| Max Concurrent Uploads | 3 |
| Request Timeout | 30s |
| WS Reconnect Delay | 3s |
| WS Max Reconnect | 5 pogingen |
| Ondersteunde Formaten | JPEG, JPG, PNG, WebP, GIF |
| Confidence Drempels | LOW: 0.5, MEDIUM: 0.7, HIGH: 0.9 |
| Paginatie | Default 20, opties: 10/20/50/100 |
