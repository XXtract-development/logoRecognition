# Frontend Dockerfile - Development
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application files
COPY apps/web/index.html ./apps/web/
COPY apps/web/public ./apps/web/public
COPY apps/web/src ./apps/web/src
COPY apps/web/vite.config.ts ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/

# Set working directory to web app
WORKDIR /app/apps/web

# Expose port
EXPOSE 3000

# Start development server
CMD ["pnpm", "run", "dev", "--host", "0.0.0.0"]
