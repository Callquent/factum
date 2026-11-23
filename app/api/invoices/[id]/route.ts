import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getUpload, toFileData, removeLegacyFile, MAX_SIZE } from "../../../../lib/storage";

type Ctx = { params: { id: string } };

const tidy = () => prisma.company.deleteMany({ where: { invoices: { none: {} } } });

export async function PUT(req: Request, { params }: Ctx) {
  const id = Number(params.id);
  const current = await prisma.invoice.findUnique({ where: { id }, select: { filePath: true } });
  if (!current) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

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

  let file = {};
  if (upload) {
    await removeLegacyFile(current.filePath);
    file = await toFileData(upload);
  } else if (fd.get("removeFile") === "1") {
    await removeLegacyFile(current.filePath);
    file = { fileData: null, filePath: null, fileName: null, fileType: null };
  }

  const company = await prisma.company.upsert({ where: { name }, update: {}, create: { name } });
  const date = String(fd.get("date") ?? "");
  const reference = String(fd.get("reference") ?? "").trim();
  await prisma.invoice.update({
    where: { id },
    data: { companyId: company.id, amount, date: date ? new Date(date) : null, reference: reference || null, ...file },
  });
  await tidy();
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const id = Number(params.id);
  const current = await prisma.invoice.findUnique({ where: { id }, select: { filePath: true } });
  if (current) {
    await removeLegacyFile(current.filePath);
    await prisma.invoice.delete({ where: { id } });
    await tidy();
  }
  return NextResponse.json({ ok: true });
}
