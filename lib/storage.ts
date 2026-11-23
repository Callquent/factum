import { promises as fs } from "fs";
import path from "path";

export const MAX_SIZE = 15 * 1024 * 1024;

export type Upload = { arrayBuffer(): Promise<ArrayBuffer>; name: string; type: string; size: number };

export function getUpload(fd: FormData): Upload | null {
  const f = fd.get("file") as unknown;
  if (f && typeof f === "object" && "arrayBuffer" in f && (f as Upload).size > 0) return f as Upload;
  return null;
}

// Le fichier est conservé directement dans la base SQLite
export async function toFileData(f: Upload) {
  return {
    fileData: Buffer.from(await f.arrayBuffer()),
    fileName: f.name,
    fileType: f.type || "application/octet-stream",
    filePath: null,
  };
}

// Anciens fichiers stockés sur disque (versions précédentes)
const DIR = path.join(process.cwd(), "storage");
export const legacyPath = (name: string) => path.join(DIR, path.basename(name));
export async function removeLegacyFile(name?: string | null) {
  if (name) await fs.rm(legacyPath(name), { force: true });
}
