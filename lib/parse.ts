export type Extracted = { company: string; amount: string; date: string; reference: string };

// Un montant = décimales exactes (2 chiffres). Le point n'est jamais un séparateur de milliers
// sauf au format "1.234,56". Les montants collés ("2.432.43") sont séparés en "2.43" et "2.43".
const NUM = /\d{1,3}(?:\.\d{3})+,\d{2}|(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+)[,.]\d{2}/g;

function toNumber(raw: string): number {
  const s = raw.replace(/[ \u00a0]/g, "");
  return /\.\d{3}.*,\d{2}$/.test(s)
    ? parseFloat(s.replace(/\./g, "").replace(",", "."))
    : parseFloat(s.replace(",", "."));
}

function amounts(line: string): number[] {
  return [...line.matchAll(NUM)].map((m) => toNumber(m[0]));
}

export function parseInvoiceText(text: string): Extracted {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Extracted = { company: "", amount: "", date: "", reference: "" };

  // Montant : "net/total à payer" > "total TTC" > "total" (hors sous-total et TVA)
  const tiers = [
    /(?:net|total|montant)\s+[àa]\s+pa\w+/i,
    /total\s+ttc|montant\s+ttc|\bttc\b/i,
    /\btotal\b(?!.*tva)/i,
  ];
  const pure = (l?: string) => !!l && /^[\d\s.,€]+$/.test(l); // ligne qui ne contient qu'un montant
  let best: number | null = null;
  for (const re of tiers) {
    const found: number[] = [];
    lines.forEach((l, i) => {
      if (!re.test(l) || /sous[\s-]*total/i.test(l)) return;
      let a = amounts(l);
      // montant sur une ligne voisine (colonnes mal alignées par la lecture), jamais une ligne de produit
      if (!a.length) {
        const n = [lines[i + 1], lines[i + 2], lines[i - 1]].find((x) => pure(x) && amounts(x!).length);
        if (n) a = amounts(n);
      }
      found.push(...a);
    });
    if (found.length) { best = Math.max(...found); break; }
  }
  if (best === null) {
    const all = lines.flatMap(amounts);
    if (all.length) best = Math.max(...all);
  }
  if (best !== null) out.amount = best.toFixed(2);

  // Date
  const d = text.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})/);
  if (d) {
    const y = d[3].length === 2 ? "20" + d[3] : d[3];
    const mm = d[2].padStart(2, "0"), dd = d[1].padStart(2, "0");
    if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) out.date = `${y}-${mm}-${dd}`;
  }

  // Référence
  const r = text.match(/(?:facture|invoice)\s*(?:n[°o]?\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/_]{2,})/i);
  if (r && /\d/.test(r[1])) out.reference = r[1];

  // Entreprise : ligne avec forme juridique, sinon première ligne "propre"
  const legal = /\b(SAS|SASU|SARL|EURL|SA|SCI|SNC|SELARL)\b/;
  const skip = /facture|invoice|devis|avoir|date|n°|\d{2}[\/.]\d{2}|page|client|tel|www\.|@/i;
  const name =
    lines.find((l) => legal.test(l) && l.length <= 60) ??
    lines.find((l) => !skip.test(l) && /[A-Za-zÀ-ÿ]{2,}/.test(l) && l.length >= 2 && l.length <= 60);
  if (name) out.company = name.replace(/[|•]+/g, " ").replace(/\s{2,}/g, " ").trim();

  return out;
}
