#!/usr/bin/env python3
"""Read-only selective release export. Credentials stay in process memory.
Source rows and the archive must stay outside Git in a private directory.
"""
import argparse, hashlib, json, os, pathlib, shlex, subprocess, urllib.parse
TABLES = ('_prisma_migrations','logos','logo_images','training_data','reference_logos','gold_set_records','hard_negatives','model_versions','logo_embeddings')
APP = 'app-qsookwow8koko0kwg00g0cwk-171455207534'
def ssh_python(host, code, payload, target=None):
    result = subprocess.run(['ssh',host,'python3 -c '+shlex.quote(code)], input=json.dumps(payload).encode(), stdout=target or subprocess.PIPE, stderr=subprocess.PIPE, timeout=240)
    if result.returncode: raise RuntimeError('Read-only source operation failed; credentials and server stderr withheld')
    return result.stdout
REMOTE = "import sys,json,os,subprocess; p=json.load(sys.stdin); r=subprocess.run(p['args'],env={**os.environ,**p['env']},stdout=sys.stdout.buffer,stderr=subprocess.PIPE); sys.exit(r.returncode)"
def source_env():
    result=subprocess.run(['ssh','vanilla','docker inspect '+shlex.quote(APP)],capture_output=True,check=True,timeout=30)
    env=dict(item.split('=',1) for item in json.loads(result.stdout)[0]['Config']['Env'])
    u=urllib.parse.urlsplit(env['DATABASE_URL'])
    return {'PGHOST':u.hostname,'PGPORT':str(u.port or 5432),'PGDATABASE':u.path.strip('/'),'PGUSER':urllib.parse.unquote(u.username),'PGPASSWORD':urllib.parse.unquote(u.password)}
def fingerprint(env):
    result={}
    for table in TABLES:
        sql='SELECT row_to_json(t)::text FROM public."'+table+'" t ORDER BY id'
        data=ssh_python('cherry',REMOTE,{'env':env,'args':['psql','-X','-At','-v','ON_ERROR_STOP=1','-c',sql]})
        result[table]={'rows':len(data.splitlines()),'sha256':hashlib.sha256(data).hexdigest()}
    return result

def private_package_path(value):
    output=pathlib.Path(value).resolve()
    if any((parent/'.git').exists() for parent in (output,*output.parents)):
        raise ValueError('Source package must be outside every Git checkout')
    output.mkdir(parents=True,exist_ok=True,mode=0o700)
    os.chmod(output,0o700)
    return output

def validate_ledger(ledger,migrations):
    expected={p.parent.name for p in migrations.glob('*/migration.sql')}
    names=[r['name'] for r in ledger]
    if len(names)!=len(set(names)) or set(names)!=expected:
        raise ValueError('Source migration names do not exactly match this release')
    proof=[]
    for row in ledger:
        path=migrations/row['name']/'migration.sql'
        matches=hashlib.sha256(path.read_bytes()).hexdigest()==row['checksum']
        proof.append({'name':row['name'],'match':matches,'finished':row['finished'],'rolled_back':row['rolled_back']})
    if not all(x['match'] and x['finished'] and not x['rolled_back'] for x in proof):
        raise ValueError('Source migration ledger does not match this release')
    return proof

def main():
    p=argparse.ArgumentParser(); p.add_argument('--output',required=True); args=p.parse_args()
    output=private_package_path(args.output); root=pathlib.Path(__file__).resolve().parents[3]
    os.umask(0o077)
    env=source_env(); before=fingerprint(env)
    ledger_sql="SELECT json_agg(json_build_object('name',migration_name,'checksum',checksum,'finished',finished_at IS NOT NULL,'rolled_back',rolled_back_at IS NOT NULL) ORDER BY migration_name) FROM _prisma_migrations"
    ledger=json.loads(ssh_python('cherry',REMOTE,{'env':env,'args':['psql','-X','-At','-c',ledger_sql]}))
    migrations=root/'apps/api/prisma/migrations'
    ledger_proof=validate_ledger(ledger,migrations)
    (output/'ledger-checksums.json').write_text(json.dumps(ledger_proof,indent=2)+'\n')
    all_tables=ssh_python('cherry',REMOTE,{'env':env,'args':['psql','-X','-At','-c',"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"]}).decode().splitlines()
    dump_args=['pg_dump','--schema=public','--format=custom','--no-owner','--no-acl']
    dump_args += ['--exclude-table-data=public.'+t for t in all_tables if t not in TABLES]
    archive=output/'database.dump'
    with archive.open('wb') as f: ssh_python('cherry',REMOTE,{'env':env,'args':dump_args},target=f)
    after=fingerprint(env)
    if before!=after: archive.unlink(); raise SystemExit('Source changed during export; retry with a stable snapshot')
    manifest={'source':'ACC readonly selective pg_dump snapshot','table_fingerprints':after,'application_tables':len(all_tables)-1,'excluded_table_data':[t for t in all_tables if t not in TABLES],'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'archive_bytes':archive.stat().st_size,'credentials_exported':False}
    (output/'database-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'status':'exported','tables':{t:v['rows'] for t,v in after.items()},'archive_bytes':manifest['archive_bytes']}))
if __name__=='__main__': main()
