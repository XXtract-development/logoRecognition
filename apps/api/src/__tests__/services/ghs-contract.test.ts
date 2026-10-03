import { describe,it,expect,vi } from 'vitest';
import prisma from '../../core/db';
import mapping from '../../services/reference-code-mapping.json';
import { resolveFieldType } from '../../services/field-type-mapping';
import { parseDeclaredMarks } from '../../services/t3777-declarations';
import { crosscheckDetections } from '../../services/artwork-crosscheck';
import { registerCropsTx, processAcceptedReviewItems } from '../../services/artwork-registration';
import { promoteOne } from '../../services/flywheel/promotion';
import { nominateCandidate } from '../../services/flywheel/nomination';

describe('GHS pilot contracts',()=>{
 it('G01 resolves all nine aliases',()=>{
  for(const [alias,code] of Object.entries(mapping.aliases)) expect(resolveFieldType(` ${alias.toLowerCase()} `)).toMatchObject({code,fieldType:'GHSSymbolDescriptionCode',gs1Field:'gHSSymbolDescriptionCode'});
 });
 it('G05 exact namespaced repeated XML field independently resolves aliases',()=>{
  expect(parseDeclaredMarks('<a:gHSSymbolDescriptionCode>GHS02</a:gHSSymbolDescriptionCode><gHSSymbolDescriptionCode> flame </gHSSymbolDescriptionCode><gHSSymbolDescriptionCodeOther>GHS03</gHSSymbolDescriptionCodeOther><enumerationValue>GHS04</enumerationValue>')).toEqual([{code:'FLAME',fieldType:'GHSSymbolDescriptionCode'}]);
 });
 it.each([['FLAME'],[],['GHS03'],['NO_PICTOGRAM'],['FLAME','NO_PICTOGRAM']])('G06 always review even confidence one (%j)',async (...declared)=>{
  const result=await crosscheckDetections('123',[{t3777Code:'GHS02',confidence:1,bbox:{x:0,y:0,width:10,height:10},method:'ghs-reference'}],declared as string[]);
  expect(result.autoAccepted).toEqual([]);
  expect(result.reviewItems[0]).toMatchObject({t3777Code:'FLAME'});
  expect(result.reviewItems[0].reason).toContain('menselijke beoordeling');
 });
 it('G06 low-confidence GHS stays open',async()=>{
  await crosscheckDetections('123',[{t3777Code:'FLAME',confidence:.1,bbox:{x:0,y:0,width:10,height:10}}],[]);
  expect(vi.mocked(prisma.artworkReviewItem.createMany).mock.lastCall?.[0].data[0].status).toBe('open');
 });
 it.each(['GHS00','GHS10','NO_PICTOGRAM','GHS02'])('G04/G07 refuses live training before writes %s',async(code)=>{
  const tx={logoImage:{findFirst:vi.fn()},logo:{},trainingData:{}};
  await expect(registerCropsTx(tx as never,'123',[{t3777Code:code,cropPath:'x',sourceFile:'y',bbox:{x:0,y:0,width:10,height:10},confidence:1,method:'human'}])).rejects.toThrow();
  expect(tx.logoImage.findFirst).not.toHaveBeenCalled();
 });
 it.each(['true','false'])('G06 no automatic nomination/promotion with flags %s',async(flag)=>{
  process.env.FLYWHEEL_NOMINATION_ENABLED=flag;
  expect(await nominateCandidate({detection:{t3777Code:'GHS02',confidence:1,cropPath:'x',method:'template'},declared:['FLAME'],gtin:'123',origin:'crosscheck'} as never)).toMatchObject({status:'refused'});
  expect(await promoteOne({id:'a',t3777Code:'GHS02',cropPath:'x',embeddingModelVersion:'v'},'v')).toEqual({status:'skipped'});
 });
});

it.each(['true','false'])('manual GHS review acceptance skips training for flag %s',async flag=>{
 process.env.FLYWHEEL_NOMINATION_ENABLED=flag;
 const result=await processAcceptedReviewItems([{id:'ghs',gtin:'123',t3777Code:'GHS02',cropPath:'x',sourceFile:'y',bbox:{},confidence:1,method:'classifier'}]);
 expect(result).toEqual({registered:0,skipped:1,skippedIds:['ghs']});
});

it('NO_PICTOGRAM alone creates no fictitious missing detection', async () => {
 const result=await crosscheckDetections('123',[],['NO_PICTOGRAM']);
 expect(result).toEqual({autoAccepted:[],reviewItems:[]});
});
it('NO_PICTOGRAM contradiction remains one review item for actual matching GHS', async () => {
 const result=await crosscheckDetections('123',[{t3777Code:'FLAME',confidence:1,bbox:{x:0,y:0,width:10,height:10}}],['FLAME','NO_PICTOGRAM']);
 expect(result.autoAccepted).toEqual([]);
 expect(result.reviewItems).toHaveLength(1);
 expect(result.reviewItems[0].reason).toContain('NO_PICTOGRAM');
});
