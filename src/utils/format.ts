export function formatNumber(value: number): string {
  return new Intl.NumberFormat("tr-TR").format(value);
}

export function formatIsoDuration(value: string): string {
  const match = value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return value;

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0) + days * 24;
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function discordTimestamp(iso: string): string {
  const seconds = Math.floor(new Date(iso).getTime() / 1000);
  return Number.isFinite(seconds) ? `<t:${seconds}:D>` : iso;
}
