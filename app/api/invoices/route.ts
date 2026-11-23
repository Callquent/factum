import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getUpload, toFileData, MAX_SIZE } from "../../../lib/storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const invoices = await prisma.invoice.findMany({
    select: {
      id: true, amount: true, date: true, reference: true, source: true, createdAt: true,
      fileName: true, fileType: true, company: true,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(invoices);
}

export async function POST(req: Request) {
  const fd = await req.formData();
  const name = String(fd.get("company") ?? "").trim();
  const amount = Number(String(fd.get("amount") ?? "").replace(",", "."));
  if (!name || !Number.isFinite(amount)) {
    return NextResponse.json({ error: "Entreprise et montant requis" }, { status: 400 });
  }
  const upload = getUpload(fd);
  if (upload && upload.size > MAX_SIZE) {
    return NextResponse.json({ error: "Fichier trop volumineux (15 Mo max)" }, { status: 413 });
  }
  const file = upload ? await toFileData(upload) : {};
  const company = await prisma.company.upsert({ where: { name }, update: {}, create: { name } });
  const date = String(fd.get("date") ?? "");
  const reference = String(fd.get("reference") ?? "").trim();
  const source = String(fd.get("source") ?? "");
  const invoice = await prisma.invoice.create({
    data: {
      companyId: company.id,
      amount,
      date: date ? new Date(date) : null,
      reference: reference || null,
      source: ["pdf", "ocr"].includes(source) ? source : "manual",
      ...file,
    },
    select: { id: true },
  });
  return NextResponse.json(invoice, { status: 201 });
}
