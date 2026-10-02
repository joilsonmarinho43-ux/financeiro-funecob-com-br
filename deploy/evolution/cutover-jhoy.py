#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime
import json, re, shutil, subprocess, time
import urllib.request

backup = Path("/root/funecob/backups/migracao-20261002-122831")
lab = Path("/root/funecob/evolution-lab")
cfg = json.loads((backup / "jhoy-config.json").read_text())
hook = json.loads((backup / "jhoy-webhook.json").read_text())
env = {}
for line in (lab / ".env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v
assert cfg["id"] == "aa0cda4a-4617-4af0-b640-c10fcd7b5f9d"
assert cfg["name"] == "Jhoy"
assert hook.get("enabled") and hook.get("url") and hook.get("events")
newkey = env["LAB_API_KEY"]
def api(base, key, route, body=None):
    req = urllib.request.Request(base + route,
        data=None if body is None else json.dumps(body).encode(),
        headers={"apikey": key, "Content-Type": "application/json"},
        method="GET" if body is None else "POST")
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.load(r)
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError("API retornou erro na rota " + route)
    return data
newbase = "http://127.0.0.1:18081"
oldbase = "http://127.0.0.1:8080"
def state():
    return api(newbase, newkey, "/instance/connectionState/Jhoy").get("instance", {}).get("state")
if state() != "open":
    raise SystemExit("Jhoy nova nao esta open. Nenhuma troca realizada.")
# Persist the shared network only for this API service.
compose = lab / "compose.yaml"
text = compose.read_text()
stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
shutil.copy2(compose, backup / ("compose-before-cutover-" + stamp + ".yaml"))
if "funecob_external:" not in text:
    assert text.count("  api:\n") == 1
    assert not re.search(r"(?m)^networks:", text)
    api_section = text.split("  api:\n",1)[1].split("\nvolumes:",1)[0]
    assert not re.search(r"(?m)^    networks:", api_section)
    text = text.replace("  api:\n",
        "  api:\n    networks:\n      default: {}\n      funecob_external:\n        aliases:\n          - evolution-v2\n",1)
    text += "\nnetworks:\n  funecob_external:\n    external: true\n    name: funecob_network\n"
if '    restart: "no"' in text:
    text = text.replace('    restart: "no"', "    restart: unless-stopped",1)
compose.write_text(text)
subprocess.run(["docker","compose","-p","funecob-evolution-lab","config","--quiet"],cwd=lab,check=True)
subprocess.run(["docker","compose","-p","funecob-evolution-lab","up","-d","--no-deps","api"],cwd=lab,check=True)
ready = False
for attempt in range(30):
    try:
        if state() == "open":
            ready = True
            break
    except Exception:
        pass
    time.sleep(2)
if not ready:
    raise SystemExit("Nova API nao reconectou. Jhoy antiga preservada; nao houve troca no banco.")
meta = json.loads(subprocess.check_output(["docker","inspect","funecob-evolution-lab-api-1"],text=True))[0]
net = meta["NetworkSettings"]["Networks"].get("funecob_network", {})
if "evolution-v2" not in (net.get("Aliases") or []):
    raise SystemExit("Alias de rede ausente. Nao houve troca no banco.")
# Use quoted SQL via stdin, never shell interpolation of credentials.
def lit(value):
    return "'" + str(value).replace("'", "''") + "'"
newhook = {"webhook": {"enabled": True, "url": hook["url"],
    "events": hook["events"], "byEvents": False, "base64": False}}
old_disabled = False
db_changed = False
try:
    disabled = dict(hook, enabled=False)
    api(oldbase, cfg["api_key"], "/webhook/set/Jhoy", disabled)
    old_disabled = True
    api(newbase, newkey, "/webhook/set/Jhoy", newhook)
    verified = api(newbase, newkey, "/webhook/find/Jhoy")
    if isinstance(verified.get("webhook"), dict):
        verified = verified["webhook"]
    if not verified.get("enabled") or verified.get("url") != hook["url"]:
        raise RuntimeError("Webhook novo nao confirmado.")
    sql = "BEGIN;\n"
    sql += "UPDATE public.whatsapp_instances SET api_url='http://evolution-v2:8080', api_key=" + lit(newkey)
    sql += " WHERE id=" + lit(cfg["id"]) + "::uuid AND organization_id=" + lit(cfg["organization_id"]) + "::uuid"
    sql += " AND api_url=" + lit(cfg["api_url"]) + " AND api_key=" + lit(cfg["api_key"])
    sql += " RETURNING id;\nCOMMIT;\n"
    result = subprocess.run(["docker","exec","-i","funecob-db","psql","-U","postgres","-d","postgres",
        "-v","ON_ERROR_STOP=1","-At"],input=sql,capture_output=True,text=True)
    if result.returncode or cfg["id"] not in result.stdout.splitlines():
        raise RuntimeError("Troca no banco nao confirmada; configuracao mudou ou SQL falhou.")
    db_changed = True
except Exception as error:
    if not db_changed:
        try:
            off = {"webhook": dict(newhook["webhook"], enabled=False)}
            api(newbase, newkey, "/webhook/set/Jhoy", off)
        except Exception:
            pass
        if old_disabled:
            try:
                api(oldbase, cfg["api_key"], "/webhook/set/Jhoy", hook)
                print("Webhook antigo restaurado.")
            except Exception:
                print("ATENCAO: conferir restauracao do webhook antigo.")
    raise SystemExit(str(error))
print("Jhoy direcionada para a nova Evolution.")
print("Webhook novo confirmado; webhook antigo desativado.")
print("API antiga mantida para retorno. Nenhum envio de teste foi realizado.")
print("Agora validar entrega de mensagem e recebimento de comprovante.")
