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
if __name__=='__main__':unittest.main()
