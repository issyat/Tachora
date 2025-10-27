export function minutesBetween(start: Date, end: Date): number {
  const deltaMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(deltaMs / 60000));
}

export function formatTime(time: Date | string | null): string | null {
  if (!time) return null;
  if (typeof time === "string") {
    return time.slice(0, 5);
  }
  return time.toISOString().substring(11, 16);
}

export function sumMinutes(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

export function timeToDayMinutes(time: Date | string): number {
  if (typeof time === "string") {
    const [hours, minutes] = time.split(":").map((part) => Number(part));
    return hours * 60 + (minutes ?? 0);
  }
  return time.getUTCHours() * 60 + time.getUTCMinutes();
}

export function formatMinutes(minutes: number): string {
  const hours = minutes / 60;
  if (hours >= 1) {
    return `${hours.toFixed(1)}h`;
  }
  return `${minutes}m`;
}
