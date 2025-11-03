# 12. Unified Project Structure

```
logo-recognition/
├── .github/                    # CI/CD workflows
│   └── workflows/
│       ├── ci.yaml            # Continuous integration
│       ├── deploy-staging.yaml
│       └── deploy-prod.yaml
├── apps/                       # Application packages
│   ├── web/                    # Frontend application
│   │   ├── src/
│   │   │   ├── components/     # UI components
│   │   │   ├── pages/          # Page components
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── services/       # API client services
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── styles/         # Global styles
│   │   │   ├── utils/          # Frontend utilities
│   │   │   └── main.tsx        # Entry point
│   │   ├── public/             # Static assets
│   │   ├── tests/              # Frontend tests
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── api/                    # Backend application
│       ├── app/
│       │   ├── api/            # API routes
│       │   ├── core/           # Core functionality
│       │   ├── models/         # SQLAlchemy models
│       │   ├── schemas/        # Pydantic schemas
│       │   ├── services/       # Business logic
│       │   ├── repositories/   # Data access layer
│       │   ├── tasks/          # Celery tasks
│       │   ├── ml/             # ML pipeline
│       │   │   ├── training/   # Training logic
│       │   │   ├── inference/  # Inference logic
│       │   │   └── models/     # Model definitions
│       │   └── main.py         # FastAPI app
│       ├── tests/              # Backend tests
│       ├── alembic/            # Database migrations
│       ├── requirements.txt
│       ├── pyproject.toml
│       └── Dockerfile
├── packages/                   # Shared packages
│   ├── shared/                 # Shared types/utilities
│   │   ├── src/
│   │   │   ├── types/          # TypeScript interfaces
│   │   │   │   ├── user.ts
│   │   │   │   ├── training.ts
│   │   │   │   └── recognition.ts
│   │   │   ├── constants/      # Shared constants
│   │   │   └── utils/          # Shared utilities
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── ui/                     # Shared UI components
│   │   ├── src/
│   │   │   ├── Button/
│   │   │   ├── Modal/
│   │   │   └── index.ts
│   │   └── package.json
│   └── config/                 # Shared configuration
│       ├── eslint/
│       │   └── .eslintrc.js
│       ├── typescript/
│       │   └── tsconfig.base.json
│       └── prettier/
│           └── .prettierrc
├── infrastructure/             # IaC definitions
│   ├── terraform/
│   │   ├── modules/
│   │   ├── environments/
│   │   └── main.tf
│   └── k8s/
│       ├── base/
│       ├── overlays/
│       └── kustomization.yaml
├── scripts/                    # Build/deploy scripts
│   ├── setup.sh               # Initial setup
│   ├── build.sh               # Build all packages
│   └── deploy.sh              # Deployment script
├── docs/                       # Documentation
│   ├── prd/                   # Product requirements
│   ├── architecture.md        # This document
│   ├── api/                   # API documentation
│   └── deployment/            # Deployment guides
├── .env.example                # Environment template
├── docker-compose.yml          # Local development
├── docker-compose.prod.yml     # Production compose
├── pnpm-workspace.yaml         # Monorepo configuration
├── package.json                # Root package.json
├── .gitignore
└── README.md
```

---
