import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { CheckCircle2, XCircle, AlertCircle, Loader2, FlaskConical } from "lucide-react";
import { toast } from "sonner";

type Scenario = {
  name: string;
  category: "v2_protocol" | "ocr_bank" | "edge_case" | "identification";
  webhook_payload?: any;
  fake_ocr?: any;
  phone?: string;
  expected_status: string; // "would_settle" | "would_error" | etc
  expected_reason?: string | null;
};

const PHONE_REAL = "11987654321"; // será usado para gerar fixtures — match depende de existir cliente nessa org
const LID = "1234567890123456@lid";

function makeImageWebhook(opts: any = {}) {
  const phone = opts.phone || PHONE_REAL;
  const key: any = {
    fromMe: false,
    id: `MSG_${Math.random().toString(36).slice(2)}`,
    remoteJid: opts.remoteJidIsLid ? LID : `${phone}@s.whatsapp.net`,
  };
  if (opts.phoneField) key[opts.phoneField] = `${phone}@s.whatsapp.net`;
  return {
    event: "messages.upsert",
    instance: "sandbox",
    data: { key, messageType: "imageMessage", message: { imageMessage: { caption: opts.caption || "" } } },
  };
}

const BANKS = [
  { bank: "Nubank", amount: 44.0, sender_name: "JOAO DA SILVA", txid: "NU-1", raw_text: "Nubank PIX R$ 44,00 JOAO DA SILVA" },
  { bank: "Caixa", amount: "156,00", sender_name: "MARIA SOUZA", txid: "CEF-1", raw_text: "CAIXA PIX R$ 156,00 MARIA SOUZA" },
  { bank: "Mercado Pago", amount: 48.5, sender_name: "Carlos Pereira", txid: "MP-1", raw_text: "Mercado Pago R$ 48,50 Carlos Pereira" },
  { bank: "PicPay", amount: 75, sender_name: "ANA LIMA", txid: "PP-1", raw_text: "PicPay R$ 75,00 ANA LIMA" },
  { bank: "Inter", amount: 120, sender_name: "PEDRO ALMEIDA", txid: "INT-1", raw_text: "Inter PIX R$ 120,00 Pedro Almeida" },
  { bank: "Itaú", amount: "1.250,00", sender_name: "ROBERTO COSTA", txid: "ITAU-1", raw_text: "Itaú R$ 1.250,00 ROBERTO COSTA" },
  { bank: "Santander", amount: 89.9, sender_name: "FERNANDA ROCHA", txid: "SAN-1", raw_text: "Santander R$ 89,90 Fernanda Rocha" },
  { bank: "Bradesco", amount: 33.33, sender_name: "LUCAS MARTINS", txid: "BRA-1", raw_text: "Bradesco R$ 33,33 LUCAS MARTINS" },
];

function buildScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  // 1. Protocolos Evolution v2
  scenarios.push({
    name: "v2 → remoteJid @s.whatsapp.net (legado)",
    category: "v2_protocol",
    webhook_payload: makeImageWebhook({}),
    fake_ocr: { amount: 50, sender_name: "Teste", txid: "PROTO-1", raw_text: "R$ 50,00" },
    expected_status: "any",
  });
  scenarios.push({
    name: "v2 → @lid + senderPn fallback",
    category: "v2_protocol",
    webhook_payload: makeImageWebhook({ remoteJidIsLid: true, phoneField: "senderPn" }),
    fake_ocr: { amount: 50, sender_name: "Teste", txid: "PROTO-2", raw_text: "R$ 50,00" },
    expected_status: "any",
  });
  scenarios.push({
    name: "v2 → @lid + remoteJidAlt fallback",
    category: "v2_protocol",
    webhook_payload: makeImageWebhook({ remoteJidIsLid: true, phoneField: "remoteJidAlt" }),
    fake_ocr: { amount: 50, sender_name: "Teste", txid: "PROTO-3", raw_text: "R$ 50,00" },
    expected_status: "any",
  });
  scenarios.push({
    name: "v2 → @lid + participantPn fallback",
    category: "v2_protocol",
    webhook_payload: makeImageWebhook({ remoteJidIsLid: true, phoneField: "participantPn" }),
    fake_ocr: { amount: 50, sender_name: "Teste", txid: "PROTO-4", raw_text: "R$ 50,00" },
    expected_status: "any",
  });
  scenarios.push({
    name: "v2 → SOMENTE @lid (sem fallback) → deve rejeitar com client_not_identified",
    category: "v2_protocol",
    webhook_payload: makeImageWebhook({ remoteJidIsLid: true }),
    fake_ocr: { amount: 50, sender_name: "Desconhecido", txid: "PROTO-5", raw_text: "R$ 50,00" },
    expected_status: "would_error",
    expected_reason: "client_not_identified",
  });

  // 2. OCR de 8 bancos
  for (const b of BANKS) {
    scenarios.push({
      name: `OCR ${b.bank} — R$ ${b.amount}`,
      category: "ocr_bank",
      webhook_payload: makeImageWebhook({}),
      fake_ocr: b,
      expected_status: "any",
    });
  }

  // 3. Casos adversos
  scenarios.push({
    name: "Comprovante cortado (sem amount)",
    category: "edge_case",
    webhook_payload: makeImageWebhook({}),
    fake_ocr: { amount: null, sender_name: null, txid: null, raw_text: "comprovante de tra…" },
    expected_status: "would_error",
    expected_reason: "amount_not_detected",
  });
  scenarios.push({
    name: "Imagem borrada (texto ilegível)",
    category: "edge_case",
    webhook_payload: makeImageWebhook({}),
    fake_ocr: { amount: null, sender_name: "???", txid: null, raw_text: "P1X ??,??" },
    expected_status: "would_error",
    expected_reason: "amount_not_detected",
  });
  scenarios.push({
    name: "Pagamento duplicado (mesmo txid 2x)",
    category: "edge_case",
    webhook_payload: makeImageWebhook({}),
    fake_ocr: { amount: 100, sender_name: "Teste", txid: "DUP-TEST-001", raw_text: "R$ 100,00" },
    expected_status: "any", // primeira execução: would_settle; segunda: would_skip_duplicate
  });

  // 4. Identificação por fallback
  scenarios.push({
    name: "Identificação por CPF (telefone @lid + CPF no OCR)",
    category: "identification",
    webhook_payload: makeImageWebhook({ remoteJidIsLid: true }),
    fake_ocr: { amount: 50, sender_name: "Nome Diferente", txid: "CPF-1", raw_text: "PIX R$ 50,00 CPF 123.456.789-00" },
    expected_status: "any",
  });
  scenarios.push({
    name: "Identificação por nome difuso (fallback)",
    category: "identification",
    webhook_payload: makeImageWebhook({ remoteJidIsLid: true }),
    fake_ocr: { amount: 50, sender_name: "Eladio Fornos Cliente", txid: "NAME-1", raw_text: "R$ 50,00 Eladio Fornos" },
    expected_status: "any",
  });

  return scenarios;
}

export default function SandboxTests() {
  const { organization } = useOrganization();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  async function runAll() {
    if (!organization?.id) {
      toast.error("Organização não carregada");
      return;
    }
    setRunning(true);
    setResults([]);
    const scenarios = buildScenarios();
    const out: any[] = [];

    for (const s of scenarios) {
      try {
        const { data, error } = await supabase.functions.invoke("pix-ocr-sandbox", {
          body: {
            organization_id: organization.id,
            webhook_payload: s.webhook_payload,
            fake_ocr: s.fake_ocr,
            phone: s.phone,
          },
        });
        if (error) throw error;

        const expectOk = s.expected_status === "any" ||
          data.final_status === s.expected_status ||
          (s.expected_reason && data.rejection_reason === s.expected_reason);

        out.push({
          ...s,
          report: data,
          passed: expectOk,
        });
        setResults([...out]);
      } catch (e: any) {
        out.push({ ...s, error: e.message, passed: false });
        setResults([...out]);
      }
    }
    setRunning(false);
    const passed = out.filter((r) => r.passed).length;
    toast.success(`Testes concluídos: ${passed}/${out.length} OK`);
  }

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  return (
    <AppLayout>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <FlaskConical className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Sandbox — Testes Automatizados PIX OCR</h1>
            <p className="text-sm text-muted-foreground">
              Valida o motor SEM depender de clientes reais — não grava nada no banco.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Execução</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runAll} disabled={running}>
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
                {running ? "Rodando…" : "Rodar todos os cenários"}
              </Button>
              {total > 0 && (
                <>
                  <Badge variant="default" className="bg-green-600">{passed} OK</Badge>
                  {failed > 0 && <Badge variant="destructive">{failed} falhas</Badge>}
                  <span className="text-sm text-muted-foreground">{total} total</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Cobre: Evolution API v2 (senderPn, remoteJidAlt, participantPn, @lid),
              OCR de 8 bancos (Nubank, Caixa, MP, PicPay, Inter, Itaú, Santander, Bradesco),
              casos adversos (cortado, borrado, duplicado) e identificação por CPF/nome.
            </p>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Relatório</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-2">
                  {results.map((r, i) => (
                    <div key={i} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-start gap-2">
                        {r.passed
                          ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                          : r.error
                            ? <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                            : <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Categoria: {r.category} · Esperado: {r.expected_status}
                            {r.expected_reason && ` (${r.expected_reason})`}
                          </div>
                          {r.error && <div className="text-xs text-destructive mt-1">Erro: {r.error}</div>}
                          {r.report && (
                            <details className="mt-2">
                              <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                                Status: <strong>{r.report.final_status}</strong>
                                {r.report.rejection_reason && ` — ${r.report.rejection_reason}`}
                                {" · ver detalhes"}
                              </summary>
                              <pre className="mt-2 text-[10px] bg-muted/50 p-2 rounded overflow-auto">
                                {JSON.stringify(r.report, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
