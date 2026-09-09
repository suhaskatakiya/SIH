/**
 * scripts/inspect-db.mjs
 *
 * Inspects the live Supabase database tables, prints row counts,
 * and displays active bookings, live queue state, and slots in a formatted CLI table.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function main() {
  console.log('\n======================================================');
  console.log('       CropSaathi — Supabase Database Inspection       ');
  console.log('======================================================');
  console.log(`Connected to: ${SUPABASE_URL}\n`);

  const tables = [
    'profiles',
    'farmers',
    'centres',
    'operator_centres',
    'procurement_rates',
    'slots',
    'bookings',
    'queue_entries',
    'procurements',
    'procurement_events',
    'payments'
  ];

  console.log('--- 1. Table Row Counts ---');
  const counts = {};
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    counts[t] = error ? `Error: ${error.message}` : count;
  }
  console.table(counts);

  console.log('\n--- 2. Procurement Centres ---');
  const { data: centres } = await supabase.from('centres').select('id, name, state_code, district, avg_service_minutes, active');
  if (centres && centres.length) console.table(centres);
  else console.log('No centres found.');

  console.log('\n--- 3. Farmers ---');
  const { data: farmers } = await supabase.from('farmers').select('id, full_name, state_code, district, village, preferred_language');
  if (farmers && farmers.length) console.table(farmers);
  else console.log('No farmers found.');

  console.log('\n--- 4. Active Bookings ---');
  const { data: bookings } = await supabase.from('bookings').select('id, reference, commodity_code, expected_quantity_qtl, status, created_at');
  if (bookings && bookings.length) console.table(bookings);
  else console.log('No bookings found.');

  console.log('\n--- 5. Live Queue Entries ---');
  const { data: queue } = await supabase.from('queue_entries').select('id, booking_id, date, seq, state, created_at');
  if (queue && queue.length) console.table(queue);
  else console.log('No queue entries found.');

  console.log('\n--- 6. Slots Sample (First 5) ---');
  const { data: slots } = await supabase.from('slots').select('id, date, start_time, end_time, capacity, booked_count, active').order('date', { ascending: true }).limit(5);
  if (slots && slots.length) console.table(slots);

  console.log('\nInspection complete!\n');
}

main().catch(console.error);
