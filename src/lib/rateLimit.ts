// Very small stub for daily cap logic (AI agent will implement real DB-backed version).
export async function underDailyCap(caller: string, tz = 'Asia/Kolkata'): Promise<boolean> {
  // TODO: read from Postgres rate_limits table; create if missing
  return true;
}