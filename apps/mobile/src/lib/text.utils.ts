export function getInitials(name: string): string {
  return name
    .replace(/^@/, '')
    .split(/[\s_]/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
