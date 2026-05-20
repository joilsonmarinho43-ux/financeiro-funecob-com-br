// Fixtures de payloads Evolution API v2 — cobrem todas as variações de phone extraction
// Use estas fixtures nos testes para garantir compatibilidade com:
//   - senderPn / remoteJidAlt / participantPn / participantAlt / participant
//   - @lid (novo protocolo) vs @s.whatsapp.net (legado)
//   - imageMessage, documentMessage (PDF), conversation, extendedTextMessage

export const PHONE = "11987654321";
export const LID = "1234567890123456@lid";

export function makeImageWebhook(opts: {
  instance?: string;
  phoneField?: "remoteJid" | "senderPn" | "remoteJidAlt" | "participantPn" | "participantAlt";
  phone?: string;
  remoteJidIsLid?: boolean;
  caption?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  messageId?: string;
}) {
  const phone = opts.phone || PHONE;
  const key: any = {
    fromMe: !!opts.fromMe,
    id: opts.messageId || `MSG_${Math.random().toString(36).slice(2)}`,
    remoteJid: opts.isGroup
      ? "120363000000000000@g.us"
      : opts.remoteJidIsLid
        ? LID
        : `${phone}@s.whatsapp.net`,
  };
  if (opts.phoneField && opts.phoneField !== "remoteJid") {
    key[opts.phoneField] = `${phone}@s.whatsapp.net`;
  }
  return {
    event: "messages.upsert",
    instance: opts.instance || "test-instance",
    data: {
      key,
      messageType: "imageMessage",
      message: {
        imageMessage: {
          caption: opts.caption ?? "",
          mimetype: "image/jpeg",
          base64: "/9j/4AAQFAKEBASE64DATA==", // placeholder — sandbox doesn't OCR
        },
        base64: "/9j/4AAQFAKEBASE64DATA==",
      },
    },
  };
}

export function makePdfWebhook(opts: { instance?: string; phone?: string; messageId?: string }) {
  const phone = opts.phone || PHONE;
  return {
    event: "messages.upsert",
    instance: opts.instance || "test-instance",
    data: {
      key: {
        fromMe: false,
        id: opts.messageId || `PDF_${Math.random().toString(36).slice(2)}`,
        remoteJid: `${phone}@s.whatsapp.net`,
      },
      messageType: "documentMessage",
      message: {
        documentMessage: {
          mimetype: "application/pdf",
          fileName: "comprovante.pdf",
          base64: "JVBERi0xLjQKJfake==",
        },
      },
    },
  };
}

export function makeTextWebhook(opts: { instance?: string; phone?: string; text: string; messageId?: string }) {
  const phone = opts.phone || PHONE;
  return {
    event: "messages.upsert",
    instance: opts.instance || "test-instance",
    data: {
      key: { fromMe: false, id: opts.messageId || `TXT_${Math.random().toString(36).slice(2)}`, remoteJid: `${phone}@s.whatsapp.net` },
      messageType: "conversation",
      message: { conversation: opts.text },
    },
  };
}

// ===== Fake OCR outputs — simulam o que o Gemini retornaria por banco =====
export type FakeOcr = {
  bank: string;
  amount: number | string | null;
  sender_name: string | null;
  txid: string | null;
  end_to_end_id?: string | null;
  raw_text: string;
};

export const FAKE_OCRS: FakeOcr[] = [
  {
    bank: "Nubank",
    amount: 44.0, sender_name: "JOAO DA SILVA",
    txid: "E18236120202504201234567890123456",
    end_to_end_id: "E18236120202504201234567890123456",
    raw_text: "Comprovante de transferência\nPix enviado\nValor: R$ 44,00\nDe: JOAO DA SILVA\nCPF: 123.456.789-00\nNubank",
  },
  {
    bank: "Caixa",
    amount: "156,00", sender_name: "MARIA SOUZA",
    txid: "CEF-PIX-9988776655",
    raw_text: "CAIXA ECONOMICA FEDERAL\nPIX REALIZADO\nR$ 156,00\nMARIA SOUZA\n987.654.321-00",
  },
  {
    bank: "Mercado Pago",
    amount: 48.5, sender_name: "Carlos Pereira",
    txid: "MP-2025-ABC123",
    raw_text: "Mercado Pago — Comprovante\nVocê transferiu R$ 48,50\nPara: FUNECOB\nDe: Carlos Pereira",
  },
  {
    bank: "PicPay",
    amount: 75.0, sender_name: "ANA LIMA",
    txid: "PP-987654",
    raw_text: "PicPay\nPagamento realizado\nR$ 75,00\nANA LIMA",
  },
  {
    bank: "Inter",
    amount: 120.0, sender_name: "PEDRO ALMEIDA",
    txid: "INTER-E00077777202504",
    raw_text: "Banco Inter\nPIX enviado\nR$ 120,00\nPedro Almeida\n111.222.333-44",
  },
  {
    bank: "Itaú",
    amount: "1.250,00", sender_name: "ROBERTO COSTA",
    txid: "ITAU-PIX-555444",
    raw_text: "Itaú — Comprovante PIX\nValor R$ 1.250,00\nROBERTO COSTA",
  },
  {
    bank: "Santander",
    amount: 89.9, sender_name: "FERNANDA ROCHA",
    txid: "SAN-PIX-2025-789",
    raw_text: "Santander\nTransferência PIX\nR$ 89,90\nFernanda Rocha",
  },
  {
    bank: "Bradesco",
    amount: 33.33, sender_name: "LUCAS MARTINS",
    txid: "BRADESCO-XYZ-001",
    raw_text: "Bradesco\nPIX realizado com sucesso\nR$ 33,33\nLUCAS MARTINS",
  },
  // ===== Casos adversos =====
  {
    bank: "Cortado",
    amount: null, sender_name: null, txid: null,
    raw_text: "Comprovante de tra… (imagem cortada)",
  },
  {
    bank: "Borrado",
    amount: null, sender_name: "???",
    txid: null,
    raw_text: "P1X env1ado R$ ??,?? para FUN3C0B",
  },
  {
    bank: "Print escuro",
    amount: 50.0, sender_name: "USUARIO",
    txid: "DARK-001",
    raw_text: "[imagem escura] R$ 50,00 PIX",
  },
];
