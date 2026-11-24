import json,glob,os,sys,collections
sys.path.insert(0,'/Users/frisovanweelden/Documents/projects/logoRecognition/skua/scripts')
import nutriscore_measure as nm
B=os.path.expanduser('~/logo-meetset-20261018/')
truth=nm.load_truth(B+'nutriscore-k4aa-de-20261124/truth-deelset.json')
def L(d): return {os.path.basename(f)[:-5]:json.load(open(f)) for f in glob.glob(B+d+'/*.json')}
new=L('nutriscore-k4aa-de-20261124/deelset'); old=L('nutriscore-acc-k4aa-20261124')
def res(j): return (j.get('logoResults') or j.get('result') or {})
c=collections.Counter(); rows=[]
for k,tl in truth.items():
    if not tl: continue
    if k not in new or k not in old: c['ontbreekt',tuple(sorted(tl))]+=1; continue
    o=nm.extract_letters(res(old[k])); n=nm.extract_letters(res(new[k]))
    rows.append((k,sorted(tl),sorted(o),sorted(n)))
    c[(''.join(sorted(tl)),''.join(sorted(o)) or '-',''.join(sorted(n)) or '-')]+=1
for x,m in sorted(c.items(),key=str): print(m,x)
print(list(new[next(iter(new))].keys()))
