/**
 * Display formatting helpers. These NEVER mutate the underlying values — money
 * and quantities stay decimal strings everywhere in the app (§ money-as-string);
 * we only format them for the screen.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/** Local calendar date as YYYY-MM-DD (no UTC shift). */
export function todayIso(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add whole days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m! - 1), d! + days);
  return toIsoDate(dt);
}

/** "2026-09-10" -> "10 Sep 2026". Returns the input unchanged if unparseable. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month} ${m[1]}`;
}

/** "10:30" + "11:00" -> "10:30 – 11:00". */
export function formatTimeRange(start: string, end: string): string {
  return `${start} – ${end}`;
}

/** ISO-8601 timestamp -> "10 Sep 2026, 10:14". Falls back gracefully. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

/** Group an integer string with the Indian numbering system: 4491440 -> 44,91,440. */
function groupIndian(intPart: string): string {
  const neg = intPart.startsWith('-');
  const digits = neg ? intPart.slice(1) : intPart;
  if (digits.length <= 3) return (neg ? '-' : '') + digits;
  const head = digits.slice(0, digits.length - 3);
  const tail = digits.slice(digits.length - 3);
  const grouped = head.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + ',' + tail;
}

/**
 * Format a decimal money string for display, e.g. "44914.40" -> "₹44,914.40".
 * Keeps exactly two fraction digits. `null`/`undefined` -> "—".
 */
export function formatMoney(value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  const [rawInt = '0', rawFrac = ''] = value.split('.');
  const frac = (rawFrac + '00').slice(0, 2);
  return `₹${groupIndian(rawInt)}.${frac}`;
}

/** "18.40" -> "18.40 qtl". `null` -> "—". */
export function formatQuantity(value: string | null | undefined, unit = 'qtl'): string {
  if (value == null || value === '') return '—';
  return `${value} ${unit}`;
}

/** Minutes -> a short human duration: 0 -> "now", 12 -> "12 min", 75 -> "1 hr 15 min". */
export function formatWait(minutes: number): string {
  if (minutes <= 0) return 'now';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
