// Shared helpers for the refresh scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const outDir = (sport) => {
  const d = path.join(ROOT, "public", "data", sport);
  fs.mkdirSync(d, { recursive: true });
  return d;
};

export async function getText(url, { optional = false, tries = 4 } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": "stat-analysis-refresh" } });
      if (r.status === 404 && optional) return null;
      if (r.ok) return await r.text();
      if (attempt === tries) throw new Error(`${r.status} ${url}`);
    } catch (e) {
      if (attempt === tries) throw e;
    }
    await new Promise((res) => setTimeout(res, 1500 * attempt));
  }
}
export async function getJson(url, opts) {
  const t = await getText(url, opts);
  return t == null ? null : JSON.parse(t);
}

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
export async function csv(url, optional = false) {
  const t = await getText(url, { optional });
  return t == null ? null : parseCsv(t);
}

export const num = (v) => {
  if (v === "" || v == null || v === "NA") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const round = (n) => (Number.isInteger(n) ? n : Math.round(n * 1000) / 1000);
export const ymd = (s) => Number(String(s).slice(0, 10).replace(/-/g, "")); // "2026-11-15" -> 20261115

// Run async fn over items with limited concurrency.
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

export function readMeta(dir) {
  const p = path.join(dir, "meta.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}
export function haveSeason(dir, season) {
  return fs.existsSync(path.join(dir, `players_${season}.json`)) && fs.existsSync(path.join(dir, `teams_${season}.json`));
}
export function writeSeason(dir, season, team, player) {
  fs.writeFileSync(path.join(dir, `teams_${season}.json`), JSON.stringify(team));
  fs.writeFileSync(path.join(dir, `players_${season}.json`), JSON.stringify(player));
}
export function writeMeta(dir, meta) {
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ ...meta, updated: new Date().toISOString() }, null, 1));
}

// Add opp_<col> copies of the opponent's row for each team row. rows: [{key, oppKey, vals:{}}]
export function oppColumns(cols, byKey, key) {
  const o = byKey.get(key);
  return cols.map((c) => round(o ? o[c] || 0 : 0));
}
