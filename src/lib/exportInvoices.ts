import { format, parseISO } from "date-fns";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type InvoiceRow = {
  clients?: { name: string } | null;
  description?: string | null;
  due_date: string;
  amount: number;
  status: string;
  paid_date?: string | null;
};

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusLabel = (s: string) => {
  switch (s) {
    case "pago": return "Pago";
    case "cancelado": return "Cancelado";
    case "vencido": return "Vencido";
    default: return "Em aberto";
  }
};

function toRows(invoices: InvoiceRow[]) {
  return invoices.map((inv) => ({
    Cliente: inv.clients?.name || "—",
    Descrição: inv.description || "—",
    Vencimento: format(parseISO(inv.due_date), "dd/MM/yyyy"),
    Valor: Number(inv.amount),
    Status: statusLabel(inv.status),
    "Pago em": inv.paid_date ? format(parseISO(inv.paid_date), "dd/MM/yyyy") : "—",
  }));
}

export function exportToExcel(invoices: InvoiceRow[], filename = "faturas") {
  const rows = toRows(invoices);
  const ws = XLSX.utils.json_to_sheet(rows);

  // Format currency column
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 3 })];
    if (cell) {
      cell.z = '#,##0.00';
    }
  }

  // Column widths
  ws["!cols"] = [
    { wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Faturas");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPDF(invoices: InvoiceRow[], filename = "faturas") {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text("Relatório de Faturas", 14, 15);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, 14, 22);
  doc.text(`Total de registros: ${invoices.length}`, 14, 27);

  const total = invoices.reduce((s, i) => s + Number(i.amount), 0);
  doc.text(`Valor total: ${formatCurrency(total)}`, 14, 32);

  doc.setTextColor(0);

  const rows = toRows(invoices);
  const tableData = rows.map((r) => [
    r.Cliente,
    r.Descrição,
    r.Vencimento,
    formatCurrency(r.Valor),
    r.Status,
    r["Pago em"],
  ]);

  autoTable(doc, {
    startY: 38,
    head: [["Cliente", "Descrição", "Vencimento", "Valor", "Status", "Pago em"]],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [82, 163, 95], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 60 },
      3: { halign: "right" },
    },
  });

  doc.save(`${filename}.pdf`);
}
