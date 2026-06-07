/**
 * Mediaserver Client — Epic 8, Story 8.1
 *
 * Fetches artwork metadata and files from the mediaserver.
 * Contract verified 2026-06-04 against acc environment.
 *
 * Discovery endpoint:
 *   GET {MEDIASERVER_DOMAIN}/uploaded?gtin={gtin}
 *   → { gln, gtin, active: [{id, fileName, previewUrl, typeInfo, active, createdAt}], inactive: [...] }
 *   The endpoint filters internally on service='LABEL'. PACKAGING_ARTWORK records have this service.
 *
 * File download:
 *   GET {MEDIASERVER_DOMAIN}{previewUrl} → binary file (e.g. image/jpeg)
 *
 * Note: /uploaded is accessible without API key auth; rate-aware importing is
 * enforced via ARTWORK_IMPORT_CONCURRENCY (default 3).
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../core/logger';

// ============================================
// Types
// ============================================

export interface MediaItem {
  id: string;
  fileName: string;
  previewUrl: string;
  typeInfo: string;
  active: boolean;
  createdAt: string;
  /**
   * GLN of the owning party (Story 8-3O, S3/D1 prerequisite). Surfaced per-item
   * from the discovery response's top-level `gln` so the import can persist it
   * on artwork_imports — the catalog declaration provider (8-3D) needs it.
   */
  gln?: string;
}

export interface MediaDiscoveryResponse {
  gln: string;
  gtin: string;
  active: MediaItem[];
  inactive: MediaItem[];
}

/**
 * Derive the owning party's GLN from a mediaserver previewUrl. The LIVE
 * discovery response has NO top-level gln field (verified against ACC,
 * 2026-06-07), but every previewUrl is structured as /{gln}/{typeInfo}/...
 * Exported for direct testing (the module is mocked in the global test setup).
 */
export function deriveGlnFromPreviewUrl(previewUrl?: string): string | undefined {
  return previewUrl?.match(/^\/(\d{13})\//)?.[1];
}

export class MediaServerError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly gtin?: string
  ) {
    super(message);
    this.name = 'MediaServerError';
  }
}

// ============================================
// Client
// ============================================

export class MediaServerClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.MEDIASERVER_DOMAIN ||
      'https://media.acc.xxtract.com';

    this.client = axios.create({
      baseURL: this.baseUrl,
      // Discovery calls are fast; file downloads may be large
      timeout: 60000,
      headers: {
        'User-Agent': 'LogoRecognition-ArtworkImporter/1.0',
      },
    });

    this.client.interceptors.request.use(
      (config) => {
        logger.debug('MediaServer request', { method: config.method, url: config.url });
        return config;
      },
      (error) => {
        logger.error('MediaServer request setup error', { error: (error as Error).message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error('MediaServer response error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Discover all PACKAGING_ARTWORK media items for a GTIN.
   * Returns only items where typeInfo === 'PACKAGING_ARTWORK' from both
   * active and inactive arrays.
   */
  async discoverArtwork(gtin: string): Promise<MediaItem[]> {
    try {
      const response = await this.client.get<MediaDiscoveryResponse>('/uploaded', {
        params: { gtin },
      });

      const data = response.data;
      const all = [...(data.active ?? []), ...(data.inactive ?? [])];
      return all
        .filter((item) => item.typeInfo === 'PACKAGING_ARTWORK')
        // The live mediaserver returns numeric ids; our schema and the
        // @@unique([mediaId]) dedup expect strings (found with real ACC data,
        // 2026-06-05: "Expected String, provided Int" crashed the import run).
        // Surface the gln per-item (Story 8-3O) without changing the array
        // return shape callers/tests rely on. The LIVE discovery response has
        // NO top-level gln field (verified against ACC, 2026-06-07) — but the
        // mediaserver structures every previewUrl as /{gln}/{typeInfo}/... so
        // we derive it from the first path segment, with the (typed but in
        // practice absent) response-level gln as preferred source if it ever
        // appears.
        .map((item) => ({
          ...item,
          id: String(item.id),
          gln: data.gln ?? deriveGlnFromPreviewUrl(item.previewUrl),
        }));
    } catch (error) {
      if (error instanceof AxiosError) {
        const status = error.response?.status;
        if (status === 404) {
          // GTIN not found in mediaserver → treat as "no artwork" (soft fail)
          logger.debug('MediaServer: GTIN not found', { gtin });
          return [];
        }
        throw new MediaServerError(
          `MediaServer discovery failed for GTIN ${gtin}: ${error.message}`,
          status,
          gtin
        );
      }
      throw new MediaServerError(
        `MediaServer discovery error for GTIN ${gtin}: ${(error as Error).message}`,
        undefined,
        gtin
      );
    }
  }

  /**
   * Download a media item file.
   * @param previewUrl — the previewUrl from the discovery response (path starting with /)
   * @returns Buffer with the file content and content-type header
   */
  async downloadFile(previewUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      const response = await this.client.get<Buffer>(previewUrl, {
        responseType: 'arraybuffer',
        // Allow larger files (artwork can be several MB)
        timeout: 120000,
      });

      const buffer = Buffer.from(response.data);
      const mimeType =
        (response.headers['content-type'] as string | undefined)?.split(';')[0]?.trim() ||
        'application/octet-stream';

      return { buffer, mimeType };
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new MediaServerError(
          `MediaServer file download failed for ${previewUrl}: ${error.message}`,
          error.response?.status
        );
      }
      throw new MediaServerError(
        `MediaServer file download error for ${previewUrl}: ${(error as Error).message}`
      );
    }
  }
}

// Singleton — override in tests by mocking this module
export const mediaServerClient = new MediaServerClient();
