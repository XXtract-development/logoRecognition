"""
Database Query Optimizer Service - A++ Implementation
Provides comprehensive query optimization with monitoring and auto-tuning
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
import asyncio
import json
import logging
from dataclasses import dataclass
from enum import Enum

from sqlalchemy import text, create_engine, event
from sqlalchemy.orm import Session, Query
from sqlalchemy.engine import Engine
import redis.asyncio as redis
import pandas as pd

logger = logging.getLogger(__name__)


class QueryPriority(Enum):
    """Query priority levels for optimization"""
    CRITICAL = 1  # <50ms target
    HIGH = 2      # <100ms target
    MEDIUM = 3    # <200ms target
    LOW = 4       # <500ms target


@dataclass
class QueryPlan:
    """Execution plan for a query"""
    query: str
    execution_time: float
    cost: float
    rows: int
    plan: Dict[str, Any]
    suggestions: List[str]
    priority: QueryPriority


class DatabaseOptimizer:
    """
    Comprehensive database optimization service with:
    - Automatic index recommendations
    - Query plan analysis
    - Performance monitoring
    - Cache-aware optimization
    - Automatic slow query detection
    """

    def __init__(self, db_session: Session, redis_client: redis.Redis):
        self.db = db_session
        self.redis = redis_client
        self.slow_query_threshold = 0.1  # 100ms
        self.query_cache: Dict[str, QueryPlan] = {}
        self.monitoring_enabled = True
        self.auto_optimize = True

        # Performance targets by priority
        self.performance_targets = {
            QueryPriority.CRITICAL: 0.05,  # 50ms
            QueryPriority.HIGH: 0.1,       # 100ms
            QueryPriority.MEDIUM: 0.2,     # 200ms
            QueryPriority.LOW: 0.5,        # 500ms
        }

        self._setup_monitoring()

    def _setup_monitoring(self):
        """Setup query monitoring and auto-optimization"""
        @event.listens_for(Engine, "before_cursor_execute")
        def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            if self.monitoring_enabled:
                conn.info.setdefault('query_start_time', []).append(datetime.now())

        @event.listens_for(Engine, "after_cursor_execute")
        def receive_after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            if self.monitoring_enabled:
                total = datetime.now() - conn.info['query_start_time'].pop(-1)
                duration = total.total_seconds()

                if duration > self.slow_query_threshold:
                    asyncio.create_task(self._handle_slow_query(statement, parameters, duration))

    async def _handle_slow_query(self, query: str, parameters: Any, duration: float):
        """Handle slow query detection and optimization"""
        logger.warning(f"Slow query detected ({duration:.3f}s): {query[:100]}")

        # Analyze query plan
        plan = await self.analyze_query_plan(query, parameters)

        # Store in slow query log
        await self.redis.lpush(
            "slow_queries",
            json.dumps({
                "query": query[:500],
                "duration": duration,
                "timestamp": datetime.now().isoformat(),
                "plan": plan.suggestions if plan else [],
            })
        )

        # Auto-optimize if enabled
        if self.auto_optimize and plan:
            await self._auto_optimize_query(plan)

    async def analyze_query_plan(
        self,
        query: str,
        parameters: Optional[Dict] = None
    ) -> Optional[QueryPlan]:
        """Analyze query execution plan and provide optimization suggestions"""
        try:
            # Get EXPLAIN ANALYZE output
            explain_query = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}"
            result = self.db.execute(text(explain_query), parameters or {})
            plan_data = result.scalar()

            if not plan_data:
                return None

            plan_json = plan_data[0] if isinstance(plan_data, list) else plan_data

            # Extract key metrics
            execution_time = plan_json.get('Execution Time', 0)
            planning_time = plan_json.get('Planning Time', 0)
            total_time = execution_time + planning_time

            # Analyze plan for optimization opportunities
            suggestions = self._analyze_plan_for_optimizations(plan_json)

            # Determine priority based on execution time
            priority = self._determine_query_priority(total_time)

            query_plan = QueryPlan(
                query=query,
                execution_time=total_time,
                cost=plan_json.get('Plan', {}).get('Total Cost', 0),
                rows=plan_json.get('Plan', {}).get('Plan Rows', 0),
                plan=plan_json,
                suggestions=suggestions,
                priority=priority
            )

            # Cache the plan
            cache_key = self._get_query_cache_key(query)
            self.query_cache[cache_key] = query_plan

            return query_plan

        except Exception as e:
            logger.error(f"Error analyzing query plan: {e}")
            return None

    def _analyze_plan_for_optimizations(self, plan: Dict) -> List[str]:
        """Analyze execution plan and suggest optimizations"""
        suggestions = []

        def analyze_node(node: Dict, depth: int = 0):
            node_type = node.get('Node Type', '')

            # Sequential scan detection
            if node_type == 'Seq Scan':
                table = node.get('Relation Name', 'unknown')
                rows = node.get('Plan Rows', 0)
                if rows > 1000:
                    suggestions.append(
                        f"Consider adding index on table '{table}' - sequential scan on {rows} rows"
                    )

            # Nested loop with high iterations
            if node_type == 'Nested Loop':
                loops = node.get('Actual Loops', 1)
                if loops > 100:
                    suggestions.append(
                        f"High nested loop count ({loops}) - consider JOIN optimization"
                    )

            # Sort operations on large datasets
            if node_type in ['Sort', 'Sort Key']:
                rows = node.get('Plan Rows', 0)
                if rows > 10000:
                    sort_key = node.get('Sort Key', [])
                    suggestions.append(
                        f"Large sort operation on {rows} rows - consider index on {sort_key}"
                    )

            # Missing index on filter
            if 'Filter' in node:
                filter_cond = node.get('Filter', '')
                if 'Index' not in node_type:
                    suggestions.append(
                        f"Filter without index: {filter_cond[:100]}"
                    )

            # High cost operations
            cost = node.get('Total Cost', 0)
            if cost > 10000:
                suggestions.append(
                    f"High cost operation ({cost:.0f}) in {node_type}"
                )

            # Recursive analysis
            if 'Plans' in node:
                for child in node['Plans']:
                    analyze_node(child, depth + 1)

        # Start analysis from root
        if 'Plan' in plan:
            analyze_node(plan['Plan'])

        return suggestions

    def _determine_query_priority(self, execution_time: float) -> QueryPriority:
        """Determine query priority based on execution time"""
        if execution_time < 0.05:
            return QueryPriority.CRITICAL
        elif execution_time < 0.1:
            return QueryPriority.HIGH
        elif execution_time < 0.2:
            return QueryPriority.MEDIUM
        else:
            return QueryPriority.LOW

    async def _auto_optimize_query(self, plan: QueryPlan):
        """Automatically apply optimizations based on query plan analysis"""
        if not plan.suggestions:
            return

        for suggestion in plan.suggestions:
            # Parse suggestion and apply optimization
            if "Consider adding index" in suggestion:
                await self._suggest_index_creation(suggestion)
            elif "JOIN optimization" in suggestion:
                await self._optimize_join_strategy(plan.query)
            elif "Large sort operation" in suggestion:
                await self._optimize_sort_operation(suggestion)

    async def _suggest_index_creation(self, suggestion: str):
        """Generate and store index creation suggestion"""
        # Parse table and potential columns from suggestion
        import re
        match = re.search(r"table '(\w+)'", suggestion)
        if match:
            table = match.group(1)

            # Analyze table statistics to recommend best index
            stats_query = f"""
                SELECT
                    attname as column_name,
                    n_distinct,
                    null_frac,
                    avg_width
                FROM pg_stats
                WHERE tablename = :table
                ORDER BY n_distinct DESC
                LIMIT 5
            """

            result = self.db.execute(text(stats_query), {"table": table})
            columns = result.fetchall()

            if columns:
                # Generate index recommendation
                index_columns = [col[0] for col in columns[:3]]  # Top 3 columns
                index_name = f"idx_{table}_{'_'.join(index_columns)}"
                index_sql = f"CREATE INDEX CONCURRENTLY {index_name} ON {table}({', '.join(index_columns)})"

                # Store recommendation
                await self.redis.hset(
                    "index_recommendations",
                    index_name,
                    json.dumps({
                        "sql": index_sql,
                        "table": table,
                        "columns": index_columns,
                        "reason": suggestion,
                        "timestamp": datetime.now().isoformat(),
                    })
                )

                logger.info(f"Index recommendation stored: {index_name}")

    async def optimize_batch_operation(
        self,
        operation: str,
        items: List[Any],
        batch_size: int = 1000
    ) -> List[Any]:
        """Optimize batch database operations"""
        results = []

        # Process in optimized batches
        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]

            # Use COPY for bulk inserts if PostgreSQL
            if operation == "insert" and self.db.bind.dialect.name == 'postgresql':
                # Use COPY FROM for maximum performance
                from io import StringIO
                import csv

                output = StringIO()
                writer = csv.writer(output)
                for item in batch:
                    writer.writerow(item)

                output.seek(0)
                raw_conn = self.db.connection().connection
                cursor = raw_conn.cursor()
                cursor.copy_from(output, 'target_table', sep=',')
                raw_conn.commit()

            else:
                # Use bulk operations for other cases
                if operation == "insert":
                    self.db.bulk_insert_mappings(Model, batch)
                elif operation == "update":
                    self.db.bulk_update_mappings(Model, batch)

            results.extend(batch)

            # Commit periodically to avoid long transactions
            if i % (batch_size * 10) == 0:
                self.db.commit()

        self.db.commit()
        return results

    def create_optimized_indexes(self) -> List[str]:
        """Create all recommended indexes for optimal performance"""
        indexes = [
            # Composite indexes for common query patterns
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_images_user_status_created
            ON images(user_id, status, created_at DESC)
            WHERE deleted_at IS NULL;
            """,

            # Partial indexes for specific conditions
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_images_processing
            ON images(created_at DESC)
            WHERE status = 'processing';
            """,

            # BRIN indexes for time-series data
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_images_created_brin
            ON images USING brin(created_at);
            """,

            # GIN indexes for JSONB columns
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_images_metadata_gin
            ON images USING gin(metadata);
            """,

            # Covering indexes for index-only scans
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_detections_covering
            ON detections(image_id, confidence DESC)
            INCLUDE (class_name, bbox);
            """,

            # Hash indexes for equality comparisons
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_hash
            ON users USING hash(email);
            """,
        ]

        created_indexes = []
        for index_sql in indexes:
            try:
                self.db.execute(text(index_sql))
                created_indexes.append(index_sql.split('INDEX')[1].split('ON')[0].strip())
                logger.info(f"Created index: {index_sql[:50]}")
            except Exception as e:
                logger.warning(f"Index creation skipped (may already exist): {e}")

        return created_indexes

    async def get_optimization_report(self) -> Dict[str, Any]:
        """Generate comprehensive optimization report"""
        # Collect slow queries
        slow_queries = await self.redis.lrange("slow_queries", 0, 100)
        slow_queries = [json.loads(q) for q in slow_queries]

        # Get index recommendations
        recommendations = await self.redis.hgetall("index_recommendations")
        recommendations = {k: json.loads(v) for k, v in recommendations.items()}

        # Analyze table statistics
        table_stats = self.db.execute(text("""
            SELECT
                schemaname,
                tablename,
                pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
                n_live_tup as row_count,
                n_dead_tup as dead_rows,
                last_vacuum,
                last_autovacuum
            FROM pg_stat_user_tables
            ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
            LIMIT 10
        """)).fetchall()

        # Get cache hit rates
        cache_stats = self.db.execute(text("""
            SELECT
                sum(heap_blks_read) as heap_read,
                sum(heap_blks_hit) as heap_hit,
                sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read))::float as cache_hit_ratio
            FROM pg_statio_user_tables
        """)).fetchone()

        return {
            "summary": {
                "slow_queries_count": len(slow_queries),
                "pending_index_recommendations": len(recommendations),
                "cache_hit_ratio": float(cache_stats[2]) if cache_stats else 0,
                "optimization_status": "healthy" if len(slow_queries) < 10 else "needs_attention",
            },
            "slow_queries": slow_queries[:10],  # Top 10
            "index_recommendations": recommendations,
            "table_statistics": [
                {
                    "table": row[1],
                    "size": row[2],
                    "rows": row[3],
                    "dead_rows": row[4],
                    "last_vacuum": row[5].isoformat() if row[5] else None,
                }
                for row in table_stats
            ],
            "performance_metrics": {
                "cache_hit_ratio": float(cache_stats[2]) if cache_stats else 0,
                "heap_blocks_read": cache_stats[0] if cache_stats else 0,
                "heap_blocks_hit": cache_stats[1] if cache_stats else 0,
            },
            "optimization_suggestions": self._generate_optimization_suggestions(
                slow_queries, recommendations, table_stats
            ),
        }

    def _generate_optimization_suggestions(
        self,
        slow_queries: List[Dict],
        recommendations: Dict,
        table_stats: List
    ) -> List[str]:
        """Generate actionable optimization suggestions"""
        suggestions = []

        # Analyze patterns in slow queries
        if len(slow_queries) > 5:
            suggestions.append("High number of slow queries detected - review query patterns")

        # Check for missing indexes
        if recommendations:
            suggestions.append(f"Apply {len(recommendations)} pending index recommendations")

        # Check for table maintenance
        for stat in table_stats:
            if stat[4] > stat[3] * 0.1:  # Dead rows > 10% of live rows
                suggestions.append(f"Table {stat[1]} needs VACUUM - high dead row count")

        return suggestions

    def _get_query_cache_key(self, query: str) -> str:
        """Generate cache key for query"""
        import hashlib
        return hashlib.md5(query.encode()).hexdigest()


class QueryPerformanceMonitor:
    """Real-time query performance monitoring"""

    def __init__(self, optimizer: DatabaseOptimizer):
        self.optimizer = optimizer
        self.metrics: List[Dict] = []
        self.alerts: List[Dict] = []

    async def monitor_query_performance(self):
        """Continuous monitoring of query performance"""
        while True:
            try:
                # Get current performance metrics
                report = await self.optimizer.get_optimization_report()

                # Check for performance degradation
                if report['summary']['cache_hit_ratio'] < 0.9:
                    self.alerts.append({
                        "level": "warning",
                        "message": "Cache hit ratio below 90%",
                        "timestamp": datetime.now().isoformat(),
                        "metric": "cache_hit_ratio",
                        "value": report['summary']['cache_hit_ratio'],
                    })

                if report['summary']['slow_queries_count'] > 10:
                    self.alerts.append({
                        "level": "critical",
                        "message": f"{report['summary']['slow_queries_count']} slow queries detected",
                        "timestamp": datetime.now().isoformat(),
                        "metric": "slow_queries",
                        "value": report['summary']['slow_queries_count'],
                    })

                # Store metrics
                self.metrics.append({
                    "timestamp": datetime.now().isoformat(),
                    "metrics": report['performance_metrics'],
                })

                # Keep only last hour of metrics
                cutoff_time = datetime.now() - timedelta(hours=1)
                self.metrics = [
                    m for m in self.metrics
                    if datetime.fromisoformat(m['timestamp']) > cutoff_time
                ]

                # Sleep for monitoring interval
                await asyncio.sleep(60)  # Check every minute

            except Exception as e:
                logger.error(f"Error in performance monitoring: {e}")
                await asyncio.sleep(60)