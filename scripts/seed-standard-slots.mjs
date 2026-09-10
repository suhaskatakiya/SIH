/**
 * Author: suhas katakiya | Enrollment: 24BIT214D
 * 
 * scripts/seed-standard-slots.mjs
 * 
 * Seeds standardized 1-hour slots (09:00 to 18:00) into Supabase PostgreSQL
 * with default capacity 10 and active = true across centres and dates.
 * Reassigns existing bookings to the standardized 1-hour slots and cleans up
 * stale non-standard slots using efficient batch queries.
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

const STANDARD_HOURLY_SLOTS = [
  { start: '09:00:00', end: '10:00:00' },
  { start: '10:00:00', end: '11:00:00' },
  { start: '11:00:00', end: '12:00:00' },
  { start: '12:00:00', end: '13:00:00' },
  { start: '13:00:00', end: '14:00:00' },
  { start: '14:00:00', end: '15:00:00' },
  { start: '15:00:00', end: '16:00:00' },
  { start: '16:00:00', end: '17:00:00' },
  { start: '17:00:00', end: '18:00:00' }
];

const CENTRES = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'SIH Demo Procurement Centre 01',
    state_code: 'GJ',
    district: 'Gandhinagar',
    address_text: 'APMC Yard, Sector 11, Gandhinagar',
    avg_service_minutes: 10,
    active: true
  },
  {
    id: '11111111-1111-4111-8111-222222222221',
    name: 'Ahmedabad APMC Grain & Cotton Market Yard Centre',
    state_code: 'GJ',
    district: 'Ahmedabad',
    address_text: 'APMC Market Yard, National Highway 8, Vasna, Ahmedabad, Gujarat 380007',
    avg_service_minutes: 12,
    active: true
  },
  {
    id: '11111111-1111-4111-8111-222222222222',
    name: 'Vadodara Central APMC Agro Procurement Hub',
    state_code: 'GJ',
    district: 'Vadodara',
    address_text: 'Sayajipura APMC Yard, New VIP Road, Vadodara, Gujarat 390019',
    avg_service_minutes: 10,
    active: true
  }
];

function getDates(count = 5) {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function run() {
  console.log('🌾 Seeding standard 1-hour slots into Supabase...');

  // 1. Ensure centres exist
  console.log('1. Ensuring procurement centres...');
  await supabase.from('centres').upsert(CENTRES, { onConflict: 'id' });

  // 2. Ensure operator centre link exists
  console.log('2. Ensuring operator centre mapping...');
  const { data: opProfiles } = await supabase.from('profiles').select('id').eq('role', 'OPERATOR');
  if (opProfiles && opProfiles.length > 0) {
    const links = opProfiles.map((op) => ({
      operator_user_id: op.id,
      centre_id: '11111111-1111-4111-8111-111111111111'
    }));
    await supabase.from('operator_centres').upsert(links, { onConflict: 'operator_user_id,centre_id' });
  }

  // 3. Batch generate slots for each centre and date
  const dates = getDates(5);
  console.log(`3. Generating 1-hour slots for dates: ${dates.join(', ')}...`);

  const slotsToInsert = [];
  for (const centre of CENTRES) {
    for (const date of dates) {
      for (const s of STANDARD_HOURLY_SLOTS) {
        slotsToInsert.push({
          centre_id: centre.id,
          date,
          start_time: s.start,
          end_time: s.end,
          capacity: 10,
          active: true
        });
      }
    }
  }

  // Batch upsert in chunks of 50
  for (let i = 0; i < slotsToInsert.length; i += 50) {
    const chunk = slotsToInsert.slice(i, i + 50);
    const { error } = await supabase
      .from('slots')
      .upsert(chunk, { onConflict: 'centre_id,date,start_time,end_time' });
    if (error) console.warn('Chunk upsert error:', error.message);
  }

  // Fetch all slots to build a lookup map
  const { data: allSlots } = await supabase.from('slots').select('*');
  const slotMap = new Map();
  for (const s of allSlots || []) {
    slotMap.set(`${s.centre_id}|${s.date}|${s.start_time.slice(0, 5)}`, s);
  }
  console.log(`✓ Total slots in database: ${allSlots?.length || 0}`);

  // 4. Re-assign any existing bookings from non-standard slots to standard 1-hour slots
  console.log('4. Reassigning existing bookings to standard 1-hour slots...');
  const { data: existingBookings } = await supabase
    .from('bookings')
    .select('id, centre_id, slot_id, slots(id, date, start_time, end_time)');

  if (existingBookings) {
    for (const b of existingBookings) {
      const slot = b.slots;
      if (!slot) continue;
      const st = slot.start_time ? slot.start_time.slice(0, 2) + ':00' : '09:00';
      const key = `${b.centre_id}|${slot.date}|${st}`;
      const targetSlot = slotMap.get(key);
      if (targetSlot && targetSlot.id !== slot.id) {
        await supabase
          .from('bookings')
          .update({ slot_id: targetSlot.id })
          .eq('id', b.id);
      }
    }
  }

  // 5. Clean up stale non-standard 30-min slots
  console.log('5. Cleaning up stale non-standard 30-min slots...');
  if (allSlots) {
    const staleIds = [];
    for (const s of allSlots) {
      const isStandard = STANDARD_HOURLY_SLOTS.some(
        (std) => std.start === s.start_time && std.end === s.end_time
      );
      if (!isStandard) staleIds.push(s.id);
    }

    if (staleIds.length > 0) {
      console.log(`Cleaning up ${staleIds.length} stale non-standard slots...`);
      for (const id of staleIds) {
        const { error: delErr } = await supabase.from('slots').delete().eq('id', id);
        if (delErr) {
          await supabase.from('slots').update({ active: false }).eq('id', id);
        }
      }
    }
  }

  // 6. Recalculate booked_counts on all standard slots
  console.log('6. Recalculating booked_count on slots...');
  const { data: refreshedSlots } = await supabase.from('slots').select('id');
  if (refreshedSlots) {
    for (const s of refreshedSlots) {
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('slot_id', s.id)
        .neq('status', 'CANCELLED');

      if (count !== null && count !== undefined) {
        await supabase.from('slots').update({ booked_count: count }).eq('id', s.id);
      }
    }
  }

  console.log('✨ Standard 1-hour slot setup complete!');
}

run().catch(console.error);
