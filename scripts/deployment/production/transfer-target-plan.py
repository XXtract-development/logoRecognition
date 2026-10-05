#!/usr/bin/env python3
"""Prepare private target SQL and IAM inputs. Never connects or executes changes."""
import argparse,hashlib,json,pathlib,re,urllib.parse
from importlib.machinery import SourceFileLoader
HERE=pathlib.Path(__file__).parent
source=SourceFileLoader('transfer_source',str(HERE/'transfer-source.py')).load_module()
objects=SourceFileLoader('transfer_objects',str(HERE/'transfer-objects.py')).load_module()
config=SourceFileLoader('production_config',str(HERE/'check-production-config.py')).load_module()
BUCKETS=('training-images','recognition-images','thumbnails','models')
def identifier(value):
 if not re.fullmatch('[a-z][a-z0-9_]*',value):raise ValueError('Unsafe database identifier')
 return '"'+value+'"'
def literal(value):return "'"+value.replace("'","''")+"'"
def runtime_roles(env):
 result=[]
 for key in ['APP_DATABASE_URL','ML_DATABASE_URL']:
  url=urllib.parse.urlsplit(env[key]);name=urllib.parse.unquote(url.username or '');password=urllib.parse.unquote(url.password or '')
  identifier(name)
  if url.hostname!='postgres' or url.port!=5432 or url.path!='/'+env['POSTGRES_DB'] or len(password)<32:raise ValueError('Dedicated runtime database connection required')
  result.append((name,password))
 if result[0][0]==result[1][0] or result[0][1]==result[1][1] or any(n in [env['POSTGRES_ADMIN_USER'],'postgres'] for n,p in result):raise ValueError('Distinct limited app and ML roles required')
 return result

def roles_sql(env):
 (app,app_secret),(ml,ml_secret)=runtime_roles(env);a=identifier(app);m=identifier(ml);db=identifier(env['POSTGRES_DB'])
 statements=['BEGIN;']
 for name,password in [(a,app_secret),(m,ml_secret)]:statements.append(f'CREATE ROLE {name} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {literal(password)};')
 statements += [f'REVOKE ALL ON DATABASE {db} FROM PUBLIC;',f'GRANT CONNECT ON DATABASE {db} TO {a}, {m};','REVOKE ALL ON SCHEMA public FROM PUBLIC;',f'GRANT USAGE ON SCHEMA public TO {a}, {m};','REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;',f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {a};',f'REVOKE ALL ON public._prisma_migrations FROM {a};',f'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {a};']
 read_tables=['logos','logo_images','training_data','reference_logos','model_versions','logo_embeddings','reference_embeddings','training_batches','declared_harvest_checks','artwork_review_items']
 statements.append('GRANT SELECT ON '+', '.join('public.'+identifier(t) for t in read_tables)+f' TO {m};')
 statements.append('GRANT INSERT, UPDATE ON public.model_versions, public.reference_logos TO '+m+';')
 statements.append('GRANT INSERT ON public.logo_embeddings TO '+m+';')
 statements.append('GRANT INSERT, DELETE ON public.reference_embeddings TO '+m+';')
 statements.append('GRANT INSERT, UPDATE ON public.training_batches, public.logos, public.declared_harvest_checks TO '+m+';')
 statements.append('ALTER TABLE public.reference_embeddings OWNER TO '+m+';')
 statements += ["INSERT INTO public.system_settings(key,value,updated_by) VALUES ('flywheel.paused',jsonb_build_object('paused',true,'reason','production-migration','since',CURRENT_TIMESTAMP,'by','production-migration'),'production-migration'),('flywheel.baselineStale',jsonb_build_object('stale',true,'reason','production-migration','at',CURRENT_TIMESTAMP,'by','production-migration'),'production-migration'),('flywheel.autoPauseStreak',jsonb_build_object('count',0,'batchIds','[]'::jsonb),'production-migration');",'COMMIT;']
 return '\n'.join(statements)+'\n'

def iam_policy():
 return {'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':['s3:ListAllMyBuckets'],'Resource':['arn:aws:s3:::*']},{'Effect':'Allow','Action':['s3:GetBucketLocation','s3:ListBucket','s3:ListBucketMultipartUploads'],'Resource':['arn:aws:s3:::'+b for b in BUCKETS]},{'Effect':'Allow','Action':['s3:GetObject','s3:PutObject','s3:DeleteObject','s3:AbortMultipartUpload','s3:ListMultipartUploadParts'],'Resource':['arn:aws:s3:::'+b+'/*' for b in BUCKETS]}]}

def main():
 p=argparse.ArgumentParser();p.add_argument('--env',required=True);p.add_argument('--package',required=True);p.add_argument('--output',required=True);args=p.parse_args()
 env=config.read_env(args.env);package=source.private_package_path(args.package);out=source.private_package_path(args.output)
 if not re.fullmatch('logo-production-[a-z0-9-]+',env.get('PRODUCTION_RESOURCE_NAME','')):raise SystemExit('Dedicated resource required')
 rows=objects.verified_rows(package);keys=objects.object_keys(rows);objects.verify_local_objects(package,keys)
 for filename,text in [('runtime-roles.sql',roles_sql(env)),('runtime-storage-policy.json',json.dumps(iam_policy(),indent=2)+'\n')]:
  path=out/filename;path.write_text(text);path.chmod(0o600)
 receipt={'status':'prepared_only','resource':env['PRODUCTION_RESOURCE_NAME'],'database':env['POSTGRES_DB'],'source_archive_sha256':hashlib.sha256((package/'database.dump').read_bytes()).hexdigest(),'objects':len(keys),'sql_sha256':hashlib.sha256((out/'runtime-roles.sql').read_bytes()).hexdigest(),'source_archive_scope':'original successful full-schema archive, selective public data; not a newly exported public-only archive','execution_authorized_by_script':False}
 (out/'target-plan.json').write_text(json.dumps(receipt,indent=2)+'\n');(out/'target-plan.json').chmod(0o600);print(json.dumps({'status':'prepared_only','objects':len(keys),'credentials_printed':False}))
if __name__=='__main__':main()
