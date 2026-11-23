import { NextResponse } from "next/server";
import pdf from "pdf-parse/lib/pdf-parse.js";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
  try {
    const data = await pdf(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ text: data.text ?? "" });
  } catch {
    return NextResponse.json({ text: "" });
  }
}
