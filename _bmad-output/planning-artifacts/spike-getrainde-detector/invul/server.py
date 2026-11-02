"""Invulpagina voor Friso (CAP-3; toetsset §6). Lokale server op 127.0.0.1, alleen standaardbibliotheek.

Serveert de pagina, `items.json`, de beelden onder de map en `/stand`; elke opslag gaat via `uitslag.valideer` en
landt atomisch (tijdelijk bestand + os.replace) in `<map>/uitslag.json`, één opslag tegelijk. Een opslag zonder
`status` (een tussenstand) houdt de status die het etiket al had, en de lijst `bevestigde_codes` (ronde 9: een keuze
op een nieuwe rij telt pas na Bevestigen); een opslag met status `bevestigd` zet `bevestigde_codes` op alle gekozen codes. Alleen aanvragen voor 127.0.0.1/localhost op de eigen
poort, en POST alleen vanaf de eigen pagina (Origin): andere pagina's in dezelfde browser krijgen 403.

  python invul/server.py --map ~/logo-meetset-20261018/proef-detector/toets [--poort 8765]
"""
import argparse
import json
import mimetypes
import os
import sys
import tempfile
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import beelden  # noqa: E402
import uitslag  # noqa: E402

PAGINA = Path(__file__).resolve().parent / "index.html"


def _lees(pad):
    return json.loads(pad.read_text(encoding="utf-8")) if pad.exists() else {}


def _schrijf_atomisch(pad, data):
    fd, tmp = tempfile.mkstemp(dir=pad.parent, prefix=".uitslag-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
        os.replace(tmp, pad)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # geen beelden, codes of tekst in de log
        pass

    def _stuur(self, code, data, soort="application/json; charset=utf-8"):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", soort)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _vreemd(self):
        """Host niet 127.0.0.1/localhost op deze poort (DNS-rebinding), of een POST vanaf een andere pagina (CSRF)."""
        hosts = {f"127.0.0.1:{self.server.server_address[1]}", f"localhost:{self.server.server_address[1]}"}
        if self.headers.get("Host") not in hosts:
            return True
        origin = self.headers.get("Origin")
        return self.command == "POST" and origin is not None and origin not in {f"http://{h}" for h in hosts}

    def do_GET(self):
        if self._vreemd():
            return self._stuur(403, {"fout": "verboden"})
        srv, pad = self.server, unquote(urlsplit(self.path).path)
        if pad in ("/", "/index.html"):
            return self._stuur(200, PAGINA.read_bytes(), "text/html; charset=utf-8")
        if pad == "/stand":
            with srv.lock:
                u = _lees(srv.bestand)
            return self._stuur(200, {"uitslag": u, "stand": uitslag.stand(u),
                                     "na_te_lopen": sum(map(uitslag.na_te_lopen, u.values()))})
        doel = (srv.map / pad.lstrip("/")).resolve()
        if not doel.is_relative_to(srv.map.resolve()) or not doel.is_file():
            return self._stuur(404, {"fout": "niet gevonden"})
        return self._stuur(200, doel.read_bytes(), mimetypes.guess_type(doel.name)[0] or "application/octet-stream")

    def do_POST(self):
        srv = self.server
        if self._vreemd():
            return self._stuur(403, {"fout": "verboden"})
        if urlsplit(self.path).path != "/opslaan":
            return self._stuur(404, {"fout": "niet gevonden"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)))
            waarde = dict(uitslag.valideer(body, srv.ids))
        except (ValueError, TypeError):
            return self._stuur(400, {"fout": "ongeldige opslag"})
        waarde.setdefault("tijd", datetime.now().astimezone().isoformat(timespec="seconds"))
        with srv.lock:  # ponytail: één lock voor alle opslagen; genoeg voor één invuller
            u = _lees(srv.bestand)
            oud = u.get(body["id"], {})
            if "status" not in waarde and "status" in oud:  # tussenstand: "bevestigd" blijft, mits de 8 oude volledig
                try:
                    waarde = dict(uitslag.valideer({"id": body["id"], "waarde": {**waarde, "status": oud["status"]}},
                                                   srv.ids, vereist=uitslag.KEURMERKEN_R5))
                except ValueError:
                    waarde = None
                if waarde is not None and oud["status"] == "bevestigd":
                    waarde["bevestigde_codes"] = sorted(uitslag.bevestigde_codes(oud))
            elif waarde.get("status") == "bevestigd":
                waarde["bevestigde_codes"] = sorted(waarde["keurmerken"])
            if waarde is not None:
                u[body["id"]] = waarde
                _schrijf_atomisch(srv.bestand, u)
        if waarde is None:
            return self._stuur(400, {"fout": "tussenstand maakt een bevestigd etiket onvolledig"})
        return self._stuur(200, {"ok": True})


def maak_server(map_, poort=0):
    map_ = beelden.veilig_doel(Path(map_))
    srv = ThreadingHTTPServer(("127.0.0.1", poort), Handler)
    srv.daemon_threads = True
    srv.map, srv.bestand, srv.lock = map_, map_ / "uitslag.json", threading.Lock()
    srv.ids = {i["id"] for i in json.loads((map_ / "items.json").read_text(encoding="utf-8"))}
    return srv


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--map", required=True, help="map met items.json, beelden/ en uitslag.json")
    ap.add_argument("--poort", type=int, default=8765)
    args = ap.parse_args(argv)
    srv = maak_server(Path(args.map).expanduser(), args.poort)
    print(f"http://127.0.0.1:{srv.server_address[1]}/  ({len(srv.ids)} etiketten)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
