// Tiny logger with a consistent prefix so Railway logs are easy to read.
function ts() { return new Date().toISOString(); }
export const log = {
  info: (area: string, msg: string, extra?: unknown) =>
    console.log(`${ts()} [${area}] ${msg}`, extra === undefined ? '' : safe(extra)),
  warn: (area: string, msg: string, extra?: unknown) =>
    console.warn(`${ts()} [${area}] WARN ${msg}`, extra === undefined ? '' : safe(extra)),
  error: (area: string, msg: string, extra?: unknown) =>
    console.error(`${ts()} [${area}] ERROR ${msg}`, extra === undefined ? '' : safe(extra)),
};
function safe(v: unknown) {
  if (v instanceof Error) return v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
}
