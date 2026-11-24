// Factures fournies à l'application « Budget » (voir app/api/budget/route.ts).
// Fonctions pures : pas d'accès à la base, elles se testent seules. Seuls ces champs sont exposés
// (jamais le fichier d'origine).

export type BudgetInvoice = {
  id: string;
  company: string;
  amount: number;
  date: string; // YYYY-MM-DD
  reference: string;
  path: string; // lien vers le fichier d'origine, "" s'il n'est pas conservé
};

export type LigneFacture = {
  id: number;
  amount: number;
  date: Date | null;
  createdAt: Date;
  reference: string | null;
  hasFile: boolean;
  company: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 800;

const jour = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** Valide ?from=&to= : dates réelles, ordre correct, plage limitée. Renvoie null si invalide. */
export function parseRange(from: string | null, to: string | null): { from: string; to: string } | null {
  if (!from || !to || !ISO.test(from) || !ISO.test(to)) return null;
  const a = jour(from);
  const b = jour(to);
  if (a.toISOString().slice(0, 10) !== from || b.toISOString().slice(0, 10) !== to || b < a) return null;
  return (b.getTime() - a.getTime()) / 86_400_000 > MAX_DAYS ? null : { from, to };
}

/** Factures dont la date (à défaut, la date d'ajout) tombe entre `from` et `to`, de la plus récente à la plus ancienne. */
export function budgetInvoices(lignes: LigneFacture[], from: string, to: string): BudgetInvoice[] {
  return lignes
    .map((l) => ({
      id: String(l.id),
      company: l.company,
      amount: l.amount,
      date: (l.date ?? l.createdAt).toISOString().slice(0, 10),
      reference: l.reference ?? "",
      path: l.hasFile ? `/api/file?id=${l.id}` : "",
    }))
    .filter((i) => i.date >= from && i.date <= to)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
