#!/usr/bin/env python3
"""Restore a selective archive on a verified local, network-isolated daemon."""
import argparse, hashlib, json, os, pathlib, secrets, subprocess, time
from importlib.machinery import SourceFileLoader
source=SourceFileLoader('transfer_source',str(pathlib.Path(__file__).with_name('transfer-source.py'))).load_module()
IMAGE='pgvector/pgvector@sha256:b81748da2ec31adb8af4b22e471a78087ee89cce2612bc5aecc9450302652cce'
def validate_local_endpoint(endpoint):
 if not endpoint.startswith('unix:///'):raise ValueError('Rehearsal requires a local Unix Docker socket')
 return pathlib.Path(endpoint.removeprefix('unix://'))
def prove_local_docker():
 host=os.environ.get('DOCKER_HOST')
 if host:validate_local_endpoint(host)
 context=os.environ.get('DOCKER_CONTEXT') or subprocess.check_output(['docker','context','show'],timeout=10).decode().strip()
 info=json.loads(subprocess.check_output(['docker','context','inspect',context],timeout=10))[0]
 endpoint=host if host and not os.environ.get('DOCKER_CONTEXT') else info['Endpoints']['docker']['Host']
 socket=validate_local_endpoint(endpoint)
 if not socket.is_socket():raise ValueError('Docker socket must exist on this computer')
 return endpoint

def assert_database_guards(excluded_empty,foreign_keys_validated):
 if not excluded_empty:raise ValueError('Excluded source table data was imported')
 if not foreign_keys_validated:raise ValueError('Database contains unvalidated foreign keys')

def restore_toc(data):
 return '\n'.join(line for line in data.decode().splitlines() if ' SCHEMA - public ' not in line).encode()+b'\n'

def write_proof(folder,proof):
 path=folder/'database-rehearsal.json';path.write_text(json.dumps(proof,indent=2)+'\n');path.chmod(0o600)

def rehearse(folder):
 os.umask(0o077)
 name='logo-release-rehearsal-'+secrets.token_hex(4);envfile=folder/'local-postgres.env'
 def restore(archive,db):
  sql('CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gin; CREATE EXTENSION IF NOT EXISTS btree_gist;',db=db)
  toc=run(['docker','exec','-i',name,'pg_restore','-l'],archive)
  run(['docker','exec','-i',name,'sh','-c','cat > /tmp/release-restore.list'],restore_toc(toc))
  run(['docker','exec','-i',name,'pg_restore','-U','postgres','-d',db,'--no-owner','--no-acl','--exit-on-error','--use-list=/tmp/release-restore.list'],archive)
 proof={'scope':'local filled selective database and backup restore; no live changes','container':name,'image':IMAGE,'status':'failed'}
 write_proof(folder,proof) # Invalidate any older green result before this attempt.
 attempted=False;failure=None
 def run(arguments,data=None):
  r=subprocess.run(arguments,input=data,capture_output=True,timeout=120)
  if r.returncode:
   diagnostic=folder/'local-failure.json';diagnostic.write_text(json.dumps({'operation':arguments[4] if len(arguments)>4 else arguments[1],'stderr':r.stderr.decode()},indent=2));diagnostic.chmod(0o600)
   raise RuntimeError('Local rehearsal operation failed; server details withheld')
  return r.stdout
 def sql(query,db='release'):return run(['docker','exec','-i',name,'psql','-U','postgres','-d',db,'-X','-At','-v','ON_ERROR_STOP=1','-c',query]).decode()
 try:
  proof['docker_endpoint']=prove_local_docker()
  manifest_bytes=(folder/'database-manifest.json').read_bytes();manifest=json.loads(manifest_bytes)
  proof['database_manifest_sha256']=hashlib.sha256(manifest_bytes).hexdigest()
  if hashlib.sha256((folder/'database.dump').read_bytes()).hexdigest()!=manifest['archive_sha256']:raise ValueError('Archive hash mismatch')
  proof['archive_sha256']=manifest['archive_sha256']
  envfile.write_text('POSTGRES_PASSWORD='+secrets.token_hex(32)+'\nPOSTGRES_DB=release\n');envfile.chmod(0o600)
  attempted=True
  run(['docker','run','-d','--network','none','--name',name,'--label','codex.task=production-data-rehearsal','--env-file',str(envfile),IMAGE])
  deadline=time.monotonic()+30;ready=False
  while time.monotonic()<deadline:
   try:ready=subprocess.run(['docker','exec',name,'sh','-c',"test \"$(cat /proc/1/comm)\" = postgres && psql -U postgres -d release -At -c 'SELECT 1' >/dev/null"],capture_output=True,timeout=3).returncode==0
   except subprocess.TimeoutExpired:ready=False
   if ready:break
   time.sleep(0.5)
  if not ready:raise RuntimeError('Local database readiness deadline exceeded')
  restore((folder/'database.dump').read_bytes(),'release')
  tableproof={};records={}
  for table in source.TABLES:
   data=sql('SELECT row_to_json(t)::text FROM public."'+table+'" t ORDER BY id').encode();fingerprint={'rows':len(data.splitlines()),'sha256':hashlib.sha256(data).hexdigest()}
   if fingerprint!=manifest['table_fingerprints'][table]:raise ValueError('Restored fingerprint mismatch: '+table)
   tableproof[table]=fingerprint
   if table!='_prisma_migrations':records[table]=[json.loads(row) for row in data.splitlines()]
  rows=folder/'rows.json';rows.write_text(json.dumps(records,indent=2)+'\n');rows.chmod(0o600);proof['rows_sha256']=hashlib.sha256(rows.read_bytes()).hexdigest()
  proof.update(table_fingerprints_match=True,table_counts={t:v['rows'] for t,v in tableproof.items()},application_tables=int(sql("SELECT count(*)-1 FROM pg_tables WHERE schemaname='public'")),excluded_tables_empty=all(int(sql('SELECT count(*) FROM public."'+t+'"'))==0 for t in manifest['excluded_table_data']),foreign_keys_validated=int(sql("SELECT count(*) FROM pg_constraint WHERE contype='f' AND NOT convalidated"))==0)
  assert_database_guards(proof['excluded_tables_empty'],proof['foreign_keys_validated'])
  proof['real_prisma_ledger_rows']=int(sql("SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"))
  dump=run(['docker','exec',name,'pg_dump','-U','postgres','-d','release','-Fc','--schema=public','--no-owner','--no-acl']);(folder/'local-backup.dump').write_bytes(dump)
  sql('CREATE DATABASE restore_check',db='postgres');restore(dump,'restore_check')
  for table in source.TABLES:
   data=sql('SELECT row_to_json(t)::text FROM public."'+table+'" t ORDER BY id',db='restore_check').encode()
   if hashlib.sha256(data).hexdigest()!=tableproof[table]['sha256']:raise ValueError('Backup restore mismatch: '+table)
  proof.update(filled_backup_restore_match=True,status='passed')
 except Exception as error:
  failure=error;proof['failure_type']=type(error).__name__
 finally:
  try:
   cleaned=True
   if attempted:
    result=subprocess.run(['docker','rm','-f','-v',name],capture_output=True,timeout=20)
    cleaned=result.returncode==0
   proof['test_container_and_anonymous_volumes_removed']=cleaned
   if not cleaned:proof['status']='cleanup_failed'
  except Exception as error:
   proof.update(status='cleanup_failed',test_container_and_anonymous_volumes_removed=False,cleanup_failure_type=type(error).__name__)
  finally:
   envfile.unlink(missing_ok=True);write_proof(folder,proof)
 if failure or proof['status']!='passed':raise RuntimeError('Local rehearsal failed; current failed proof was recorded')
 return proof

def main():
 p=argparse.ArgumentParser();p.add_argument('--package',required=True);args=p.parse_args()
 folder=source.private_package_path(args.package)
 try:print(json.dumps(rehearse(folder)))
 except RuntimeError as error:raise SystemExit(str(error))
if __name__=='__main__':main()
