#!/bin/bash
# =============================================================================
# Logo Recognition System - Development Startup Script
# =============================================================================
# Usage: ./scripts/start-dev.sh [command]
#
# Commands:
#   start       Start all services (default)
#   stop        Stop all services
#   restart     Restart all services
#   logs        Show logs for all services
#   status      Show status of all services
#   clean       Stop and remove all containers, volumes
#   db:migrate  Run database migrations
#   db:seed     Seed database with test data
#   test        Run all tests
#   build       Build all services
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.full.yml"

# Log functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_warning "Node.js is not installed. Some features may not work."
    fi

    # Check pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warning "pnpm is not installed. Installing..."
        npm install -g pnpm
    fi

    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_warning "Python 3 is not installed. ML service may not work locally."
    fi

    log_success "Prerequisites check passed!"
}

# Create .env file if not exists
setup_env() {
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        log_info "Creating .env file from template..."
        if [ -f "$PROJECT_ROOT/.env.example" ]; then
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
            log_success ".env file created. Please review and update values."
        else
            log_warning ".env.example not found. Please create .env manually."
        fi
    fi
}

# Install dependencies
install_deps() {
    log_info "Installing dependencies..."

    cd "$PROJECT_ROOT"

    # Install Node.js dependencies
    if [ -f "pnpm-lock.yaml" ]; then
        pnpm install
    elif [ -f "package-lock.json" ]; then
        npm ci
    fi

    log_success "Dependencies installed!"
}

# Start all services
start_services() {
    log_info "Starting all services..."

    cd "$PROJECT_ROOT"

    # Use docker compose v2 syntax if available
    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" up -d
    else
        docker-compose -f "$COMPOSE_FILE" up -d
    fi

    log_success "Services started!"
    echo ""
    log_info "Service URLs:"
    echo "  - Frontend:    http://localhost:3000"
    echo "  - API Gateway: http://localhost:8000"
    echo "  - ML Service:  http://localhost:8001"
    echo "  - Grafana:     http://localhost:3001 (admin/admin)"
    echo "  - MinIO:       http://localhost:9001 (minioadmin/minioadmin)"
    echo "  - pgAdmin:     http://localhost:5050 (run with --profile tools)"
    echo ""
    log_info "Run './scripts/start-dev.sh logs' to see logs"
}

# Stop all services
stop_services() {
    log_info "Stopping all services..."

    cd "$PROJECT_ROOT"

    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" down
    else
        docker-compose -f "$COMPOSE_FILE" down
    fi

    log_success "Services stopped!"
}

# Show logs
show_logs() {
    log_info "Showing logs (Ctrl+C to exit)..."

    cd "$PROJECT_ROOT"

    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" logs -f
    else
        docker-compose -f "$COMPOSE_FILE" logs -f
    fi
}

# Show status
show_status() {
    log_info "Service status:"

    cd "$PROJECT_ROOT"

    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" ps
    else
        docker-compose -f "$COMPOSE_FILE" ps
    fi
}

# Clean everything
clean_all() {
    log_warning "This will remove all containers, volumes, and networks!"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up..."

        cd "$PROJECT_ROOT"

        if docker compose version &> /dev/null; then
            docker compose -f "$COMPOSE_FILE" down -v --remove-orphans
        else
            docker-compose -f "$COMPOSE_FILE" down -v --remove-orphans
        fi

        # Remove dangling images
        docker image prune -f

        log_success "Cleanup complete!"
    else
        log_info "Cleanup cancelled."
    fi
}

# Run database migrations
run_migrations() {
    log_info "Running database migrations..."

    cd "$PROJECT_ROOT/apps/api"

    # Check if Prisma is available
    if [ -f "prisma/schema.prisma" ]; then
        npx prisma generate
        npx prisma db push
        log_success "Database migrations complete!"
    else
        log_warning "Prisma schema not found. Skipping migrations."
    fi
}

# Seed database
seed_database() {
    log_info "Seeding database..."

    cd "$PROJECT_ROOT/apps/api"

    if [ -f "prisma/seed.ts" ]; then
        npx prisma db seed
        log_success "Database seeded!"
    else
        log_warning "Seed file not found. Creating sample data..."

        # Insert sample data using psql
        docker exec logo-recognition-postgres psql -U postgres -d logo_recognition -c "
            INSERT INTO logos.model_versions (version, model_type, is_active, accuracy)
            VALUES ('1.0.0', 'EfficientDet-D4', true, 0.99)
            ON CONFLICT (version) DO NOTHING;
        "
        log_success "Sample data inserted!"
    fi
}

# Run tests
run_tests() {
    log_info "Running tests..."

    cd "$PROJECT_ROOT"

    # Frontend tests
    log_info "Running frontend tests..."
    pnpm --filter @logo-recognition/web test

    # API tests
    log_info "Running API tests..."
    pnpm --filter @logo-recognition/api test

    # ML Service tests
    if [ -d "apps/ml-service" ]; then
        log_info "Running ML service tests..."
        cd "$PROJECT_ROOT/apps/ml-service"
        if [ -f "requirements.txt" ]; then
            python -m pytest tests/ -v
        fi
    fi

    log_success "All tests passed!"
}

# Build all services
build_services() {
    log_info "Building all services..."

    cd "$PROJECT_ROOT"

    # Build Node.js apps
    pnpm build

    # Build Docker images
    if docker compose version &> /dev/null; then
        docker compose -f "$COMPOSE_FILE" build
    else
        docker-compose -f "$COMPOSE_FILE" build
    fi

    log_success "Build complete!"
}

# Health check
health_check() {
    log_info "Running health checks..."

    local all_healthy=true

    # Check API Gateway
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        log_success "API Gateway: healthy"
    else
        log_error "API Gateway: not responding"
        all_healthy=false
    fi

    # Check ML Service
    if curl -s http://localhost:8001/health > /dev/null 2>&1; then
        log_success "ML Service: healthy"
    else
        log_error "ML Service: not responding"
        all_healthy=false
    fi

    # Check PostgreSQL
    if docker exec logo-recognition-postgres pg_isready -U postgres > /dev/null 2>&1; then
        log_success "PostgreSQL: healthy"
    else
        log_error "PostgreSQL: not responding"
        all_healthy=false
    fi

    # Check Redis
    if docker exec logo-recognition-redis redis-cli ping > /dev/null 2>&1; then
        log_success "Redis: healthy"
    else
        log_error "Redis: not responding"
        all_healthy=false
    fi

    # Check MinIO
    if curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
        log_success "MinIO: healthy"
    else
        log_error "MinIO: not responding"
        all_healthy=false
    fi

    echo ""
    if [ "$all_healthy" = true ]; then
        log_success "All services are healthy!"
    else
        log_warning "Some services are not healthy. Run './scripts/start-dev.sh logs' to debug."
    fi
}

# Print help
print_help() {
    echo "Logo Recognition System - Development Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start        Start all services (default)"
    echo "  stop         Stop all services"
    echo "  restart      Restart all services"
    echo "  logs         Show logs for all services"
    echo "  status       Show status of all services"
    echo "  health       Run health checks on all services"
    echo "  clean        Stop and remove all containers, volumes"
    echo "  db:migrate   Run database migrations (Prisma)"
    echo "  db:seed      Seed database with test data"
    echo "  test         Run all tests"
    echo "  build        Build all services"
    echo "  install      Install dependencies"
    echo "  help         Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start      # Start development environment"
    echo "  $0 logs       # Follow logs from all services"
    echo "  $0 restart    # Restart all services"
}

# Main script
main() {
    cd "$PROJECT_ROOT"

    case "${1:-start}" in
        start)
            check_prerequisites
            setup_env
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            stop_services
            start_services
            ;;
        logs)
            show_logs
            ;;
        status)
            show_status
            ;;
        health)
            health_check
            ;;
        clean)
            clean_all
            ;;
        db:migrate)
            run_migrations
            ;;
        db:seed)
            seed_database
            ;;
        test)
            run_tests
            ;;
        build)
            build_services
            ;;
        install)
            install_deps
            ;;
        help|--help|-h)
            print_help
            ;;
        *)
            log_error "Unknown command: $1"
            print_help
            exit 1
            ;;
    esac
}

main "$@"
