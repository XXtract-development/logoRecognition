# Repository Guidelines

## Project Structure & Module Organization
- `backend/`: FastAPI services, domain logic in `app/`, routers under `app/routers/`, database helpers in `database.py`, and pytest suites in `tests/` with coverage reports landing in `htmlcov/`.
- `frontend/`: React + TypeScript client; UI modules in `src/components/` and `src/pages/`, shared logic in `src/hooks/`, state in `src/store/`, and tests colocated in each feature's `__tests__/` directory.
- `services/`: Infrastructure helpers for ML pipelines (`ml/`), monitoring, and storage integrations; keep environment-agnostic scripts here.
- `infrastructure/` & `docker-compose.yml`: Docker definitions for Postgres + pgvector, MinIO, Redis, and observability stack.
- `docs/`: Product specs and sprint artifacts—consult before altering APIs or workflows.

## Build, Test, and Development Commands
- Backend setup: `cd backend && pip install -r requirements.txt`; run locally with `uvicorn app.main:app --reload`.
- Frontend setup: `cd frontend && npm install`; start the dev server via `npm start`.
- Automated stack: `docker-compose up --build` to launch the full environment.
- Backend tests: `cd backend && pytest`; CI enforces `--cov=app --cov-fail-under=80`.
- Frontend tests: `cd frontend && npm test -- --coverage --watchAll=false` for deterministic runs.

## Coding Style & Naming Conventions
- Python: Follow PEP 8 with 4-space indents, prefer type hints, and group imports by standard/third-party/local. Run `flake8` before pushing; structure modules as `{noun}_{action}.py` (e.g., `training_data_management.py`).
- Frontend: 2-space indent, PascalCase for React components, camelCase for hooks and utilities. Validate formatting with `npx prettier --check "src/**/*.{ts,tsx,js,jsx}"` and use `use` prefixes for hooks (`useBoundingBox`).

## Testing Guidelines
- Backend tests live in `backend/tests/test_*.py`; use pytest markers (`@pytest.mark.unit`, `integration`, `slow`) configured in `pytest.ini`. Maintain ≥80% coverage and include async variants where endpoints are coroutine-based.
- Frontend tests reside beside features; favor React Testing Library assertions and mock network calls with `msw` or `jest.mock`. Snapshot tests only for stable UI shells.

## Commit & Pull Request Guidelines
- Use Conventional Commits reflecting scope, mirroring existing history: `feat(frontend): add smart region selector`, `fix(backend): guard empty uploads`. Keep body lines wrapped at 72 characters.
- PRs should link tracking issues, describe backend/frontend impacts, list manual verification, and attach UI screenshots or API payload samples when relevant. Ensure CI (`ci-cd.yml`) passes before requesting review.

## Security & Configuration Tips
- Keep secrets out of VCS; reference sample env vars in `.env.local` and share sensitive values through the secrets manager. When adding services, update `docker-compose.yml` and document any new ports in `docs/`.
