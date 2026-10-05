#!/usr/bin/env python3
"""Offline target-backup receipt, coverage and failure-state contracts."""
import hashlib,json,pathlib,tempfile,unittest,subprocess
from importlib.machinery import SourceFileLoader
from unittest.mock import patch
HERE=pathlib.Path(__file__).parent
backup=SourceFileLoader('target_backup_tests',str(HERE/'transfer-target-backup.py')).load_module()
class BackupContracts(unittest.TestCase):
 def test_real_ledger_table_name_allowed_without_broadening_names(self):
  self.assertEqual(backup.table_identifier('_prisma_migrations'),'\"_prisma_migrations\"')
  self.assertEqual(backup.table_identifier('logos'),'\"logos\"')
  for name in ['_unexpected','_prisma_migrations; DROP TABLE users','public.users','users\"']:
   with self.assertRaises(ValueError):backup.table_identifier(name)
 def test_receipt_requires_same_resource_and_complete_success(self):
  backup.require_receipt({'status':'passed','resource':'logo-production-new'},'logo-production-new')
  for proof in [{'status':'failed','resource':'logo-production-new'},{'status':'passed','resource':'other'},{'status':'passed_database_only','resource':'logo-production-new'}]:
   with self.assertRaises(ValueError):backup.require_receipt(proof,'logo-production-new')
 def test_storage_pending_is_not_complete_success(self):
  with tempfile.TemporaryDirectory() as directory:
   self.assertEqual(backup.object_backup(pathlib.Path(directory),{}),{'status':'pending_target_storage'})
 def fixture(self,folder):
  data=b'trained-logo';manifest=[{'bucket':'training-images','key':'example.png','size':len(data),'sha256':hashlib.sha256(data).hexdigest()}]
  path=folder/'objects/training-images/example.png';path.parent.mkdir(parents=True);path.write_bytes(data)
  (folder/'object-manifest.json').write_text(json.dumps(manifest))
  proof={'status':'passed','resource':'logo-production-new','all_readback_sha256_match':True,'objects_verified':1,'source_rows_sha256':'rows-hash','source_object_manifest_sha256':'manifest-hash'}
  (folder/'target-storage-verification.json').write_text(json.dumps(proof))
  return proof
 def test_object_backup_contains_exact_hash_verified_target_equivalent_bytes(self):
  with tempfile.TemporaryDirectory() as directory:
   folder=pathlib.Path(directory);self.fixture(folder)
   with patch.object(backup.plan.objects,'verified_rows',return_value={}),patch.object(backup.plan.objects,'object_keys',return_value=[('training-images','example.png')]),patch.object(backup.plan.objects,'verify_local_objects',return_value={'rows_sha256':'rows-hash','object_manifest_sha256':'manifest-hash'}):
    proof=backup.object_backup(folder,{'PRODUCTION_RESOURCE_NAME':'logo-production-new'})
   self.assertEqual(proof['status'],'passed');self.assertEqual(proof['objects'],1);self.assertTrue((folder/'target-objects-backup.tar').exists())
 def test_mismatched_target_manifest_stops_before_backup(self):
  with tempfile.TemporaryDirectory() as directory:
   folder=pathlib.Path(directory);proof=self.fixture(folder);proof['source_object_manifest_sha256']='wrong';(folder/'target-storage-verification.json').write_text(json.dumps(proof))
   with patch.object(backup.plan.objects,'verified_rows',return_value={}),patch.object(backup.plan.objects,'object_keys',return_value=[('training-images','example.png')]),patch.object(backup.plan.objects,'verify_local_objects',return_value={'rows_sha256':'rows-hash','object_manifest_sha256':'manifest-hash'}):
    with self.assertRaises(ValueError):backup.object_backup(folder,{'PRODUCTION_RESOURCE_NAME':'logo-production-new'})
   self.assertFalse((folder/'target-objects-backup.tar').exists())
 def test_tampered_object_backup_fails_readback(self):
  with tempfile.TemporaryDirectory() as directory:
   folder=pathlib.Path(directory);self.fixture(folder);(folder/'objects/training-images/example.png').write_bytes(b'changed')
   with patch.object(backup.plan.objects,'verified_rows',return_value={}),patch.object(backup.plan.objects,'object_keys',return_value=[('training-images','example.png')]),patch.object(backup.plan.objects,'verify_local_objects',return_value={'rows_sha256':'rows-hash','object_manifest_sha256':'manifest-hash'}):
    with self.assertRaises(ValueError):backup.object_backup(folder,{'PRODUCTION_RESOURCE_NAME':'logo-production-new'})
 def test_failed_local_daemon_guard_replaces_stale_green_proof(self):
  with tempfile.TemporaryDirectory() as directory:
   folder=pathlib.Path(directory);(folder/'target-backup-verification.json').write_text('{"status":"passed"}');(folder/'target-backup-test.env').write_text('private')
   with patch.object(backup.rehearsal,'prove_local_docker',side_effect=ValueError('remote daemon')):
    with self.assertRaises(RuntimeError):backup.execute_backup({'PRODUCTION_RESOURCE_NAME':'logo-production-new'},folder,'chosen-new-container')
   proof=json.loads((folder/'target-backup-verification.json').read_text());self.assertEqual(proof['status'],'failed');self.assertTrue(proof['isolated_container_and_volumes_removed']);self.assertFalse((folder/'target-backup-test.env').exists())
 def test_cleanup_failure_revokes_pass_and_removes_private_env(self):
  with tempfile.TemporaryDirectory() as directory:
   envfile=pathlib.Path(directory)/'test.env';envfile.write_text('private');proof={'status':'passed'}
   with patch.object(backup.subprocess,'run',return_value=subprocess.CompletedProcess([],1)):
    backup.cleanup_test_container('only-owned-fixture',True,envfile,proof)
   self.assertEqual(proof['status'],'cleanup_failed');self.assertFalse(proof['isolated_container_and_volumes_removed']);self.assertFalse(envfile.exists())
 def test_cleanup_timeout_also_revokes_pass(self):
  with tempfile.TemporaryDirectory() as directory:
   envfile=pathlib.Path(directory)/'test.env';envfile.write_text('private');proof={'status':'passed'}
   with patch.object(backup.subprocess,'run',side_effect=subprocess.TimeoutExpired(['docker'],20)):
    backup.cleanup_test_container('only-owned-fixture',True,envfile,proof)
   self.assertEqual(proof['status'],'cleanup_failed');self.assertFalse(envfile.exists())
if __name__=='__main__':unittest.main()
