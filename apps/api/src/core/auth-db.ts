/**
 * MySQL Auth Database Connection
 * Connects to xxtractdb03 for user authentication against the xxtract-portal users table
 */

import mysql from 'mysql2/promise';
import { logger } from './logger';

let pool: mysql.Pool | null = null;

/**
 * Get or create the MySQL connection pool for auth
 */
export function getAuthPool(): mysql.Pool {
  if (!pool) {
    const connectionUrl = process.env.AUTH_DATABASE_URL;

    if (!connectionUrl) {
      throw new Error('AUTH_DATABASE_URL environment variable is required');
    }

    pool = mysql.createPool({
      uri: connectionUrl,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    logger.info('MySQL auth database pool created');
  }

  return pool;
}

/**
 * Execute a query against the auth database
 */
export async function authQuery<T extends mysql.RowDataPacket[]>(
  sql: string,
  params?: (string | number | boolean | null)[]
): Promise<T> {
  const p = getAuthPool();
  const [rows] = await p.execute<T>(sql, params);
  return rows;
}

/**
 * Close the auth database pool (for graceful shutdown)
 */
export async function closeAuthPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MySQL auth database pool closed');
  }
}
