"""Nachttraining (CAP-18; trainingsset-en-herkenning §12). Alleen standaardbibliotheek (plus `beelden.veilig_doel`).

Een trainingsfase draait alleen tussen 22:00 en 07:30 (lokale tijd van deze Mac). `plan` legt de opdracht vast in
`<uit>/nacht.json` en schrijft een launchd-agent (label per uitvoermap) die elke dag om 22:00 `draai` start. `draai`
start de opdracht onder `caffeinate -i`, met `--hervat` het nieuwste leesbare `checkpoint_<n>.ckpt` van de eigen
uitvoermap, stuurt om 07:30 SIGTERM en na 300 s SIGKILL, ruimt oude checkpoints op en bewaakt stoppunt 1 zelf. Alleen
`draai` schrijft `nacht-status.json` (en `vrijgeven` wist daar stoppunt 1). Laden van de agent (`launchctl bootstrap`)
doet de hoofdsessie, niet dit script.

  python nacht.py plan --uit <map> --epochs 20 --fase echt [--plist <pad>] -- <python> train.py train ... --uit <map>
  python nacht.py draai --uit <map>        (launchd, dagelijks 22:00)
  python nacht.py status --uit <map>       (alleen lezen)
  python nacht.py stop --uit <map>         (handmatige pauze: SIGTERM naar het trainingsproces, uitkomst gepauzeerd)
  python nacht.py vrijgeven --uit <map>    (na een besluit van Friso over stoppunt 1)
"""
import argparse
import json
import os
import plistlib
import re
import signal
import subprocess
import sys
import time as _time
import zipfile
from datetime import datetime, time, timedelta
from pathlib import Path

from beelden import veilig_doel

BEGIN, EIND = time(22, 0), time(7, 30)
STOP_WACHT = 300  # s tussen SIGTERM en SIGKILL
HOUD = 2  # nieuwste leesbare checkpoints die blijven
MAX_NACHTEN = 4  # verwachte einddatum hoogstens zoveel dagen na de eerste start (stoppunt 1)
MAX_EPOCH_S = 9.5 * 3600  # één epoch langer dan het venster: stoppunt 1
LABEL = "com.xxtract.proef-nachttraining"
VENSTER_S = 9.5 * 3600
HIER = Path(__file__).resolve().parent
_CKPT = re.compile(r"checkpoint_(\d+)\.ckpt")


# --- venster --------------------------------------------------------------------------------------------------------

def in_venster(t):
    return t.time() >= BEGIN or t.time() < EIND


def einde(t):
    """De eerstvolgende 07:30 na `t`; alleen binnen het venster (anders ValueError)."""
    if not in_venster(t):
        raise ValueError(f"{t} ligt buiten het venster 22:00–07:30")
    dag = t.date() + timedelta(days=1) if t.time() >= BEGIN else t.date()
    return datetime.combine(dag, EIND, t.tzinfo)


def _volgend_begin(t):
    dag = t.date() if t.time() < BEGIN else t.date() + timedelta(days=1)
    return datetime.combine(dag, BEGIN, t.tzinfo)


def einddatum(t, seconden):
    """Moment waarop `seconden` vensterseconden vanaf `t` op zijn; buiten het venster pas vanaf de volgende 22:00."""
    if not in_venster(t):
        t = _volgend_begin(t)
    while True:
        e = einde(t)
        rest = (e - t).total_seconds()
        if seconden <= rest:
            return t + timedelta(seconds=seconden)
        seconden -= rest
        t = _volgend_begin(e)


# --- checkpoints ----------------------------------------------------------------------------------------------------

def checkpoints(uit):
    """[(epoch, pad)] van `checkpoint_<n>.ckpt` in `uit`, oplopend op epoch; andere bestanden tellen niet."""
    uit = Path(uit)
    if not uit.is_dir():
        return []
    gevonden = [(int(m.group(1)), p) for p in uit.iterdir() if (m := _CKPT.fullmatch(p.name))]
    return sorted(gevonden)


def _leesbaar(uit):
    return [(e, p) for e, p in checkpoints(uit) if zipfile.is_zipfile(p)]


def hervatpunt(uit):
    """Het nieuwste leesbare checkpoint van deze uitvoermap (een half geschreven nieuwste valt terug), of None."""
    leesbaar = _leesbaar(uit)
    return leesbaar[-1][1] if leesbaar else None


def opruimen(uit):
    """Verwijdert `checkpoint_<n>.ckpt` behalve de nieuwste HOUD leesbare; nooit `checkpoint_best_*` of iets anders."""
    houd = {p for _, p in _leesbaar(uit)[-HOUD:]}
    for _, p in checkpoints(uit):
        if p not in houd:
            p.unlink()


# --- plan en launchd ------------------------------------------------------------------------------------------------

def label(uit):
    """launchd-label per uitvoermap, zodat twee fasen elk hun eigen agent krijgen."""
    return f"{LABEL}.{Path(uit).name}"


def plan(uit, opdracht, epochs, fase):
    """Legt de trainingsopdracht van één fase vast in `<uit>/nacht.json`; `--hervat` zet `draai` zelf. Weigert een
    uitvoermap die al een plan, een status of checkpoints heeft."""
    if "--hervat" in opdracht:
        raise ValueError("--hervat hoort niet in de opdracht: draai kiest zelf het hervatpunt")
    uit = veilig_doel(Path(uit))
    if (uit / "nacht.json").exists() or (uit / "nacht-status.json").exists() or checkpoints(uit):
        raise ValueError(f"{uit} heeft al een plan, een status of checkpoints; kies een lege uitvoermap")
    uit.mkdir(parents=True, exist_ok=True)
    data = {"opdracht": [str(c) for c in opdracht], "epochs": int(epochs), "fase": fase,
            "venster": [BEGIN.strftime("%H:%M"), EIND.strftime("%H:%M")], "uit": str(uit)}
    (uit / "nacht.json").write_text(json.dumps(data, indent=1) + "\n")
    return data


def plist(python, script, uit):
    """launchd-agent: dagelijks om 22:00 `draai` voor deze uitvoermap; logs in de uitvoermap."""
    return plistlib.dumps({
        "Label": label(uit),
        "ProgramArguments": [str(python), str(script), "draai", "--uit", str(uit)],
        "StartCalendarInterval": {"Hour": BEGIN.hour, "Minute": BEGIN.minute},
        "WorkingDirectory": str(Path(script).resolve().parent),
        "StandardOutPath": str(Path(uit) / "nacht-launchd.log"),
        "StandardErrorPath": str(Path(uit) / "nacht-launchd.err"),
    })


# --- status ---------------------------------------------------------------------------------------------------------

def _iso(t):
    return t.isoformat(timespec="seconds") if t else None


def _staat(uit):
    pad = Path(uit) / "nacht-status.json"
    return json.loads(pad.read_text()) if pad.exists() else {}


def _stand(uit, nu):
    """Stand van de fase, uit de checkpoints en de opgeslagen status. Schrijft niets."""
    uit = Path(uit)
    p = json.loads((uit / "nacht.json").read_text())
    s = _staat(uit)
    leesbaar = [e for e, _ in _leesbaar(uit)] + [int(e) for e in s.get("epochs", [])]
    klaar = max(leesbaar) + 1 if leesbaar else 0
    duren = s.get("epoch_s", [])
    gem = sum(duren) / len(duren) if duren else None
    rest = max(0, p["epochs"] - klaar)
    verwacht = einddatum(nu, rest * gem) if gem is not None and rest else None
    s.update({"fase": p["fase"], "epochs_totaal": p["epochs"], "epochs_klaar": klaar, "gem_epoch_s": gem,
              "verwacht_klaar": _iso(verwacht)})
    for k in ("eerste_start", "laatste_start", "laatste_stop", "uitkomst", "stoppunt_1"):
        s.setdefault(k, None)
    return s


def status(uit, nu):
    """Stand van de fase (alleen lezen): epochs klaar/totaal, gemiddelde epochduur en de verwachte einddatum in
    vensteruren; `stoppunt_1` met reden, of None. `draai` is de enige die `nacht-status.json` schrijft."""
    return _stand(uit, nu)


def _bijwerken(uit, nu):
    s = _stand(uit, nu)
    _bewaar(uit, s)
    return s


def _bewaar(uit, s):
    pad = veilig_doel(Path(uit) / "nacht-status.json")
    tmp = pad.with_suffix(".tmp")
    tmp.write_text(json.dumps(s, indent=1, sort_keys=True) + "\n")
    os.replace(tmp, pad)


def vrijgeven(uit):
    """Wist stoppunt 1 na een besluit van Friso; daarna start `draai` weer."""
    s = _staat(uit)
    s["stoppunt_1"] = None
    _bewaar(uit, s)


# --- slot, pauze en draai -------------------------------------------------------------------------------------------

def _levend(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def _ps_command(pid):
    try:
        return subprocess.run(["ps", "-p", str(pid), "-o", "command="], capture_output=True, text=True).stdout
    except OSError:
        return ""


def _slot_pid(uit, ps=_ps_command):
    """Het pid in `nacht.slot` als dat nog een trainingsproces is (`train.py` in de opdrachtregel). Een verouderd
    slot (dood pid, of een hergebruikt pid dat geen trainingsproces is) wordt opgeruimd en telt niet als bezet."""
    slot = Path(uit) / "nacht.slot"
    if not slot.exists():
        return None
    try:
        pid = int(slot.read_text().strip())
    except ValueError:
        pid = None
    if pid and _levend(pid) and "train.py" in ps(pid):
        return pid
    slot.unlink(missing_ok=True)
    return None


def stop(uit, kill=os.kill, ps=_ps_command):
    """Handmatige pauze: SIGTERM naar het trainingsproces in het slot. `draai` legt daarna de uitkomst 'gepauzeerd'
    vast (via het stopbestand). Geeft het pid, of None als er geen draai loopt."""
    uit = Path(uit)
    pid = _slot_pid(uit, ps)
    if pid is None:
        return None
    veilig_doel(uit / "nacht.stop").write_text(f"{datetime.now().isoformat(timespec='seconds')}\n")
    kill(pid, signal.SIGTERM)
    return pid


def _nieuw(uit, voor):
    """Checkpoints die sinds `voor` ({pad: mtime}) zijn geschreven of overschreven: [(mtime, epoch)]."""
    uit_ = []
    for e, p in checkpoints(uit):
        m = p.stat().st_mtime
        if voor.get(p) != m:
            uit_.append((m, e))
    return sorted(uit_)


def _stop_proces(proces):
    """SIGTERM, na STOP_WACHT s SIGKILL; geeft de returncode."""
    proces.terminate()
    try:
        return proces.wait(timeout=STOP_WACHT)
    except subprocess.TimeoutExpired:
        proces.kill()
        return proces.wait(timeout=60)


def draai(uit, nu=datetime.now, popen=subprocess.Popen, slaap=_time.sleep, poll_s=60, ps=_ps_command):
    """Eén nachtrun van de fase in `uit`; geeft de uitkomst: klaar, stoppunt_1, buiten_venster, bezet, afgerond,
    gepauzeerd of fout (trainingsset §12)."""
    uit = Path(uit)
    if (uit / "train-resultaat.json").exists():
        return "klaar"
    if _staat(uit).get("stoppunt_1"):
        return "stoppunt_1"
    start = nu()
    if not in_venster(start):
        return "buiten_venster"
    if _slot_pid(uit, ps) is not None:
        return "bezet"
    try:
        return _draai(uit, start, nu, popen, slaap, poll_s)
    finally:
        (uit / "nacht.slot").unlink(missing_ok=True)


def _draai(uit, start, nu, popen, slaap, poll_s):
    p = json.loads((uit / "nacht.json").read_text())
    opdracht = list(p["opdracht"])
    punt = hervatpunt(uit)
    if punt is not None:
        opdracht += ["--hervat", str(punt)]
    s = _staat(uit)
    s["eerste_start"] = s.get("eerste_start") or _iso(start)
    s.update({"laatste_start": _iso(start), "uitkomst": "loopt", "hervat": str(punt) if punt else None})
    _bewaar(uit, s)
    voor = {pad: pad.stat().st_mtime for _, pad in checkpoints(uit)}
    eind = einde(start)
    stopbestand = uit / "nacht.stop"
    stopbestand.unlink(missing_ok=True)
    gezien, gestopt, rc, fout = 0, False, None, None
    log = open(veilig_doel(uit / "nacht-train.log"), "a", encoding="utf-8")
    try:
        proces = popen(opdracht, stdout=log, stderr=subprocess.STDOUT, cwd=str(HIER))
        veilig_doel(uit / "nacht.slot").write_text(f"{proces.pid}\n")  # het slot: het trainingsproces zelf
        cafe = None
        try:
            cafe = popen(["caffeinate", "-i", "-w", str(proces.pid)])
        except OSError as e:  # het trainingsproces draait al; zonder caffeinate geen verweesde trainer laten lopen
            fout = f"caffeinate kon niet starten: {e}"
            rc = _stop_proces(proces)
        while fout is None:
            rc = proces.poll()
            gezien = _registreer(uit, voor, start, gezien)
            if rc is not None:
                break
            t = nu()
            if t >= eind:  # 07:30: PyTorch Lightning stopt op een batchgrens; het lopende epoch gaat verloren
                gestopt = True
                rc = _stop_proces(proces)
                break
            slaap(max(0.0, min(poll_s, (eind - t).total_seconds())))
        gezien = _registreer(uit, voor, start, gezien)
        if cafe is not None and cafe.poll() is None:
            cafe.terminate()
    finally:
        log.close()
    stop = nu()
    if stopbestand.exists():  # `stop` heeft het trainingsproces weggestuurd
        gestopt = True
    if fout:
        uitkomst = "fout"
    elif rc == 0 and (uit / "train-resultaat.json").exists():
        uitkomst = "afgerond"
    elif gestopt:
        uitkomst = "gepauzeerd"
    else:
        uitkomst = "fout"
    opruimen(uit)
    s = _staat(uit)
    s.update({"laatste_stop": _iso(stop), "uitkomst": uitkomst, "returncode": rc, "reden_fout": fout})
    _bewaar(uit, s)
    reden = None
    duur = (stop - start).total_seconds()
    # ponytail: "volledig venster" = minstens 90% van het venster gelopen (launchd start soms iets later dan 22:00)
    if gestopt and not gezien and duur >= 0.9 * VENSTER_S:
        reden = f"een volledig venster ({duur / 3600:.1f} uur) zonder nieuw checkpoint"
    elif not gezien and uitkomst != "afgerond":  # R10: elke run zonder nieuw checkpoint is een stoppunt
        reden = "geen nieuw checkpoint in een run"
    elif any(d > MAX_EPOCH_S for d in (s.get("epoch_s", [])[-gezien:] if gezien else [])):
        reden = f"een epoch duurde langer dan {MAX_EPOCH_S / 3600:.1f} uur"
    else:
        st = _stand(uit, stop)
        if st["verwacht_klaar"] and datetime.fromisoformat(st["verwacht_klaar"]) > \
                datetime.fromisoformat(st["eerste_start"]) + timedelta(days=MAX_NACHTEN):
            reden = f"verwachte einddatum {st['verwacht_klaar']} ligt meer dan {MAX_NACHTEN} nachten na de eerste start"
    if reden:
        s = _staat(uit)
        s["stoppunt_1"] = reden
        _bewaar(uit, s)
    _bijwerken(uit, stop)
    return uitkomst


def _registreer(uit, voor, start, gezien):
    """Nieuwe checkpoints van deze run: epochduur (mtime min vorige, de eerste min de start) in de status."""
    nieuw = _nieuw(uit, voor)
    if len(nieuw) <= gezien:
        return gezien
    s = _staat(uit)
    tijden = [start.timestamp()] + [m for m, _ in nieuw]
    s.setdefault("epoch_s", []).extend(tijden[i + 1] - tijden[i] for i in range(gezien, len(nieuw)))
    s["epochs"] = sorted(set(s.get("epochs", [])) | {e for _, e in nieuw})
    _bewaar(uit, s)
    return len(nieuw)


# --- opdrachtregel --------------------------------------------------------------------------------------------------

def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    opdracht = []
    if "--" in argv:
        i = argv.index("--")
        argv, opdracht = argv[:i], argv[i + 1:]
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="stap", required=True)
    pl = sub.add_parser("plan")
    pl.add_argument("--uit", required=True, type=Path)
    pl.add_argument("--epochs", required=True, type=int)
    pl.add_argument("--fase", required=True, choices=("nagemaakt", "echt"))
    pl.add_argument("--plist", type=Path, help="standaard ~/Library/LaunchAgents/<label per uitvoermap>.plist")
    for naam in ("draai", "status", "vrijgeven", "stop"):
        sub.add_parser(naam).add_argument("--uit", required=True, type=Path)
    a = ap.parse_args(argv)
    if a.stap == "plan":
        if not opdracht:
            ap.error("plan vraagt de trainingsopdracht na --")
        try:
            plan(a.uit, opdracht, a.epochs, a.fase)
        except ValueError as e:
            print(f"niet gepland: {e}", file=sys.stderr)
            return 2
        doel = veilig_doel(a.plist or Path.home() / "Library" / "LaunchAgents" / f"{label(a.uit)}.plist")
        doel.parent.mkdir(parents=True, exist_ok=True)
        doel.write_bytes(plist(sys.executable, Path(__file__).resolve(), a.uit.resolve()))
        print(f"gepland: {a.uit}/nacht.json; launchd-agent {doel} (laden: launchctl bootstrap gui/$(id -u) {doel})")
    elif a.stap == "draai":
        uitkomst = draai(a.uit)
        print(datetime.now().isoformat(timespec="seconds"), uitkomst, flush=True)
        return 0 if uitkomst in ("klaar", "buiten_venster", "bezet", "afgerond", "gepauzeerd") else 1
    elif a.stap == "status":
        print(json.dumps(status(a.uit, datetime.now()), indent=1, sort_keys=True))
    elif a.stap == "stop":
        pid = stop(a.uit)
        if pid is None:
            print("geen draai actief: geen trainingsproces in het slot", file=sys.stderr)
            return 1
        print(f"SIGTERM naar trainingsproces {pid}; draai legt de uitkomst 'gepauzeerd' vast")
    else:
        vrijgeven(a.uit)
        print("stoppunt 1 vrijgegeven")
    return 0


if __name__ == "__main__":
    sys.exit(main())
