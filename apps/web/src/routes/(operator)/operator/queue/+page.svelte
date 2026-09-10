<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { CentreBookingRow } from '$lib/services';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatTimeRange, formatQuantity, formatDate, todayIso, addDaysIso } from '$lib/format';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import OperatorWorkPanel from '$lib/components/OperatorWorkPanel.svelte';

  const DATES = Array.from({ length: 5 }, (_, i) => addDaysIso(todayIso(), i));

  let date = $state(todayIso());
  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let notLive = $state(false);
  let centreId = $state('');
  let rows = $state<CentreBookingRow[]>([]);
  let busyId = $state<string | null>(null);
  let calling = $state(false);
  let selectedId = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function load(quiet = false) {
    if (!quiet) status = 'loading';
    error = '';
    notLive = false;
    try {
      const dash = await api.getOperatorDashboard();
      centreId = dash.centre.id;
      const res = await api.listCentreBookings(centreId, date);
      rows = res.bookings;
      status = 'ready';
    } catch (err) {
      if (isApiClientError(err) && err.code === 'NOT_AVAILABLE_LIVE') {
        notLive = true;
        status = 'ready';
        rows = [];
      } else {
        error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
        status = 'error';
      }
    }
  }

  onMount(() => {
    load();
    pollTimer = setInterval(() => load(true), 4000);
  });

  onDestroy(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  async function callNext() {
    error = '';
    calling = true;
    try {
      await api.callNext(centreId);
      await load(true);
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      calling = false;
    }
  }

  async function act(row: CentreBookingRow, fn: () => Promise<unknown>) {
    error = '';
    busyId = row.booking_id;
    try {
      await fn();
      await load(true);
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      busyId = null;
    }
  }

  // Active desk farmer: currently CALLED or IN_SERVICE
  let activeDeskFarmer = $derived(
    rows.find((r) => r.queue_state === 'CALLED' || r.queue_state === 'IN_SERVICE') ?? null
  );

  let nextWaitingFarmer = $derived(
    rows.find((r) => r.queue_state === 'WAITING') ?? null
  );

  // Group rows by slot window
  let slotGroups = $derived.by(() => {
    const map = new Map<string, CentreBookingRow[]>();
    for (const r of rows) {
      const key = `${r.slot_start} - ${r.slot_end}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([slotWindow, farmers]) => {
      const waiting = farmers.filter((f) => f.queue_state === 'WAITING').length;
      const called = farmers.filter((f) => f.queue_state === 'CALLED' || f.queue_state === 'IN_SERVICE').length;
      const completed = farmers.filter((f) => f.queue_state === 'COMPLETED' || f.booking_status === 'COMPLETED').length;
      return { slotWindow, farmers, waiting, called, completed };
    });
  });
</script>

<PageHeader title={t('op.queue')}>
  {#snippet actions()}
    {#if status === 'ready' && !notLive}
      <button class="btn btn--primary desk-call-btn" onclick={callNext} disabled={calling}>
        <span class="desk-call-btn__icon">❯</span>
        {calling ? t('common.loading') : t('op.callNext')}
      </button>
    {/if}
  {/snippet}
</PageHeader>

{#if error}<ErrorBanner message={error} />{/if}

<!-- Date selector -->
<div class="card stack" style="margin-bottom: var(--space-4);">
  <div class="field">
    <label class="field__label" for="date">{t('book.date')}</label>
    <select id="date" class="select" bind:value={date} onchange={() => load()}>
      {#each DATES as d (d)}<option value={d}>{formatDate(d)}</option>{/each}
    </select>
  </div>
</div>

{#if status === 'loading'}
  <Spinner />
{:else if status === 'error'}
  <button class="btn btn--secondary" onclick={() => load()}>{t('common.retry')}</button>
{:else if notLive}
  <div class="alert alert--info">{errorMessage('NOT_AVAILABLE_LIVE', '')}</div>
{:else}
  <!-- =========================================================================
       NOW SERVING DESK (TOP CARD)
       Prominently shows who is currently at Desk 1, with "Next Farmer ❯" action
       ========================================================================= -->
  <div class="card desk-card" class:desk-card--active={!!activeDeskFarmer}>
    <div class="desk-card__header">
      <div class="desk-tag">
        <span class="pulse-dot" class:pulse-dot--active={!!activeDeskFarmer}></span>
        <span class="desk-tag__title">VERIFICATION DESK 1</span>
        <span class="desk-tag__sub">
          {activeDeskFarmer ? 'NOW SERVING' : 'IDLE / READY'}
        </span>
      </div>
      {#if activeDeskFarmer}
        <StatusBadge value={activeDeskFarmer.queue_state ?? activeDeskFarmer.booking_status} />
      {/if}
    </div>

    {#if activeDeskFarmer}
      <div class="desk-card__body">
        <div class="desk-farmer-info">
          <div class="desk-farmer-token">Token #{activeDeskFarmer.position ?? 1}</div>
          <h2 class="desk-farmer-name">{activeDeskFarmer.farmer_name}</h2>
          <div class="desk-farmer-meta">
            <span class="meta-pill">⏰ Slot: {formatTimeRange(activeDeskFarmer.slot_start, activeDeskFarmer.slot_end)}</span>
            <span class="meta-pill">🌾 {activeDeskFarmer.commodity_code}</span>
            <span class="meta-pill">⚖️ {formatQuantity(activeDeskFarmer.expected_quantity_qtl)}</span>
            <span class="meta-pill meta-pill--muted">Ref: {activeDeskFarmer.reference}</span>
          </div>
        </div>

        <div class="desk-actions">
          <button
            class="btn btn--primary desk-action-btn"
            onclick={callNext}
            disabled={calling}
            title="Complete current farmer & pull next waiting farmer to the desk"
          >
            <span style="font-size: 1.15rem;">⏭</span>
            {calling ? t('common.loading') : 'Next Farmer ❯'}
          </button>

          {#if activeDeskFarmer.queue_state === 'CALLED'}
            <button
              class="btn btn--secondary"
              onclick={() => act(activeDeskFarmer!, () => api.startService(activeDeskFarmer!.booking_id))}
              disabled={busyId === activeDeskFarmer.booking_id}
            >
              {busyId === activeDeskFarmer.booking_id ? t('common.loading') : t('op.startService')}
            </button>
          {:else if activeDeskFarmer.booking_status === 'IN_SERVICE' && activeDeskFarmer.procurement_id}
            <button
              class="btn btn--secondary"
              onclick={() => (selectedId = selectedId === activeDeskFarmer!.booking_id ? null : activeDeskFarmer!.booking_id)}
            >
              {selectedId === activeDeskFarmer.booking_id ? t('common.back') : t('op.openProcurement')}
            </button>
          {/if}
        </div>
      </div>

      {#if selectedId === activeDeskFarmer.booking_id && activeDeskFarmer.procurement_id}
        <div style="margin-top: var(--space-4); border-top: 1px solid var(--color-border); padding-top: var(--space-4);">
          <OperatorWorkPanel
            bookingId={activeDeskFarmer.booking_id}
            procurementId={activeDeskFarmer.procurement_id}
            onChange={() => load(true)}
          />
        </div>
      {/if}
    {:else}
      <div class="desk-card__idle">
        <p class="desk-idle-text">
          {#if nextWaitingFarmer}
            Next in queue: <strong>{nextWaitingFarmer.farmer_name}</strong> (Token #{nextWaitingFarmer.position ?? 1} · {nextWaitingFarmer.commodity_code})
          {:else}
            No waiting farmers in today's queue. Desk is open for arriving farmers.
          {/if}
        </p>
        <button class="btn btn--primary" onclick={callNext} disabled={calling || !nextWaitingFarmer}>
          {calling ? t('common.loading') : t('op.callNext')} ❯
        </button>
      </div>
    {/if}
  </div>

  <!-- =========================================================================
       MULTI-FARMER SAME-SLOT QUEUE BREAKDOWN
       Groups all farmers by time slot (e.g. 09:30 - 10:00 AM)
       ========================================================================= -->
  <div class="queue-section-header">
    <h3 class="section-heading">⏰ Slot-by-Slot Queue Management</h3>
    <span class="section-meta">{rows.length} Total Bookings</span>
  </div>

  {#if rows.length === 0}
    <div class="card"><Empty icon="👥" title={t('op.noBookings')} /></div>
  {:else}
    {#each slotGroups as group (group.slotWindow)}
      <div class="slot-group-card">
        <!-- Slot Window Header -->
        <div class="slot-group-header">
          <div class="slot-group-title">
            <span class="slot-clock-icon">⏰</span>
            <strong>{formatTimeRange(group.farmers[0]?.slot_start ?? '09:00', group.farmers[0]?.slot_end ?? '09:30')}</strong>
            <span class="slot-count-badge">
              {group.farmers.length} {group.farmers.length === 1 ? 'Farmer' : 'Farmers'} Booked
            </span>
          </div>
          <div class="slot-group-stats">
            {#if group.called > 0}
              <span class="stat-pill stat-pill--active">1 at desk</span>
            {/if}
            {#if group.waiting > 0}
              <span class="stat-pill stat-pill--waiting">{group.waiting} waiting</span>
            {/if}
            {#if group.completed > 0}
              <span class="stat-pill stat-pill--done">{group.completed} completed</span>
            {/if}
          </div>
        </div>

        <!-- Farmers in this slot -->
        <div class="slot-farmers-list">
          {#each group.farmers as row (row.booking_id)}
            {@const isAtDesk = row.queue_state === 'CALLED' || row.queue_state === 'IN_SERVICE'}
            {@const isDone = row.queue_state === 'COMPLETED' || row.booking_status === 'COMPLETED'}
            <div
              class="farmer-item"
              class:farmer-item--desk={isAtDesk}
              class:farmer-item--done={isDone}
            >
              <div class="farmer-item__top">
                <div class="farmer-item__left">
                  {#if row.position && row.queue_state === 'WAITING'}
                    <span class="token-pill token-pill--waiting">Token #{row.position}</span>
                  {:else if isAtDesk}
                    <span class="token-pill token-pill--desk">Desk 1 · Live</span>
                  {:else if isDone}
                    <span class="token-pill token-pill--done">Done ✓</span>
                  {:else}
                    <span class="token-pill">Booked</span>
                  {/if}

                  <strong class="farmer-name">{row.farmer_name}</strong>
                  <span class="farmer-ref">{row.reference}</span>
                </div>

                <div class="farmer-item__right">
                  <StatusBadge value={row.queue_state ?? row.booking_status} />
                </div>
              </div>

              <div class="farmer-item__details">
                <div class="detail-col">
                  <span class="detail-label">{t('label.commodity')}</span>
                  <span class="detail-val">{row.commodity_code}</span>
                </div>
                <div class="detail-col">
                  <span class="detail-label">{t('label.quantity')}</span>
                  <span class="detail-val">{formatQuantity(row.expected_quantity_qtl)}</span>
                </div>
                <div class="detail-col">
                  <span class="detail-label">Queue Turn</span>
                  <span class="detail-val">
                    {#if isAtDesk}
                      <span style="color: var(--color-success); font-weight: 700;">Now Serving</span>
                    {:else if row.queue_state === 'WAITING'}
                      {row.position ? `${row.position - 1} ahead` : 'In Queue'}
                    {:else if isDone}
                      <span style="color: var(--color-muted);">Completed</span>
                    {:else}
                      Awaiting Check-in
                    {/if}
                  </span>
                </div>
              </div>

              <!-- Action buttons per row -->
              <div class="farmer-item__actions">
                {#if row.booking_status === 'BOOKED'}
                  <button
                    class="btn btn--secondary btn--sm"
                    onclick={() => act(row, () => api.checkIn(row.booking_id))}
                    disabled={busyId === row.booking_id}
                  >
                    {busyId === row.booking_id ? t('common.loading') : t('op.checkIn')}
                  </button>
                {:else if row.queue_state === 'CALLED'}
                  <button
                    class="btn btn--primary btn--sm"
                    onclick={() => act(row, () => api.startService(row.booking_id))}
                    disabled={busyId === row.booking_id}
                  >
                    {busyId === row.booking_id ? t('common.loading') : t('op.startService')}
                  </button>
                {:else if row.booking_status === 'IN_SERVICE' && row.procurement_id}
                  <button
                    class="btn btn--secondary btn--sm"
                    onclick={() => (selectedId = selectedId === row.booking_id ? null : row.booking_id)}
                  >
                    {selectedId === row.booking_id ? t('common.back') : t('op.openProcurement')}
                  </button>
                {/if}
              </div>

              {#if selectedId === row.booking_id && row.procurement_id && !isAtDesk}
                <div style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border);">
                  <OperatorWorkPanel
                    bookingId={row.booking_id}
                    procurementId={row.procurement_id}
                    onChange={() => load(true)}
                  />
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
{/if}

<style>
  .desk-call-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 700;
  }
  .desk-call-btn__icon {
    font-size: 1.1rem;
  }

  /* Top "Now Serving Desk" Card */
  .desk-card {
    border: 2px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    padding: var(--space-5);
    margin-bottom: var(--space-5);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .desk-card--active {
    border-color: #10b981;
    background: linear-gradient(180deg, rgba(16, 185, 129, 0.04) 0%, var(--color-surface) 100%);
    box-shadow: 0 8px 24px rgba(16, 185, 129, 0.12);
  }
  .desk-card__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .desk-tag {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .desk-tag__title {
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--color-text-secondary);
  }
  .desk-tag__sub {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.15);
    color: #059669;
  }

  .pulse-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #9ca3af;
  }
  .pulse-dot--active {
    background: #10b981;
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.25);
    animation: pulseGlow 1.8s infinite;
  }
  @keyframes pulseGlow {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
    70% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }

  .desk-card__body {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
  }
  .desk-farmer-token {
    font-size: 0.85rem;
    font-weight: 800;
    color: #059669;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }
  .desk-farmer-name {
    font-size: 1.5rem;
    font-weight: 800;
    margin: 0 0 var(--space-2) 0;
    color: var(--color-text);
  }
  .desk-farmer-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .meta-pill {
    font-size: 0.8rem;
    padding: 3px 10px;
    border-radius: 6px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    font-weight: 600;
  }
  .meta-pill--muted {
    color: var(--color-text-secondary);
    font-family: monospace;
  }
  .desk-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
  }
  .desk-action-btn {
    padding: var(--space-3) var(--space-5);
    font-weight: 800;
    font-size: 1rem;
  }

  .desk-card__idle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .desk-idle-text {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.95rem;
  }

  /* Section Header */
  .queue-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: var(--space-5) 0 var(--space-3);
  }
  .section-heading {
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0;
  }
  .section-meta {
    font-size: 0.82rem;
    color: var(--color-text-secondary);
    font-weight: 600;
  }

  /* Slot Group Card */
  .slot-group-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-4);
    overflow: hidden;
  }
  .slot-group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: rgba(0, 0, 0, 0.02);
    border-bottom: 1px solid var(--color-border);
  }
  .slot-group-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.95rem;
  }
  .slot-clock-icon {
    font-size: 1.1rem;
  }
  .slot-count-badge {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
  }
  .slot-group-stats {
    display: flex;
    gap: var(--space-2);
  }
  .stat-pill {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .stat-pill--active {
    background: rgba(16, 185, 129, 0.15);
    color: #059669;
  }
  .stat-pill--waiting {
    background: rgba(245, 158, 11, 0.15);
    color: #d97706;
  }
  .stat-pill--done {
    background: rgba(107, 114, 128, 0.12);
    color: #4b5563;
  }

  /* Farmer items in slot */
  .slot-farmers-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .farmer-item {
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    transition: background 0.15s;
  }
  .farmer-item:last-child {
    border-bottom: none;
  }
  .farmer-item--desk {
    background: rgba(16, 185, 129, 0.06);
    border-left: 4px solid #10b981;
  }
  .farmer-item--done {
    opacity: 0.65;
    background: rgba(0, 0, 0, 0.015);
  }

  .farmer-item__top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
  }
  .farmer-item__left {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .token-pill {
    font-size: 0.72rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
  }
  .token-pill--desk {
    background: #10b981;
    color: #ffffff;
    border-color: #10b981;
  }
  .token-pill--waiting {
    background: #fef3c7;
    color: #b45309;
    border-color: #fde68a;
  }
  .token-pill--done {
    background: #f3f4f6;
    color: #6b7280;
  }
  .farmer-name {
    font-size: 1rem;
    color: var(--color-text);
  }
  .farmer-ref {
    font-size: 0.78rem;
    font-family: monospace;
    color: var(--color-text-secondary);
  }

  .farmer-item__details {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .detail-col {
    display: flex;
    flex-direction: column;
  }
  .detail-label {
    font-size: 0.72rem;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .detail-val {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .farmer-item__actions {
    display: flex;
    gap: var(--space-2);
    justify-content: flex-end;
  }
  .btn--sm {
    padding: 4px 12px;
    font-size: 0.82rem;
    min-height: 32px;
  }
</style>
