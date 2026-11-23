"use client";

import { useEffect, useMemo, useState } from "react";
import { parseInvoiceText } from "../lib/parse";

type Invoice = {
  id: number;
  amount: number;
  date: string | null;
  reference: string | null;
  source: string;
  fileName: string | null;
  company: { name: string };
};

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const frDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { timeZone: "UTC" });
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const empty = { company: "", amount: "", date: "", reference: "" };
const SRC: Record<string, string> = { pdf: "PDF", ocr: "OCR", manual: "Saisie" };

// Agrandit et passe l'image en niveaux de gris pour une meilleure lecture OCR
async function prepare(f: File): Promise<Blob> {
  const bmp = await createImageBitmap(f);
  const k = bmp.width < 1600 ? 2 : 1;
  const c = document.createElement("canvas");
  c.width = bmp.width * k;
  c.height = bmp.height * k;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
}

// Texte sur lequel porte la recherche : entreprise, référence, fichier, date, montant
function haystack(i: Invoice) {
  const a = i.amount.toFixed(2);
  return norm(
    [i.company.name, i.reference ?? "", i.fileName ?? "", i.date ? `${frDate(i.date)} ${i.date.slice(0, 10)}` : "", a, a.replace(".", ","), eur(i.amount)].join(" ")
  );
}

export default function Home() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [form, setForm] = useState(empty);
  const [source, setSource] = useState("manual");
  const [file, setFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    const r = await fetch("/api/invoices");
    setInvoices(await r.json());
  }
  useEffect(() => { load(); }, []);

  const byCompany = useMemo(() => {
    const m = new Map<string, { total: number; count: number }>();
    invoices.forEach((i) => {
      const c = m.get(i.company.name) ?? { total: 0, count: 0 };
      c.total += i.amount; c.count++;
      m.set(i.company.name, c);
    });
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [invoices]);
  const grandTotal = invoices.reduce((s, i) => s + i.amount, 0);

  const shown = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    return invoices.filter(
      (i) => (!filter || i.company.name === filter) && tokens.every((t) => haystack(i).includes(t))
    );
  }, [invoices, filter, query]);
  const shownTotal = shown.reduce((s, i) => s + i.amount, 0);

  function reset() {
    setForm(empty); setSource("manual"); setFile(null); setEditing(null); setRemoveFile(false);
  }

  async function onFile(f: File) {
    setFile(f); setRemoveFile(false);
    if (editing) { setMsg(`« ${f.name} » remplacera le fichier à l'enregistrement.`); return; }
    setBusy(true); setMsg("");
    try {
      let text = "";
      let src = "manual";
      if (f.type === "application/pdf") {
        setMsg("Lecture du PDF…");
        const fd = new FormData();
        fd.append("file", f);
        const r = await fetch("/api/extract", { method: "POST", body: fd });
        text = (await r.json()).text ?? "";
        src = "pdf";
      } else if (f.type.startsWith("image/")) {
        setMsg("Lecture OCR en cours, cela peut prendre quelques secondes…");
        const { createWorker } = await import("tesseract.js");
        const w = await createWorker("fra");
        await w.setParameters({ tessedit_pageseg_mode: "6" as never });
        text = (await w.recognize(await prepare(f))).data.text;
        await w.terminate();
        src = "ocr";
      } else {
        setFile(null);
        setMsg("Format non pris en charge. Importez un PDF ou une image, ou saisissez à la main.");
        return;
      }
      if (text.trim().length < 10) {
        setSource("manual");
        setMsg("Aucun texte lisible (PDF scanné ou image floue ?). Le fichier est conservé : saisissez les informations.");
        return;
      }
      const e = parseInvoiceText(text);
      setForm(e);
      const missing = [!e.company && "l'entreprise", !e.amount && "le montant"].filter(Boolean);
      if (missing.length === 2) {
        setSource("manual");
        setMsg("Entreprise et montant non reconnus. Saisissez-les à la main.");
      } else {
        setSource(src);
        setMsg(missing.length ? `Non reconnu : ${missing[0]}. Complétez puis enregistrez.` : "Vérifiez les champs puis enregistrez.");
      }
    } catch {
      setMsg("La lecture a échoué. Le fichier est conservé : saisissez les informations.");
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!form.company.trim() || isNaN(amount)) {
      setMsg("Renseignez l'entreprise et le montant.");
      return;
    }
    const fd = new FormData();
    fd.append("company", form.company);
    fd.append("amount", String(amount));
    fd.append("date", form.date);
    fd.append("reference", form.reference);
    fd.append("source", source);
    if (file) fd.append("file", file);
    if (removeFile) fd.append("removeFile", "1");
    const r = await fetch(editing ? `/api/invoices/${editing.id}` : "/api/invoices", {
      method: editing ? "PUT" : "POST",
      body: fd,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => null);
      setMsg(err?.error ?? "Enregistrement impossible.");
      return;
    }
    setMsg(editing ? "Facture mise à jour." : "Facture enregistrée.");
    reset();
    load();
  }

  function edit(i: Invoice) {
    setEditing(i);
    setForm({
      company: i.company.name,
      amount: i.amount.toFixed(2),
      date: i.date ? i.date.slice(0, 10) : "",
      reference: i.reference ?? "",
    });
    setSource(i.source); setFile(null); setRemoveFile(false); setMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: number) {
    if (!confirm("Supprimer cette facture et son fichier ?")) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    if (editing?.id === id) reset();
    load();
  }

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const keptFile = editing?.fileName && !removeFile && !file ? editing.fileName : null;

  return (
    <main>
      <h1>Mes factures</h1>
      <p className="sub">Importez une facture : l'entreprise et le montant sont repérés pour vous, et le fichier est conservé.</p>

      <div className="grid">
        <section className="panel">
          <h2>{editing ? "Modifier la facture" : "Ajouter une facture"}</h2>
          {editing && (
            <p className="editing-note">Modification de la facture de {editing.company.name}.</p>
          )}
          <label className="drop">
            {busy ? "Lecture en cours…" : editing ? "Remplacer le fichier" : "Choisir un PDF ou une photo"}
            <small>PDF avec texte, JPG ou PNG (OCR)</small>
            <input type="file" accept="application/pdf,image/*" disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </label>
          {(file || keptFile) && (
            <p className="filebox">
              Fichier : {file ? file.name : keptFile}
              {keptFile && editing && (
                <> · <a className="link" href={`/api/file?id=${editing.id}`} target="_blank" rel="noreferrer">Voir</a>
                {" · "}<button type="button" className="link del" onClick={() => setRemoveFile(true)}>Retirer</button></>
              )}
              {file && <> · <button type="button" className="link del" onClick={() => setFile(null)}>Ne pas conserver</button></>}
            </p>
          )}
          {msg && <p className="msg" role="status">{msg}</p>}
          <form onSubmit={save}>
            <label className="f">Entreprise
              <input type="text" list="companies" value={form.company} onChange={set("company")} />
              <datalist id="companies">{byCompany.map(([n]) => <option key={n} value={n} />)}</datalist>
            </label>
            <label className="f">Montant TTC (€)
              <input type="text" inputMode="decimal" value={form.amount} onChange={set("amount")} />
            </label>
            <label className="f">Date
              <input type="date" value={form.date} onChange={set("date")} />
            </label>
            <label className="f">Référence
              <input type="text" value={form.reference} onChange={set("reference")} />
            </label>
            <button className="btn" disabled={busy}>{editing ? "Mettre à jour" : "Enregistrer la facture"}</button>
            {editing && <button type="button" className="btn alt" onClick={() => { reset(); setMsg(""); }}>Annuler</button>}
          </form>
        </section>

        <div>
          <section className="panel">
            <h2>Total dépensé</h2>
            <p className="total">{eur(grandTotal)}</p>
            {byCompany.length === 0 ? (
              <p className="empty">Aucune facture pour l'instant. Importez-en une pour commencer.</p>
            ) : (
              <table>
                <thead><tr><th>Entreprise</th><th className="n">Factures</th><th className="n">Total</th></tr></thead>
                <tbody>
                  {byCompany.map(([name, c]) => (
                    <tr key={name}>
                      <td><button className="link" onClick={() => setFilter(filter === name ? "" : name)}>{name}</button></td>
                      <td className="n">{c.count}</td>
                      <td className="n">{eur(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {invoices.length > 0 && (
            <section className="panel">
              <h2>
                {filter ? `Factures de ${filter}` : "Toutes les factures"}{" "}
                <span className="count">{shown.length} résultat{shown.length > 1 ? "s" : ""} · {eur(shownTotal)}</span>
                {filter && <> <button className="link" onClick={() => setFilter("")}>Tout afficher</button></>}
              </h2>
              <input className="search" type="text" placeholder="Rechercher : entreprise, montant, date, référence…"
                value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Rechercher une facture"
                style={{ display: "block", width: "100%", padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 4, font: "inherit" }} />
              {shown.length === 0 ? (
                <p className="empty">Aucune facture ne correspond à cette recherche.</p>
              ) : (
                <table>
                  <thead><tr><th>Date</th><th>Entreprise</th><th>Réf.</th><th className="n">Montant</th><th></th></tr></thead>
                  <tbody>
                    {shown.map((i) => (
                      <tr key={i.id} className={editing?.id === i.id ? "editing" : ""}>
                        <td>{i.date ? frDate(i.date) : "—"}</td>
                        <td>{i.company.name} <span className="chip">{SRC[i.source]}</span></td>
                        <td>{i.reference ?? "—"}</td>
                        <td className="n">{eur(i.amount)}</td>
                        <td className="n actions">
                          {i.fileName && <a className="link" href={`/api/file?id=${i.id}`} target="_blank" rel="noreferrer">Voir</a>}
                          <button className="link" onClick={() => edit(i)}>Modifier</button>
                          <button className="link del" onClick={() => remove(i.id)}>Supprimer</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
