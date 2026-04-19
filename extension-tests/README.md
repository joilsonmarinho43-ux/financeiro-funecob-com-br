# Testes E2E — Extensão FuneCob Bip

Testes automatizados **reais** com Playwright que carregam a extensão em um Chromium real, simulam um leitor de código de barras (teclado físico) e interceptam as requisições para o backend.

## O que é validado

| # | Cenário | Componente testado |
|---|---------|--------------------|
| 1 | Código válido (13 dígitos) → envia e recebe success | `content.js` + `background.js` |
| 2 | Código curto (8 dígitos) → ignorado | `content.js` (validação de tamanho) |
| 3 | Código longo (15 dígitos) em strictMode → ignorado | `content.js` (strictMode) |
| 4 | Código duplicado em <2.5s → enviado apenas 1x | `content.js` + `background.js` (dedupe) |
| 5 | Digitação humana lenta (>50ms/tecla) → descartada | `content.js` (anti-velocidade) |
| 6 | Sem `action` no storage → não envia | `popup.js` config + `content.js` |
| 7 | Backend retorna `ignored` → sem alerta visível | `background.js` (silent mode) |
| 8 | Estrutura do payload `{ barcode, action }` correta | `content.js` → fetch |

## Pré-requisitos

- Node 18+
- Chromium (instalado automaticamente pelo Playwright)
- A pasta `extension/` no repositório raiz (já existe — v1.5.0)

## Instalação

```bash
cd extension-tests
npm install
npx playwright install chromium
```

## Executar

```bash
# Modo padrão (com janela visível — extensões MV3 exigem headed)
npm test

# Modo debug (passo-a-passo no Playwright Inspector)
npm run test:debug
```

> ⚠️ Extensões Chrome MV3 **não funcionam em modo headless**. O Playwright abrirá uma janela do navegador.

## Como funciona

1. **Servidor HTTP local** (porta aleatória) serve `fixtures/test-page.html` simulando o sistema antigo.
2. **Persistent context** do Chromium é iniciado com `--load-extension=../extension` (pasta real do projeto).
3. **Service worker** (`background.js`) é detectado e a `chrome.storage.local` é pré-configurada com:
   - `endpoint: https://mock-funecob.test/functions/v1/bip-receiver`
   - `expectedLen: 13`, `strictMode: true`, `globalCapture: true`
4. **Interceptação `context.route()`** captura todas as chamadas para `mock-funecob.test` e responde conforme o cenário (`success` / `ignored` / `duplicate`).
5. Cada cenário simula teclas via `page.keyboard.press()` no campo do "sistema legado":
   - **Scanner**: 10ms entre teclas (rápido) — passa pelo filtro de velocidade
   - **Humano**: 200ms entre teclas — bloqueado pelo anti-velocidade
6. Asserções verificam:
   - **Quando deveria enviar**: o `interceptedRequests[]` contém o payload esperado
   - **Quando deveria ignorar**: nenhuma request foi capturada
   - **Sem alertas visíveis**: nenhum `dialog` foi disparado

## Validação por componente

### `content.js` (captura no DOM)
Os cenários 1, 2, 3, 5 validam diretamente:
- Filtro de velocidade (`<50ms` entre teclas)
- Validação de comprimento (`expectedLen`)
- Strict mode (rejeita tamanhos diferentes)
- Buffer reset em digitação lenta

### `background.js` (service worker)
Os cenários 4 e 7 validam:
- Cache de dedupe de 3s no service worker
- Tratamento silencioso de `{ ignored: true }` do backend
- Badge update sem alertas

### `popup.js` (configuração)
O cenário 6 valida que sem `action` configurada, nenhuma request é feita.
Para testar a UI do popup diretamente, abra:
```ts
const popupUrl = `chrome-extension://${extensionId}/popup.html`;
await page.goto(popupUrl);
```
(o `extensionId` pode ser obtido via `serviceWorker.url().split("/")[2]`).

## Saída esperada

```
Running 8 tests using 1 worker

  ✓ Cenário 1: código VÁLIDO (13 dígitos) (1.2s)
    PASSOU — código válido enviado: { barcode: '1234567202604', action: 'baixa' }
  ✓ Cenário 2: código CURTO (8 dígitos) (1.0s)
    PASSOU — código curto ignorado pela extensão
  ...
  8 passed (15s)
```

## Troubleshooting

- **"Extension manifest not found"**: rode os testes a partir de `extension-tests/`, não da raiz.
- **Service worker não inicia**: confirme que `extension/manifest.json` tem `"background": { "service_worker": "background.js" }`.
- **Requests não são interceptadas**: a extensão pode estar usando outro endpoint. Verifique o `endpoint` configurado em `beforeAll`.
