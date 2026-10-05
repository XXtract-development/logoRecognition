import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Socket } from 'node:net';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { fetchLegacyImage, MAX_LEGACY_IMAGE_BYTES } from '../../services/legacy-image-fetch';

let status = 200; let contentType = 'image/png'; let chunks = [Buffer.from('png')]; let contentLength: string|undefined;
let options: any;
beforeEach(() => {
 vi.clearAllMocks(); status=200; contentType='image/png';chunks=[Buffer.from('png')];contentLength=undefined;
 vi.mocked(lookup).mockResolvedValue([{address:'8.8.8.8',family:4}] as any);
 vi.mocked(request).mockImplementation(((url:any, opts:any, callback:any) => {
   options=opts;
   const req:any = new EventEmitter();
   req.destroy = (err:any) => { req.emit('error',err);req.emit('close'); };
   req.end = () => queueMicrotask(() => {
     const res:any = new EventEmitter();res.statusCode=status;
     res.headers={'content-type':contentType,'content-length':contentLength};
     res.destroy = (err:any) => { if(err)res.emit('error',err);req.emit('close'); };
     callback(res);
     if(status===200 && contentType==='image/png' && Number(contentLength||0)<=MAX_LEGACY_IMAGE_BYTES) {
       for(const chunk of chunks)res.emit('data',chunk);
       res.emit('end');req.emit('close');
     }
   });
   return req;
 }) as any);
});
describe('real fetch boundary with mocked network transport', () => {
 it('pins validated DNS address while retaining hostname for TLS',async()=>{
   expect(await fetchLegacyImage('https://public.example/x.png')).toEqual(Buffer.from('png'));
   expect(options.agent).toBe(false);
   const cb=vi.fn();options.lookup('public.example',{},cb);expect(cb).toHaveBeenCalledWith(null,'8.8.8.8',4);
 });
 it('honors the all-addresses lookup signature without re-resolving the pinned host',async()=>{
   await fetchLegacyImage('https://public.example/x.png');
   const cb=vi.fn();options.lookup('public.example',{hints:32,all:true},cb);
   expect(cb).toHaveBeenCalledWith(null,[{address:'8.8.8.8',family:4}]);
   expect(lookup).toHaveBeenCalledTimes(1);
 });
 it.each([false,true])('passes actual Node socket lookup validation with autoSelectFamily=%s',async autoSelectFamily=>{
   await fetchLegacyImage('https://public.example/x.png');
   const pinnedLookup=options.lookup;
   const socket=new Socket();
   let observedAll: boolean|undefined;
   await new Promise<void>((resolve,reject)=>{
     // Node validates the actual callback shape; stop at lookup before any network connect.
     socket.once('error',reject);
     socket.once('lookup',(err,address,family,host)=>{
       socket.destroy();
       try {
         expect(err).toBeNull();expect(address).toBe('8.8.8.8');expect(family).toBe(4);
         expect(host).toBe('public.example');expect(Boolean(observedAll)).toBe(autoSelectFamily);
         resolve();
       } catch(error) { reject(error); }
     });
     socket.connect({host:'public.example',port:443,autoSelectFamily,
       lookup:(host,opts,cb)=>{observedAll=opts.all;pinnedLookup(host,opts,cb);},
     });
   }).finally(()=>socket.destroy());
   expect(lookup).toHaveBeenCalledTimes(1);
 });
 it.each([[{address:'127.0.0.1',family:4}], [{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}], []])('rejects non-public/mixed/empty DNS before request %#',async records=>{
   vi.mocked(lookup).mockResolvedValue(records as any);
   await expect(fetchLegacyImage('https://public.example/x')).rejects.toThrow();expect(request).not.toHaveBeenCalled();
 });
 it('refuses redirect instead of following Location',async()=>{status=302;await expect(fetchLegacyImage('https://public.example/x')).rejects.toThrow('redirects');expect(request).toHaveBeenCalledTimes(1);});
 it('rejects content length before reading',async()=>{contentLength=String(MAX_LEGACY_IMAGE_BYTES+1);await expect(fetchLegacyImage('https://public.example/x')).rejects.toThrow('oversized');});
 it('enforces chunked byte limit independently of content length',async()=>{chunks=[Buffer.alloc(MAX_LEGACY_IMAGE_BYTES+1)];await expect(fetchLegacyImage('https://public.example/x')).rejects.toThrow();});
 it('rejects wrong media type',async()=>{contentType='text/html';await expect(fetchLegacyImage('https://public.example/x')).rejects.toThrow('Unsupported');});
 it('bounds stalled network request',async()=>{
   vi.useFakeTimers();
   vi.mocked(request).mockImplementation((() => {
     const req:any=new EventEmitter();req.end=()=>{};req.destroy=(err:any)=>{req.emit('error',err);req.emit('close');};return req;
   }) as any);
   const pending=fetchLegacyImage('https://public.example/x'); const assertion=expect(pending).rejects.toThrow();
   await vi.advanceTimersByTimeAsync(15001);await assertion;vi.useRealTimers();
 });
});
