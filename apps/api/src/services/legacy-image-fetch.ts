import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';

export const MAX_LEGACY_IMAGE_BYTES = 20 * 1024 * 1024;
export class LegacyImageError extends Error {}

/** Conservatively reject IPv6 and every IPv4 special-use range. */
export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113));
}

export function validateLegacyImageUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new LegacyImageError('Invalid image URL'); }
  if (url.protocol !== 'https:' || url.username || url.password ||
    (url.port && url.port !== '443') || url.hash || url.hostname.endsWith('.') ||
    url.hostname === 'localhost' || !url.hostname.includes('.') ||
    (isIP(url.hostname) !== 0 && !isPublicIPv4(url.hostname))) {
    throw new LegacyImageError('Only public HTTPS image URLs are allowed');
  }
  return url;
}

export async function fetchLegacyImage(value: string): Promise<Buffer> {
  const url = validateLegacyImageUrl(value);
  let dnsTimer: NodeJS.Timeout | undefined;
  let addresses: Awaited<ReturnType<typeof lookup>>[];
  try {
    addresses = await Promise.race([
      lookup(url.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        dnsTimer = setTimeout(() => reject(new LegacyImageError('Image lookup timed out')), 5000);
      }),
    ]);
  } catch { throw new LegacyImageError('Image host unavailable'); }
  finally { clearTimeout(dnsTimer); }
  if (!addresses.length || addresses.some(({ address }) => !isPublicIPv4(address))) {
    throw new LegacyImageError('Image host must resolve exclusively to public IPv4 addresses');
  }
  const pinned = addresses[0].address;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET', agent: false,
      headers: { Accept: 'image/png,image/jpeg,image/webp' },
      // Keep original hostname for TLS verification/SNI, pin the network destination.
      lookup: (_host, _options, callback) => callback(null, pinned, 4),
    }, res => {
      if (res.statusCode !== 200) {
        res.destroy(); reject(new LegacyImageError('Image download failed; redirects are not allowed')); return;
      }
      if (!/^image\/(png|jpeg|webp)(?:;|$)/i.test(String(res.headers['content-type'] || '')) ||
        Number(res.headers['content-length'] || 0) > MAX_LEGACY_IMAGE_BYTES) {
        res.destroy(); reject(new LegacyImageError('Unsupported or oversized image')); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_LEGACY_IMAGE_BYTES) {
          res.destroy(new LegacyImageError('Image exceeds size limit')); return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', () => reject(new LegacyImageError('Image download failed')));
      res.on('aborted', () => reject(new LegacyImageError('Image download interrupted')));
    });
    const timer = setTimeout(() => req.destroy(new LegacyImageError('Image download timed out')), 15000);
    req.once('close', () => clearTimeout(timer));
    req.on('error', () => reject(new LegacyImageError('Image download failed')));
    req.end();
  });
}
