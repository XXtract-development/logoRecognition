"""Training van de detector (CAP-6; trainingsset-en-herkenning §5). RF-DETR (`rfdetr`, Apache-2.0), maat N.
S/M/L alleen met een vastgelegde verwijzing naar een besluit van Friso (`--besluit`; besluit 01-11-2026: eerst alleen N).

`config` is licht (stdlib); `train` en `snelheid` importeren `rfdetr`/`torch` pas bij gebruik (groep `detector`).
Uitvoer van rfdetr gaat expliciet naar `uit` (via beelden.veilig_doel, dus nooit in een git-werkboom); de
voorgetrainde gewichten komen in de cache van rfdetr (`RF_HOME`, standaard ~/.roboflow/models), buiten elke repo.

  python train.py snelheid --maat N --dataset <coco-map> --uit <map> [--iteraties 50 --tegels-per-epoch 5000 --epochs 20]
  python train.py train --fase nagemaakt --maat N --dataset <coco-map> --uit <map> --epochs 20 --seed 20261031 [--start <ckpt>]
      [--hervat <uit>/checkpoint_<n>.ckpt]   (gaat verder bij het volgende epoch; nacht.py zet dit zelf)
  ... --maat S --besluit "<verwijzing naar het besluit van Friso>"     (S/M/L; zonder besluit start er niets)
"""
import argparse
import hashlib
import json
import logging
import sys
import time
from pathlib import Path

import uitslag as uitslag_mod
from beelden import veilig_doel

MATEN = {"N": "RFDETRNano", "S": "RFDETRSmall", "M": "RFDETRMedium", "L": "RFDETRLarge"}
FASEN = ("nagemaakt", "echt")
# De enige klassenlijst (trainingsset §1): COCO-categorie-id = index + 1. De drie van ronde 5 (besluit Friso 01-11-2026)
# staan achteraan, zodat id 1–10 gelijk blijven; de vier van ronde 9 (besluit Friso 02-11-2026) daarachter (id 1–13 gelijk).
# Glutenvrij (ronde 10, besluit Friso 03-11-2026) is de 18e, achteraan (id 1–17 gelijk).
GLUTEN = "DIET_FREE_FROM_GLUTEN"
KLASSEN = ("EU_ORGANIC_FARMING", "GREEN_DOT", "RECYCLABLE_GENERAL_CLAIM", "NUTRISCORE_A", "NUTRISCORE_B", "NUTRISCORE_C",
           "PREGNANCY_WARNING", "MARINE_STEWARDSHIP_COUNCIL_LABEL", "WEIDEMELK", "VEGAN_SOCIETY_VEGAN_LOGO",
           "NUTRISCORE_D", "NUTRISCORE_E", "EUROPEAN_V_LABEL_VEGAN",
           "FOREST_STEWARDSHIP_COUNCIL_LABEL", "TRIMAN", "SOCIETY_PLASTICS_INDUSTRY", "ON_THE_WAY_TO_PLANETPROOF",
           GLUTEN)
MIN_GLUTEN_MET, MIN_ZONDER = 16, 35  # Gate C (stoppunt 2, meetregels §4 en §7)
_FSC = "FOREST_STEWARDSHIP_COUNCIL_LABEL"
VARIANTEN = {"EUROPEAN_V_LABEL_VEGETARIAN": "EUROPEAN_V_LABEL_VEGAN",  # variant → klasse (meetregels §2)
             "FOREST_STEWARDSHIP_COUNCIL_MIX": _FSC, "FOREST_STEWARDSHIP_COUNCIL_RECYCLED": _FSC,
             "FOREST_STEWARDSHIP_COUNCIL_100_PERCENT": _FSC}
CATEGORIEEN = [{"id": i + 1, "name": k, "supercategory": "keurmerk"} for i, k in enumerate(KLASSEN)]  # COCO van echt en nutrigreen
RESOLUTIE = {"N": 384, "S": 512, "M": 576, "L": 704}
GEWICHTEN = {  # rfdetr 1.11.2, rfdetr/assets/model_weights.py
    "N": ("rf-detr-nano.pth", "https://storage.googleapis.com/rfdetr/nano_coco/checkpoint_best_regular.pth"),
    "S": ("rf-detr-small.pth", "https://storage.googleapis.com/rfdetr/small_coco/checkpoint_best_regular.pth"),
    "M": ("rf-detr-medium.pth", "https://storage.googleapis.com/rfdetr/medium_coco/checkpoint_best_regular.pth"),
    "L": ("rf-detr-large-2026.pth", "https://storage.googleapis.com/rfdetr/rf-detr-large-2026.pth"),
}
BATCH = 4


def _maat(maat, besluit):
    """Gestript besluit of None; ValueError bij een onbekende maat, of bij S/M/L zonder besluit (trainingsset §5)."""
    if maat not in MATEN:
        raise ValueError(f"maat {maat!r} niet in {sorted(MATEN)}")
    besluit = (besluit or "").strip() or None
    if maat != "N" and besluit is None:
        raise ValueError(f"maat {maat} alleen met een vastgelegd besluit van Friso (--besluit \"<verwijzing>\"); N mag zonder")
    return besluit


def config(fase, maat, dataset, uit, epochs, seed, start=None, besluit=None, hervat=None):
    """Vaste trainingsconfiguratie; ValueError bij een andere fase of maat, of S/M/L zonder besluit, of een `hervat`
    (checkpoint om verder te gaan, CAP-18) dat niet bestaat; `uit` via veilig_doel. `besluit` (de verwijzing, of None
    bij N) en `hervat` komen zo ook in train-resultaat.json."""
    if fase not in FASEN:
        raise ValueError(f"fase {fase!r} niet in {FASEN}")
    besluit = _maat(maat, besluit)
    if hervat is not None and not Path(hervat).is_file():
        raise ValueError(f"hervatpunt {hervat} bestaat niet")
    uit = veilig_doel(uit)
    return {"fase": fase, "maat": maat, "besluit": besluit, "model": MATEN[maat], "resolutie": RESOLUTIE[maat],
            "dataset": str(dataset), "uit": str(uit), "epochs": int(epochs), "seed": int(seed), "batch_size": BATCH,
            "start": str(start) if start else None,
            "hervat": str(hervat) if hervat is not None else None, "gewichten": {"bestand": GEWICHTEN[maat][0], "url": GEWICHTEN[maat][1],
                                                                 "licentie": "Apache-2.0"}}


def _rfdetr_klasse(maat):
    import rfdetr

    return getattr(rfdetr, MATEN[maat])


def _apparaat():
    import torch

    return "mps" if torch.backends.mps.is_available() else "cpu"


def _sha256(pad):
    h = hashlib.sha256()
    with open(pad, "rb") as f:
        for blok in iter(lambda: f.read(1 << 20), b""):
            h.update(blok)
    return h.hexdigest()


def _op_schaal(dataset, doel, zijde):
    """Kopie van de COCO-set met beelden verkleind tot hoogstens `zijde` px (vakjes mee geschaald). rfdetr verkleint
    elke tegel toch tot zijn trainingsschaal; tegels van 1024 px ongeschaald aanbieden maakte een iteratie op MPS
    ±16× trager (gemeten 01-11-2026: N 29 s tegen 1,8 s per iteratie)."""
    import shutil

    from PIL import Image

    if doel.exists():
        shutil.rmtree(doel)
    for split in ("train", "valid", "test"):
        coco = json.loads((Path(dataset) / split / "_annotations.coco.json").read_text())
        (doel / split).mkdir(parents=True)
        factor = {}
        for im in coco["images"]:
            f = min(1.0, zijde / max(im["width"], im["height"]))
            factor[im["id"]], bron, uit = f, Path(dataset) / split / im["file_name"], doel / split / im["file_name"]
            if f == 1.0:
                shutil.copyfile(bron, uit)
                continue
            im["width"], im["height"] = round(im["width"] * f), round(im["height"] * f)
            with Image.open(bron) as b:
                b.convert("RGB").resize((im["width"], im["height"]), Image.LANCZOS).save(uit, quality=95)
        for a in coco["annotations"]:
            a["bbox"] = [v * factor[a["image_id"]] for v in a["bbox"]]
            a["area"] = a["bbox"][2] * a["bbox"][3]
        (doel / split / "_annotations.coco.json").write_text(json.dumps(coco))
    return doel


def train_argumenten(cfg, dataset_dir):
    """Argumenten voor `model.train` (zonder `device`/`progress_bar`): elk epoch een volledig checkpoint
    (`checkpoint_interval=1`), en `resume` alleen met een hervatpunt (trainingsset §12)."""
    a = {"dataset_dir": dataset_dir, "epochs": cfg["epochs"], "batch_size": cfg["batch_size"], "output_dir": cfg["uit"],
         "seed": cfg["seed"], "tensorboard": False, "num_workers": 0, "checkpoint_interval": 1}
    if cfg.get("hervat"):
        a["resume"] = cfg["hervat"]
    return a


def _train(cfg, log, voortgang=None):
    """Draait rfdetr.train met uitvoer onder cfg["uit"]; geeft (model, apparaat, seconden)."""
    uit = Path(cfg["uit"])
    uit.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(log, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s"))
    logging.getLogger().addHandler(handler)
    try:
        klasse, apparaat = _rfdetr_klasse(cfg["maat"]), _apparaat()
        model = klasse(pretrain_weights=cfg["start"]) if cfg["start"] else klasse()
        from rfdetr.datasets.coco import compute_multi_scale_scales

        mc = model.model_config
        zijde = max(compute_multi_scale_scales(mc.resolution, True, mc.patch_size, mc.num_windows))
        dataset = _op_schaal(cfg["dataset"], uit / f"dataset-{zijde}", zijde)
        logging.getLogger("proef.train").info("config %s apparaat %s schaal %d", json.dumps(cfg, sort_keys=True), apparaat,
                                              zijde)
        t0 = time.perf_counter()
        model.train(**train_argumenten(cfg, str(dataset)), device=apparaat, progress_bar=voortgang)
        duur = time.perf_counter() - t0
        logging.getLogger("proef.train").info("klaar in %.1f s", duur)
        return model, apparaat, duur
    finally:
        logging.getLogger().removeHandler(handler)
        handler.close()


def _gewichtsherkomst(cfg):
    """Herkomst van de voorgetrainde gewichten. Fase 2 (`start`) neemt de COCO-gewichten over uit het train-resultaat van
    fase 1 naast het startcheckpoint, zodat de herkomst niet verloren gaat; een ontbrekend bestand is een fout."""
    if cfg["start"]:
        vorige = Path(cfg["start"]).parent / "train-resultaat.json"
        if not vorige.exists():
            raise FileNotFoundError(f"herkomst van de gewichten onbekend: {vorige} ontbreekt naast het startcheckpoint")
        return {"bron": cfg["start"], "sha256": _sha256(cfg["start"]), "licentie": "Apache-2.0",
                "basis": json.loads(vorige.read_text())["gewichten"]}
    from rfdetr.assets.model_weights import get_model_cache_dir

    pad = Path(get_model_cache_dir()) / cfg["gewichten"]["bestand"]
    if not pad.exists():
        raise FileNotFoundError(f"voorgetrainde gewichten ontbreken: {pad}")
    return {**cfg["gewichten"], "pad": str(pad), "sha256": _sha256(pad)}


def _data_herkomst(cfg):
    """Herkomst van data van derden (CAP-16): de lijst van de vorige fase (train-resultaat.json naast het startcheckpoint)
    plus `<dataset>/herkomst.json` als die bestaat (een lijst; een los object telt als lijst van één). Zo draagt elk model
    dat op NutriGreen of OFF verder traint de attributie. Ontdubbeld op `bron`: volgorde van het eerste voorkomen,
    inhoud van het laatste (CAP-17)."""
    lijst = []
    if cfg["start"]:
        vorige = Path(cfg["start"]).parent / "train-resultaat.json"
        if vorige.exists():
            lijst += json.loads(vorige.read_text(encoding="utf-8")).get("data_herkomst", [])
    eigen = Path(cfg["dataset"]) / "herkomst.json"
    if eigen.exists():
        h = json.loads(eigen.read_text(encoding="utf-8"))
        lijst += h if isinstance(h, list) else [h]
    per_bron = {}
    for h in lijst:
        per_bron[h.get("bron")] = h  # dict houdt de volgorde van de eerste sleutel; de waarde is de laatste
    return list(per_bron.values())


def controleer_klassen(cfg):
    """ValueError als de COCO-set (`<dataset>/train`) andere categorieën heeft dan de klassen van `KLASSEN`, of het startcheckpoint
    (train-resultaat.json ernaast) andere `klassen`: rfdetr zou de kop dan stil opnieuw opbouwen (CAP-6)."""
    coco = Path(cfg["dataset"]) / "train" / "_annotations.coco.json"
    cat = {c["id"]: c["name"] for c in json.loads(coco.read_text())["categories"]} if coco.exists() else None
    if cat != {c["id"]: c["name"] for c in CATEGORIEEN}:
        raise ValueError(f"{coco} ontbreekt of heeft andere categorieën dan de {len(KLASSEN)} klassen van train.KLASSEN")
    if cfg["start"]:
        vorige = Path(cfg["start"]).parent / "train-resultaat.json"
        klassen = json.loads(vorige.read_text()).get("klassen") if vorige.exists() else None
        if klassen != list(KLASSEN):
            raise ValueError(f"startcheckpoint: {vorige} ontbreekt of heeft andere klassen ({klassen})")


class PoortGlutenvrij(Exception):
    """Gate C (besluit Friso 03-11-2026): te weinig bevestigde etiketten voor glutenvrij, of de toetsset is te klein."""


def poort_glutenvrij(uitslag_pad):
    """Gate C: weigert zolang de toetsset te klein is om glutenvrij te meten. Fail-closed: een ontbrekend of onleesbaar
    `toets/uitslag.json` weigert ook. Telt bevestigde etiketten (status "bevestigd") waarvan GLUTEN in bevestigde_codes
    staat (uitslag.bevestigde_codes), met keurmerken[GLUTEN] "aanwezig" (mét) of "afwezig" (zonder); minder dan
    MIN_GLUTEN_MET mét of minder dan MIN_ZONDER zonder weigert met het aantal.

    Geroepen door de dataset-bouwer (`echt.py dataset`) als de set glutenvrij-beelden bevat, níet door `train()`: de
    rooktests (test_cap06, test_ronde9) bouwen hun eigen mini-set met alle klassen en mogen niet door deze poort vallen."""
    try:
        uitslag_gelezen = json.loads(Path(uitslag_pad).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise PoortGlutenvrij(f"{uitslag_pad} ontbreekt of is onleesbaar; training geweigerd") from e
    if not isinstance(uitslag_gelezen, dict):
        raise PoortGlutenvrij(f"{uitslag_pad} heeft niet het verwachte formaat; training geweigerd")
    # Zelfde semantiek als de uitslag: alleen wat in bevestigde_codes staat telt (uitslag.bevestigde_codes, ook de telling
    # op de pagina en in per_keurmerk), dus een losse keuze die nog niet bevestigd is telt niet mee.
    telt = [r for r in uitslag_gelezen.values()
            if isinstance(r, dict) and isinstance(r.get("keurmerken"), dict) and GLUTEN in uitslag_mod.bevestigde_codes(r)]
    met = sum(1 for r in telt if r["keurmerken"].get(GLUTEN) == "aanwezig")
    zonder = sum(1 for r in telt if r["keurmerken"].get(GLUTEN) == "afwezig")
    if met < MIN_GLUTEN_MET:
        raise PoortGlutenvrij(f"{met} bevestigde etiketten mét glutenvrij; minimaal {MIN_GLUTEN_MET} nodig (stoppunt 2), "
                              "training geweigerd")
    if zonder < MIN_ZONDER:
        raise PoortGlutenvrij(f"{zonder} bevestigde etiketten zonder glutenvrij; minimaal {MIN_ZONDER} nodig "
                              "(meetregels §4 en §7), training geweigerd")


def train(cfg):
    """Eén trainingsfase; resultaat met checkpoint, sha256, seed, log, apparaat, klassen en herkomst van gewichten en
    data. Weigert vóór het werk een set of startcheckpoint met andere klassen (`controleer_klassen`)."""
    controleer_klassen(cfg)
    uit = Path(cfg["uit"])
    log = uit / "train.log"
    uit.mkdir(parents=True, exist_ok=True)
    _, apparaat, duur = _train(cfg, log)
    kandidaten = [uit / n for n in ("checkpoint_best_total.pth", "checkpoint_best_ema.pth", "checkpoint_best_regular.pth",
                                    "checkpoint.pth")]
    ckpt = next((p for p in kandidaten if p.exists()), None) or max(uit.glob("*.pth"), key=lambda p: p.stat().st_mtime)
    resultaat = {"config": cfg, "checkpoint": str(ckpt), "sha256": _sha256(ckpt), "seed": cfg["seed"], "log": str(log),
                 "apparaat": apparaat, "duur_s": duur, "gewichten": _gewichtsherkomst(cfg), "klassen": list(KLASSEN),
                 "data_herkomst": _data_herkomst(cfg)}
    (uit / "train-resultaat.json").write_text(json.dumps(resultaat, indent=1, sort_keys=True))
    return resultaat


def snelheid(maat, dataset, uit, iteraties=50, tegels_per_epoch=5000, epochs=20, besluit=None):
    """Snelheidsmeting op MPS (stoppunt 1). Traint één epoch op de eerste `iteraties × batch` trainingsbeelden van
    `dataset` en deelt de wandkloktijd van `model.train` door `iteraties`; vaste kosten (model bouwen, validatie)
    tellen mee, dus de schatting is aan de hoge kant. Verwachte duur van één fase = tegels_per_epoch / batch ×
    epochs × s_per_iteratie (standaard 5.000 tegels × 20 epochs; tegels van 1024 px, geschaald naar de resolutie van
    de maat). Zelfde maatregel als `config`, vóór enig werk."""
    import shutil

    besluit = _maat(maat, besluit)
    uit = veilig_doel(uit)
    deel = uit / "dataset"
    if deel.exists():
        shutil.rmtree(deel)
    n = iteraties * BATCH
    for split in ("train", "valid", "test"):
        coco = json.loads((Path(dataset) / split / "_annotations.coco.json").read_text())
        if split == "train":
            beelden = (coco["images"] * (n // max(1, len(coco["images"])) + 1))[:n]  # herhaald tot n beelden
        else:
            beelden = coco["images"][:BATCH]
        (deel / split).mkdir(parents=True)
        nieuwe, ann = [], []
        for i, im in enumerate(beelden):
            naam = f"{i:05d}-{im['file_name']}"
            shutil.copyfile(Path(dataset) / split / im["file_name"], deel / split / naam)
            nieuwe.append({**im, "id": i, "file_name": naam})
            ann += [{**a, "id": len(ann) + j, "image_id": i} for j, a in enumerate(x for x in coco["annotations"]
                                                                                   if x["image_id"] == im["id"])]
        (deel / split / "_annotations.coco.json").write_text(json.dumps({**coco, "images": nieuwe, "annotations": ann}))
    cfg = config("nagemaakt", maat, deel, uit / "run", epochs=1, seed=20261031, besluit=besluit)
    _, apparaat, duur = _train(cfg, uit / "snelheid.log", voortgang="tqdm")  # tqdm: stapsnelheid op stderr
    s = duur / iteraties
    meting = {"maat": maat, "besluit": besluit, "apparaat": apparaat, "iteraties": iteraties, "batch_size": BATCH, "resolutie": RESOLUTIE[maat],
            "s_per_iteratie": s, "tegels_per_epoch": tegels_per_epoch, "epochs": epochs,
            "verwacht_uur": tegels_per_epoch / BATCH * epochs * s / 3600}
    (uit / "snelheid.json").write_text(json.dumps(meting, indent=1, sort_keys=True))  # rfdetr schrijft ook naar stdout
    return meting


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    s = sub.add_parser("snelheid")
    s.add_argument("--maat", required=True)
    s.add_argument("--dataset", required=True)
    s.add_argument("--uit", required=True)
    s.add_argument("--iteraties", type=int, default=50)
    s.add_argument("--tegels-per-epoch", type=int, default=5000)
    s.add_argument("--epochs", type=int, default=20)
    s.add_argument("--besluit", help="verwijzing naar het besluit van Friso; verplicht voor S/M/L")
    t = sub.add_parser("train")
    t.add_argument("--fase", required=True)
    t.add_argument("--maat", required=True)
    t.add_argument("--dataset", required=True)
    t.add_argument("--uit", required=True)
    t.add_argument("--epochs", type=int, required=True)
    t.add_argument("--seed", type=int, default=20261031)
    t.add_argument("--start", help="checkpoint van fase 1 (bijtrainen op echte voorbeelden)")
    t.add_argument("--besluit", help="verwijzing naar het besluit van Friso; verplicht voor S/M/L")
    t.add_argument("--hervat", help="checkpoint_<n>.ckpt van deze fase: verder bij het volgende epoch (nacht.py)")
    a = ap.parse_args(argv)
    try:  # alleen de controle vooraf; een fout tijdens het werk houdt zijn traceback
        if a.stap == "snelheid":
            _maat(a.maat, a.besluit)
        else:
            cfg = config(a.fase, a.maat, a.dataset, a.uit, a.epochs, a.seed, a.start, besluit=a.besluit,
                         hervat=a.hervat)
            controleer_klassen(cfg)
    except ValueError as e:
        print(f"niet gestart: {e}", file=sys.stderr)
        return 2
    if a.stap == "snelheid":
        uitkomst = snelheid(a.maat, a.dataset, a.uit, a.iteraties, a.tegels_per_epoch, a.epochs, besluit=a.besluit)
    else:
        uitkomst = train(cfg)
    print(json.dumps(uitkomst, indent=1, sort_keys=True, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
