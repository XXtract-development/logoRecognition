#!/usr/bin/env python3
"""Contract tests for the deliberately selective production transfer."""
from importlib.machinery import SourceFileLoader
import pathlib,unittest,tempfile,json,hashlib,subprocess
from unittest.mock import patch
HERE=pathlib.Path(__file__).parent
source=SourceFileLoader('transfer_source',str(HERE/'transfer-source.py')).load_module()
objects=SourceFileLoader('transfer_objects',str(HERE/'transfer-objects.py')).load_module()
rehearsal=SourceFileLoader('transfer_rehearsal',str(HERE/'transfer-rehearsal.py')).load_module()
class TransferContracts(unittest.TestCase):
 def test_no_identity_queue_or_runtime_log_data(self):
  self.assertFalse(set(source.TABLES)&{'users','organizations','recognition_logs','reference_candidates','promotion_batches','search_history','feedback_queue','bootstrap_queue'})
 def test_real_ledger_and_training_provenance_retained(self):
  self.assertTrue({'_prisma_migrations','training_data','gold_set_records','hard_negatives','reference_logos'}<=set(source.TABLES))
 def test_references_default_to_private_training_bucket(self):
  keys=objects.object_keys({'reference_logos':[{'storage_path':'reference-logos/GHS/a.png'}]})
  self.assertIn(('training-images','reference-logos/GHS/a.png'),keys)
 def test_prefixed_path_uses_exact_bucket_and_key(self):
  keys=objects.object_keys({'logo_images':[{'storage_path':'training-images/artwork-crops/a.png'}]})
  self.assertIn(('training-images','artwork-crops/a.png'),keys)
 def test_original_path_and_crop_both_exported(self):
  keys=objects.object_keys({'logo_images':[{'storage_path':'artwork-crops/original.png'}],'training_data':[{'crop_path':'artwork-crops/crop.png'}]})
  self.assertIn(('training-images','artwork-crops/original.png'),keys);self.assertIn(('training-images','artwork-crops/crop.png'),keys)
 def test_duplicates_export_once_and_null_crop_skipped(self):
  keys=objects.object_keys({'training_data':[{'crop_path':'a.png'},{'crop_path':'a.png'},{'crop_path':None}]})
  self.assertEqual(keys.count(('training-images','a.png')),1)
 def test_both_nutriscore_artifacts_explicit(self):
  self.assertEqual(len(objects.object_keys({})),2)
  self.assertTrue(any(key.endswith('a2_meta.json') for _,key in objects.object_keys({})))
 def test_paths_cannot_escape_private_package(self):
  for path in ['/a.png','../a.png','x/../../a.png','https://x/a.png','x\\a.png','x\x00.png','training-images/']:
   with self.subTest(path=path):
    with self.assertRaises(ValueError):objects.object_keys({'reference_logos':[{'storage_path':path}]})
 def test_readonly_remote_transfer(self):
  self.assertIn('client.get_object',objects.REMOTE);self.assertIn('client.stat_object',objects.REMOTE)
  for forbidden in ['put_object','remove_object','make_bucket','list_objects']:self.assertNotIn(forbidden,objects.REMOTE)
class FailClosedContracts(unittest.TestCase):
 def test_restore_toc_omits_only_redundant_public_creation(self):
  toc=b'8; 2615 2200 SCHEMA - public owner\n9; 0 0 COMMENT - SCHEMA public owner\n10; 0 0 TABLE public logos owner\n'
  filtered=rehearsal.restore_toc(toc)
  self.assertNotIn(b'SCHEMA - public',filtered);self.assertIn(b'COMMENT - SCHEMA public',filtered);self.assertIn(b'TABLE public logos',filtered)
 def test_other_checkout_and_worktree_rejected(self):
  with tempfile.TemporaryDirectory() as name:
   root=pathlib.Path(name)
   for marker in ['directory','file']:
    checkout=root/marker;checkout.mkdir()
    if marker=='directory':(checkout/'.git').mkdir()
    else:(checkout/'.git').write_text('gitdir: /somewhere')
    with self.assertRaises(ValueError):source.private_package_path(checkout/'secret-package')
 def test_duplicate_or_missing_ledger_names_rejected(self):
  with tempfile.TemporaryDirectory() as name:
   migrations=pathlib.Path(name)
   for m in ['a','b']:(migrations/m).mkdir();(migrations/m/'migration.sql').write_text('SELECT 1;')
   entry={'name':'a','checksum':hashlib.sha256(b'SELECT 1;').hexdigest(),'finished':True,'rolled_back':False}
   for ledger in [[entry,entry],[entry]]:
    with self.assertRaises(ValueError):source.validate_ledger(ledger,migrations)
   self.assertEqual(len(source.validate_ledger([entry,{**entry,'name':'b'}],migrations)),2)
 def test_remote_docker_endpoints_rejected(self):
  for endpoint in ['ssh://banana','tcp://127.0.0.1:2375','http://server','unix://relative.sock']:
   with self.assertRaises(ValueError):rehearsal.validate_local_endpoint(endpoint)
  self.assertEqual(str(rehearsal.validate_local_endpoint('unix:///tmp/docker.sock')),'/tmp/docker.sock')
 def test_database_guard_failures_are_fatal(self):
  for flags in [(False,True),(True,False),(False,False)]:
   with self.assertRaises(ValueError):rehearsal.assert_database_guards(*flags)
  rehearsal.assert_database_guards(True,True)
 def test_incomplete_duplicate_unexpected_manifests_rejected(self):
  keys=[('training-images','a.png')];entry={'bucket':'training-images','key':'a.png'}
  for manifest in [[],[entry,entry],[entry,{'bucket':'training-images','key':'unexpected.png'}],[{**entry,'error':'NoSuchKey'}]]:
   with self.assertRaises(ValueError):objects.validate_object_manifest(manifest,keys)
  objects.validate_object_manifest([entry],keys)
 def test_rows_require_success_and_matching_hashes(self):
  with tempfile.TemporaryDirectory() as name:
   folder=pathlib.Path(name);rows=b'{}';manifest=b'{}';archive=b'data'
   for file,data in [('rows.json',rows),('database-manifest.json',manifest),('database.dump',archive)]:(folder/file).write_bytes(data)
   proof={'status':'passed','rows_sha256':hashlib.sha256(rows).hexdigest(),'database_manifest_sha256':hashlib.sha256(manifest).hexdigest(),'archive_sha256':hashlib.sha256(archive).hexdigest()}
   (folder/'database-rehearsal.json').write_text(json.dumps(proof));self.assertEqual(objects.verified_rows(folder),{})
   for changes in [{'status':'failed'},{'rows_sha256':'bad'},{'database_manifest_sha256':'bad'},{'archive_sha256':'bad'}]:
    (folder/'database-rehearsal.json').write_text(json.dumps({**proof,**changes}))
    with self.assertRaises(ValueError):objects.verified_rows(folder)
 def test_failed_attempt_replaces_old_pass_and_removes_env(self):
  with tempfile.TemporaryDirectory() as name:
   folder=pathlib.Path(name);(folder/'database-rehearsal.json').write_text('{"status":"passed"}');(folder/'local-postgres.env').write_text('private')
   with patch.object(rehearsal,'prove_local_docker',side_effect=ValueError('remote')):
    with self.assertRaises(RuntimeError):rehearsal.rehearse(folder)
   self.assertEqual(json.loads((folder/'database-rehearsal.json').read_text())['status'],'failed');self.assertFalse((folder/'local-postgres.env').exists())
 def test_cleanup_failure_is_fatal_and_persisted(self):
  with tempfile.TemporaryDirectory() as name:
   folder=pathlib.Path(name);data=b'archive';(folder/'database.dump').write_bytes(data);(folder/'database-manifest.json').write_text(json.dumps({'archive_sha256':hashlib.sha256(data).hexdigest()}))
   def run(args,**kwargs):return subprocess.CompletedProcess(args,1 if args[1]=='rm' else 0,stdout=b'ok',stderr=b'')
   with patch.object(rehearsal,'prove_local_docker',return_value='unix:///local.sock'),patch.object(rehearsal.subprocess,'run',side_effect=run),patch.object(rehearsal.time,'monotonic',side_effect=[0,31]):
    with self.assertRaises(RuntimeError):rehearsal.rehearse(folder)
   proof=json.loads((folder/'database-rehearsal.json').read_text());self.assertEqual(proof['status'],'cleanup_failed');self.assertFalse((folder/'local-postgres.env').exists())
 def test_cleanup_timeout_still_persists_failure(self):
  with tempfile.TemporaryDirectory() as name:
   folder=pathlib.Path(name);data=b'archive';(folder/'database.dump').write_bytes(data);(folder/'database-manifest.json').write_text(json.dumps({'archive_sha256':hashlib.sha256(data).hexdigest()}))
   def run(args,**kwargs):
    if args[1]=='rm':raise subprocess.TimeoutExpired(args,20)
    return subprocess.CompletedProcess(args,0,stdout=b'ok',stderr=b'')
   with patch.object(rehearsal,'prove_local_docker',return_value='unix:///local.sock'),patch.object(rehearsal.subprocess,'run',side_effect=run),patch.object(rehearsal.time,'monotonic',side_effect=[0,31]):
    with self.assertRaises(RuntimeError):rehearsal.rehearse(folder)
   proof=json.loads((folder/'database-rehearsal.json').read_text());self.assertEqual(proof['status'],'cleanup_failed');self.assertFalse((folder/'local-postgres.env').exists())
class TargetContracts(unittest.TestCase):
 def setUp(self):
  self.plan=SourceFileLoader('target_plan_tests',str(HERE/'transfer-target-plan.py')).load_module()
  self.target=SourceFileLoader('target_db_tests',str(HERE/'transfer-target-database.py')).load_module()
  self.env={'PRODUCTION_RESOURCE_NAME':'logo-production-new','POSTGRES_DB':'production_new','POSTGRES_ADMIN_USER':'provision_owner','POSTGRES_ADMIN_PASSWORD':'owner-secret','APP_DATABASE_URL':'postgresql://app_role:'+('a'*32)+'@postgres:5432/production_new','ML_DATABASE_URL':'postgresql://ml_role:'+('b'*32)+'@postgres:5432/production_new'}
 def test_shared_or_admin_runtime_roles_rejected(self):
  for change in [{'ML_DATABASE_URL':self.env['APP_DATABASE_URL']},{'APP_DATABASE_URL':self.env['APP_DATABASE_URL'].replace('app_role','provision_owner')},{'ML_DATABASE_URL':self.env['ML_DATABASE_URL'].replace('postgres:5432','10.0.0.6:5432')}]:
   with self.assertRaises(ValueError):self.plan.runtime_roles({**self.env,**change})
 def test_runtime_policy_cannot_read_every_bucket_or_administer(self):
  policy=self.plan.iam_policy()
  for item in policy['Statement']:
   self.assertFalse(any(a.startswith('admin:') for a in item['Action']))
   if 's3:GetObject' in item['Action']:self.assertEqual(set(item['Resource']),{'arn:aws:s3:::'+b+'/*' for b in self.plan.BUCKETS})
 def test_roles_limited_and_comparison_table_owned_by_ml(self):
  sql=self.plan.roles_sql(self.env)
  self.assertIn('ALTER TABLE public.reference_embeddings OWNER TO "ml_role"',sql)
  self.assertIn('NOBYPASSRLS',sql);self.assertIn('REVOKE ALL ON public._prisma_migrations',sql)
  self.assertIn("jsonb_build_object('paused',true",sql);self.assertIn("jsonb_build_object('stale',true",sql)
 def test_target_container_identity_rejects_shared_volume_or_ports(self):
  base={'Config':{'Env':['POSTGRES_DB=production_new','POSTGRES_USER=provision_owner','POSTGRES_PASSWORD=owner-secret'],'Labels':{'com.docker.compose.service':'postgres'}},'Mounts':[{'Type':'volume','Destination':'/var/lib/postgresql/data','Name':'logo-production-new-postgres-data'}],'HostConfig':{'PortBindings':{}},'State':{'Running':True}}
  self.target.target_identity(base,self.env)
  for change in [{'Mounts':[{'Type':'volume','Destination':'/var/lib/postgresql/data','Name':'existing-production-data'}]},{'HostConfig':{'PortBindings':{'5432/tcp':[{'HostPort':'5432'}]}}},{'State':{'Running':False}}]:
   with self.assertRaises(ValueError):self.target.target_identity({**base,**change},self.env)
 def test_password_sql_quotes_are_escaped(self):
  self.assertEqual(self.plan.literal("a'b"),"'a''b'")
class StorageReviewContracts(unittest.TestCase):
 def setUp(self):
  self.storage=SourceFileLoader('target_storage_tests',str(HERE/'transfer-target-storage.py')).load_module()
 def test_preexisting_identity_policy_or_group_stops_before_changes(self):
  class Admin:
   def policy_list(self):return json.dumps(self.policies)
   def user_list(self):return json.dumps(self.users)
   def group_list(self):return json.dumps(self.groups)
  a=Admin();a.policies={};a.users={};a.groups=[]
  self.storage.fresh_iam(a,'new-runtime')
  for attr,value in [('policies',{'new-runtime':{}}),('users',{'existing':{}}),('groups',['existing'])]:
   setattr(a,attr,value)
   with self.assertRaises(ValueError):self.storage.fresh_iam(a,'new-runtime')
   setattr(a,attr,[] if attr=='groups' else {})
 def test_effective_binding_rejects_extra_direct_or_inherited_permissions(self):
  class Admin:
   def user_info(self,key):return json.dumps(self.info)
   def policy_info(self,name):return json.dumps(self.policy)
   def user_list(self):return '{"runtime":{}}'
   def group_list(self):return '[]'
  a=Admin();a.info={'policyName':'intended','status':'enabled','memberOf':[]};a.policy=self.storage.plan.iam_policy()
  self.storage.effective_binding(a,'runtime','intended')
  for change in [{'policyName':'intended,consoleAdmin'},{'memberOf':['admins']},{'status':'disabled'}]:
   a.info={**{'policyName':'intended','status':'enabled','memberOf':[]},**change}
   with self.assertRaises(ValueError):self.storage.effective_binding(a,'runtime','intended')
  a.info={'policyName':'intended','status':'enabled','memberOf':[]};a.policy['Statement'].append({'Effect':'Allow','Action':['admin:*'],'Resource':['*']})
  with self.assertRaises(ValueError):self.storage.effective_binding(a,'runtime','intended')
 def test_policy_ordering_does_not_change_permission_comparison(self):
  p=self.storage.plan.iam_policy();q=json.loads(json.dumps(p));q['Statement'].reverse()
  for statement in q['Statement']:statement['Action'].reverse();statement['Resource'].reverse()
  self.assertEqual(self.storage.canonical_policy(p),self.storage.canonical_policy(q))
 def test_put_is_atomic_create_only_even_if_another_writer_wins(self):
  class Response:
   def close(self):pass
   def release_conn(self):pass
  class Runtime:
   def _execute(self,method,**kwargs):self.method=method;self.kwargs=kwargs;return Response()
  r=Runtime();self.storage.conditional_put(r,{'bucket':'training-images','key':'a.png'},b'data')
  self.assertEqual(r.kwargs['headers']['If-None-Match'],'*');self.assertEqual(r.kwargs['body'],b'data');self.assertEqual(r.method,'PUT')
  class Exists(Exception):code='PreconditionFailed'
  r._execute=lambda *a,**k:(_ for _ in ()).throw(Exists())
  self.storage.conditional_put(r,{'bucket':'training-images','key':'a.png'},b'data')
 def test_actual_training_and_harvest_methods_have_required_grants(self):
  plan=self.storage.plan;env={'POSTGRES_DB':'db_new','POSTGRES_ADMIN_USER':'owner','APP_DATABASE_URL':'postgresql://app:'+('a'*32)+'@postgres:5432/db_new','ML_DATABASE_URL':'postgresql://ml:'+('b'*32)+'@postgres:5432/db_new'}
  sql=plan.roles_sql(env)
  self.assertIn('GRANT INSERT, UPDATE ON public.training_batches, public.logos, public.declared_harvest_checks',sql)
  for table in ['training_batches','declared_harvest_checks','artwork_review_items']:self.assertIn('public."'+table+'"',sql)
if __name__=='__main__':unittest.main()
