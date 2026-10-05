#!/usr/bin/env python3
"""Read-only exact-key object transfer; never list or mutate the source buckets."""
import argparse,hashlib,json,os,pathlib,shlex,subprocess,tarfile
from importlib.machinery import SourceFileLoader
source=SourceFileLoader('transfer_source',str(pathlib.Path(__file__).with_name('transfer-source.py'))).load_module()
REMOTE=r'''
import os,sys,json,hashlib,io,tarfile,concurrent.futures
from urllib.parse import urlsplit
from minio import Minio
import urllib3
p=json.load(sys.stdin); raw=os.environ['MINIO_ENDPOINT']; u=urlsplit(raw if '://' in raw else 'http://'+raw)
endpoint=u.hostname+':'+str(u.port or int(os.environ.get('MINIO_PORT','9000')))
client=Minio(endpoint,access_key=os.environ['MINIO_ACCESS_KEY'],secret_key=os.environ['MINIO_SECRET_KEY'],secure=os.environ.get('MINIO_USE_SSL','false').lower()=='true',http_client=urllib3.PoolManager(timeout=urllib3.Timeout(connect=3,read=15),retries=False))
def fetch(item):
 bucket,key=item
 try:
  before=client.stat_object(bucket,key); response=client.get_object(bucket,key)
  try:data=response.read()
  finally:response.close();response.release_conn()
  after=client.stat_object(bucket,key)
  if before.etag!=after.etag or before.size!=after.size or len(data)!=before.size:raise RuntimeError('source changed')
  return {'bucket':bucket,'key':key,'size':len(data),'sha256':hashlib.sha256(data).hexdigest(),'etag':after.etag,'content_type':after.content_type},data
 except Exception as e:return {'bucket':bucket,'key':key,'error':getattr(e,'code',type(e).__name__)},None
manifest=[]
with tarfile.open(fileobj=sys.stdout.buffer,mode='w|') as tar:
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for item,data in pool.map(fetch,p['objects']):
   manifest.append(item)
   if data is not None:
    info=tarfile.TarInfo('objects/'+item['bucket']+'/'+item['key']);info.size=len(data);info.mode=0o600;tar.addfile(info,io.BytesIO(data))
 data=json.dumps(manifest,indent=2).encode();info=tarfile.TarInfo('object-manifest.json');info.size=len(data);info.mode=0o600;tar.addfile(info,io.BytesIO(data))
'''
def object_keys(rows):
 result=set()
 for table,column in [('logo_images','storage_path'),('training_data','crop_path'),('reference_logos','storage_path'),('gold_set_records','crop_path'),('hard_negatives','crop_path')]:
  for row in rows.get(table,[]):
   path=row.get(column)
   if not path:continue
   bucket='training-images'; key=path
   if path.split('/')[0] in ('training-images','models','recognition-images','thumbnails'):bucket,key=path.split('/',1)
   if path.startswith('/') or '..' in path.split('/') or '://' in path or not key or any(c in path for c in ('\\','\x00','\n','\r')):raise ValueError('Unsafe source object path')
   result.add((bucket,key))
 result.update([('training-images','models/nutriscore-a2/v1/a2_mobilenetv3s.pt'),('training-images','models/nutriscore-a2/v1/a2_meta.json')])
 return sorted(result)
def verified_rows(folder):
 proof=json.loads((folder/'database-rehearsal.json').read_text())
 rows=(folder/'rows.json').read_bytes();manifest=(folder/'database-manifest.json').read_bytes()
 if proof.get('status')!='passed' or proof.get('rows_sha256')!=hashlib.sha256(rows).hexdigest() or proof.get('database_manifest_sha256')!=hashlib.sha256(manifest).hexdigest():
  raise ValueError('Object transfer requires the matching passed database rehearsal')
 if proof.get('archive_sha256')!=hashlib.sha256((folder/'database.dump').read_bytes()).hexdigest():
  raise ValueError('Object transfer database archive mismatch')
 return json.loads(rows)

def validate_object_manifest(manifest,keys):
 names=[(item['bucket'],item['key']) for item in manifest]
 if len(names)!=len(set(names)) or set(names)!=set(keys) or len(names)!=len(keys):
  raise ValueError('Object manifest must contain exactly one entry per requested key')
 if any('error' in item for item in manifest):raise ValueError('Requested source objects are missing or unreadable')

def verify_local_objects(folder,keys):
 manifest=json.loads((folder/'object-manifest.json').read_text());validate_object_manifest(manifest,keys)
 for item in manifest:
  data=(folder/'objects'/item['bucket']/item['key']).read_bytes()
  if len(data)!=item['size'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise ValueError('Local object hash mismatch')
 return {'status':'passed','requested':len(keys),'downloaded':len(manifest),'bytes':sum(x['size'] for x in manifest),'rows_sha256':hashlib.sha256((folder/'rows.json').read_bytes()).hexdigest(),'object_manifest_sha256':hashlib.sha256((folder/'object-manifest.json').read_bytes()).hexdigest()}

def main():
 p=argparse.ArgumentParser();p.add_argument('--package',required=True);p.add_argument('--verify-only',action='store_true');args=p.parse_args()
 folder=source.private_package_path(args.package);os.umask(0o077)
 proof={'status':'failed'}
 try:
  keys=object_keys(verified_rows(folder))
  if not args.verify_only:
   (folder/'object-keys.json').write_text(json.dumps(keys,indent=2)+'\n')
   cmd='docker exec -i ml-service-qsookwow8koko0kwg00g0cwk-171455209144 python -c '+shlex.quote(REMOTE)
   archive=folder/'objects.tar'
   with archive.open('wb') as f:
    r=subprocess.run(['ssh','vanilla',cmd],input=json.dumps({'objects':keys}).encode(),stdout=f,stderr=subprocess.PIPE,timeout=1800)
   if r.returncode:raise ValueError('Object export failed; server details withheld')
   with tarfile.open(archive) as tar:
    incoming=json.load(tar.extractfile('object-manifest.json'));validate_object_manifest(incoming,keys)
    expected={'objects/'+b+'/'+k for b,k in keys}|{'object-manifest.json'}
    members=tar.getmembers()
    if {m.name for m in members}!=expected or len(members)!=len(expected):raise ValueError('Object archive entries do not match requested objects')
    for member in members:
     path=(folder/member.name).resolve()
     if folder not in path.parents or not member.isfile():raise ValueError('Unsafe archive entry')
     path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
     with tar.extractfile(member) as data,path.open('wb') as output:output.write(data.read())
  proof=verify_local_objects(folder,keys);print(json.dumps(proof))
 except Exception as error:
  proof['failure_type']=type(error).__name__;raise SystemExit('Object verification failed; current failed proof recorded')
 finally:
  path=folder/'object-verification.json';path.write_text(json.dumps(proof,indent=2)+'\n');path.chmod(0o600)
if __name__=='__main__':main()
