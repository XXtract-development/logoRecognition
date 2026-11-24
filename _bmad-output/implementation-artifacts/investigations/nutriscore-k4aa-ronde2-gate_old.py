import json,glob,os,sys,collections
sys.path.insert(0,'/Users/frisovanweelden/Documents/projects/logoRecognition/skua/apps/ml-service')
sys.path.insert(0,'/Users/frisovanweelden/Documents/projects/logoRecognition/skua/scripts')
os.environ['K4AA_SIGLIP_PATH']=glob.glob(os.path.expanduser('~/.cache/huggingface/hub/models--google--siglip2-base-patch16-384/snapshots/*'))[0]
import numpy as np
from PIL import Image
import nutriscore_measure as nm
import importlib.util,types
from unittest.mock import MagicMock
for m in ['asyncpg','asyncpg.exceptions','fastapi','httpx','cv2','app','app.core','app.core.config','app.services','app.services.artwork_proposals','app.services.database','app.symbol_contract']:
    try: __import__(m)
    except Exception: sys.modules[m]=MagicMock()
normalize_code=lambda c:str(c).strip().upper()
sys.modules['app.symbol_contract'].normalize_code=normalize_code
sp=importlib.util.spec_from_file_location('k4aa','/Users/frisovanweelden/Documents/projects/logoRecognition/skua/apps/ml-service/app/services/k4aa.py'); k4aa=importlib.util.module_from_spec(sp); sp.loader.exec_module(k4aa)
B=os.path.expanduser('~/logo-meetset-20261018/')
SNAP=B+'ontwikkelmeting-20261028/fase-b/momentopname/'
refs=json.load(open(SNAP+'actieve-refs.json')); z=np.load(SNAP+'embeddings.npz')
idx={p:i for i,p in enumerate(z['pad'])}
R=z['siglip'][[idx[r['path']] for r in refs]].astype(np.float32); codes=[normalize_code(r['code']) for r in refs]
print('refs per NS code',collections.Counter(c for c in codes if c.startswith('NUTRI')))
truth=nm.load_truth(B+'nutriscore-k4aa-de-20261124/truth-deelset.json')
def L(d): return {os.path.basename(f)[:-5]:json.load(open(f)) for f in glob.glob(B+d+'/*.json')}
old=L('nutriscore-acc-k4aa-20261124'); new=L('nutriscore-k4aa-de-20261124/deelset')
emb=k4aa.get_embedder()
out=[]
for k,tl in truth.items():
    if k not in old or not (tl&set('ABC')): continue
    for d in old[k]['logoResults']['detections']:
        c=d['t3777_code']
        if not c.startswith('NUTRISCORE_'): continue
        b=d['bbox']; im=k4aa._rgb(Image.open(B+'proef-detector/toets/beelden/'+k+'.png'))
        crop=im.crop((b['x'],b['y'],b['x']+b['width'],b['y']+b['height']))
        top=k4aa.top_codes(emb.embed([crop]),R,codes,k=3)[0]
        # also top over all NS codes
        s=R@emb.embed([crop])[0]
        ns={}
        for j in np.argsort(-s):
            if codes[j].startswith('NUTRI'): ns.setdefault(codes[j],round(float(s[j]),3))
        sc=dict(top).get(c)
        gate_new = sc is not None and k4aa._letters_ok(c,sc,top)
        gate_old = sc is not None
        newl=''.join(sorted(nm.extract_letters(new.get(k,{}).get('logoResults'))))
        out.append(dict(id=k,truth=''.join(sorted(tl)),code=c[-1],top=[(a[-3:] if a.startswith('NUTRI') else a[:10],round(b,3)) for a,b in top],ns=ns,gate_old=gate_old,gate_new=gate_new,new_found=newl,orig=d['bbox']['x']))
json.dump(out,open('gate_old.json','w'),indent=1)
for r in out: print(r['truth'],r['code'],'old',int(r['gate_old']),'new',int(r['gate_new']),'nu gemeld',r['new_found'] or '-',r['top'],r['ns'])
