# Testing Strategy

Voor gedetailleerde testing strategie, zie: `_archive/old-structure/architecture/16-testing-strategy.md`

## Quick Reference

### Frontend (apps/web)
```bash
pnpm test          # Vitest unit tests
pnpm test:e2e      # Playwright E2E tests
pnpm test:coverage # Coverage report
```

### API (apps/api)
```bash
pnpm test          # Jest tests
pnpm test:coverage # Coverage report
```

### Python ML (backend/)
```bash
pytest             # All tests
pytest --cov       # With coverage
```
