"""
Database Indexing Scripts
US-017: Database Optimization - Database indexing scripts
"""

import logging
from typing import Dict, List, Optional, Tuple
from sqlalchemy import text, inspect, Index
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime
import asyncio
import psutil
import time

logger = logging.getLogger(__name__)

class DatabaseIndexManager:
    """Comprehensive database index management system"""

    def __init__(self, db_engine):
        self.engine = db_engine
        self.indexes = {}
        self.performance_metrics = {}

    async def create_optimization_indexes(self):
        """Create optimized indexes for the logo recognition system"""

        indexes_to_create = [
            # Users table indexes
            {
                'name': 'idx_users_email_active',
                'table': 'users',
                'columns': ['email'],
                'condition': 'is_active = true',
                'type': 'partial',
                'priority': 'high'
            },
            {
                'name': 'idx_users_created_at',
                'table': 'users',
                'columns': ['created_at'],
                'type': 'btree',
                'priority': 'medium'
            },

            # Images table indexes
            {
                'name': 'idx_images_user_id_status',
                'table': 'images',
                'columns': ['user_id', 'status'],
                'type': 'composite',
                'priority': 'high'
            },
            {
                'name': 'idx_images_file_hash',
                'table': 'images',
                'columns': ['file_hash'],
                'type': 'unique',
                'priority': 'high'
            },
            {
                'name': 'idx_images_created_at_desc',
                'table': 'images',
                'columns': ['created_at DESC'],
                'type': 'btree',
                'priority': 'high'
            },
            {
                'name': 'idx_images_size_format',
                'table': 'images',
                'columns': ['file_size', 'format'],
                'type': 'composite',
                'priority': 'medium'
            },
            {
                'name': 'idx_images_metadata_gin',
                'table': 'images',
                'columns': ['metadata'],
                'type': 'gin',
                'priority': 'medium'
            },

            # Annotations table indexes
            {
                'name': 'idx_annotations_image_id_user_id',
                'table': 'annotations',
                'columns': ['image_id', 'user_id'],
                'type': 'composite',
                'priority': 'high'
            },
            {
                'name': 'idx_annotations_bbox_coordinates',
                'table': 'annotations',
                'columns': ['bbox_x', 'bbox_y', 'bbox_width', 'bbox_height'],
                'type': 'composite',
                'priority': 'medium'
            },
            {
                'name': 'idx_annotations_label_confidence',
                'table': 'annotations',
                'columns': ['label', 'confidence'],
                'type': 'composite',
                'priority': 'high'
            },
            {
                'name': 'idx_annotations_created_at',
                'table': 'annotations',
                'columns': ['created_at'],
                'type': 'btree',
                'priority': 'medium'
            },

            # Training Jobs table indexes
            {
                'name': 'idx_training_jobs_status_created_at',
                'table': 'training_jobs',
                'columns': ['status', 'created_at'],
                'type': 'composite',
                'priority': 'high'
            },
            {
                'name': 'idx_training_jobs_user_id_status',
                'table': 'training_jobs',
                'columns': ['user_id', 'status'],
                'type': 'composite',
                'priority': 'high'
            },
            {
                'name': 'idx_training_jobs_model_version',
                'table': 'training_jobs',
                'columns': ['model_version'],
                'type': 'btree',
                'priority': 'medium'
            },

            # Models table indexes
            {
                'name': 'idx_models_version_status',
                'table': 'models',
                'columns': ['version', 'status'],
                'type': 'composite',
                'priority': 'high'
            },
            {
                'name': 'idx_models_accuracy_desc',
                'table': 'models',
                'columns': ['accuracy DESC'],
                'type': 'btree',
                'priority': 'medium'
            },
            {
                'name': 'idx_models_created_at',
                'table': 'models',
                'columns': ['created_at'],
                'type': 'btree',
                'priority': 'medium'
            },

            # Predictions table indexes
            {
                'name': 'idx_predictions_image_id_model_id',
                'table': 'predictions',
                'columns': ['image_id', 'model_id'],
                'type': 'composite',
                'priority': 'high'
            },
            {
                'name': 'idx_predictions_confidence_desc',
                'table': 'predictions',
                'columns': ['confidence DESC'],
                'type': 'btree',
                'priority': 'medium'
            },
            {
                'name': 'idx_predictions_created_at',
                'table': 'predictions',
                'columns': ['created_at'],
                'type': 'btree',
                'priority': 'high'
            },

            # Audit logs table indexes
            {
                'name': 'idx_audit_logs_user_id_action',
                'table': 'audit_logs',
                'columns': ['user_id', 'action'],
                'type': 'composite',
                'priority': 'medium'
            },
            {
                'name': 'idx_audit_logs_timestamp',
                'table': 'audit_logs',
                'columns': ['timestamp'],
                'type': 'btree',
                'priority': 'high'
            },
            {
                'name': 'idx_audit_logs_ip_address',
                'table': 'audit_logs',
                'columns': ['ip_address'],
                'type': 'hash',
                'priority': 'low'
            },

            # Performance optimization indexes
            {
                'name': 'idx_images_annotations_join',
                'table': 'images',
                'columns': ['id'],
                'type': 'covering',
                'include': ['filename', 'file_size', 'created_at'],
                'priority': 'high'
            },
            {
                'name': 'idx_annotations_stats',
                'table': 'annotations',
                'columns': ['label'],
                'type': 'covering',
                'include': ['confidence', 'created_at'],
                'priority': 'medium'
            }
        ]

        results = []
        for index_def in indexes_to_create:
            try:
                result = await self.create_index(index_def)
                results.append(result)
                logger.info(f"Created index {index_def['name']}: {result}")
            except Exception as e:
                logger.error(f"Failed to create index {index_def['name']}: {e}")
                results.append({'name': index_def['name'], 'status': 'failed', 'error': str(e)})

        return results

    async def create_index(self, index_definition: Dict) -> Dict:
        """Create a single index with performance monitoring"""

        start_time = time.time()

        try:
            # Check if index already exists
            if await self.index_exists(index_definition['name']):
                return {
                    'name': index_definition['name'],
                    'status': 'already_exists',
                    'duration': 0
                }

            # Generate SQL based on index type
            sql = self._generate_index_sql(index_definition)

            # Monitor system resources during creation
            process = psutil.Process()
            initial_memory = process.memory_info().rss

            # Execute index creation
            async with self.engine.begin() as conn:
                await conn.execute(text(sql))
                await conn.commit()

            duration = time.time() - start_time
            final_memory = process.memory_info().rss
            memory_used = final_memory - initial_memory

            # Store performance metrics
            self.performance_metrics[index_definition['name']] = {
                'creation_time': duration,
                'memory_used': memory_used,
                'created_at': datetime.now(),
                'sql': sql
            }

            return {
                'name': index_definition['name'],
                'status': 'created',
                'duration': duration,
                'memory_used': memory_used,
                'sql': sql
            }

        except SQLAlchemyError as e:
            logger.error(f"Database error creating index {index_definition['name']}: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error creating index {index_definition['name']}: {e}")
            raise

    def _generate_index_sql(self, index_def: Dict) -> str:
        """Generate SQL for index creation based on type"""

        name = index_def['name']
        table = index_def['table']
        columns = index_def['columns']
        index_type = index_def.get('type', 'btree')

        # Base SQL
        if index_type == 'unique':
            sql = f"CREATE UNIQUE INDEX CONCURRENTLY {name} ON {table}"
        else:
            sql = f"CREATE INDEX CONCURRENTLY {name} ON {table}"

        # Add index method
        if index_type in ['gin', 'gist', 'hash']:
            sql += f" USING {index_type}"

        # Add columns
        if isinstance(columns, list):
            columns_str = ', '.join(columns)
        else:
            columns_str = columns

        sql += f" ({columns_str})"

        # Add covering/include columns for PostgreSQL
        if 'include' in index_def:
            include_cols = ', '.join(index_def['include'])
            sql += f" INCLUDE ({include_cols})"

        # Add partial index condition
        if 'condition' in index_def:
            sql += f" WHERE {index_def['condition']}"

        return sql

    async def index_exists(self, index_name: str) -> bool:
        """Check if an index exists"""

        sql = """
        SELECT 1 FROM pg_indexes
        WHERE indexname = :index_name
        """

        async with self.engine.begin() as conn:
            result = await conn.execute(text(sql), {'index_name': index_name})
            return result.fetchone() is not None

    async def drop_index(self, index_name: str, if_exists: bool = True) -> bool:
        """Drop an index"""

        try:
            if_exists_clause = "IF EXISTS" if if_exists else ""
            sql = f"DROP INDEX CONCURRENTLY {if_exists_clause} {index_name}"

            async with self.engine.begin() as conn:
                await conn.execute(text(sql))
                await conn.commit()

            logger.info(f"Dropped index {index_name}")
            return True

        except SQLAlchemyError as e:
            logger.error(f"Failed to drop index {index_name}: {e}")
            return False

    async def analyze_index_usage(self) -> Dict:
        """Analyze index usage statistics"""

        sql = """
        SELECT
            schemaname,
            tablename,
            indexname,
            idx_tup_read,
            idx_tup_fetch,
            idx_scan,
            CASE
                WHEN idx_scan = 0 THEN 'unused'
                WHEN idx_scan < 100 THEN 'low_usage'
                WHEN idx_scan < 1000 THEN 'medium_usage'
                ELSE 'high_usage'
            END as usage_category,
            pg_size_pretty(pg_relation_size(indexrelid)) as index_size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC;
        """

        async with self.engine.begin() as conn:
            result = await conn.execute(text(sql))
            rows = result.fetchall()

        usage_stats = []
        for row in rows:
            usage_stats.append({
                'schema': row.schemaname,
                'table': row.tablename,
                'index': row.indexname,
                'reads': row.idx_tup_read,
                'fetches': row.idx_tup_fetch,
                'scans': row.idx_scan,
                'usage_category': row.usage_category,
                'size': row.index_size
            })

        return {
            'total_indexes': len(usage_stats),
            'unused_indexes': len([i for i in usage_stats if i['usage_category'] == 'unused']),
            'low_usage_indexes': len([i for i in usage_stats if i['usage_category'] == 'low_usage']),
            'indexes': usage_stats
        }

    async def get_table_statistics(self) -> Dict:
        """Get comprehensive table statistics"""

        sql = """
        SELECT
            schemaname,
            tablename,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            n_live_tup as live_tuples,
            n_dead_tup as dead_tuples,
            CASE
                WHEN n_live_tup > 0
                THEN round((n_dead_tup::float / n_live_tup::float) * 100, 2)
                ELSE 0
            END as dead_tuple_ratio,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
        """

        async with self.engine.begin() as conn:
            result = await conn.execute(text(sql))
            rows = result.fetchall()

        table_stats = []
        for row in rows:
            table_stats.append({
                'schema': row.schemaname,
                'table': row.tablename,
                'inserts': row.inserts,
                'updates': row.updates,
                'deletes': row.deletes,
                'live_tuples': row.live_tuples,
                'dead_tuples': row.dead_tuples,
                'dead_tuple_ratio': row.dead_tuple_ratio,
                'total_size': row.total_size,
                'last_vacuum': row.last_vacuum,
                'last_autovacuum': row.last_autovacuum,
                'last_analyze': row.last_analyze,
                'last_autoanalyze': row.last_autoanalyze
            })

        return table_stats

    async def suggest_indexes(self) -> List[Dict]:
        """Suggest indexes based on query patterns and missing indexes"""

        suggestions = []

        # Analyze slow queries
        slow_queries = await self._get_slow_queries()
        for query in slow_queries:
            suggestion = await self._analyze_query_for_index_suggestion(query)
            if suggestion:
                suggestions.append(suggestion)

        # Check for missing foreign key indexes
        missing_fk_indexes = await self._check_missing_foreign_key_indexes()
        suggestions.extend(missing_fk_indexes)

        # Check for columns frequently used in WHERE clauses
        frequent_columns = await self._analyze_frequent_where_columns()
        for col_info in frequent_columns:
            suggestions.append({
                'type': 'frequent_column',
                'table': col_info['table'],
                'column': col_info['column'],
                'frequency': col_info['frequency'],
                'suggested_index': f"idx_{col_info['table']}_{col_info['column']}",
                'priority': 'medium' if col_info['frequency'] > 1000 else 'low'
            })

        return suggestions

    async def _get_slow_queries(self) -> List[Dict]:
        """Get slow queries from pg_stat_statements if available"""

        # Check if pg_stat_statements extension is available
        check_sql = """
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
        """

        try:
            async with self.engine.begin() as conn:
                result = await conn.execute(text(check_sql))
                if not result.fetchone():
                    return []

                # Get slow queries
                slow_query_sql = """
                SELECT
                    query,
                    calls,
                    total_exec_time,
                    mean_exec_time,
                    rows
                FROM pg_stat_statements
                WHERE mean_exec_time > 100  -- queries taking more than 100ms on average
                ORDER BY mean_exec_time DESC
                LIMIT 20;
                """

                result = await conn.execute(text(slow_query_sql))
                rows = result.fetchall()

                return [
                    {
                        'query': row.query,
                        'calls': row.calls,
                        'total_time': row.total_exec_time,
                        'mean_time': row.mean_exec_time,
                        'rows': row.rows
                    }
                    for row in rows
                ]
        except Exception as e:
            logger.warning(f"Could not analyze slow queries: {e}")
            return []

    async def _analyze_query_for_index_suggestion(self, query_info: Dict) -> Optional[Dict]:
        """Analyze a query to suggest potential indexes"""

        query = query_info['query'].lower()

        # Simple pattern matching for common cases
        # In production, you'd want more sophisticated query parsing

        # Look for WHERE clauses without indexes
        if 'where' in query and 'seq scan' in query:
            return {
                'type': 'slow_query',
                'query': query_info['query'][:200] + '...',
                'mean_time': query_info['mean_time'],
                'suggestion': 'Consider adding indexes on columns used in WHERE clause',
                'priority': 'high' if query_info['mean_time'] > 1000 else 'medium'
            }

        return None

    async def _check_missing_foreign_key_indexes(self) -> List[Dict]:
        """Check for foreign key columns without indexes"""

        sql = """
        SELECT
            tc.table_name,
            kcu.column_name,
            tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = tc.table_name
            AND indexdef LIKE '%' || kcu.column_name || '%'
        );
        """

        suggestions = []
        try:
            async with self.engine.begin() as conn:
                result = await conn.execute(text(sql))
                rows = result.fetchall()

                for row in rows:
                    suggestions.append({
                        'type': 'missing_fk_index',
                        'table': row.table_name,
                        'column': row.column_name,
                        'constraint': row.constraint_name,
                        'suggested_index': f"idx_{row.table_name}_{row.column_name}",
                        'priority': 'high',
                        'reason': 'Foreign key column without index'
                    })
        except Exception as e:
            logger.warning(f"Could not check foreign key indexes: {e}")

        return suggestions

    async def _analyze_frequent_where_columns(self) -> List[Dict]:
        """Analyze frequently used columns in WHERE clauses"""

        # This would require query log analysis
        # For now, return common patterns based on application logic

        return [
            {'table': 'images', 'column': 'user_id', 'frequency': 5000},
            {'table': 'annotations', 'column': 'image_id', 'frequency': 3000},
            {'table': 'predictions', 'column': 'model_id', 'frequency': 2000},
            {'table': 'training_jobs', 'column': 'status', 'frequency': 1500},
        ]

    async def optimize_existing_indexes(self) -> Dict:
        """Optimize existing indexes by rebuilding and analyzing"""

        results = {
            'reindexed': [],
            'analyzed': [],
            'errors': []
        }

        # Get all user indexes
        sql = """
        SELECT indexname, tablename
        FROM pg_indexes
        WHERE schemaname = 'public'
        AND indexname NOT LIKE 'pg_%'
        """

        async with self.engine.begin() as conn:
            result = await conn.execute(text(sql))
            indexes = result.fetchall()

        for index in indexes:
            try:
                # Reindex
                reindex_sql = f"REINDEX INDEX CONCURRENTLY {index.indexname}"
                async with self.engine.begin() as conn:
                    await conn.execute(text(reindex_sql))

                results['reindexed'].append(index.indexname)

                # Analyze table
                analyze_sql = f"ANALYZE {index.tablename}"
                async with self.engine.begin() as conn:
                    await conn.execute(text(analyze_sql))

                results['analyzed'].append(index.tablename)

            except Exception as e:
                error_msg = f"Failed to optimize {index.indexname}: {e}"
                logger.error(error_msg)
                results['errors'].append(error_msg)

        return results

    async def monitor_index_bloat(self) -> List[Dict]:
        """Monitor index bloat and suggest maintenance"""

        sql = """
        SELECT
            schemaname,
            tablename,
            indexname,
            pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
            CASE
                WHEN pg_relation_size(indexrelid) > 100*1024*1024 THEN 'large'
                WHEN pg_relation_size(indexrelid) > 10*1024*1024 THEN 'medium'
                ELSE 'small'
            END as size_category
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY pg_relation_size(indexrelid) DESC;
        """

        bloat_info = []
        async with self.engine.begin() as conn:
            result = await conn.execute(text(sql))
            rows = result.fetchall()

            for row in rows:
                bloat_info.append({
                    'schema': row.schemaname,
                    'table': row.tablename,
                    'index': row.indexname,
                    'size': row.index_size,
                    'size_category': row.size_category,
                    'maintenance_needed': row.size_category in ['large', 'medium']
                })

        return bloat_info

    async def get_index_performance_report(self) -> Dict:
        """Generate comprehensive index performance report"""

        report = {
            'timestamp': datetime.now().isoformat(),
            'index_usage': await self.analyze_index_usage(),
            'table_statistics': await self.get_table_statistics(),
            'index_suggestions': await self.suggest_indexes(),
            'bloat_analysis': await self.monitor_index_bloat(),
            'performance_metrics': self.performance_metrics
        }

        return report


async def create_database_indexes(db_engine):
    """Main function to create all database indexes"""

    manager = DatabaseIndexManager(db_engine)

    logger.info("Starting database index creation process...")

    try:
        # Create optimization indexes
        results = await manager.create_optimization_indexes()

        # Generate performance report
        report = await manager.get_index_performance_report()

        logger.info(f"Index creation completed. Created {len([r for r in results if r.get('status') == 'created'])} new indexes")

        return {
            'status': 'success',
            'results': results,
            'performance_report': report
        }

    except Exception as e:
        logger.error(f"Index creation process failed: {e}")
        return {
            'status': 'error',
            'error': str(e)
        }


if __name__ == "__main__":
    # This would be called with proper database engine
    # asyncio.run(create_database_indexes(engine))
    pass