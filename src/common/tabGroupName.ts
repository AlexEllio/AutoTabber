export function normalizeTabGroupName(name: string | undefined): string {
  return (name ?? '').trim().toLowerCase();
}
