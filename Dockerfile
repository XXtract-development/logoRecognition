# =============================================================================
# Logo Recognition Monolith Dockerfile (Web + API in one container)
# Multi-stage build: frontend + backend compiled separately, served from one image
# =============================================================================

# ============================================
# Stage 1: Build Frontend (Vite/React)
# ============================================
FROM node:20-alpine AS frontend-builder

RUN npm install -g pnpm@9.15.0

WORKDIR /app

# Copy workspace root config for dependency resolution
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Copy all package.json files needed for install
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ml/package.json ./packages/ml/
COPY packages/ui/package.json ./packages/ui/

# Install ALL dependencies including devDependencies (needed for build)
RUN NODE_ENV=development pnpm install --no-frozen-lockfile

# Copy source code
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/

# Build frontend (Vite handles TypeScript internally)
RUN cd apps/web && npx vite build

# ============================================
# Stage 2: Build Backend (Fastify/TypeScript)
# ============================================
FROM node:20-alpine AS backend-builder

RUN npm install -g pnpm@9.15.0

WORKDIR /app

# Copy workspace root config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./

# Copy package.json files for dependency resolution
COPY apps/api/package.json ./apps/api/
COPY apps/api/tsconfig.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ml/package.json ./packages/ml/
COPY packages/ui/package.json ./packages/ui/

# Install ALL dependencies including devDependencies (needed for build)
RUN NODE_ENV=development pnpm install --no-frozen-lockfile

# Copy source and prisma schema
COPY apps/api/src/ ./apps/api/src/
COPY apps/api/prisma/ ./apps/api/prisma/
COPY packages/ ./packages/

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# Build TypeScript
RUN pnpm --filter @logo-recognition/api build

# ============================================
# Stage 3: Production Runtime
# ============================================
FROM node:20-alpine AS runtime

ENV NODE_ENV=production

# Install curl for healthcheck + openssl for Prisma engine
RUN apk add --no-cache curl openssl

# Create non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# Copy backend build output
COPY --from=backend-builder /app/apps/api/dist ./dist
COPY --from=backend-builder /app/apps/api/package.json ./
COPY --from=backend-builder /app/apps/api/prisma ./prisma

# Copy node_modules (includes Prisma generated client)
COPY --from=backend-builder /app/node_modules ./node_modules

# Copy frontend build output to be served as static files
COPY --from=frontend-builder /app/apps/web/dist ./public

# Set ownership
RUN chown -R appuser:appgroup /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -sf -o /dev/null http://localhost:${APP_PORT:-8000}/health || exit 1

USER appuser

EXPOSE ${APP_PORT:-8000}

# NOTE: The API (main.ts) must serve static files from ./public using @fastify/static.
# If not yet configured, add @fastify/static to apps/api and register it to serve ./public
# for all non-API routes (SPA fallback).
CMD ["node", "dist/main.js"]
