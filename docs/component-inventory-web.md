# Component Inventaris — Web Frontend

**Gegenereerd:** 2026-03-31 | **Scan Level:** Exhaustive

---

## Pagina Componenten (6)

| Component | Bestand | Beschrijving |
|-----------|---------|-------------|
| HomePage | `src/pages/HomePage.tsx` | Landing met 2 CTAs, stats cards, quick links |
| DashboardPage | `src/pages/DashboardPage.tsx` | Statistieken dashboard, recente activiteit, 30s refresh |
| RecognitionInterface | `src/components/recognition/RecognitionInterface.tsx` | Logo detectie interface (upload → canvas → resultaten → export) |
| TrainingPage | `src/pages/TrainingPage.tsx` | Image library + batch uploader + category manager (tabs) |
| TrainingPipelinePage | `src/pages/TrainingPipelinePage.tsx` | Training job aanmaken, configuratie, voortgang |
| ModelsPage | `src/pages/ModelsPage.tsx` | Model tabel, details/vergelijking modals, loss curves |
| AnnotationPage | `src/pages/AnnotationPage.tsx` | Full-screen annotatie editor met keyboard shortcuts |

---

## Layout Componenten (2)

| Component | Bestand | Beschrijving |
|-----------|---------|-------------|
| AppLayout | `src/components/common/AppLayout.tsx` | Sticky header met navigatie menu (6 routes), verbindingsstatus, taalwissel, theme toggle |
| RootLayout | `src/App.tsx` (inline) | Globale providers (ErrorBoundary, I18next, AntD, Theme, BackendStatus) |

---

## Herkenning Componenten (4)

| Component | Bestand | Beschrijving |
|-----------|---------|-------------|
| ImageUploader | `src/components/recognition/ImageUploader.tsx` | Drag-drop bestand input met formaat/grootte validatie |
| BoundingBoxCanvas | `src/components/recognition/BoundingBoxCanvas.tsx` | Konva canvas voor detectie visualisatie (alleen-lezen) |
| ResultsDisplay | `src/components/recognition/ResultsDisplay.tsx` | Detectieresultaten lijst met filtering en selectie |
| ExportDialog | `src/components/recognition/ExportDialog.tsx` | Export naar JSON/CSV/XML/PDF |

---

## Training Componenten (3)

| Component | Bestand | Beschrijving |
|-----------|---------|-------------|
| ImageLibrary | `src/components/training/ImageLibrary.tsx` | Grid/list view met paginatie, filtering, bulk selectie |
| BatchUploader | `src/components/training/BatchUploader.tsx` | Drag-drop batch upload met voortgangs tracking |
| CategoryManager | `src/components/training/CategoryManager.tsx` | CRUD voor annotatie categorieën (logo definities) |

---

## Annotatie Componenten (1)

| Component | Bestand | Beschrijving |
|-----------|---------|-------------|
| AnnotationCanvas | `src/components/annotation/AnnotationCanvas.tsx` | Konva-based bounding box editor — tools: box/select/smart, zoom 50-400%, undo/redo |

---

## Common Componenten (4)

| Component | Bestand | Beschrijving |
|-----------|---------|-------------|
| ConnectionStatus | `src/components/common/ConnectionStatus.tsx` | Offline banner wanneer API niet bereikbaar |
| ErrorFallback | `src/components/common/ErrorFallback.tsx` | Error boundary fallback UI met reset |
| ErrorBoundary | `src/components/common/ErrorBoundary.tsx` | React Error Boundary wrapper |
| EmptyState | `src/components/common/EmptyState.tsx` | Lege state placeholder |

---

## Zustand Stores (7)

| Store | Bestand | Domein |
|-------|---------|--------|
| recognitionStore | `src/stores/recognitionStore.ts` | Herkenningsresultaten en geschiedenis |
| trainingStore | `src/stores/trainingStore.ts` | Training afbeeldingen, categorieën, annotaties |
| modelStore | `src/stores/modelStore.ts` | Training jobs en model versies |
| uploadStore | `src/stores/uploadStore.ts` | Upload voortgang en status |
| websocketStore | `src/stores/websocketStore.ts` | WebSocket verbindingsstatus |
| themeStore | `src/stores/themeStore.ts` | Light/dark theme |
| uiStore | `src/stores/uiStore.ts` | UI state (modals, notificaties, sidebar) |

---

## Custom Hooks (7)

| Hook | Bestand | Functionaliteit |
|------|---------|----------------|
| useWebSocket | `src/hooks/useWebSocket.ts` | Socket.IO verbinding met health checks |
| useTheme | `src/hooks/useTheme.ts` | Theme store consumer |
| useDebounce | `src/hooks/useDebounce.ts` | Debounced state |
| useLocalStorage | `src/hooks/useLocalStorage.ts` | Persistent state |
| useOnScreen | `src/hooks/useOnScreen.ts` | Intersection Observer |
| useMediaQuery | `src/hooks/useMediaQuery.ts` | Responsive breakpoints |
| useAccessibility | `src/hooks/useAccessibility.ts` | WCAG 2.1 axe-core |

---

## Contexts (1)

| Context | Bestand | Beschrijving |
|---------|---------|-------------|
| BackendStatusContext | `src/contexts/BackendStatusContext.tsx` | Gecentraliseerde backend health checking (API + WebSocket apart) |

---

## Utilities (5)

| Utility | Bestand | Functionaliteit |
|---------|---------|----------------|
| export | `src/utils/export.ts` | JSON/CSV/PDF generatie |
| format | `src/utils/format.ts` | Datum/nummer/bytes formatting |
| image | `src/utils/image.ts` | Laden, croppen, resizen, EXIF |
| validation | `src/utils/validation.ts` | Bestand/afbeelding validatie |
| performance | `src/utils/performance.ts` | Performance API wrapper |

---

## Totaal Overzicht

| Categorie | Aantal |
|-----------|--------|
| Pagina Componenten | 7 |
| Layout Componenten | 2 |
| Feature Componenten | 8 |
| Common Componenten | 4 |
| Zustand Stores | 7 |
| Custom Hooks | 7 |
| Contexts | 1 |
| Utilities | 5 |
| Type Bestanden | 7 |
| **Totaal Bronbestanden** | **~61** |
