"""
Query Optimization System
US-017: Database Optimization - Query optimization
"""

import logging
import time
import hashlib
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from sqlalchemy import text, inspect
from sqlalchemy.exc import SQLAlchemyError
from dataclasses import dataclass
import asyncio
import re

logger = logging.getLogger(__name__)

@dataclass
class QueryMetrics:
    """Query performance metrics"""
    query_hash: str
    execution_time: float
    rows_affected: int
    memory_usage: int
    cpu_usage: float
    timestamp: datetime
    execution_plan: Optional[Dict] = None

@dataclass
class OptimizationSuggestion:
    """Query optimization suggestion"""
    query_hash: str
    suggestion_type: str
    description: str
    priority: str
    estimated_improvement: float
    implementation_effort: str

class QueryOptimizer:
    """Advanced query optimization system"""

    def __init__(self, db_engine):
        self.engine = db_engine
        self.query_cache = {}
        self.metrics_history = []
        self.optimization_rules = []
        self.slow_query_threshold = 1000  # ms

        self._setup_optimization_rules()

    def _setup_optimization_rules(self):
        """Setup query optimization rules"""

        self.optimization_rules = [
            {
                'name': 'avoid_select_star',
                'pattern': r'SELECT\s+\*\s+FROM',
                'suggestion': 'Avoid SELECT * - specify only needed columns',
                'priority': 'medium',
                'improvement': 15
            },
            {
                'name': 'missing_where_clause',
                'pattern': r'SELECT.*FROM\s+\w+(?!\s+WHERE)',
                'suggestion': 'Add WHERE clause to limit result set',
                'priority': 'high',
                'improvement': 50
            },
            {
                'name': 'inefficient_like',
                'pattern': r'LIKE\s+[\'"]%.*%[\'"]',
                'suggestion': 'Consider full-text search for complex LIKE patterns',
                'priority': 'medium',
                'improvement': 30
            },
            {
                'name': 'missing_limit',
                'pattern': r'SELECT.*FROM.*(?!LIMIT)',
                'suggestion': 'Add LIMIT clause to prevent large result sets',
                'priority': 'medium',
                'improvement': 25
            },
            {
                'name': 'inefficient_order_by',
                'pattern': r'ORDER\s+BY.*(?!LIMIT)',
                'suggestion': 'Add LIMIT when using ORDER BY to improve performance',
                'priority': 'medium',
                'improvement': 20
            },
            {
                'name': 'multiple_joins_without_indexes',
                'pattern': r'JOIN.*JOIN',
                'suggestion': 'Ensure proper indexes exist for JOIN columns',
                'priority': 'high',
                'improvement': 40
            },
            {
                'name': 'subquery_in_select',
                'pattern': r'SELECT.*\(SELECT.*FROM.*\)',
                'suggestion': 'Consider using JOINs instead of subqueries in SELECT',
                'priority': 'medium',
                'improvement': 25
            },
            {
                'name': 'function_in_where',
                'pattern': r'WHERE.*\w+\([^)]*\)\s*[=<>]',
                'suggestion': 'Avoid functions in WHERE clause for better index usage',
                'priority': 'high',
                'improvement': 35
            }
        ]

    async def analyze_query(self, query: str, execution_time: float = None) -> Dict:
        """Analyze a query for optimization opportunities"""

        query_hash = self._hash_query(query)
        normalized_query = self._normalize_query(query)

        analysis = {
            'query_hash': query_hash,
            'original_query': query,
            'normalized_query': normalized_query,
            'suggestions': [],
            'severity': 'low',
            'estimated_improvement': 0
        }

        # Apply optimization rules
        for rule in self.optimization_rules:
            if re.search(rule['pattern'], normalized_query, re.IGNORECASE):
                suggestion = OptimizationSuggestion(
                    query_hash=query_hash,
                    suggestion_type=rule['name'],
                    description=rule['suggestion'],
                    priority=rule['priority'],
                    estimated_improvement=rule['improvement'],
                    implementation_effort='low'
                )
                analysis['suggestions'].append(suggestion.__dict__)

        # Determine overall severity
        if analysis['suggestions']:
            priorities = [s['priority'] for s in analysis['suggestions']]
            if 'high' in priorities:
                analysis['severity'] = 'high'
            elif 'medium' in priorities:
                analysis['severity'] = 'medium'

        # Calculate estimated improvement
        if analysis['suggestions']:
            analysis['estimated_improvement'] = max(
                s['estimated_improvement'] for s in analysis['suggestions']
            )

        # Get execution plan if query is slow
        if execution_time and execution_time > self.slow_query_threshold:
            try:
                execution_plan = await self._get_execution_plan(query)
                analysis['execution_plan'] = execution_plan
                analysis['execution_time'] = execution_time
            except Exception as e:
                logger.warning(f"Could not get execution plan: {e}")

        return analysis

    async def _get_execution_plan(self, query: str) -> Dict:
        """Get query execution plan"""

        try:
            explain_query = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {query}"

            async with self.engine.begin() as conn:
                result = await conn.execute(text(explain_query))
                plan_data = result.fetchone()[0]

            return {
                'plan': plan_data,
                'analysis': self._analyze_execution_plan(plan_data)
            }

        except Exception as e:
            logger.error(f"Failed to get execution plan: {e}")
            return {}

    def _analyze_execution_plan(self, plan_data: List[Dict]) -> Dict:
        """Analyze execution plan for optimization opportunities"""

        if not plan_data or not isinstance(plan_data, list):
            return {}

        plan = plan_data[0].get('Plan', {})

        analysis = {
            'total_cost': plan.get('Total Cost', 0),
            'execution_time': plan.get('Actual Total Time', 0),
            'rows_returned': plan.get('Actual Rows', 0),
            'sequential_scans': 0,
            'index_scans': 0,
            'nested_loops': 0,
            'hash_joins': 0,
            'sort_operations': 0,
            'expensive_operations': []
        }

        # Recursively analyze plan nodes
        self._analyze_plan_node(plan, analysis)

        # Generate recommendations based on plan analysis
        recommendations = []

        if analysis['sequential_scans'] > 0:
            recommendations.append({
                'type': 'index_recommendation',
                'description': f"Found {analysis['sequential_scans']} sequential scans. Consider adding indexes.",
                'priority': 'high'
            })

        if analysis['nested_loops'] > 2:
            recommendations.append({
                'type': 'join_optimization',
                'description': f"Multiple nested loops detected ({analysis['nested_loops']}). Consider query restructuring.",
                'priority': 'medium'
            })

        if analysis['sort_operations'] > 1:
            recommendations.append({
                'type': 'sort_optimization',
                'description': f"Multiple sort operations found. Consider using indexes for sorting.",
                'priority': 'medium'
            })

        analysis['recommendations'] = recommendations

        return analysis

    def _analyze_plan_node(self, node: Dict, analysis: Dict):
        """Recursively analyze execution plan nodes"""

        node_type = node.get('Node Type', '')

        # Count different operation types
        if 'Seq Scan' in node_type:
            analysis['sequential_scans'] += 1

        if 'Index Scan' in node_type:
            analysis['index_scans'] += 1

        if 'Nested Loop' in node_type:
            analysis['nested_loops'] += 1

        if 'Hash Join' in node_type:
            analysis['hash_joins'] += 1

        if 'Sort' in node_type:
            analysis['sort_operations'] += 1

        # Check for expensive operations
        cost = node.get('Total Cost', 0)
        if cost > 10000:  # Threshold for expensive operations
            analysis['expensive_operations'].append({
                'node_type': node_type,
                'cost': cost,
                'relation': node.get('Relation Name', 'unknown')
            })

        # Recursively analyze child plans
        if 'Plans' in node:
            for child_plan in node['Plans']:
                self._analyze_plan_node(child_plan, analysis)

    async def optimize_query(self, query: str) -> Dict:
        """Automatically optimize a query"""

        original_analysis = await self.analyze_query(query)
        optimized_query = query
        applied_optimizations = []

        # Apply automatic optimizations
        optimizations = [
            self._optimize_select_star,
            self._optimize_unnecessary_joins,
            self._optimize_where_clause_order,
            self._optimize_limit_usage,
            self._optimize_subqueries
        ]

        for optimization_func in optimizations:
            try:
                result = optimization_func(optimized_query)
                if result['modified']:
                    optimized_query = result['query']
                    applied_optimizations.append(result['optimization'])
            except Exception as e:
                logger.warning(f"Optimization failed: {e}")

        # Analyze optimized query
        optimized_analysis = await self.analyze_query(optimized_query)

        return {
            'original_query': query,
            'optimized_query': optimized_query,
            'applied_optimizations': applied_optimizations,
            'original_analysis': original_analysis,
            'optimized_analysis': optimized_analysis,
            'estimated_improvement': self._calculate_improvement(
                original_analysis, optimized_analysis
            )
        }

    def _optimize_select_star(self, query: str) -> Dict:
        """Optimize SELECT * queries"""

        # This is a simplified optimization
        # In practice, you'd need to know the table schema
        if re.search(r'SELECT\s+\*', query, re.IGNORECASE):
            # For demo purposes, we'll suggest common columns
            optimized = re.sub(
                r'SELECT\s+\*',
                'SELECT id, name, created_at',
                query,
                flags=re.IGNORECASE
            )

            return {
                'modified': True,
                'query': optimized,
                'optimization': 'select_star_removal'
            }

        return {'modified': False, 'query': query}

    def _optimize_unnecessary_joins(self, query: str) -> Dict:
        """Remove unnecessary JOINs"""

        # Simplified check for unused JOIN tables
        # This would require more sophisticated analysis in practice

        return {'modified': False, 'query': query}

    def _optimize_where_clause_order(self, query: str) -> Dict:
        """Optimize WHERE clause order for better index usage"""

        # Move more selective conditions first
        # This is a simplified implementation

        return {'modified': False, 'query': query}

    def _optimize_limit_usage(self, query: str) -> Dict:
        """Add LIMIT clauses where appropriate"""

        # Add LIMIT if ORDER BY exists but no LIMIT
        if re.search(r'ORDER\s+BY', query, re.IGNORECASE) and \
           not re.search(r'LIMIT', query, re.IGNORECASE):

            optimized = query + ' LIMIT 100'

            return {
                'modified': True,
                'query': optimized,
                'optimization': 'limit_addition'
            }

        return {'modified': False, 'query': query}

    def _optimize_subqueries(self, query: str) -> Dict:
        """Convert subqueries to JOINs where possible"""

        # Simplified subquery to JOIN conversion
        # This would require more sophisticated analysis

        return {'modified': False, 'query': query}

    async def benchmark_query(self, query: str, iterations: int = 5) -> Dict:
        """Benchmark query performance"""

        execution_times = []
        total_rows = 0

        for i in range(iterations):
            start_time = time.time()

            try:
                async with self.engine.begin() as conn:
                    result = await conn.execute(text(query))
                    rows = result.fetchall()
                    total_rows = len(rows)

                execution_time = (time.time() - start_time) * 1000  # Convert to ms
                execution_times.append(execution_time)

            except Exception as e:
                logger.error(f"Benchmark iteration {i+1} failed: {e}")
                continue

        if not execution_times:
            return {'error': 'All benchmark iterations failed'}

        return {
            'query': query,
            'iterations': len(execution_times),
            'avg_execution_time': sum(execution_times) / len(execution_times),
            'min_execution_time': min(execution_times),
            'max_execution_time': max(execution_times),
            'total_rows': total_rows,
            'execution_times': execution_times
        }

    async def compare_queries(self, query1: str, query2: str) -> Dict:
        """Compare performance of two queries"""

        benchmark1 = await self.benchmark_query(query1)
        benchmark2 = await self.benchmark_query(query2)

        if 'error' in benchmark1 or 'error' in benchmark2:
            return {'error': 'One or both queries failed to execute'}

        improvement = (
            (benchmark1['avg_execution_time'] - benchmark2['avg_execution_time']) /
            benchmark1['avg_execution_time'] * 100
        )

        return {
            'query1': {
                'query': query1,
                'benchmark': benchmark1
            },
            'query2': {
                'query': query2,
                'benchmark': benchmark2
            },
            'performance_improvement': improvement,
            'recommendation': 'query2' if improvement > 0 else 'query1'
        }

    async def get_slow_queries(self, limit: int = 20) -> List[Dict]:
        """Get slow queries from metrics history"""

        # Filter slow queries
        slow_queries = [
            metric for metric in self.metrics_history
            if metric.execution_time > self.slow_query_threshold
        ]

        # Sort by execution time
        slow_queries.sort(key=lambda x: x.execution_time, reverse=True)

        # Group by query hash and aggregate
        query_groups = {}
        for metric in slow_queries[:limit]:
            if metric.query_hash not in query_groups:
                query_groups[metric.query_hash] = {
                    'query_hash': metric.query_hash,
                    'count': 0,
                    'total_time': 0,
                    'avg_time': 0,
                    'max_time': 0,
                    'last_seen': metric.timestamp
                }

            group = query_groups[metric.query_hash]
            group['count'] += 1
            group['total_time'] += metric.execution_time
            group['max_time'] = max(group['max_time'], metric.execution_time)
            group['last_seen'] = max(group['last_seen'], metric.timestamp)

        # Calculate averages
        for group in query_groups.values():
            group['avg_time'] = group['total_time'] / group['count']

        return list(query_groups.values())

    async def suggest_indexes_for_query(self, query: str) -> List[Dict]:
        """Suggest indexes for a specific query"""

        suggestions = []

        # Analyze WHERE clauses
        where_columns = self._extract_where_columns(query)
        for table, columns in where_columns.items():
            for column in columns:
                suggestions.append({
                    'type': 'single_column_index',
                    'table': table,
                    'columns': [column],
                    'index_name': f'idx_{table}_{column}',
                    'priority': 'high',
                    'reason': f'Column {column} used in WHERE clause'
                })

        # Analyze JOIN conditions
        join_columns = self._extract_join_columns(query)
        for join in join_columns:
            suggestions.append({
                'type': 'join_index',
                'table': join['table'],
                'columns': [join['column']],
                'index_name': f'idx_{join["table"]}_{join["column"]}',
                'priority': 'high',
                'reason': f'Column {join["column"]} used in JOIN'
            })

        # Analyze ORDER BY clauses
        order_columns = self._extract_order_columns(query)
        for table, columns in order_columns.items():
            suggestions.append({
                'type': 'sort_index',
                'table': table,
                'columns': columns,
                'index_name': f'idx_{table}_{"_".join(columns)}',
                'priority': 'medium',
                'reason': f'Columns {", ".join(columns)} used in ORDER BY'
            })

        return suggestions

    def _extract_where_columns(self, query: str) -> Dict[str, List[str]]:
        """Extract columns used in WHERE clauses"""

        # Simplified extraction - would need more sophisticated parsing
        where_columns = {}

        # Find WHERE clause
        where_match = re.search(r'WHERE\s+(.+?)(?:ORDER\s+BY|GROUP\s+BY|LIMIT|$)', query, re.IGNORECASE | re.DOTALL)
        if where_match:
            where_clause = where_match.group(1)

            # Extract table.column patterns
            column_matches = re.findall(r'(\w+)\.(\w+)\s*[=<>!]', where_clause)
            for table, column in column_matches:
                if table not in where_columns:
                    where_columns[table] = []
                if column not in where_columns[table]:
                    where_columns[table].append(column)

        return where_columns

    def _extract_join_columns(self, query: str) -> List[Dict]:
        """Extract columns used in JOIN conditions"""

        join_columns = []

        # Find JOIN clauses
        join_matches = re.findall(
            r'JOIN\s+(\w+)\s+.*?ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)',
            query,
            re.IGNORECASE
        )

        for match in join_matches:
            table1, col1, table2, col2 = match[1], match[2], match[3], match[4]

            join_columns.append({
                'table': table1,
                'column': col1
            })
            join_columns.append({
                'table': table2,
                'column': col2
            })

        return join_columns

    def _extract_order_columns(self, query: str) -> Dict[str, List[str]]:
        """Extract columns used in ORDER BY clauses"""

        order_columns = {}

        # Find ORDER BY clause
        order_match = re.search(r'ORDER\s+BY\s+(.+?)(?:LIMIT|$)', query, re.IGNORECASE)
        if order_match:
            order_clause = order_match.group(1)

            # Extract table.column patterns
            column_matches = re.findall(r'(\w+)\.(\w+)', order_clause)
            for table, column in column_matches:
                if table not in order_columns:
                    order_columns[table] = []
                if column not in order_columns[table]:
                    order_columns[table].append(column)

        return order_columns

    def _hash_query(self, query: str) -> str:
        """Generate hash for query identification"""

        normalized = self._normalize_query(query)
        return hashlib.md5(normalized.encode()).hexdigest()

    def _normalize_query(self, query: str) -> str:
        """Normalize query for comparison"""

        # Remove extra whitespace
        normalized = re.sub(r'\s+', ' ', query.strip())

        # Convert to uppercase
        normalized = normalized.upper()

        # Remove comments
        normalized = re.sub(r'--.*$', '', normalized, flags=re.MULTILINE)
        normalized = re.sub(r'/\*.*?\*/', '', normalized, flags=re.DOTALL)

        return normalized

    def _calculate_improvement(self, original: Dict, optimized: Dict) -> float:
        """Calculate estimated improvement percentage"""

        original_score = len(original.get('suggestions', []))
        optimized_score = len(optimized.get('suggestions', []))

        if original_score == 0:
            return 0.0

        improvement = (original_score - optimized_score) / original_score * 100
        return max(0, improvement)

    async def record_query_metrics(self, query: str, execution_time: float, rows_affected: int = 0):
        """Record query execution metrics"""

        query_hash = self._hash_query(query)

        metrics = QueryMetrics(
            query_hash=query_hash,
            execution_time=execution_time,
            rows_affected=rows_affected,
            memory_usage=0,  # Would be measured in practice
            cpu_usage=0.0,   # Would be measured in practice
            timestamp=datetime.now()
        )

        self.metrics_history.append(metrics)

        # Keep only recent metrics (last 1000)
        if len(self.metrics_history) > 1000:
            self.metrics_history = self.metrics_history[-1000:]

        # Analyze if this is a slow query
        if execution_time > self.slow_query_threshold:
            analysis = await self.analyze_query(query, execution_time)
            logger.warning(f"Slow query detected: {execution_time:.2f}ms - {analysis}")

    def get_query_statistics(self) -> Dict:
        """Get comprehensive query statistics"""

        if not self.metrics_history:
            return {'error': 'No metrics available'}

        total_queries = len(self.metrics_history)
        total_time = sum(m.execution_time for m in self.metrics_history)
        avg_time = total_time / total_queries

        slow_queries = [m for m in self.metrics_history if m.execution_time > self.slow_query_threshold]
        slow_query_percentage = (len(slow_queries) / total_queries) * 100

        return {
            'total_queries': total_queries,
            'average_execution_time': avg_time,
            'total_execution_time': total_time,
            'slow_queries': len(slow_queries),
            'slow_query_percentage': slow_query_percentage,
            'fastest_query': min(m.execution_time for m in self.metrics_history),
            'slowest_query': max(m.execution_time for m in self.metrics_history),
            'metrics_timeframe': {
                'start': min(m.timestamp for m in self.metrics_history).isoformat(),
                'end': max(m.timestamp for m in self.metrics_history).isoformat()
            }
        }


# Example usage functions
async def optimize_application_queries(db_engine):
    """Optimize common application queries"""

    optimizer = QueryOptimizer(db_engine)

    # Common queries to optimize
    queries_to_optimize = [
        "SELECT * FROM images WHERE user_id = 123",
        "SELECT i.*, a.label FROM images i LEFT JOIN annotations a ON i.id = a.image_id ORDER BY i.created_at DESC",
        "SELECT COUNT(*) FROM annotations WHERE label = 'logo'",
        "SELECT u.email, COUNT(i.id) as image_count FROM users u LEFT JOIN images i ON u.id = i.user_id GROUP BY u.id"
    ]

    optimization_results = []

    for query in queries_to_optimize:
        try:
            result = await optimizer.optimize_query(query)
            optimization_results.append(result)
            logger.info(f"Optimized query: {result['estimated_improvement']:.1f}% improvement")
        except Exception as e:
            logger.error(f"Failed to optimize query: {e}")

    return optimization_results


if __name__ == "__main__":
    # This would be called with proper database engine
    # asyncio.run(optimize_application_queries(engine))
    pass