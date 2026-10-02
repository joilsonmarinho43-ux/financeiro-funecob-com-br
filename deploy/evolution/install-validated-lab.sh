#!/usr/bin/env bash
set -euo pipefail
umask 077
source_repo=/root/funecob/evolution-upgrade-source
lab=/root/funecob/evolution-lab
test -f "$lab/compose.yaml"
test -f "$lab/.env"
git -C "$source_repo" cat-file -e 5624bdaea81c58e4db60fe2a3a8de7c48bba1e60^{commit}
build_dir=$(mktemp -d /root/funecob/evolution-validated-XXXXXXXX)
git -C "$source_repo" archive 5624bdaea81c58e4db60fe2a3a8de7c48bba1e60 | tar -x -C "$build_dir"
printf 'Diretorio da versao: %s\n' "$build_dir"
docker run --rm --entrypoint node funecob/evolution-lab:2.4.0-rc2-baileys-rc14 --version
cat > "$build_dir/prepare.sh" <<'RECIPE'
set -euo pipefail
npm pkg set overrides.lodash=4.18.1
npm pkg set 'overrides.@figuro/chatwoot-sdk.axios=1.20.0'
mv patches/baileys+7.0.0-rc.6.patch patches/baileys+7.0.0-rc14.patch
mkdir -p vendor/baileys-source
npm pack @whiskeysockets/baileys@7.0.0-rc14 --pack-destination vendor
tar -xzf vendor/whiskeysockets-baileys-7.0.0-rc14.tgz -C vendor/baileys-source
python3 - <<'PY'
import json
from pathlib import Path
root = Path("vendor/baileys-source/package")
p = root / "package.json"
data = json.loads(p.read_text())
assert data["version"] == "7.0.0-rc14"
groups = ("dependencies", "optionalDependencies", "peerDependencies", "peerDependenciesMeta", "devDependencies")
assert any("link-preview-js" in data.get(group, {}) for group in groups)
for group in groups:
    data.get(group, {}).pop("link-preview-js", None)
p.write_text(json.dumps(data, indent=2) + "\n")
module = root / "lib/Utils/link-preview.js"
assert "getLinkPreview" in module.read_text()
module.write_text("export const getUrlInfo = async () => undefined;\n")
app = Path("package.json")
data = json.loads(app.read_text())
data["dependencies"].pop("link-preview-js", None)
data["dependencies"]["baileys"] = "file:vendor/whiskeysockets-baileys-7.0.0-rc14.tgz"
app.write_text(json.dumps(data, indent=2) + "\n")
docker = Path("Dockerfile")
text = docker.read_text()
marker = "COPY ./package*.json ./"
assert text.count(marker) == 1
docker.write_text(text.replace(marker, marker + "\nCOPY ./vendor ./vendor", 1))
PY
rm vendor/whiskeysockets-baileys-7.0.0-rc14.tgz
npm pack ./vendor/baileys-source/package --ignore-scripts --pack-destination vendor
npm install --package-lock-only --ignore-scripts
set +e
npm audit fix --package-lock-only --ignore-scripts --omit=dev > audit-fix.log 2>&1
audit_exit=$?
set -e
if [ "$audit_exit" -gt 1 ]; then cat audit-fix.log; exit "$audit_exit"; fi
npm install --package-lock-only --ignore-scripts --save-exact sharp@0.35.5
python3 - <<'PY'
from pathlib import Path
p = Path("src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts")
text = p.read_text()
start = "  private async generateLinkPreview(text: string) {"
end = "  private async sendMessage("
assert text.count(start) == 1 and text.count(end) == 1
a = text.index(start)
b = text.index(end, a)
text = text[:a] + "  private async generateLinkPreview(_text: string): Promise<any> {\n    return undefined;\n  }\n\n" + text[b:]
text = text.replace("import { getLinkPreview } from 'link-preview-js';\n", "")
text = text.replace("generateHighQualityLinkPreview: true,", "generateHighQualityLinkPreview: false,")
p.write_text(text)
PY

RECIPE
docker run --rm --entrypoint bash -v "$build_dir:/source" -w /source funecob/evolution-lab:2.4.0-rc2-baileys-rc14 /source/prepare.sh > "$build_dir/prepare.log" 2>&1 || { tail -40 "$build_dir/prepare.log"; exit 1; }
docker run --rm --entrypoint npm -v "$build_dir:/source" -w /source funecob/evolution-lab:2.4.0-rc2-baileys-rc14 audit --omit=dev --package-lock-only --audit-level=high --json > "$build_dir/production-audit.json" || audit_status=$?
python3 - "$build_dir/production-audit.json" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
if data.get("error"):
    raise SystemExit("Auditoria indisponivel; laboratorio preservado.")
counts = data.get("metadata", {}).get("vulnerabilities")
if not counts:
    raise SystemExit("Relatorio sem contagens; laboratorio preservado.")
print("Auditoria:", counts)
if counts.get("high", 0) or counts.get("critical", 0):
    raise SystemExit("Falhas altas/criticas; laboratorio preservado.")
PY
docker build -t funecob/evolution-validated:d2374334 "$build_dir" > "$build_dir/build.log" 2>&1 || { tail -45 "$build_dir/build.log"; exit 1; }
docker run --rm --network none --entrypoint node funecob/evolution-validated:d2374334 -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("/evolution/node_modules/baileys/package.json","utf8")); if(p.version!=="7.0.0-rc14")process.exit(1); console.log("Baileys:",p.version);'
docker run --rm --network none --entrypoint node funecob/evolution-validated:d2374334 --input-type=module -e '
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
assert.throws(() => require.resolve("link-preview-js"), { code: "MODULE_NOT_FOUND" });
globalThis.fetch = () => { throw new Error("Unexpected URL fetch"); };
const { getUrlInfo } = await import("/evolution/node_modules/baileys/lib/Utils/link-preview.js");
for (const url of ["https://example.com", "http://127.0.0.1", "http://169.254.169.254"]) {
  assert.equal(await getUrlInfo(url), undefined);
}
console.log("URL previews disabled; vulnerable library absent");'

python3 - <<'PY'
from pathlib import Path
from datetime import datetime
import re, shutil
p = Path("/root/funecob/evolution-lab/compose.yaml")
text = p.read_text()
pattern = r"(?m)^(\s+image: )funecob/evolution-lab:2\.4\.0-rc2(?:-baileys-rc14)?\s*$"
if len(re.findall(pattern, text)) != 1:
    raise SystemExit("Compose diferente do esperado; nenhuma troca realizada.")
backup = p.with_name("compose.yaml.before-validated-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
shutil.copy2(p, backup)
p.write_text(re.sub(pattern, r"\g<1>funecob/evolution-validated:d2374334", text))
print("Backup:", backup)
PY
cd "$lab"
docker compose -p funecob-evolution-lab up -d --no-deps api
python3 - <<'PY'
from pathlib import Path
import json, time, urllib.request
env = dict(line.split("=",1) for line in Path(".env").read_text().splitlines() if "=" in line and not line.startswith("#"))
for attempt in range(30):
    try:
        req = urllib.request.Request("http://127.0.0.1:18081/license/status", headers={"apikey":env["LAB_API_KEY"]})
        with urllib.request.urlopen(req,timeout=3) as r:
            status=json.load(r).get("status")
        if status != "active":
            raise SystemExit("API iniciou, mas licenca nao esta ativa: " + str(status))
        req = urllib.request.Request("http://127.0.0.1:18081/instance/fetchInstances",headers={"apikey":env["LAB_API_KEY"]})
        with urllib.request.urlopen(req,timeout=3) as r:
            instances=json.load(r)
        print("Licenca:",status,"| API autenticada: OK | Instancias:",len(instances) if isinstance(instances,list) else "resposta inesperada")
        break
    except Exception:
        time.sleep(2)
else:
    raise SystemExit("API de teste nao respondeu; verificar inicializacao. Producao preservada.")
PY
printf 'Laboratorio atualizado. Producao preservada. Logs em %s\n' "$build_dir"
