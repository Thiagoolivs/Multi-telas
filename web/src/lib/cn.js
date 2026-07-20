// Junta classes condicionais sem dependência externa (clsx-like enxuto).
export function cn(...parts) {
  return parts
    .flat(Infinity)
    .filter(Boolean)
    .join(' ')
    .trim();
}
