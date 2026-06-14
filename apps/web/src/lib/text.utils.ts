export function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .replace(/^@/, '')
    .split(/[\s_]/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}
