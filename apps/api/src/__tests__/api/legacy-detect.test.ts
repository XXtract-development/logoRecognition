import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import sharp from 'sharp';
import { randomFillSync } from 'node:crypto';
vi.mock('../../services/legacy-image-fetch', async original => ({ ...await original<typeof import('../../services/legacy-image-fetch')>(), fetchLegacyImage: vi.fn() }));
vi.mock('../../services/ml-client', () => ({ mlClient: { detectLogosFromBuffer: vi.fn(), localizeArtwork: vi.fn(), classifyArtwork: vi.fn() } }));
import { legacyDetectRoutes, toLegacyArtworkResults } from '../../api/legacy-detect';
import prisma from '../../core/db';
import { mlClient } from '../../services/ml-client';
import { fetchLegacyImage, isPublicIPv4, validateLegacyImageUrl, LegacyImageError } from '../../services/legacy-image-fetch';
const GHS_CODES=['CORROSION','ENVIRONMENT','EXCLAMATION_MARK','EXPLODING_BOMB','FLAME','FLAME_OVER_CIRCLE','GAS_CYLINDER','HEALTH_HAZARD','SKULL_AND_CROSSBONES'];
const box={x:10,y:5,width:30,height:20};
const refs=[{t3777Code:'GREEN_DOT',fieldType:'PackagingMarkedLabelAccreditationCode'}, {t3777Code:'NUTRISCORE_A',fieldType:'NutritionalScore'}, {t3777Code:'FLAME',fieldType:'GHSSymbolDescriptionCode'}];
const result=(overrides={})=>({t3777_code:'GREEN_DOT',confidence:.999,method:'embedding',bbox:box,...overrides});
describe('trained classification output',()=>{
 it('preserves actual classification score and highest code with normalized box',()=>{
  expect(toLegacyArtworkResults([result({confidence:.995}),result()],100,50,refs,[box]).detections).toEqual([expect.objectContaining({logo_code:'GREEN_DOT',confidence:.999,bbox:[.1,.1,.4,.5],confidence_kind:'embedding-cosine-similarity'})]);
 });
 it('never automatically confirms GHS even when upstream review flag omitted',()=>{
  const r=toLegacyArtworkResults([result({t3777_code:'FLAME',confidence:1,method:'ghs-glyph'})],100,50,refs,[box]);
  expect(r.detections).toEqual([]);expect(r.review_proposals).toEqual([expect.objectContaining({logo_code:'FLAME',requires_review:true})]);
 });
 it.each([result({uncertain:true}),result({requires_review:true}),result({confidence:.8})])('keeps doubt as proposal %#',d=>{
  const r=toLegacyArtworkResults([d],100,50,refs,[box]);expect(r.detections).toEqual([]);expect(r.review_proposals).toHaveLength(1);
 });
 it.each([result({t3777_code:'MADE_UP'}),result({t3777_code:'NO_PICTOGRAM'}),result({confidence:NaN}),result({confidence:1.1}),result({method:'mock'}),result({bbox:{x:-1,y:0,width:1,height:1}}),result({bbox:{x:0,y:0,width:101,height:1}}),result({bbox:{x:0,y:0,width:1,height:1}})])('rejects invalid or unrequested result %#',d=>expect(toLegacyArtworkResults([d],100,50,refs,[box]).detections).toEqual([]));
 it('rejects ambiguous category evidence',()=>expect(toLegacyArtworkResults([result()],100,50,[...refs,{t3777Code:'GREEN_DOT',fieldType:'DietTypeCode'}],[box]).detections).toEqual([]));
});
describe('URL security',()=>{
 it.each(['127.0.0.1','10.1.2.3','192.168.1.1','172.31.0.1','169.254.169.254','100.64.0.1','0.0.0.0','198.18.0.1','192.0.2.1','203.0.113.1','::1','::ffff:8.8.8.8','224.1.1.1'])('rejects %s',a=>expect(isPublicIPv4(a)).toBe(false));
 it('permits public IPv4',()=>expect(isPublicIPv4('8.8.8.8')).toBe(true));
 it.each(['http://example.com/x','https://localhost/x','https://10.0.0.1/x','https://[::1]/x','https://u:p@example.com/x','https://example.com:444/x','https://example.com./x','https://example.com/x#x','https://2130706433/x'])('rejects URL %s',u=>expect(()=>validateLegacyImageUrl(u)).toThrow());
});
describe('trained legacy route',()=>{
 let app:ReturnType<typeof Fastify>;
 const payload={image_url:'https://example.com/image.png',product_id:'product-123'};
 const post=()=>app.inject({method:'POST',url:'/detect',headers:{'x-api-key':'integration-test'},payload});
 beforeEach(async()=>{
  process.env.LEGACY_DETECTION_API_KEY='integration-test';vi.clearAllMocks();app=Fastify();await app.register(legacyDetectRoutes);
  vi.mocked(fetchLegacyImage).mockResolvedValue(await sharp({create:{width:100,height:50,channels:3,background:'#fff'}}).png().toBuffer());
  vi.mocked(prisma.referenceLogo.findMany).mockResolvedValue(refs as any);
  vi.mocked(mlClient.localizeArtwork).mockResolvedValue({detections:[{bbox:box}],truncated:false});
  vi.mocked(mlClient.classifyArtwork).mockResolvedValue({results:[result()]});
 });
 afterEach(async()=>{await app.close();delete process.env.LEGACY_DETECTION_API_KEY;});
 it('uses trained localization and classification, never generic detector',async()=>{
  const r=await post();expect(r.statusCode).toBe(200);expect(r.json().product_id).toBe('product-123');expect(r.json().detections[0].bbox).toEqual([.1,.1,.4,.5]);
  expect(mlClient.detectLogosFromBuffer).not.toHaveBeenCalled();
  expect(mlClient.localizeArtwork).toHaveBeenCalledWith({proposal_strategy:'visual',strict_runtime:true,remaining_budget_ms:expect.any(Number),image_b64:expect.any(String),codes:expect.arrayContaining(['GREEN_DOT','NUTRISCORE_A',...GHS_CODES])},{timeoutMs:expect.any(Number)});
  expect(mlClient.classifyArtwork).toHaveBeenCalledWith({strict_runtime:true,remaining_budget_ms:expect.any(Number),image_b64:expect.any(String),crops:[box],confidence_threshold:.99,persist_crops:false},{timeoutMs:expect.any(Number)});
  expect(vi.mocked(mlClient.localizeArtwork).mock.calls[0][0].image_b64).toBe(vi.mocked(mlClient.classifyArtwork).mock.calls[0][0].image_b64);
 });
 it('preserves actual corroboration evidence and score',async()=>{
  const evidence={head_letter:'A',head_score:.875,trained_model:{prediction:'A'}};
  vi.mocked(mlClient.classifyArtwork).mockResolvedValue({results:[result({t3777_code:'NUTRISCORE_A',method:'nutriscore-a2',confidence:.999698877,evidence})]});
  const r=await post();expect(r.json().detections[0].confidence).toBe(.999698877);expect(r.json().detections[0].evidence).toEqual(evidence);
 });
 it('preserves original large label dimensions above former pixel cap',async()=>{
  vi.mocked(fetchLegacyImage).mockResolvedValue(await sharp({create:{width:4500,height:2000,channels:3,background:'#fff'}}).png().toBuffer());
  const r=await post();expect(r.statusCode).toBe(200);
  const bytes=Buffer.from(vi.mocked(mlClient.classifyArtwork).mock.calls[0][0].image_b64!,'base64');
  const metadata=await sharp(bytes).metadata();expect([metadata.width,metadata.height]).toEqual([4500,2000]);
  expect(r.json().detections[0].bbox).toEqual([10/4500,5/2000,40/4500,25/2000]);
 });
 it.each(GHS_CODES)('includes specialist %s without any GHS reference row and keeps review',async code=>{
  vi.mocked(prisma.referenceLogo.findMany).mockResolvedValue(refs.filter(ref=>ref.fieldType!=='GHSSymbolDescriptionCode') as any);
  vi.mocked(mlClient.classifyArtwork).mockResolvedValue({results:[result({t3777_code:code,confidence:1,method:'ghs-specialist',requires_review:undefined,uncertain:false})]});
  const response=await post();expect(response.statusCode).toBe(200);
  const requested=vi.mocked(mlClient.localizeArtwork).mock.calls[0][0].codes!;
  expect([...requested].sort()).toEqual(['GREEN_DOT','NUTRISCORE_A',...GHS_CODES].sort());
  expect(requested).not.toContain('NO_PICTOGRAM');expect(requested.some(code=>/^GHS\d+$/.test(code))).toBe(false);
  expect(response.json().detections).toEqual([]);
  expect(response.json().review_proposals).toEqual([expect.objectContaining({logo_code:code,confidence:1,requires_review:true,product_id:'product-123',bbox:[.1,.1,.4,.5]})]);
 });
 it('bounds catalog SQL on the transaction connection',async()=>{
   await post();expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),{maxWait:1000,timeout:5000});
   const sql=vi.mocked(prisma.$queryRaw).mock.calls[0];expect(String(sql[0])).toContain('statement_timeout');expect(sql[1]).toBe('5000');
 });
 it('reports query cancellation and releases capacity',async()=>{
   vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('canceling statement due to statement timeout'));
   expect((await post()).statusCode).toBe(502);expect(mlClient.localizeArtwork).not.toHaveBeenCalled();
   expect((await post()).statusCode).toBe(200);
 });
 it('fails empty catalog before upstream whole-library interpretation',async()=>{vi.mocked(prisma.referenceLogo.findMany).mockResolvedValue([]);expect((await post()).statusCode).toBe(503);expect(mlClient.localizeArtwork).not.toHaveBeenCalled();});
 it.each([
   [],[result(),result()], [result({bbox:{x:0,y:0,width:1,height:1}})],
   [result({confidence:NaN})], [result({confidence:1.5})], [result({method:'mock'})],
 ])('requires complete valid classification before filtering %#',async results=>{vi.mocked(mlClient.classifyArtwork).mockResolvedValue({results});expect((await post()).statusCode).toBe(502);});
 it('accepts a complete legitimate UNKNOWN negative',async()=>{vi.mocked(mlClient.classifyArtwork).mockResolvedValue({results:[result({t3777_code:'UNKNOWN',confidence:0,uncertain:true})]});const r=await post();expect(r.statusCode).toBe(200);expect(r.json().detections).toEqual([]);});
 it('preserves positive A2 score and method',async()=>{vi.mocked(mlClient.classifyArtwork).mockResolvedValue({results:[result({t3777_code:'NUTRISCORE_A',method:'nutriscore-a2',confidence:.999})]});expect((await post()).json().detections[0]).toMatchObject({logo_code:'NUTRISCORE_A',method:'nutriscore-a2',confidence:.999,confidence_kind:'classifier-softmax'});});
 it('preserves GHS as review proposal',async()=>{vi.mocked(mlClient.classifyArtwork).mockResolvedValue({results:[result({t3777_code:'FLAME',method:'ghs-specialist',confidence:1})]});const r=(await post()).json();expect(r.detections).toEqual([]);expect(r.review_proposals[0]).toMatchObject({logo_code:'FLAME',requires_review:true});});
 it('does not classify whole image when no valid regions exist',async()=>{vi.mocked(mlClient.localizeArtwork).mockResolvedValue({detections:[],truncated:false});expect((await post()).json().detections).toEqual([]);expect(mlClient.classifyArtwork).not.toHaveBeenCalled();});
 it('reports malformed localization instead of silently dropping regions',async()=>{vi.mocked(mlClient.localizeArtwork).mockResolvedValue({detections:[{bbox:{x:-1,y:0,width:1,height:1}}],truncated:false});expect((await post()).statusCode).toBe(502);expect(mlClient.classifyArtwork).not.toHaveBeenCalled();});
 it('reports incomplete localization as failure',async()=>{vi.mocked(mlClient.localizeArtwork).mockResolvedValue({detections:[{bbox:box}],truncated:true});expect((await post()).statusCode).toBe(502);expect(mlClient.classifyArtwork).not.toHaveBeenCalled();});
 it('bounds number of regions',async()=>{vi.mocked(mlClient.localizeArtwork).mockResolvedValue({detections:Array.from({length:65},()=>({bbox:box})),truncated:false});expect((await post()).statusCode).toBe(502);expect(mlClient.classifyArtwork).not.toHaveBeenCalled();});
 it('uses remaining total deadline for classification',async()=>{
   let now=Date.now();const clock=vi.spyOn(Date,'now').mockImplementation(()=>now);
   vi.mocked(mlClient.localizeArtwork).mockImplementation(async()=>{now+=50000;return {detections:[{bbox:box}],truncated:false};});
   try {await post();expect(vi.mocked(mlClient.localizeArtwork).mock.calls[0][1]?.timeoutMs).toBe(165000);expect(vi.mocked(mlClient.classifyArtwork).mock.calls[0][1]?.timeoutMs).toBe(115000);} finally {clock.mockRestore();}
 });
 it.each([undefined,'bad'])('rejects bad auth before fetching',async k=>{const r=await app.inject({method:'POST',url:'/detect',headers:k?{'x-api-key':k}:{},payload});expect(r.statusCode).toBe(401);expect(fetchLegacyImage).not.toHaveBeenCalled();});
 it('fails closed without key',async()=>{delete process.env.LEGACY_DETECTION_API_KEY;expect((await post()).statusCode).toBe(503);expect(fetchLegacyImage).not.toHaveBeenCalled();});
 it('reports download failures before ML',async()=>{vi.mocked(fetchLegacyImage).mockRejectedValue(new LegacyImageError('Image exceeds size limit'));expect((await post()).statusCode).toBe(400);expect(mlClient.localizeArtwork).not.toHaveBeenCalled();});
 it('reports model outage without leaking or empty success',async()=>{vi.mocked(mlClient.classifyArtwork).mockRejectedValue(new Error('secret-host'));const r=await post();expect(r.statusCode).toBe(502);expect(r.body).not.toContain('secret-host');});
 it('bounds concurrency and releases after errors',async()=>{const resolvers:Array<(b:Buffer)=>void>=[];vi.mocked(fetchLegacyImage).mockImplementation(()=>new Promise(r=>resolvers.push(r)));const first=post(),second=post();await new Promise(r=>setTimeout(r,10));expect((await post()).statusCode).toBe(503);expect(fetchLegacyImage).toHaveBeenCalledTimes(2);resolvers.forEach(r=>r(Buffer.from('invalid')));await Promise.all([first,second]);vi.mocked(fetchLegacyImage).mockResolvedValue(Buffer.from('invalid'));expect((await post()).statusCode).toBe(400);});
 it('rejects oversized normalized data',async()=>{const width=2800,height=2800;const raw=randomFillSync(Buffer.alloc(width*height*3));const compressed=await sharp(raw,{raw:{width,height,channels:3}}).jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();expect(compressed.length).toBeLessThan(20*1024*1024);vi.mocked(fetchLegacyImage).mockResolvedValue(compressed);const r=await post();expect(r.statusCode).toBe(400);expect(r.json().detail).toBe('Normalized image exceeds size limit');expect(mlClient.localizeArtwork).not.toHaveBeenCalled();},15000);
 it('rejects pixel cap',async()=>{vi.mocked(fetchLegacyImage).mockResolvedValue(await sharp({create:{width:10000,height:8100,channels:3,background:'#fff'}}).png().toBuffer());expect((await post()).statusCode).toBe(400);expect(mlClient.localizeArtwork).not.toHaveBeenCalled();});
 it('honors EXIF pixels and bounding coordinates',async()=>{const raw=Buffer.alloc(4*8*3);for(let y=0;y<8;y++)for(let x=0;x<4;x++){const i=(y*4+x)*3;raw[i]=y<4?255:0;raw[i+2]=y<4?0:255;}const jpeg=await sharp(raw,{raw:{width:4,height:8,channels:3}}).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();vi.mocked(fetchLegacyImage).mockResolvedValue(jpeg);const rotatedBox={x:4,y:0,width:4,height:4};vi.mocked(mlClient.localizeArtwork).mockResolvedValue({detections:[{bbox:rotatedBox}],truncated:false});vi.mocked(mlClient.classifyArtwork).mockResolvedValue({results:[result({bbox:rotatedBox})]});const r=await post();expect(r.statusCode).toBe(200);const data=Buffer.from(vi.mocked(mlClient.localizeArtwork).mock.calls[0][0].image_b64!,'base64');const pixels=await sharp(data).raw().toBuffer({resolveWithObject:true});expect([pixels.info.width,pixels.info.height]).toEqual([8,4]);expect(pixels.data[2]).toBeGreaterThan(pixels.data[0]);expect(pixels.data[21]).toBeGreaterThan(pixels.data[23]);expect(r.json().detections[0].bbox).toEqual([.5,0,1,1]);});
});
