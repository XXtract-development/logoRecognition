import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
vi.unmock('../../services/storage');
import { InMemoryStorageAdapter } from '../../services/in-memory-storage-adapter';
import { getSignedUrl, getReferenceLogoUrl, MAX_PREVIEW_BYTES, PREVIEW_TIMEOUT_MS,
  readPreviewImage, resetStorageAdapter, setStorageAdapter } from '../../services/storage';
import { storagePreviewRoutes } from '../../api/v1/storage-preview';

const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
let adapter: InMemoryStorageAdapter;
beforeEach(async () => {
  vi.stubEnv('JWT_SECRET','unit-preview-secret-with-domain-separation');
  adapter = new InMemoryStorageAdapter();setStorageAdapter(adapter);
  await adapter.makeBucket('training-images');
  await adapter.putObject('training-images','user/image.png',png);
});
afterEach(() => {resetStorageAdapter();vi.unstubAllEnvs();vi.useRealTimers();});

async function app() {const server=Fastify();await server.register(storagePreviewRoutes,{prefix:'/api/v1'});return server;}
async function signed() {return (await getSignedUrl('training-images/user/image.png'))!;}

describe('private same-origin signed storage previews',()=>{
  it('serves uploaded bytes without credentials and keeps storage private/internal links out',async()=>{
    const presign=vi.spyOn(adapter,'presignedGetObject');
    const url=await signed();expect(url.startsWith('/api/v1/storage/preview?')).toBe(true);
    expect(url).not.toContain('minio');expect(presign).not.toHaveBeenCalled();
    const server=await app();try {
      const response=await server.inject(url);expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(png);expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    } finally {await server.close();}
  });
  it('signs bare reference keys in training bucket and preserves 24-hour export expiry',async()=>{
    const url=new URL((await getReferenceLogoUrl('reference-logos/GREEN_DOT/v1.png',86400))!,'https://app.example');
    expect(url.searchParams.get('bucket')).toBe('training-images');
    expect(url.searchParams.get('key')).toBe('reference-logos/GREEN_DOT/v1.png');
    expect(Number(url.searchParams.get('expires'))-Math.floor(Date.now()/1000)).toBe(86400);
  });
  it.each(['bucket','key','expires','signature'])('rejects changed %s before any storage access',async field=>{
    const url=new URL(await signed(),'https://app.example');
    url.searchParams.set(field,field==='expires'?String(Math.floor(Date.now()/1000)+50):'wrong');
    const read=vi.spyOn(adapter,'getObject');const server=await app();try {
      expect((await server.inject(url.pathname+url.search)).statusCode).toBe(403);expect(read).not.toHaveBeenCalled();
    } finally {await server.close();}
  });
  it('rejects expired signatures before read',async()=>{
    vi.useFakeTimers();const url=(await getSignedUrl('training-images/user/image.png',1))!;
    await vi.advanceTimersByTimeAsync(2000);const read=vi.spyOn(adapter,'getObject');const server=await app();
    try {expect((await server.inject(url)).statusCode).toBe(403);expect(read).not.toHaveBeenCalled();} finally {await server.close();}
  });
  it('uses a domain-separated non-JWT signature',async()=>{
    const url=new URL(await signed(),'https://app.example');const expiry=Number(url.searchParams.get('expires'));
    const ordinary=crypto.createHmac('sha256',process.env.JWT_SECRET!).update(JSON.stringify(['training-images','user/image.png',expiry])).digest('hex');
    expect(url.searchParams.get('signature')).not.toBe(ordinary);
    url.searchParams.set('signature',ordinary);const server=await app();try {
      expect((await server.inject(url.pathname+url.search)).statusCode).toBe(403);
    } finally {await server.close();}
  });
  it.each(['unknown/x.png','training-images/../x.png','training-images/a//x.png','training-images/a\\x.png','training-images/'])('does not mint invalid path %s',async path=>{
    expect(await getSignedUrl(path)).toBeNull();
  });
  it.each([0,-1,86401,1.5])('does not mint unsupported expiry %s',async expiry=>{
    expect(await getSignedUrl('training-images/user/image.png',expiry)).toBeNull();
  });
  it('fails closed when signing secret is unavailable',async()=>{
    vi.stubEnv('JWT_SECRET','');expect(await getSignedUrl('training-images/user/image.png')).toBeNull();
  });
  it.each([['image/jpeg',Buffer.from([255,216,255,0])],['image/webp',Buffer.from('RIFF1234WEBP')]])('serves raster format %s based on bytes',async(mime,bytes)=>{
    await adapter.putObject('training-images','user/image.png',bytes);
    const server=await app();try {const response=await server.inject(await signed());expect(response.statusCode).toBe(200);expect(response.headers['content-type']).toBe(mime);} finally {await server.close();}
  });
  it('rejects active HTML/SVG and non-image model data',async()=>{
    await adapter.putObject('training-images','user/image.png',Buffer.from('<svg onload="alert(1)"></svg>'));
    const server=await app();try {expect((await server.inject(await signed())).statusCode).toBe(415);} finally {await server.close();}
  });
  it('destroys oversized streams without trusting stored metadata',async()=>{
    const stream=Readable.from([Buffer.alloc(MAX_PREVIEW_BYTES+1)]);vi.spyOn(adapter,'getObject').mockResolvedValue(stream);
    await expect(readPreviewImage('training-images','user/image.png')).rejects.toMatchObject({statusCode:413});expect(stream.destroyed).toBe(true);
  });
  it('times out stalled reads and releases finished admission',async()=>{
    vi.useFakeTimers();const stream=new Readable({read(){}});const getter=vi.spyOn(adapter,'getObject').mockResolvedValueOnce(stream);
    const pending=readPreviewImage('training-images','user/image.png');const assertion=expect(pending).rejects.toMatchObject({statusCode:504});
    await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS+1);await assertion;expect(stream.destroyed).toBe(true);
    getter.mockRestore();expect((await readPreviewImage('training-images','user/image.png')).buffer).toEqual(png);
  });
  it('retains all four admission slots during timed-out object openings and destroys late streams',async()=>{
    vi.useFakeTimers();let open!: (stream:Readable)=>void;
    const opening=new Promise<Readable>(resolve=>{open=resolve;});const getter=vi.spyOn(adapter,'getObject').mockReturnValue(opening);
    const requests=Array.from({length:4},()=>readPreviewImage('training-images','user/image.png'));
    const assertions=requests.map(pending=>expect(pending).rejects.toMatchObject({statusCode:504}));
    await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS+1);await Promise.all(assertions);
    await expect(readPreviewImage('training-images','user/image.png')).rejects.toMatchObject({statusCode:503});
    const late=new Readable({read(){}});open(late);await vi.advanceTimersByTimeAsync(0);expect(late.destroyed).toBe(true);
    getter.mockRestore();expect((await readPreviewImage('training-images','user/image.png')).buffer).toEqual(png);
  });
});
