# 13. UI/UX Specifications

## 13.1 Design Philosophy

### Design Principles
1. **Clarity First** - Every interface element must have a clear purpose
2. **Progressive Disclosure** - Show only what's needed, when it's needed
3. **Consistency** - Unified experience across all modules
4. **Feedback Rich** - Every action has immediate visual feedback
5. **Error Prevention** - Design to prevent mistakes, not just handle them
6. **Accessibility** - WCAG 2.1 AA compliant for all users

### Target User Experience Goals
- **Jan (Quality Manager)**: Professional, data-driven interface with detailed controls
- **Sarah (DevOps)**: Technical dashboard with API documentation and metrics
- **Mike (Operator)**: Simplified, large-button interface for production floor

## 13.2 Visual Design System

### Color Palette
```css
/* Primary Colors */
--primary-blue: #1890ff;      /* Ant Design primary */
--primary-dark: #002766;      /* Navigation & headers */

/* Status Colors */
--success-green: #52c41a;     /* 99%+ confidence */
--warning-orange: #faad14;    /* 90-99% confidence */
--error-red: #f5222d;         /* <90% confidence */

/* Neutral Colors */
--gray-1: #ffffff;            /* Background */
--gray-2: #fafafa;            /* Card background */
--gray-3: #f0f0f0;            /* Borders */
--gray-4: #d9d9d9;            /* Disabled state */
--gray-5: #bfbfbf;            /* Placeholder text */
--gray-6: #8c8c8c;            /* Secondary text */
--gray-7: #595959;            /* Primary text */
--gray-8: #262626;            /* Headings */
```

### Typography
```css
/* Font Stack */
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;

/* Type Scale */
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 24px;
--text-3xl: 30px;
--text-4xl: 36px;

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Spacing System
```css
/* 8px Grid System */
--space-1: 8px;
--space-2: 16px;
--space-3: 24px;
--space-4: 32px;
--space-5: 40px;
--space-6: 48px;
--space-8: 64px;
--space-10: 80px;
```

## 13.3 Component Specifications

### 13.3.1 Annotation Canvas
**Purpose:** Smart click detection and manual rectangle selection

**Specifications:**
- Canvas size: Responsive, max 1200x800px
- Zoom levels: 50%, 75%, 100%, 150%, 200%, 400%
- Cursor states:
  - Default: crosshair
  - Hovering logo: pointer
  - Drawing: crosshair with coordinates
- Visual feedback:
  - Click point: Pulsing blue dot (8px)
  - Auto-detected boundary: Dashed blue line (2px)
  - Confirmed boundary: Solid green line (3px)
  - Confidence overlay: Semi-transparent color coding

**Interactions:**
- Single click: Smart detect
- Click + drag: Manual rectangle
- Scroll: Zoom in/out
- Space + drag: Pan
- Double click: Reset zoom

### 13.3.2 Training Progress Dashboard
**Purpose:** Real-time training feedback

**Components:**
- Accuracy gauge: Circular progress (200x200px)
- Epoch counter: Linear progress bar
- Loss graph: Line chart (400x200px)
- Sample counter: Big number display
- ETA timer: Countdown format

**Update frequency:** Every 500ms via WebSocket

### 13.3.3 Recognition Results Display
**Purpose:** Show detected logos with confidence

**Layout:**
- Grid view: 3 columns desktop, 2 tablet, 1 mobile
- Card size: 320x240px
- Thumbnail: 280x160px with overlay
- Confidence bar: Horizontal, color-coded
- Actions: View details, Accept, Reject

### 13.3.4 Operator Interface
**Purpose:** Simplified production floor interface

**Specifications:**
- Button size: Minimum 64x64px (touch target)
- Font size: Minimum 18px
- Contrast ratio: 7:1 minimum
- Status indicators: Full screen color flash
- Sound feedback: Optional beeps

## 13.4 Responsive Breakpoints

```css
/* Breakpoint System */
--screen-xs: 480px;   /* Mobile portrait */
--screen-sm: 576px;   /* Mobile landscape */
--screen-md: 768px;   /* Tablet portrait */
--screen-lg: 992px;   /* Tablet landscape */
--screen-xl: 1200px;  /* Desktop */
--screen-2xl: 1600px; /* Wide desktop */
```

### Layout Adaptations
| Screen | Columns | Navigation | Sidebar |
|--------|---------|------------|---------|
| Mobile (< 768px) | 1 | Bottom tab bar | Hidden |
| Tablet (768-1199px) | 2 | Top navbar | Collapsible |
| Desktop (≥ 1200px) | 3-4 | Top navbar | Fixed |

## 13.5 Interaction Patterns

### Loading States
1. **Skeleton screens** for initial load
2. **Progress bars** for determinate operations
3. **Spinners** for indeterminate operations
4. **Optimistic updates** for user actions

### Error Handling
1. **Inline validation** as user types
2. **Toast notifications** for non-blocking errors
3. **Modal dialogs** for critical errors
4. **Empty states** with clear CTAs

### Feedback Mechanisms
1. **Hover states** on all interactive elements
2. **Active states** for current selections
3. **Success animations** for completed actions
4. **Micro-interactions** for delightful UX

## 13.6 Accessibility Requirements

### WCAG 2.1 AA Compliance
- **Color contrast**: 4.5:1 for normal text, 3:1 for large text
- **Keyboard navigation**: All features accessible via keyboard
- **Screen reader**: Proper ARIA labels and roles
- **Focus indicators**: Visible focus states (2px outline minimum)
- **Error identification**: Clear error messages with suggestions

### Internationalization
- **Languages**: Dutch (primary), English (secondary)
- **Date formats**: DD/MM/YYYY (EU standard)
- **Number formats**: 1.234,56 (EU standard)
- **RTL support**: Not required in Phase 1

## 13.7 Design Deliverables

### Phase 1 Deliverables (Week 1-8)
| Deliverable | Format | Due | Owner |
|-------------|--------|-----|-------|
| User Journey Maps | Figma/PDF | Week 2 | UX Designer |
| Wireframes (20 screens) | Figma | Week 2 | UX Designer |
| Design System v1 | Figma | Week 4 | UX Designer |
| Component Library | Figma | Week 4 | UX Designer |
| High-Fidelity Mockups | Figma | Week 6 | UX Designer |
| Interactive Prototype | Figma | Week 6 | UX Designer |
| Design Tokens | JSON | Week 8 | UX Designer |
| Handoff Documentation | Figma/PDF | Week 8 | UX Designer |

### Phase 2 Deliverables (Week 9-12)
| Deliverable | Format | Due | Owner |
|-------------|--------|-----|-------|
| Operator Interface | Figma | Week 10 | UX Designer |
| Accessibility Audit | PDF | Week 10 | UX Designer |
| User Testing Report | PDF | Week 12 | UX Designer |
| Design Iterations v2 | Figma | Week 12 | UX Designer |

## 13.8 Design Review Process

### Review Checkpoints
1. **Concept Review** (Week 2) - Wireframes & user flows
2. **Design Review** (Week 4) - Design system & components
3. **Prototype Review** (Week 6) - Interactive prototype
4. **Implementation Review** (Week 8) - Development handoff
5. **Usability Review** (Week 10) - User testing results
6. **Final Review** (Week 12) - Complete design package

### Stakeholder Sign-offs
- **Jan de Vries**: Business requirements alignment
- **Sarah Chen**: Technical feasibility
- **Mike Johnson**: Operator usability
- **Development Team**: Implementation readiness

## 13.9 Design-Development Collaboration

### Handoff Process
1. **Design Freeze**: 2 days before sprint start
2. **Handoff Meeting**: Review specs with developers
3. **Token Export**: Automated via Figma API
4. **Component Mapping**: 1:1 Figma to React components
5. **QA Review**: Designer reviews implementation

### Communication Channels
- **Daily**: Slack #design-dev channel
- **Weekly**: Design sync meeting (1 hour)
- **Sprint**: Design review in sprint demo
- **Ad-hoc**: Figma comments for specific feedback

## 13.10 Success Metrics

### Design KPIs
| Metric | Target | Measurement |
|--------|--------|-------------|
| Task Completion Rate | >90% | User testing |
| Time to First Action | <3 seconds | Analytics |
| Error Rate | <5% | Session recordings |
| User Satisfaction | >4.5/5 | Survey |
| Accessibility Score | 100% | Automated testing |
| Design-Dev Handoff Time | <2 days | Sprint metrics |
| Design Debt | <10% | Component coverage |

---