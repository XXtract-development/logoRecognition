"""Uitgavenbewaking (CAP-14; randvoorwaarden §3). Alleen standaardbibliotheek.

Een post start niet als de verwachte uitgave boven de grens ligt (1,5× de raming, of de vaste grens die Friso besliste,
§3); tijdens een post wordt een aanroep die de grens zou passeren niet verstuurd (de client vraagt `mag` vóór elke
aanroep). Kosten komen uit `usage.cost`, anders uit tokens × tarief (OpenRouter-tarieven 30-10-2026, dollar per
token). Met een grootboek (`PROEF_MAP/uitgaven.json`) telt
de grens per post over alle processen en herstarts: de bewaker leest bij de start wat de post al uitgaf en schrijft na
elke boeking de nieuwe stand weg."""
import json
import os

TARIEF = {
    "anthropic/claude-sonnet-5.5": (2e-6, 10e-6),
    "google/gemini-3.8-flash": (0.825e-6, 4.125e-6),
}


class BudgetOverschreden(Exception):
    """Verwachte uitgave van een post boven de grens (stoppunt 5)."""


def kosten_uit(envelope, model):
    usage = (envelope or {}).get("usage") or {}
    cost = usage.get("cost")
    if isinstance(cost, (int, float)) and not isinstance(cost, bool):
        return float(cost)
    tin, tuit = TARIEF[model]
    return (usage.get("prompt_tokens") or 0) * tin + (usage.get("completion_tokens") or 0) * tuit


class Bewaker:
    def __init__(self, post, raming, factor=1.5, grootboek=None, grens=None):
        self.post, self.raming, self.uitgegeven = post, raming, 0.0
        self.grens = raming * factor if grens is None else grens
        self.grootboek = None
        if grootboek:
            from beelden import veilig_doel  # grootboek staat in PROEF_MAP, nooit in een git-werkboom

            self.grootboek = veilig_doel(grootboek)
        if self.grootboek and self.grootboek.exists():
            self.uitgegeven = float(json.loads(self.grootboek.read_text()).get(post, 0.0))

    def controleer_start(self, verwacht):
        """Al uitgegeven (grootboek) plus de verwachte uitgave van deze run mag de grens niet passeren."""
        if self.uitgegeven + verwacht > self.grens:
            raise BudgetOverschreden(f"{self.post}: uitgegeven ${self.uitgegeven:.2f} + verwacht ${verwacht:.2f} "
                                     f"boven grens ${self.grens:.2f}")

    def mag(self, volgende):
        return self.uitgegeven + volgende <= self.grens

    def boek(self, bedrag):
        if not self.grootboek:
            self.uitgegeven += bedrag
            return
        data = json.loads(self.grootboek.read_text()) if self.grootboek.exists() else {}
        self.uitgegeven = data[self.post] = float(data.get(self.post, 0.0)) + bedrag  # telt mee wat een ander proces boekte
        tmp = self.grootboek.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=1, sort_keys=True))
        os.replace(tmp, self.grootboek)
