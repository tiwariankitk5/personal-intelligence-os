export function formatLearningTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return value >= 3600 ? `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}` : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
export function parseLearningTime(value: string): number {
  const parts = value.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) throw new Error("Use seconds, mm:ss or hh:mm:ss for the timestamp.");
  if (parts.slice(1).some((part) => Number(part) >= 60)) throw new Error("Timestamp minutes and seconds must be below 60.");
  const seconds = parts.reduce((total, part) => total * 60 + Number(part), 0);
  if (!Number.isSafeInteger(seconds) || seconds > 86400) throw new Error("The timestamp must be within 24 hours.");
  return seconds;
}
