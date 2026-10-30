"""Lekcontrole (na bevriezen, vóór de meting): waarheidsvakken uitgeknipt, cosinus EfficientNet-B0 (ACC-keten:
convert('RGB') zonder alpha-compositie, Resize 256/CenterCrop 224, eerste 512 dims) en SigLIP 2 tegen alle 899
momentopnamebestanden; ≥ 0,98 = lekpaar (kaart, code). Schrijft <FASEB>/lekparen.json en lekcontrole.json."""
import json
import numpy as np, torch, torchvision
from torchvision import transforms
from PIL import Image
import fb_common as C
from fb_embed import Embedder

def b0():
    m = torchvision.models.efficientnet_b0(weights=torchvision.models.EfficientNet_B0_Weights.DEFAULT); m.classifier = torch.nn.Identity(); m.eval()
    tf = transforms.Compose([transforms.Resize(256), transforms.CenterCrop(224), transforms.ToTensor(), transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    def f(ims):
        with torch.no_grad():
            v = torch.cat([m(torch.stack([tf(x.convert("RGB")) for x in ims[i:i + 32]])) for i in range(0, len(ims), 32)]).numpy()[:, :512]
        return v / np.linalg.norm(v, axis=1, keepdims=True)
    return f

def main():
    M = C.FASEB / "momentopname"; z = np.load(M / "embeddings.npz")
    snap = [Image.open(M / "bestanden" / p) for p in z["pad"]]
    crops, keys = [], []
    for e in C.selectie()["etiketten"]:
        im = Image.open(e["bestand"]); im.load()
        for v in e["positieve_vakken"]:
            x1, y1, x2, y2 = v["box"]; crops.append(im.crop((round(x1), round(y1), round(x2), round(y2)))); keys.append((e["kaart"], v["code"]))
    eb = b0(); Sb = eb(crops) @ eb(snap).T
    Ss = Embedder("siglip")(crops) @ z["siglip"].T
    lek = sorted({k for k, a, b in zip(keys, Sb.max(1), Ss.max(1)) if a >= 0.98 or b >= 0.98})
    json.dump([list(k) for k in lek], open(C.FASEB / "lekparen.json", "w"))
    json.dump({"vakken": len(keys), "max_b0": [round(float(x), 4) for x in Sb.max(1)], "max_siglip": [round(float(x), 4) for x in Ss.max(1)],
               "sleutels": keys, "lekparen": lek}, open(C.FASEB / "lekcontrole.json", "w"))
    print("waarheidsvakken", len(keys), "lekparen", len(lek), lek[:20])

if __name__ == "__main__":
    main()
