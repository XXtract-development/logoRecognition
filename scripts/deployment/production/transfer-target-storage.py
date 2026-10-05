#!/usr/bin/env python3
"""Explicit target-only MinIO provisioning and complete upload/readback proof.
Run only in an isolated provisioning helper on the validated NEW private network.
Never use this with a source endpoint. It imports no application lifespan.
"""
import argparse,hashlib,io,json,pathlib,tempfile
from importlib.machinery import SourceFileLoader
HERE=pathlib.Path(__file__).parent
plan=SourceFileLoader('transfer_target_plan',str(HERE/'transfer-target-plan.py')).load_module()

def fresh_iam(admin,policy_name):
 policies=json.loads(admin.policy_list());users=json.loads(admin.user_list());groups=json.loads(admin.group_list())
 if not isinstance(policies,dict) or not isinstance(users,dict) or not isinstance(groups,list):raise ValueError('Unexpected IAM inventory response')
 if policy_name in policies or users or groups:raise ValueError('IAM policy/users/groups must be absent before new provisioning')

def canonical_policy(policy):
 import copy
 policy=copy.deepcopy(policy)
 for statement in policy.get('Statement',[]):
  for key in ('Action','Resource'):
   value=statement.get(key,[])
   statement[key]=sorted(value if isinstance(value,list) else [value])
 policy['Statement']=sorted(policy.get('Statement',[]),key=lambda x:json.dumps(x,sort_keys=True))
 return policy

def effective_binding(admin,access_key,policy_name):
 user=json.loads(admin.user_info(access_key));policy=json.loads(admin.policy_info(policy_name))
 if user.get('policyName')!=policy_name or user.get('memberOf') or user.get('status')!='enabled':raise ValueError('Runtime identity has unexpected direct or inherited policy bindings')
 if canonical_policy(policy)!=canonical_policy(plan.iam_policy()):raise ValueError('Effective runtime policy differs from reviewed restricted policy')
 users=json.loads(admin.user_list());groups=json.loads(admin.group_list())
 if set(users)!={access_key} or groups:raise ValueError('Unexpected IAM identities/groups after provisioning')

def conditional_put(runtime,item,data):
 try:
  response=runtime._execute('PUT',bucket_name=item['bucket'],object_name=item['key'],body=data,headers={'If-None-Match':'*','Content-Type':item.get('content_type') or 'application/octet-stream'})
  response.close();response.release_conn()
 except Exception as error:
  if getattr(error,'code',None) not in ('PreconditionFailed','ConditionalRequestConflict'):raise
 # Caller always rereads and hashes. A competing object is never overwritten.

def provision(env,package):
 from minio import Minio
 from minio.minioadmin import MinioAdmin
 from minio.credentials import StaticProvider
 import urllib3
 pool=urllib3.PoolManager(timeout=urllib3.Timeout(connect=3,read=30),retries=False)
 endpoint='minio:9000'
 root=Minio(endpoint,access_key=env['MINIO_ROOT_USER'],secret_key=env['MINIO_ROOT_PASSWORD'],secure=False,http_client=pool)
 admin=MinioAdmin(endpoint,credentials=StaticProvider(env['MINIO_ROOT_USER'],env['MINIO_ROOT_PASSWORD']),secure=False,http_client=pool)
 if env['MINIO_ROOT_USER']==env['MINIO_APP_ACCESS_KEY'] or env['MINIO_ROOT_PASSWORD']==env['MINIO_APP_SECRET_KEY']:raise ValueError('Runtime credentials must be nonroot')
 keys=plan.objects.object_keys(plan.objects.verified_rows(package));plan.objects.verify_local_objects(package,keys)
 expected=set(keys);policy_name=env['PRODUCTION_RESOURCE_NAME']+'-runtime'
 fresh_iam(admin,policy_name)
 existing_buckets={b.name for b in root.list_buckets()}
 if existing_buckets-set(plan.BUCKETS):raise ValueError('Unexpected target buckets; dedicated target required')
 for bucket in plan.BUCKETS:
  if bucket not in existing_buckets:root.make_bucket(bucket)
  try:root.get_bucket_policy(bucket)
  except Exception as error:
   if getattr(error,'code',None)!='NoSuchBucketPolicy':raise ValueError('Target bucket privacy could not be verified') from None
  else:raise ValueError('Target bucket must not have an anonymous policy')
  for obj in root.list_objects(bucket,recursive=True):
   if (bucket,obj.object_name) not in expected:raise ValueError('Unexpected existing target object')
 with tempfile.NamedTemporaryFile(mode='w',suffix='.json') as policy:
  json.dump(plan.iam_policy(),policy);policy.flush();admin.policy_add(policy_name,policy.name)
 admin.user_add(env['MINIO_APP_ACCESS_KEY'],env['MINIO_APP_SECRET_KEY'])
 admin.policy_set(policy_name,user=env['MINIO_APP_ACCESS_KEY'])
 effective_binding(admin,env['MINIO_APP_ACCESS_KEY'],policy_name)
 runtime=Minio(endpoint,access_key=env['MINIO_APP_ACCESS_KEY'],secret_key=env['MINIO_APP_SECRET_KEY'],secure=False,http_client=pool)
 if {b.name for b in runtime.list_buckets()}!=set(plan.BUCKETS):raise ValueError('Runtime bucket listing parity failed')
 limited=MinioAdmin(endpoint,credentials=StaticProvider(env['MINIO_APP_ACCESS_KEY'],env['MINIO_APP_SECRET_KEY']),secure=False,http_client=pool)
 try:limited.user_list()
 except Exception as error:
  if getattr(error,'_code',None)!='403' and getattr(error,'code',None) not in ('AccessDenied','XMinioAdminAccessDenied'):raise ValueError('Runtime admin denial could not be proven') from None
 else:raise ValueError('Runtime account unexpectedly has admin rights')
 manifest=json.loads((package/'object-manifest.json').read_text());verified=[]
 for item in manifest:
  data=(package/'objects'/item['bucket']/item['key']).read_bytes()
  try:
   response=runtime.get_object(item['bucket'],item['key'])
  except Exception as error:
   if getattr(error,'code',None)!='NoSuchKey':raise
   conditional_put(runtime,item,data)
   response=runtime.get_object(item['bucket'],item['key'])
  try:readback=response.read()
  finally:response.close();response.release_conn()
  if len(readback)!=item['size'] or hashlib.sha256(readback).hexdigest()!=item['sha256']:raise ValueError('Target object readback mismatch; existing object never overwritten')
  verified.append((item['bucket'],item['key']))
 effective_binding(admin,env['MINIO_APP_ACCESS_KEY'],policy_name)
 if set(verified)!=expected or len(verified)!=len(expected):raise ValueError('Target object verification coverage incomplete')
 return {'status':'passed','resource':env['PRODUCTION_RESOURCE_NAME'],'objects_verified':len(verified),'bytes_verified':sum(i['size'] for i in manifest),'four_buckets_private':True,'runtime_account_nonroot':True,'runtime_admin_access_denied':True,'all_readback_sha256_match':True,'fresh_iam_verified_before_mutation':True,'effective_single_policy_and_no_groups_verified':True,'conditional_put_no_overwrite':True,'source_rows_sha256':hashlib.sha256((package/'rows.json').read_bytes()).hexdigest(),'source_object_manifest_sha256':hashlib.sha256((package/'object-manifest.json').read_bytes()).hexdigest()}

def main():
 p=argparse.ArgumentParser();p.add_argument('--env',required=True);p.add_argument('--package',required=True);p.add_argument('--expected-resource',required=True);p.add_argument('--execute',action='store_true');args=p.parse_args()
 env=plan.config.read_env(args.env);package=plan.source.private_package_path(args.package)
 if not args.execute or args.expected_resource!=env.get('PRODUCTION_RESOURCE_NAME') or not args.expected_resource.startswith('logo-production-'):raise SystemExit('Explicit matching new target execution required')
 proof={'status':'failed','resource':args.expected_resource}
 try:proof=provision(env,package);print(json.dumps(proof))
 except Exception as error:proof['failure_type']=type(error).__name__;raise SystemExit('Target storage provisioning failed; no credentials printed')
 finally:
  path=package/'target-storage-verification.json';path.write_text(json.dumps(proof,indent=2)+'\n');path.chmod(0o600)
if __name__=='__main__':main()
