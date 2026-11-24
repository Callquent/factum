import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { budgetInvoices, parseRange } from "../../../lib/budget-feed";

export const dynamic = "force-dynamic";

// Flux pour l'application « Budget » : GET /api/budget?from=YYYY-MM-DD&to=YYYY-MM-DD
// -> { invoices: [{ id, company, amount, date, reference, path }] }
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const range = parseRange(sp.get("from"), sp.get("to"));
  if (!range) {
    return NextResponse.json({ error: "Paramètres from et to (YYYY-MM-DD, 800 jours maximum) requis." }, { status: 400 });
  }

  const rows = await prisma.invoice.findMany({
    select: {
      id: true, amount: true, date: true, reference: true, createdAt: true,
      fileName: true, filePath: true, company: { select: { name: true } },
    },
  });
  // fileData n'est pas sélectionné (volumineux) : fileName / filePath indiquent qu'un fichier est conservé.
  const lignes = rows.map((r) => ({
    id: r.id, amount: r.amount, date: r.date, createdAt: r.createdAt, reference: r.reference,
    hasFile: !!(r.fileName || r.filePath), company: r.company.name,
  }));
  return NextResponse.json({ invoices: budgetInvoices(lignes, range.from, range.to) });
}
