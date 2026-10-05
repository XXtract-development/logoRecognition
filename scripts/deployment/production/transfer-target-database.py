#!/usr/bin/env python3
"""Explicit restore into a verified EMPTY dedicated target container; never starts it."""
import argparse,hashlib,json,pathlib,subprocess
from importlib.machinery import SourceFileLoader
HERE=pathlib.Path(__file__).parent
plan=SourceFileLoader('transfer_target_plan',str(HERE/'transfer-target-plan.py')).load_module()
rehearsal=SourceFileLoader('transfer_rehearsal',str(HERE/'transfer-rehearsal.py')).load_module()

def target_identity(info,env):
 container_env=dict(x.split('=',1) for x in info['Config']['Env'])
 if container_env.get('POSTGRES_DB')!=env['POSTGRES_DB'] or container_env.get('POSTGRES_USER')!=env['POSTGRES_ADMIN_USER'] or container_env.get('POSTGRES_PASSWORD')!=env['POSTGRES_ADMIN_PASSWORD']:raise ValueError('New target database identity mismatch')
 if container_env.get('POSTGRES_HOST_AUTH_METHOD') not in (None,'scram-sha-256'):raise ValueError('Target authentication must not be trust or a weaker override')
 if info['Config'].get('Labels',{}).get('com.docker.compose.service')!='postgres':raise ValueError('Wrong target service')
 mounts=[m for m in info['Mounts'] if m['Destination']=='/var/lib/postgresql/data']
 if len(mounts)!=1 or mounts[0].get('Type')!='volume' or mounts[0].get('Name')!=env['PRODUCTION_RESOURCE_NAME']+'-postgres-data':raise ValueError('Dedicated target volume mismatch')
 if any(info['HostConfig'].get('PortBindings',{}).values()):raise ValueError('Target database ports must stay private')
 if not info['State']['Running']:raise ValueError('Target infrastructure must already be running')

def provision(env,package,container):
 def run(args,data=None):
  r=subprocess.run(args,input=data,capture_output=True,timeout=180)
  if r.returncode:raise RuntimeError('Target database operation failed; details withheld')
  return r.stdout
 info=json.loads(run(['docker','inspect',container]))[0];target_identity(info,env)
 image=json.loads(run(['docker','image','inspect',info['Image']]))[0]
 if not any(x.endswith('@sha256:d88687938e7336e1ecd1d8c2f29a750e6ab033e511b04a57a1f2d6d2219a0435') for x in image.get('RepoDigests',[])):raise ValueError('Target PostgreSQL image digest mismatch')
 rows=plan.objects.verified_rows(package);keys=plan.objects.object_keys(rows);plan.objects.verify_local_objects(package,keys)
 manifest=json.loads((package/'database-manifest.json').read_text());archive=(package/'database.dump').read_bytes();role_script=plan.roles_sql(env);(app,_),(ml,_)=plan.runtime_roles(env)
 def sql(query):return run(['docker','exec','-i',container,'psql','-U',env['POSTGRES_ADMIN_USER'],'-d',env['POSTGRES_DB'],'-X','-At','-v','ON_ERROR_STOP=1'],query.encode()).decode()
 if int(sql("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')"))!=0:raise ValueError('Target must have no application tables; existing data will never be overwritten')
 if int(sql('SELECT count(*) FROM pg_roles WHERE rolname IN ('+plan.literal(app)+','+plan.literal(ml)+')'))!=0:raise ValueError('Runtime roles must not already exist on new target')
 toc=run(['docker','exec','-i',container,'pg_restore','-l'],archive)
 for line in toc.decode().splitlines():
  if ' SCHEMA - ' in line and ' SCHEMA - public ' not in line:raise ValueError('Original archive contains unexpected custom schema')
 sql('CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS btree_gin; CREATE EXTENSION IF NOT EXISTS btree_gist;')
 run(['docker','exec','-i',container,'sh','-c','cat > /tmp/production-restore.list'],rehearsal.restore_toc(toc))
 run(['docker','exec','-i',container,'pg_restore','-U',env['POSTGRES_ADMIN_USER'],'-d',env['POSTGRES_DB'],'--no-owner','--no-acl','--exit-on-error','--use-list=/tmp/production-restore.list'],archive)
 for table in plan.source.TABLES:
  data=sql('SELECT row_to_json(t)::text FROM public."'+table+'" t ORDER BY id').encode()
  fingerprint={'rows':len(data.splitlines()),'sha256':hashlib.sha256(data).hexdigest()}
  if fingerprint!=manifest['table_fingerprints'][table]:raise ValueError('Target row fingerprint mismatch')
 excluded=all(int(sql('SELECT count(*) FROM public."'+table+'"'))==0 for table in manifest['excluded_table_data'])
 fks=int(sql("SELECT count(*) FROM pg_constraint WHERE contype='f' AND NOT convalidated"))==0
 rehearsal.assert_database_guards(excluded,fks)
 sql(role_script)
 ml_url=env['ML_DATABASE_URL'].replace('@postgres:5432/','@127.0.0.1:5432/')
 # URI stays on stdin; role password is never an argv/env/log parameter.
 checks="\\connect '"+ml_url+"'\nBEGIN;\n"
 for table,privileges in [('training_batches','SELECT,INSERT,UPDATE'),('logos','SELECT,INSERT,UPDATE'),('declared_harvest_checks','SELECT,INSERT,UPDATE'),('artwork_review_items','SELECT')]:
  for privilege in privileges.split(','):
   checks+="SELECT has_table_privilege(current_user, 'public."+table+"', '"+privilege+"');\n"
 checks+="SELECT current_user; SELECT count(*) FROM reference_logos; SELECT count(*) FROM artwork_review_items; SELECT count(*) FROM training_batches;\n"
 checks+="INSERT INTO logos(category,value,updated_at) VALUES ('provisioning-check',gen_random_uuid()::text,now()); UPDATE logos SET updated_at=updated_at WHERE category='provisioning-check';\n"
 checks+="INSERT INTO declared_harvest_checks(t3777_code,gtin,source_file,outcome,permanent) VALUES ('provisioning-check',gen_random_uuid()::text,'provisioning-check','below_floor',false); UPDATE declared_harvest_checks SET checked_at=checked_at WHERE t3777_code='provisioning-check';\n"
 checks+="INSERT INTO training_batches(id,name,status,user_id,created_at,updated_at) SELECT gen_random_uuid(),'provisioning-check','TRAINING','00000000-0000-0000-0000-000000000000'::uuid,now(),now() WHERE false; UPDATE training_batches SET updated_at=updated_at WHERE false;\n"
 checks+="REINDEX TABLE public.reference_embeddings; ROLLBACK;\n"
 output=run(['docker','exec','-i',container,'psql','-U',env['POSTGRES_ADMIN_USER'],'-d',env['POSTGRES_DB'],'-X','-At','-v','ON_ERROR_STOP=1'],checks.encode()).decode().splitlines()
 if ml not in output or output.count('t')<10:raise ValueError('Authenticated ML grants/read/write proof failed')
 for table in ['logos','declared_harvest_checks','training_batches']:
  expected=manifest['table_fingerprints'].get(table,{'rows':0})['rows']
  if int(sql('SELECT count(*) FROM public.'+plan.identifier(table)))!=expected:raise ValueError('Rolled-back ML verification changed target rows')
 owner=sql("SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.reference_embeddings'::regclass").strip()
 if owner!=ml:raise ValueError('ML comparison-table ownership mismatch')
 for role in [app,ml]:
  if sql('SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls FROM pg_roles WHERE rolname='+plan.literal(role)).strip()!='f':raise ValueError('Runtime role has excessive privileges')
 if sql("SELECT value->>'paused' FROM system_settings WHERE key='flywheel.paused'").strip()!='true':raise ValueError('Persistent production pause missing')
 return {'status':'passed','resource':env['PRODUCTION_RESOURCE_NAME'],'new_empty_target_confirmed':True,'source_archive_sha256':hashlib.sha256(archive).hexdigest(),'all_selected_row_fingerprints_match':True,'excluded_data_absent_before_target_settings':True,'foreign_keys_validated':True,'app_ml_roles_distinct_and_limited':True,'ml_reference_table_owner':True,'ml_reindex_proven':True,'ml_authenticated_read_and_rollback_writes_proven':True,'flywheel_persistently_paused':True}

def main():
 p=argparse.ArgumentParser();p.add_argument('--env',required=True);p.add_argument('--package',required=True);p.add_argument('--container',required=True);p.add_argument('--expected-resource',required=True);p.add_argument('--execute',action='store_true');args=p.parse_args()
 env=plan.config.read_env(args.env);package=plan.source.private_package_path(args.package)
 if not args.execute or args.expected_resource!=env.get('PRODUCTION_RESOURCE_NAME') or not args.expected_resource.startswith('logo-production-'):raise SystemExit('Explicit matching new target execution required')
 proof={'status':'failed','resource':args.expected_resource}
 try:proof=provision(env,package,args.container);print(json.dumps(proof))
 except Exception as error:proof['failure_type']=type(error).__name__;raise SystemExit('Target database provisioning failed; failed proof recorded')
 finally:
  path=package/'target-database-verification.json';path.write_text(json.dumps(proof,indent=2)+'\n');path.chmod(0o600)
if __name__=='__main__':main()
