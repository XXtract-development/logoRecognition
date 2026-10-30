"""Gedeelde beeldnetwerken voor fase B (lokaal, CPU). SigLIP 2 B/16-384 en DINOv3 ViT-S/16.
Transparante beelden worden op wit gezet (alpha-compositie); daarna RGB. Embeddings L2-genormaliseerd."""
import numpy as np, torch
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
torch.set_grad_enabled(False)
SIGLIP = "google/siglip2-base-patch16-384"
DINO = "vit_small_patch16_dinov3.lvd1689m"

def rgb(im):
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA"); bg = Image.new("RGB", im.size, "white"); bg.paste(im, mask=im.split()[3]); return bg
    return im.convert("RGB")

class Embedder:
    def __init__(self, kind):
        self.kind = kind
        if kind == "siglip":
            from transformers import AutoModel, AutoProcessor
            self.m = AutoModel.from_pretrained(SIGLIP).eval(); self.p = AutoProcessor.from_pretrained(SIGLIP)
        elif kind == "dino":
            import timm
            self.m = timm.create_model(DINO, pretrained=True, num_classes=0).eval()
            cfg = timm.data.resolve_data_config({}, model=self.m); self.t = timm.data.create_transform(**cfg)
        else:
            raise ValueError(kind)

    def __call__(self, images, batch=16):
        out = []
        for i in range(0, len(images), batch):
            ims = [rgb(x) for x in images[i:i + batch]]
            if self.kind == "siglip":
                v = self.m.get_image_features(**self.p(images=ims, return_tensors="pt"))
                v = v.pooler_output if hasattr(v, "pooler_output") else v
            else:
                v = self.m(torch.stack([self.t(x) for x in ims]))
            v = v.float().numpy(); out.append(v / np.linalg.norm(v, axis=1, keepdims=True))
        return np.concatenate(out).astype(np.float32) if out else np.zeros((0, 1), np.float32)
