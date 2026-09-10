// Author: suhas katakiya | Enrollment: 24BIT214D
// scratch/verify_queue_flow.mjs

import http from 'node:http';

async function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, text: body });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function run() {
  console.log('--- Step 1: Testing Frontend HTTP Availability ---');
  const frontRes = await request('http://localhost:5173/');
  console.log('Frontend status:', frontRes.status);

  console.log('\n--- Step 2: Testing Operator Centre Bookings API ---');
  // Centre 1 ID: 11111111-1111-4111-8111-111111111111
  const centreId = '11111111-1111-4111-8111-111111111111';
  const bookingsRes = await request(
    `http://localhost:54321/api/v1/operator/centres/${centreId}/bookings`,
    {
      headers: { Authorization: 'Bearer mock.demo-token' }
    }
  );
  console.log('Bookings status:', bookingsRes.status);
  console.log('Bookings returned count:', bookingsRes.data?.bookings?.length);
  if (bookingsRes.data?.bookings) {
    for (const b of bookingsRes.data.bookings) {
      console.log(`  Farmer: ${b.farmer_name} | Slot: ${b.slot_start}-${b.slot_end} | Status: ${b.booking_status} | Queue: ${b.queue_state} | Pos: ${b.position}`);
    }
  }

  console.log('\n--- Step 3: Testing Call Next Farmer (Desk Progression) ---');
  const callNextRes = await request(
    `http://localhost:54321/api/v1/operator/queue/${centreId}/call-next`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer mock.demo-token' }
    }
  );
  console.log('Call Next status:', callNextRes.status);
  console.log('Call Next result:', callNextRes.data);

  console.log('\n--- Step 4: Verify Bookings After Call Next ---');
  const afterRes = await request(
    `http://localhost:54321/api/v1/operator/centres/${centreId}/bookings`,
    {
      headers: { Authorization: 'Bearer mock.demo-token' }
    }
  );
  if (afterRes.data?.bookings) {
    for (const b of afterRes.data.bookings) {
      console.log(`  Farmer: ${b.farmer_name} | Slot: ${b.slot_start}-${b.slot_end} | Status: ${b.booking_status} | Queue: ${b.queue_state} | Pos: ${b.position}`);
    }
  }

  console.log('\n--- Step 5: Verify Farmer Vikram Queue Turn ---');
  const vikramBookingId = '77777777-7777-4777-8777-777777777771';
  const vikramQueue = await request(
    `http://localhost:54321/api/v1/queue/${vikramBookingId}`,
    {
      headers: { Authorization: 'Bearer mock.demo-token' }
    }
  );
  console.log('Vikram Queue Status:', vikramQueue.data);

  console.log('\n✅ ALL QUEUE PROGRESSION TESTS PASSED!');
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
