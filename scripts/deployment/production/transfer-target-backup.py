#!/usr/bin/env python3
"""Read-only target backup plus isolated restore. Explicit execution by coordinator.
Never restores into the real target. Own temporary container has no network.
"""
import argparse,hashlib,json,os,pathlib,secrets,subprocess,tarfile,time
from importlib.machinery import SourceFileLoader
HERE=pathlib.Path(__file__).parent
plan=SourceFileLoader('target_backup_plan',str(HERE/'transfer-target-plan.py')).load_module()
target=SourceFileLoader('target_backup_identity',str(HERE/'transfer-target-database.py')).load_module()
rehearsal=SourceFileLoader('target_backup_rehearsal',str(HERE/'transfer-rehearsal.py')).load_module()
IMAGE='pgvector/pgvector@sha256:d88687938e7336e1ecd1d8c2f29a750e6ab033e511b04a57a1f2d6d2219a0435'

def table_identifier(name):
 # Only the known real migration table needs this leading-underscore exception.
 if name=='_prisma_migrations':return '"_prisma_migrations"'
 return plan.identifier(name)

def require_receipt(proof,resource):
 if proof.get('status')!='passed' or proof.get('resource')!=resource:raise ValueError('Matching passed target receipt required')

def object_backup(package,env):
 receipt_path=package/'target-storage-verification.json'
 if not receipt_path.exists():return {'status':'pending_target_storage'}
 proof=json.loads(receipt_path.read_text());require_receipt(proof,env['PRODUCTION_RESOURCE_NAME'])
 keys=plan.objects.object_keys(plan.objects.verified_rows(package));verified=plan.objects.verify_local_objects(package,keys)
 if not proof.get('all_readback_sha256_match') or proof.get('objects_verified')!=len(keys) or proof.get('source_rows_sha256')!=verified['rows_sha256'] or proof.get('source_object_manifest_sha256')!=verified['object_manifest_sha256']:raise ValueError('Target storage proof differs from verified package')
 archive=package/'target-objects-backup.tar'
 with tarfile.open(archive,'w') as tar:
  tar.add(package/'object-manifest.json',arcname='object-manifest.json',recursive=False)
  for bucket,key in keys:tar.add(package/'objects'/bucket/key,arcname='objects/'+bucket+'/'+key,recursive=False)
 archive.chmod(0o600);manifest=json.loads((package/'object-manifest.json').read_text());expected={'objects/'+i['bucket']+'/'+i['key']:i for i in manifest}
 with tarfile.open(archive) as tar:
  members=tar.getmembers();names=[m.name for m in members]
  if len(names)!=len(set(names)) or set(names)!=set(expected)|{'object-manifest.json'}:raise ValueError('Object backup has missing, duplicate or unexpected entries')
  for member in members:
   if not member.isfile():raise ValueError('Only ordinary files allowed in object backup')
   if member.name=='object-manifest.json':continue
   item=expected[member.name];data=tar.extractfile(member).read()
   if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError('Object backup readback hash mismatch')
 return {'status':'passed','scope':'byte-equivalent package copy, proven against complete target readback receipt; tar readback tested','objects':len(keys),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archive_bytes':archive.stat().st_size,'target_storage_receipt_sha256':hashlib.sha256(receipt_path.read_bytes()).hexdigest()}

def cleanup_test_container(name,attempted,envfile,proof):
 try:
  removed=not attempted
  if attempted:removed=subprocess.run(['docker','rm','-f','-v',name],capture_output=True,timeout=20).returncode==0
  proof['isolated_container_and_volumes_removed']=removed
  if not removed:proof['status']='cleanup_failed'
 except Exception as failure:proof.update(status='cleanup_failed',isolated_container_and_volumes_removed=False,cleanup_failure_type=type(failure).__name__)
 finally:envfile.unlink(missing_ok=True)

def execute_backup(env,package,container):
 os.umask(0o077);proof={'status':'failed','resource':env['PRODUCTION_RESOURCE_NAME'],'scope':'read-only new production target backup; restore only into own isolated test container'}
 receipt_path=package/'target-backup-verification.json'
 def persist():receipt_path.write_text(json.dumps(proof,indent=2)+'\n');receipt_path.chmod(0o600)
 persist();name='logo-target-backup-'+secrets.token_hex(4);envfile=package/'target-backup-test.env';attempted=False;error=None
 def run(args,data=None,timeout=180):
  result=subprocess.run(args,input=data,capture_output=True,timeout=timeout)
  if result.returncode:raise RuntimeError('Target backup operation failed; connection details withheld')
  return result.stdout
 def sql(query,where=container,owner=None,db=None):return run(['docker','exec','-i',where,'psql','-U',owner or env['POSTGRES_ADMIN_USER'],'-d',db or env['POSTGRES_DB'],'-X','-At','-v','ON_ERROR_STOP=1'],query.encode()).decode()
 def fingerprints(where,tables,owner=None,db=None):
  result={}
  for table in tables:
   data=sql('SELECT row_to_json(t)::text FROM public.'+table_identifier(table)+' t ORDER BY row_to_json(t)::text',where,owner,db).encode()
   result[table]={'rows':len(data.splitlines()),'sha256':hashlib.sha256(data).hexdigest()}
  return result
 try:
  proof['local_docker_endpoint']=rehearsal.prove_local_docker()
  target_proof=json.loads((package/'target-database-verification.json').read_text());require_receipt(target_proof,env['PRODUCTION_RESOURCE_NAME'])
  plan.objects.verified_rows(package)
  if target_proof.get('source_archive_sha256')!=hashlib.sha256((package/'database.dump').read_bytes()).hexdigest():raise ValueError('Target database receipt source archive mismatch')
  info=json.loads(run(['docker','inspect',container]))[0];target.target_identity(info,env)
  image=json.loads(run(['docker','image','inspect',info['Image']]))[0]
  if not any(i.endswith('@sha256:d88687938e7336e1ecd1d8c2f29a750e6ab033e511b04a57a1f2d6d2219a0435') for i in image.get('RepoDigests',[])):raise ValueError('Target PostgreSQL image mismatch')
  tables=sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1").splitlines()
  manifest=json.loads((package/'database-manifest.json').read_text());expected=set(manifest['excluded_table_data'])|set(plan.source.TABLES)
  if set(tables)!=expected or len(tables)!=35:raise ValueError('Target backup must include all 34 application tables plus real migration ledger')
  before=fingerprints(container,tables)
  archive=run(['docker','exec',container,'pg_dump','-U',env['POSTGRES_ADMIN_USER'],'-d',env['POSTGRES_DB'],'--format=custom','--schema=public','--no-owner','--no-acl'])
  path=package/'target-backup.dump';path.write_bytes(archive);path.chmod(0o600)
  after=fingerprints(container,tables)
  if before!=after:raise ValueError('Target changed during backup snapshot')
  if before['system_settings']['rows']!=3 or before['_prisma_migrations']['rows']!=21:raise ValueError('Expected production settings or genuine migration ledger absent')
  envfile.write_text('POSTGRES_USER=backup_owner\nPOSTGRES_DB=backup_restore\nPOSTGRES_PASSWORD='+secrets.token_hex(32)+'\n');envfile.chmod(0o600)
  attempted=True
  run(['docker','run','-d','--pull=never','--network','none','--cpus','0.5','--memory','1g','--name',name,'--label','codex.task=production-target-backup','--env-file',str(envfile),IMAGE],timeout=30)
  deadline=time.monotonic()+40;ready=False
  while time.monotonic()<deadline:
   try:ready=subprocess.run(['docker','exec',name,'sh','-c',"test \"$(cat /proc/1/comm)\" = postgres && psql -U backup_owner -d backup_restore -At -c 'SELECT 1' >/dev/null"],capture_output=True,timeout=3).returncode==0
   except subprocess.TimeoutExpired:ready=False
   if ready:break
   time.sleep(.5)
  if not ready:raise RuntimeError('Isolated backup restore readiness deadline exceeded')
  sql('CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gin; CREATE EXTENSION IF NOT EXISTS btree_gist;',name,'backup_owner','backup_restore')
  toc=run(['docker','exec','-i',name,'pg_restore','-l'],archive)
  run(['docker','exec','-i',name,'sh','-c','cat > /tmp/target-backup-restore.list'],rehearsal.restore_toc(toc))
  run(['docker','exec','-i',name,'pg_restore','-U','backup_owner','-d','backup_restore','--no-owner','--no-acl','--exit-on-error','--use-list=/tmp/target-backup-restore.list'],archive)
  restored=fingerprints(name,tables,'backup_owner','backup_restore')
  if restored!=before:raise ValueError('Full target backup restore fingerprints mismatch')
  proof.update(database_backup_restore_passed=True,all_35_public_table_fingerprints_match=True,table_fingerprints=before,database_archive_sha256=hashlib.sha256(archive).hexdigest(),database_archive_bytes=len(archive),target_database_receipt_sha256=hashlib.sha256((package/'target-database-verification.json').read_bytes()).hexdigest())
  proof['objects_backup']=object_backup(package,env)
  proof['status']='passed' if proof['objects_backup']['status']=='passed' else 'passed_database_only'
 except Exception as failure:error=failure;proof['failure_type']=type(failure).__name__
 finally:
  cleanup_test_container(name,attempted,envfile,proof);persist()
 if error or proof['status'] in ('failed','cleanup_failed'):raise RuntimeError('Target backup rehearsal failed; current failed proof recorded')
 return proof

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--env',required=True);parser.add_argument('--package',required=True);parser.add_argument('--container',required=True);parser.add_argument('--expected-resource',required=True);parser.add_argument('--execute',action='store_true');args=parser.parse_args()
 env=plan.config.read_env(args.env);package=plan.source.private_package_path(args.package)
 if not args.execute or args.expected_resource!=env.get('PRODUCTION_RESOURCE_NAME') or not args.expected_resource.startswith('logo-production-'):raise SystemExit('Explicit matching new resource backup execution required')
 try:
  proof=execute_backup(env,package,args.container);print(json.dumps({k:proof[k] for k in ['status','resource','database_backup_restore_passed','isolated_container_and_volumes_removed']}))
 except RuntimeError as error:raise SystemExit(str(error))
if __name__=='__main__':main()
