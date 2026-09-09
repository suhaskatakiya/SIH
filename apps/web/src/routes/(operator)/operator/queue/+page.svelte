<script lang="ts">
  import { onMount } from 'svelte';
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
  onMount(() => load());

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
</script>

<PageHeader title={t('op.queue')}>
  {#snippet actions()}
    {#if status === 'ready' && !notLive}
      <button class="btn btn--primary" onclick={callNext} disabled={calling}>
        {calling ? t('common.loading') : t('op.callNext')}
      </button>
    {/if}
  {/snippet}
</PageHeader>

{#if error}<ErrorBanner message={error} />{/if}

<div class="card stack">
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
{:else if rows.length === 0}
  <div class="card"><Empty icon="👥" title={t('op.noBookings')} /></div>
{:else}
  {#each rows as row (row.booking_id)}
    <div class="card stack stack--tight">
      <div class="row row--between">
        <span class="card__title">{row.farmer_name}</span>
        <StatusBadge value={row.booking_status} />
      </div>
      <div class="kv"><span class="kv__k">{t('label.reference')}</span><span class="kv__v">{row.reference}</span></div>
      <div class="kv"><span class="kv__k">{t('label.slot')}</span><span class="kv__v">{formatTimeRange(row.slot_start, row.slot_end)}</span></div>
      <div class="kv"><span class="kv__k">{t('label.commodity')}</span><span class="kv__v">{row.commodity_code}</span></div>
      <div class="kv"><span class="kv__k">{t('label.quantity')}</span><span class="kv__v">{formatQuantity(row.expected_quantity_qtl)}</span></div>

      {#if row.queue_state}
        <div class="row" style="gap: var(--space-2);">
          <StatusBadge value={row.queue_state} />
          {#if row.position && row.queue_state === 'WAITING'}
            <span class="meta">#{row.position}</span>
          {/if}
        </div>
      {/if}

      <!-- Per-state action -->
      {#if row.booking_status === 'BOOKED'}
        <button class="btn btn--secondary btn--block" onclick={() => act(row, () => api.checkIn(row.booking_id))} disabled={busyId === row.booking_id}>
          {busyId === row.booking_id ? t('common.loading') : t('op.checkIn')}
        </button>
      {:else if row.queue_state === 'CALLED'}
        <button class="btn btn--primary btn--block" onclick={() => act(row, () => api.startService(row.booking_id))} disabled={busyId === row.booking_id}>
          {busyId === row.booking_id ? t('common.loading') : t('op.startService')}
        </button>
      {:else if row.booking_status === 'IN_SERVICE' && row.procurement_id}
        <button
          class="btn btn--secondary btn--block"
          onclick={() => (selectedId = selectedId === row.booking_id ? null : row.booking_id)}
        >
          {selectedId === row.booking_id ? t('common.back') : t('op.openProcurement')}
        </button>
        {#if selectedId === row.booking_id}
          <OperatorWorkPanel
            bookingId={row.booking_id}
            procurementId={row.procurement_id}
            onChange={() => load(true)}
          />
        {/if}
      {/if}
    </div>
  {/each}
{/if}
