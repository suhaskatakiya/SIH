<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { FarmerDashboardResponse } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatWait, formatDateTime, formatTimeRange, formatDate, formatQuantity } from '$lib/format';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import CongestionIndicator from '$lib/components/CongestionIndicator.svelte';

  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let data = $state<FarmerDashboardResponse | null>(null);
  let refreshing = $state(false);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function load(quiet = false) {
    if (quiet) refreshing = true;
    else status = 'loading';
    try {
      data = await api.getFarmerDashboard();
      status = 'ready';
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
      status = 'error';
    } finally {
      refreshing = false;
    }
  }

  onMount(() => {
    load();
    // Auto-poll every 3.5s so when operator advances queue, farmer sees real-time change
    pollTimer = setInterval(() => load(true), 3500);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });
</script>

<PageHeader title={t('queue.title')}>
  {#snippet actions()}
    {#if status === 'ready'}
      <button class="btn btn--ghost refresh-btn" onclick={() => load(true)} disabled={refreshing}>
        <span class="refresh-indicator" class:refresh-indicator--active={refreshing}></span>
        {refreshing ? t('common.loading') : t('common.refresh')}
      </button>
    {/if}
  {/snippet}
</PageHeader>

{#if status === 'loading'}
  <Spinner />
{:else if status === 'error'}
  <ErrorBanner message={error} />
  <button class="btn btn--secondary" onclick={() => load()}>{t('common.retry')}</button>
{:else if data?.active_queue && data.upcoming_booking}
  {@const q = data.active_queue}
  {@const b = data.upcoming_booking}

  <!-- =======================================================================
       1. BOOKED TIME SLOT BANNER
       Prominently informs the farmer about their specific time slot window
       ======================================================================= -->
  <div class="slot-banner">
    <div class="slot-banner__icon">⏰</div>
    <div class="slot-banner__content">
      <span class="slot-banner__badge">YOUR BOOKED SLOT WINDOW</span>
      <h2 class="slot-banner__time">{formatTimeRange(b.slot_start, b.slot_end)}</h2>
      <p class="slot-banner__centre">
        📍 {b.centre_name} · {formatDate(b.slot_date)}
      </p>
    </div>
  </div>

  <!-- =======================================================================
       2. QUEUE TURN & LIVE STATUS CARD
       Displays token number, people ahead, approx time, or "IT'S YOUR TURN!"
       ======================================================================= -->
  <div class="card stack queue-main-card">
    <div class="row row--between">
      <span class="card__title">Live Queue Status</span>
      <StatusBadge value={q.state} />
    </div>

    <!-- State: CALLED (IT'S YOUR TURN) -->
    {#if q.state === 'CALLED'}
      <div class="turn-banner turn-banner--called">
        <div class="turn-banner__emoji">🎉</div>
        <div class="turn-banner__body">
          <h3 class="turn-banner__title">IT'S YOUR TURN!</h3>
          <p class="turn-banner__desc">
            Please proceed immediately to <strong>Mandi Verification Desk 1</strong>. The operator is ready to verify your load.
          </p>
        </div>
      </div>
    <!-- State: IN_SERVICE -->
    {:else if q.state === 'IN_SERVICE'}
      <div class="turn-banner turn-banner--service">
        <div class="turn-banner__emoji">⚖️</div>
        <div class="turn-banner__body">
          <h3 class="turn-banner__title">CURRENTLY AT DESK</h3>
          <p class="turn-banner__desc">
            Your weighment and quality inspection are in progress at Desk 1.
          </p>
        </div>
      </div>
    <!-- State: COMPLETED -->
    {:else if q.state === 'COMPLETED'}
      <div class="turn-banner turn-banner--done">
        <div class="turn-banner__emoji">✅</div>
        <div class="turn-banner__body">
          <h3 class="turn-banner__title">DESK SERVICE COMPLETED</h3>
          <p class="turn-banner__desc">
            Your verification has been completed at the desk. You can view your receipt and payment status.
          </p>
        </div>
      </div>
    <!-- State: WAITING -->
    {:else}
      <!-- Token Number -->
      <div class="center-screen" style="min-height: auto; padding: var(--space-3) 0 0;">
        <div class="big-number">#{q.position}</div>
        <div class="stat__label">{t('queue.position')} · Live Token Number</div>
      </div>

      <!-- Prominent Multi-Farmer Queue Turn Information -->
      <div class="slot-queue-info">
        <div class="info-metric">
          <span class="info-metric__number">{q.farmers_ahead}</span>
          <span class="info-metric__text">
            {q.farmers_ahead === 1 ? 'Farmer' : 'Farmers'} ahead of you in this queue
          </span>
        </div>
        <div class="info-divider"></div>
        <div class="info-metric">
          <span class="info-metric__number">~{q.estimated_wait_min}m</span>
          <span class="info-metric__text">
            Estimated wait time until your turn
          </span>
        </div>
      </div>

      <!-- Congestion Level Indicator Component -->
      <CongestionIndicator
        waitMinutes={q.estimated_wait_min}
        farmersAhead={q.farmers_ahead}
        showAdvice={true}
      />
    {/if}

    <div class="live-sync-footer">
      <span class="sync-dot"></span>
      <span>Live updates active · Auto-refreshes when operator calls next</span>
      <span class="sync-time">Updated: {formatDateTime(q.updated_at)}</span>
    </div>
  </div>

  <!-- Booking and Commodity Details Card -->
  <div class="card stack stack--tight">
    <h3 style="font-size: 1rem; margin: 0 0 var(--space-2) 0; font-weight: 700;">Booking Summary</h3>
    <div class="kv"><span class="kv__k">{t('label.reference')}</span><span class="kv__v">{b.reference}</span></div>
    <div class="kv"><span class="kv__k">{t('label.commodity')}</span><span class="kv__v">{b.commodity_code}</span></div>
    <div class="kv"><span class="kv__k">{t('label.quantity')}</span><span class="kv__v">{formatQuantity(b.expected_quantity_qtl)}</span></div>
    <div class="kv"><span class="kv__k">{t('label.slot')}</span><span class="kv__v">{formatDate(b.slot_date)} · {formatTimeRange(b.slot_start, b.slot_end)}</span></div>
  </div>
{:else if data?.upcoming_booking}
  {@const b = data.upcoming_booking}
  <div class="card stack">
    <div class="row row--between">
      <span class="card__title">{b.centre_name}</span>
      <StatusBadge value={b.status} />
    </div>
    <div class="stack stack--tight">
      <div class="kv"><span class="kv__k">{t('label.reference')}</span><span class="kv__v">{b.reference}</span></div>
      <div class="kv"><span class="kv__k">{t('label.date')}</span><span class="kv__v">{formatDate(b.slot_date)}</span></div>
      <div class="kv"><span class="kv__k">{t('label.slot')}</span><span class="kv__v">{formatTimeRange(b.slot_start, b.slot_end)}</span></div>
    </div>
    <div class="alert alert--info">
      You have a booked slot! Please arrive at the centre during your window. The operator will check you in to assign your token.
    </div>
  </div>
{:else}
  <div class="card">
    <Empty icon="👥" title={t('queue.none')} subtitle={t('queue.noneSub')}>
      {#snippet action()}
        <a class="btn btn--primary" href="/book">{t('dash.bookNow')}</a>
      {/snippet}
    </Empty>
  </div>
{/if}

<style>
  .refresh-btn {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .refresh-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
  }
  .refresh-indicator--active {
    background: #f59e0b;
    animation: spinPulse 0.8s infinite;
  }
  @keyframes spinPulse {
    0% { opacity: 0.3; }
    50% { opacity: 1; }
    100% { opacity: 0.3; }
  }

  /* Slot Banner */
  .slot-banner {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
    color: #ffffff;
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-4);
    box-shadow: 0 4px 14px rgba(30, 58, 138, 0.2);
  }
  .slot-banner__icon {
    font-size: 2.25rem;
    line-height: 1;
  }
  .slot-banner__content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .slot-banner__badge {
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #93c5fd;
    text-transform: uppercase;
  }
  .slot-banner__time {
    font-size: 1.45rem;
    font-weight: 800;
    margin: 0;
    color: #ffffff;
  }
  .slot-banner__centre {
    font-size: 0.88rem;
    margin: 0;
    color: #e0e7ff;
  }

  /* Queue Main Card */
  .queue-main-card {
    border: 1px solid var(--color-border);
    position: relative;
    overflow: hidden;
  }

  /* Turn Banners */
  .turn-banner {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    margin: var(--space-2) 0;
  }
  .turn-banner__emoji {
    font-size: 2.5rem;
    line-height: 1;
  }
  .turn-banner__title {
    font-size: 1.25rem;
    font-weight: 800;
    margin: 0 0 4px 0;
  }
  .turn-banner__desc {
    font-size: 0.95rem;
    margin: 0;
    line-height: 1.4;
  }

  .turn-banner--called {
    background: #ecfdf5;
    border: 2px solid #10b981;
    color: #065f46;
    animation: bounceNotice 2s infinite;
  }
  @keyframes bounceNotice {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }

  .turn-banner--service {
    background: #eff6ff;
    border: 2px solid #3b82f6;
    color: #1e40af;
  }

  .turn-banner--done {
    background: #f3f4f6;
    border: 2px solid #9ca3af;
    color: #374151;
  }

  /* Multi-Farmer Same-Slot Wait Metrics Box */
  .slot-queue-info {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    margin: var(--space-2) 0;
  }
  .info-metric {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .info-metric__number {
    font-size: 1.75rem;
    font-weight: 800;
    color: var(--color-text);
  }
  .info-metric__text {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    font-weight: 600;
    margin-top: 2px;
  }
  .info-divider {
    width: 1px;
    height: 48px;
    background: var(--color-border);
  }

  /* Live Sync Footer */
  .live-sync-footer {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.76rem;
    color: var(--color-text-secondary);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
    flex-wrap: wrap;
  }
  .sync-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
  }
  .sync-time {
    margin-left: auto;
    font-family: monospace;
  }
</style>
