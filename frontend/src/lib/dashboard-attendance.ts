export type TodayFieldEntry = {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  latestEntry: string | null;
};

const count = (value: unknown) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

export function mapTodayFieldEntry(value: unknown): TodayFieldEntry {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    total: count(source.total),
    draft: count(source.draft),
    submitted: count(source.submitted),
    approved: count(source.approved),
    latestEntry:
      typeof source.latestEntry === "string" ? source.latestEntry : null,
  };
}
