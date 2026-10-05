import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import sharp from 'sharp';
import { randomFillSync } from 'node:crypto';
vi.mock('../../services/legacy-image-fetch', async original => ({ ...await original<typeof import('../../services/legacy-image-fetch')>(), fetchLegacyImage: vi.fn() }));
vi.mock('../../services/ml-client', () => ({ mlClient: { detectLogosFromBuffer: vi.fn() } }));
import { legacyDetectRoutes, toLegacyDetections } from '../../api/legacy-detect';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { fetchLegacyImage, isPublicIPv4, validateLegacyImageUrl, LegacyImageError } from '../../services/legacy-image-fetch';
const response = (detections: any[]) => ({ request_id:'r', detections, processing_time_ms:1, image_hash:'h', model_version:'ghs-model', review_proposals:[] as any[] });
const det = (overrides = {}) => ({ category:'GHSSymbolDescriptionCode', value:'FLAME', confidence:0.995, bbox:{ x:10,y:5,width:30,height:20 }, confidence_kind:'ghs_glyph_similarity', ...overrides });
describe('legacy output', () => {
  it('preserves scores, normalizes xyxy and deduplicates by highest score', () => {
    expect(toLegacyDetections(response([det(),det({confidence:0.999})]),100,50)).toEqual([expect.objectContaining({logo_code:'FLAME',confidence:0.999,bbox:[0.1,0.1,0.4,0.5],confidence_kind:'ghs_glyph_similarity',model_version:'ghs-model'})]);
  });
  it('does not promote review proposals', () => {
    const r=response([det({uncertain:true}),det({requires_review:true})]); r.review_proposals=[det()];
    expect(toLegacyDetections(r,100,50)).toEqual([]);
  });
  it.each([det({category:'PackagingMarkedLabelAccreditationCode',value:'MADE_UP',match_confidence:0.999}),det({category:'DietTypeCode',value:'FLAME'}),det({value:'MADE_UP'}),det({category:'unknown',value:'detected_logo'}),det({value:'NO_PICTOGRAM'}),det({value:'GHS99'}),det({confidence:NaN}),det({confidence:1.1}),det({bbox:{x:-1,y:0,width:1,height:1}}),det({bbox:{x:0,y:0,width:101,height:1}})])('drops invalid output %#', d => expect(toLegacyDetections(response([d]),100,50)).toEqual([]));
});
describe('URL security', () => {
  it.each(['127.0.0.1','10.1.2.3','192.168.1.1','172.31.0.1','169.254.169.254','100.64.0.1','0.0.0.0','198.18.0.1','192.0.2.1','203.0.113.1','::1','::ffff:8.8.8.8','224.1.1.1'])('rejects %s',a=>expect(isPublicIPv4(a)).toBe(false));
  it('permits public IP',()=>expect(isPublicIPv4('8.8.8.8')).toBe(true));
  it.each(['http://example.com/x','https://localhost/x','https://10.0.0.1/x','https://[::1]/x','https://u:p@example.com/x','https://example.com:444/x','https://example.com./x','https://example.com/x#x','https://2130706433/x'])('rejects URL %s',u=>expect(()=>validateLegacyImageUrl(u)).toThrow());
});
describe('route',()=>{
 let app:ReturnType<typeof Fastify>;
 const payload={image_url:'https://example.com/image.png',product_id:'product-123'};
 beforeEach(async()=>{process.env.LEGACY_DETECTION_API_KEY='integration-test';vi.clearAllMocks();app=Fastify();await app.register(legacyDetectRoutes);
 vi.mocked(fetchLegacyImage).mockResolvedValue(await sharp({create:{width:100,height:50,channels:3,background:'#fff'}}).png().toBuffer());
 vi.mocked(prisma.referenceLogo.findMany).mockResolvedValue([{t3777Code:'FLAME',fieldType:'GHSSymbolDescriptionCode'}, {t3777Code:'GREEN_DOT',fieldType:'PackagingMarkedLabelAccreditationCode'}] as any);
 vi.mocked(mlClient.detectLogosFromBuffer).mockResolvedValue(response([det()]));});
 afterEach(async()=>{await app.close();delete process.env.LEGACY_DETECTION_API_KEY;});
 const post=()=>app.inject({method:'POST',url:'/detect',headers:{'x-api-key':'integration-test'},payload});
 it('preserves old response and calls recognition client',async()=>{const r=await post();expect(r.statusCode).toBe(200);expect(r.json().product_id).toBe('product-123');expect(r.json().detections[0].bbox).toEqual([.1,.1,.4,.5]);expect(mlClient.detectLogosFromBuffer).toHaveBeenCalledWith(expect.any(Buffer),{confidenceThreshold:.99,returnEmbeddings:true});});
 it.each([undefined,'bad'])('rejects bad auth before fetching',async k=>{const r=await app.inject({method:'POST',url:'/detect',headers:k?{'x-api-key':k}:{},payload});expect(r.statusCode).toBe(401);expect(fetchLegacyImage).not.toHaveBeenCalled();});
 it('fails closed unconfigured',async()=>{delete process.env.LEGACY_DETECTION_API_KEY;expect((await post()).statusCode).toBe(503);expect(fetchLegacyImage).not.toHaveBeenCalled();});
 it('reports download errors before ML',async()=>{vi.mocked(fetchLegacyImage).mockRejectedValue(new LegacyImageError('Image exceeds size limit'));expect((await post()).statusCode).toBe(400);expect(mlClient.detectLogosFromBuffer).not.toHaveBeenCalled();});
 it('does not return empty success on model outage',async()=>{vi.mocked(mlClient.detectLogosFromBuffer).mockRejectedValue(new Error('secret-host'));const r=await post();expect(r.statusCode).toBe(502);expect(r.body).not.toContain('secret-host');});
 it('accepts canonical accreditation with real classification score',async()=>{
   vi.mocked(mlClient.detectLogosFromBuffer).mockResolvedValue(response([det({category:'PackagingMarkedLabelAccreditationCode',value:'GREEN_DOT',confidence:.995,match_confidence:.999})]));
   const r=await post();expect(r.json().detections[0]).toMatchObject({logo_code:'GREEN_DOT',confidence:.999,detector_confidence:.995,confidence_kind:'embedding-cosine-similarity'});
 });
 it('rejects a confident localization with weak classification',async()=>{
   vi.mocked(mlClient.detectLogosFromBuffer).mockResolvedValue(response([det({category:'PackagingMarkedLabelAccreditationCode',value:'GREEN_DOT',confidence:.995,match_confidence:.8})]));
   expect((await post()).json().detections).toEqual([]);
 });
 it('bounds concurrency before fetching and releases capacity after failure',async()=>{
   const resolvers:Array<(b:Buffer)=>void>=[];
   vi.mocked(fetchLegacyImage).mockImplementation(()=>new Promise(r=>resolvers.push(r)));
   const first=post();const second=post();
   await new Promise(r=>setTimeout(r,10));
   expect((await post()).statusCode).toBe(503);expect(fetchLegacyImage).toHaveBeenCalledTimes(2);
   for(const resolve of resolvers)resolve(Buffer.from('invalid'));
   await Promise.all([first,second]);
   vi.mocked(fetchLegacyImage).mockResolvedValue(Buffer.from('invalid'));
   expect((await post()).statusCode).toBe(400);
 });
 it('rejects normalized output larger than byte cap',async()=>{
   const width=2800,height=2800;
   const raw=randomFillSync(Buffer.alloc(width*height*3));
   const compressed=await sharp(raw,{raw:{width,height,channels:3}}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
   expect(compressed.length).toBeLessThan(20*1024*1024);
   vi.mocked(fetchLegacyImage).mockResolvedValue(compressed);
   const r=await post();expect(r.statusCode).toBe(400);expect(r.json().detail).toBe('Normalized image exceeds size limit');
   expect(mlClient.detectLogosFromBuffer).not.toHaveBeenCalled();
   vi.mocked(fetchLegacyImage).mockResolvedValue(Buffer.from('invalid'));
   expect((await post()).statusCode).toBe(400);
 },15000);
 it('rejects decoded pixel cap before ML',async()=>{
   vi.mocked(fetchLegacyImage).mockResolvedValue(await sharp({create:{width:3000,height:3000,channels:3,background:'#fff'}}).png().toBuffer());
   const r=await post();expect(r.statusCode).toBe(400);expect(mlClient.detectLogosFromBuffer).not.toHaveBeenCalled();
 });
 it('honors EXIF orientation in ML pixels and corresponding bbox',async()=>{
   const raw=Buffer.alloc(4*8*3);
   for(let y=0;y<8;y++)for(let x=0;x<4;x++){const i=(y*4+x)*3;raw[i]=y<4?255:0;raw[i+2]=y<4?0:255;}
   const jpeg=await sharp(raw,{raw:{width:4,height:8,channels:3}}).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();
   vi.mocked(fetchLegacyImage).mockResolvedValue(jpeg);
   vi.mocked(mlClient.detectLogosFromBuffer).mockResolvedValue(response([det({bbox:{x:4,y:0,width:4,height:4}})]));
   const r=await post();expect(r.statusCode).toBe(200);
   const data=vi.mocked(mlClient.detectLogosFromBuffer).mock.calls[0][0];
   const pixels=await sharp(data).raw().toBuffer({resolveWithObject:true});
   expect([pixels.info.width,pixels.info.height]).toEqual([8,4]);
   expect(pixels.data[2]).toBeGreaterThan(pixels.data[0]);
   expect(pixels.data[7*3]).toBeGreaterThan(pixels.data[7*3+2]);
   expect(r.json().detections[0].bbox).toEqual([.5,0,1,1]);
 });
 it('rejects invalid decoded image',async()=>{vi.mocked(fetchLegacyImage).mockResolvedValue(Buffer.from('invalid'));expect((await post()).statusCode).toBe(400);});
});
