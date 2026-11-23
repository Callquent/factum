import { promises as fs } from "fs";
import { prisma } from "../../../lib/prisma";
import { legacyPath } from "../../../lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return new Response("Identifiant invalide", { status: 400 });
  const inv = await prisma.invoice.findUnique({
    where: { id },
    select: { fileData: true, filePath: true, fileName: true, fileType: true },
  });
  if (!inv) return new Response("Facture introuvable", { status: 404 });

  let body: Uint8Array | null = inv.fileData ? new Uint8Array(inv.fileData) : null;
  if (!body && inv.filePath) {
    try { body = new Uint8Array(await fs.readFile(legacyPath(inv.filePath))); } catch { /* fichier disque absent */ }
  }
  if (!body) return new Response("Aucun fichier conservé pour cette facture", { status: 404 });

  return new Response(body, {
    headers: {
      "Content-Type": inv.fileType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(inv.fileName ?? "facture")}`,
    },
  });
}
