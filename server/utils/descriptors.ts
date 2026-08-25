export function parseDescriptors(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

export function serializeDescriptors(
  tags: readonly string[] | null | undefined,
): string | null {
  if (!tags?.length) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.length ? JSON.stringify(out) : null;
}
