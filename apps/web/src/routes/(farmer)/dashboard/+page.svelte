<script lang="ts">
  import { onMount } from 'svelte';
  import type { FarmerDashboardResponse } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, i18n, errorMessage } from '$lib/i18n.svelte';
  import { formatDate, formatTimeRange, formatMoney, formatWait } from '$lib/format';
  import { formatCommodity } from '$lib/commodities';
  import { session } from '$lib/session.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';

  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let data = $state<FarmerDashboardResponse | null>(null);

  async function load() {
    status = 'loading';
    try {
      data = await api.getFarmerDashboard();
      status = 'ready';
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
      status = 'error';
    }
  }
  onMount(load);

  const farmer = $derived(session.me?.farmer);
  const fullName = $derived(farmer?.full_name ?? '');
  const firstName = $derived(fullName.split(' ')[0] || '');
  const locationText = $derived(
    [farmer?.village, farmer?.district, farmer?.state_code].filter(Boolean).join(', ')
  );

  const allBookings = $derived.by(() => {
    if (!data) return [];
    if (data.upcoming_bookings && data.upcoming_bookings.length > 0) {
      return data.upcoming_bookings;
    }
    if (data.upcoming_booking) {
      return [data.upcoming_booking];
    }
    return [];
  });
</script>

<!-- Rich Top Welcome Header & Quick Overview -->
<div class="dash-hero card">
  <div class="dash-hero__content">
    <div class="dash-hero__text">
      <h1 class="dash-hero__greeting">
        👋 {t('dash.welcome')}, {firstName || 'Farmer'}!
      </h1>
      <div class="dash-hero__meta">
        <span class="meta-pill">🌾 {t('label.farmer')}</span>
        {#if locationText}
          <span class="meta-pill">📍 {locationText}</span>
        {/if}
        {#if farmer?.external_farmer_ref}
          <span class="meta-pill">🏷️ {farmer.external_farmer_ref}</span>
        {/if}
      </div>
    </div>
    <div class="dash-hero__actions">
      <a class="btn btn--primary" href="/book">+ {t('dash.bookNow')}</a>
    </div>
  </div>

  <!-- 3-Tile Quick Overview Bar filling top space with purpose -->
  <div class="dash-stats">
    <div class="dash-stat">
      <div class="dash-stat__icon">📅</div>
      <div class="dash-stat__details">
        <span class="dash-stat__label">{t('dash.allUpcoming')}</span>
        <span class="dash-stat__val">
          {allBookings.length} {allBookings.length === 1 ? 'Slot' : 'Slots'}
        </span>
        <span class="dash-stat__sub">
          {allBookings[0] ? `Next: ${formatDate(allBookings[0].slot_date)}` : 'No slots booked'}
        </span>
      </div>
    </div>

    <div class="dash-stat">
      <div class="dash-stat__icon">👥</div>
      <div class="dash-stat__details">
        <span class="dash-stat__label">{t('queue.title')}</span>
        <span class="dash-stat__val">
          {data?.active_queue ? `Token #${data.active_queue.position}` : 'Not in queue'}
        </span>
        <span class="dash-stat__sub">
          {data?.active_queue ? `${formatWait(data.active_queue.estimated_wait_min)} wait` : 'Live arrival token'}
        </span>
      </div>
    </div>

    <div class="dash-stat">
      <div class="dash-stat__icon">💳</div>
      <div class="dash-stat__details">
        <span class="dash-stat__label">{t('payment.title')}</span>
        <span class="dash-stat__val">
          {data?.payment?.amount ? formatMoney(data.payment.amount) : (data?.procurement ? 'In progress' : 'Mandi MSP')}
        </span>
        <span class="dash-stat__sub">
          {data?.payment ? `Status: ${data.payment.status}` : 'Direct bank credit'}
        </span>
      </div>
    </div>
  </div>
</div>

{#if status === 'loading'}
  <Spinner />
{:else if status === 'error'}
  <ErrorBanner message={error} />
  <button class="btn btn--secondary" onclick={load}>{t('common.retry')}</button>
{:else if data}
  {#if data.active_queue}
    {@const q = data.active_queue}
    <div class="card stack live-card">
      <div class="row row--between">
        <div class="row">
          <span class="live-dot"></span>
          <span class="card__title">{t('queue.title')}</span>
        </div>
        <StatusBadge value={q.state} />
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="stat__num">{q.position}</div><div class="stat__label">{t('queue.position')}</div></div>
        <div class="stat"><div class="stat__num">{formatWait(q.estimated_wait_min)}</div><div class="stat__label">{t('queue.eta')}</div></div>
      </div>
      <a class="btn btn--primary btn--block" href="/queue">{t('dash.viewQueue')}</a>
    </div>
  {/if}

  {#if data.procurement}
    {@const p = data.procurement}
    <div class="card stack">
      <div class="row row--between">
        <span class="card__title">{t('status.title')}</span>
        <StatusBadge value={p.status} />
      </div>
      {#if p.amount}
        <div class="kv"><span class="kv__k">{t('status.amount')}</span><span class="kv__v">{formatMoney(p.amount)}</span></div>
      {/if}
      <a class="btn btn--secondary btn--block" href="/status">{t('dash.viewStatus')}</a>
    </div>
  {/if}

  {#if data.payment}
    {@const pay = data.payment}
    <div class="card stack">
      <div class="row row--between">
        <span class="card__title">{t('payment.title')}</span>
        <StatusBadge value={pay.status} />
      </div>
      {#if pay.amount}
        <div class="kv"><span class="kv__k">{t('payment.amount')}</span><span class="kv__v">{formatMoney(pay.amount)}</span></div>
      {/if}
      <a class="btn btn--secondary btn--block" href="/payment">{t('dash.viewPayment')}</a>
    </div>
  {/if}

  {#if allBookings.length === 0}
    <div class="card">
      <Empty
        icon="🌾"
        title={t('dash.noBooking')}
        subtitle={t('dash.noBookingSub')}
      >
        {#snippet action()}
          <a class="btn btn--primary" href="/book">{t('dash.bookNow')}</a>
        {/snippet}
      </Empty>
    </div>
  {:else}
    <div class="slots-section-header">
      <div class="slots-header-text">
        <h2 class="slots-title">{t('dash.allUpcoming')}</h2>
        <span class="slots-count-badge">{allBookings.length} {allBookings.length === 1 ? 'Slot' : 'Slots'}</span>
      </div>
      <a class="btn btn--secondary btn--sm" href="/book">{t('dash.bookAnother')}</a>
    </div>

    <div class="slots-list stack">
      {#each allBookings as b (b.id)}
        <div class="card slot-card stack stack--tight">
          <div class="row row--between slot-card__header">
            <div class="slot-datetime">
              <span class="slot-calendar-date">📅 {formatDate(b.slot_date)}</span>
              <span class="slot-time-pill">⏰ {formatTimeRange(b.slot_start, b.slot_end)}</span>
            </div>
            <StatusBadge value={b.status} />
          </div>

          <div class="slot-card__body stack stack--tight">
            <div class="kv">
              <span class="kv__k">{t('label.reference')}</span>
              <span class="kv__v mono-ref">{b.reference}</span>
            </div>
            <div class="kv">
              <span class="kv__k">{t('label.centre')}</span>
              <span class="kv__v">{b.centre_name}</span>
            </div>
            <div class="kv">
              <span class="kv__k">{t('label.commodity')}</span>
              <span class="kv__v">{formatCommodity(b.commodity_code, i18n.lang)}</span>
            </div>
            <div class="kv">
              <span class="kv__k">{t('label.quantity')}</span>
              <span class="kv__v">{b.expected_quantity_qtl} qtl</span>
            </div>
          </div>

          {#if b.status === 'IN_QUEUE'}
            <div class="slot-card__actions">
              <a class="btn btn--primary btn--block" href="/queue">{t('dash.viewQueue')}</a>
            </div>
          {:else if b.status === 'IN_SERVICE'}
            <div class="slot-card__actions">
              <a class="btn btn--primary btn--block" href="/status">{t('dash.viewStatus')}</a>
            </div>
          {:else if b.status === 'BOOKED'}
            <div class="slot-tip">
              <span>ℹ️ Arrive at centre 15 mins before your slot window</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .dash-hero {
    background: linear-gradient(135deg, #ffffff 0%, #f7faf7 100%);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-card);
    padding: var(--space-4) var(--space-5);
    margin-bottom: var(--space-4);
    box-shadow: var(--shadow-card);
  }

  .dash-hero__content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .dash-hero__greeting {
    font-size: 22px;
    font-weight: 750;
    margin: 0 0 var(--space-2);
    color: var(--color-text);
  }

  .dash-hero__meta {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .meta-pill {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-muted);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    padding: 3px 10px;
    border-radius: 999px;
  }

  .dash-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  .dash-stat {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-control);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .dash-stat:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }

  .dash-stat__icon {
    font-size: 22px;
    line-height: 1;
    padding: 8px;
    background: var(--color-bg);
    border-radius: var(--radius-control);
  }

  .dash-stat__details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .dash-stat__label {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .dash-stat__val {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text);
  }

  .dash-stat__sub {
    font-size: 12px;
    color: var(--color-muted);
  }

  .live-card {
    border-left: 4px solid var(--color-primary);
  }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(46, 125, 50, 0.2);
    animation: pulse 2s infinite ease-in-out;
  }

  @keyframes pulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 125, 50, 0.4); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(46, 125, 50, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 125, 50, 0); }
  }

  .slots-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: var(--space-4);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }

  .slots-header-text {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .slots-title {
    font-size: var(--text-subheading);
    font-weight: 700;
    margin: 0;
  }

  .slots-count-badge {
    background: #e8f5e9;
    color: #2e7d32;
    font-size: var(--text-meta);
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid #c8e6c9;
  }

  .slot-card {
    border-left: 4px solid var(--color-primary);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .slot-card:hover {
    box-shadow: var(--shadow-card);
  }

  .slot-datetime {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .slot-calendar-date {
    font-weight: 700;
    font-size: 1rem;
  }

  .slot-time-pill {
    font-size: var(--text-meta);
    color: var(--color-muted);
    font-weight: 600;
  }

  .mono-ref {
    font-family: monospace;
    font-size: 0.9rem;
    letter-spacing: 0.5px;
  }

  .slot-card__actions {
    margin-top: var(--space-2);
  }

  .slot-tip {
    font-size: var(--text-meta);
    color: var(--color-muted);
    padding-top: var(--space-2);
    border-top: 1px dashed var(--color-border);
  }
</style>
