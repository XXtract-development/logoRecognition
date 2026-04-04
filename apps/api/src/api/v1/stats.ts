/**
 * Stats Routes
 * Provides dashboard statistics for the frontend
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authMiddleware, optionalAuth } from '../../middleware/auth';
import { createLogger } from '../../core/logger';

const logger = createLogger('stats');

// ============================================
// Types
// ============================================

interface DashboardStats {
  totalRecognitions: number;
  successRate: number;
  averageTime: number;
  todayCount: number;
}

interface RecentActivity {
  key: string;
  image: string;
  logos: number;
  confidence: number;
  time: string;
  timestamp: string;
}

interface StatsResponse {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
  timestamp: string;
}

// In-memory stats storage (in production, this would come from database)
// This gets updated by the recognition routes
const statsStore = {
  totalRecognitions: 0,
  successfulRecognitions: 0,
  totalProcessingTimeMs: 0,
  todayRecognitions: 0,
  todayDate: new Date().toDateString(),
  recentActivity: [] as RecentActivity[],
};

// ============================================
// Stats Management Functions (exported for use by recognition routes)
// ============================================

export function recordRecognition(
  imageName: string,
  logosFound: number,
  confidence: number,
  processingTimeMs: number,
  success: boolean
): void {
  // Reset daily count if new day
  const today = new Date().toDateString();
  if (statsStore.todayDate !== today) {
    statsStore.todayRecognitions = 0;
    statsStore.todayDate = today;
  }

  statsStore.totalRecognitions++;
  statsStore.todayRecognitions++;
  statsStore.totalProcessingTimeMs += processingTimeMs;

  if (success) {
    statsStore.successfulRecognitions++;
  }

  // Add to recent activity (keep last 20)
  const activity: RecentActivity = {
    key: crypto.randomUUID(),
    image: imageName,
    logos: logosFound,
    confidence,
    time: getRelativeTime(new Date()),
    timestamp: new Date().toISOString(),
  };

  statsStore.recentActivity.unshift(activity);
  if (statsStore.recentActivity.length > 20) {
    statsStore.recentActivity.pop();
  }

  logger.debug('Recognition recorded', {
    totalRecognitions: statsStore.totalRecognitions,
    todayCount: statsStore.todayRecognitions,
  });
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// Update relative times periodically (called internally)
function updateRelativeTimes(): void {
  statsStore.recentActivity = statsStore.recentActivity.map((activity) => ({
    ...activity,
    time: getRelativeTime(new Date(activity.timestamp)),
  }));
}

// ============================================
// Routes
// ============================================

export async function statsRoutes(fastify: FastifyInstance) {
  // Apply optional auth to all routes (user info available if logged in)
  fastify.addHook('preHandler', optionalAuth);

  /**
   * GET /stats
   * Get dashboard statistics
   */
  fastify.get(
    '/stats',
    {
      schema: {
        description: 'Get dashboard statistics',
        tags: ['Stats'],
        response: {
          200: {
            type: 'object',
            properties: {
              stats: {
                type: 'object',
                properties: {
                  totalRecognitions: { type: 'number' },
                  successRate: { type: 'number' },
                  averageTime: { type: 'number' },
                  todayCount: { type: 'number' },
                },
              },
              recentActivity: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    image: { type: 'string' },
                    logos: { type: 'number' },
                    confidence: { type: 'number' },
                    time: { type: 'string' },
                    timestamp: { type: 'string' },
                  },
                },
              },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Update relative times before returning
      updateRelativeTimes();

      // Reset daily count if new day
      const today = new Date().toDateString();
      if (statsStore.todayDate !== today) {
        statsStore.todayRecognitions = 0;
        statsStore.todayDate = today;
      }

      // Calculate stats
      const successRate =
        statsStore.totalRecognitions > 0
          ? (statsStore.successfulRecognitions / statsStore.totalRecognitions) * 100
          : 0;

      const averageTime =
        statsStore.totalRecognitions > 0
          ? statsStore.totalProcessingTimeMs / statsStore.totalRecognitions / 1000
          : 0;

      const response: StatsResponse = {
        stats: {
          totalRecognitions: statsStore.totalRecognitions,
          successRate: Math.round(successRate * 10) / 10,
          averageTime: Math.round(averageTime * 100) / 100,
          todayCount: statsStore.todayRecognitions,
        },
        recentActivity: statsStore.recentActivity.slice(0, 10),
        timestamp: new Date().toISOString(),
      };

      return reply.send(response);
    }
  );

  /**
   * POST /stats/demo
   * Add demo data for testing (only in development)
   */
  if (process.env.NODE_ENV !== 'production') {
    fastify.post(
      '/stats/demo',
      {
        schema: {
          description: 'Add demo recognition data (development only)',
          tags: ['Stats'],
        },
      },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        // Add some demo data
        const demoItems = [
          { image: 'product-001.jpg', logos: 3, confidence: 0.95, time: 1200 },
          { image: 'banner-023.png', logos: 1, confidence: 0.87, time: 800 },
          { image: 'photo-156.jpg', logos: 2, confidence: 0.92, time: 1500 },
          { image: 'logo-scan.png', logos: 4, confidence: 0.98, time: 950 },
          { image: 'brand-image.jpg', logos: 1, confidence: 0.76, time: 1100 },
        ];

        for (const item of demoItems) {
          recordRecognition(
            item.image,
            item.logos,
            item.confidence,
            item.time,
            item.confidence > 0.5
          );
        }

        logger.info('Demo data added to stats');

        return reply.send({
          message: 'Demo data added',
          count: demoItems.length,
        });
      }
    );
  }
}

export default statsRoutes;
