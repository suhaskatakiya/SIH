<script lang="ts">
  import { onMount } from 'svelte';
  import type { CentreBookingRow } from '$lib/services';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatTimeRange, formatQuantity, todayIso } from '$lib/format';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';
  import OperatorWorkPanel from '$lib/components/OperatorWorkPanel.svelte';

  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let centreName = $state('');
  let rows = $state<CentreBookingRow[]>([]);
  let selectedId = $state<string | null>(null);

  async function load(quiet = false) {
    if (!quiet) status = 'loading';
    error = '';
    try {
      const dash = await api.getOperatorDashboard();
      centreName = dash.centre.name;
      const res = await api.listCentreBookings(dash.centre.id, todayIso());
      // Show bookings that have an associated procurement
      rows = res.bookings.filter((b) => b.procurement_id != null);

      // Auto-select first in-service booking if none selected
      if (!selectedId && rows.length > 0) {
        const inService = rows.find((r) => r.booking_status === 'IN_SERVICE');
        selectedId = inService ? inService.booking_id : rows[0].booking_id;
      }
      status = 'ready';
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
      status = 'error';
    }
  }

  onMount(() => load());

  const selectedBooking = $derived(rows.find((r) => r.booking_id === selectedId) ?? null);
</script>

<PageHeader title={t('op.procurement')} subtitle={centreName || t('op.today')}>
  {#snippet actions()}
    {#if status === 'ready'}
      <button class="btn btn--ghost" style="min-height: 40px;" onclick={() => load(true)}>
        {t('common.refresh')}
      </button>
    {/if}
  {/snippet}
</PageHeader>

{#if status === 'loading'}
  <Spinner />
{:else if status === 'error'}
  <ErrorBanner message={error} />
  <button class="btn btn--secondary" onclick={() => load()}>{t('common.retry')}</button>
{:else if rows.length === 0}
  <div class="card stack">
    <Empty icon="🌾" title={t('op.selectFarmer')} />
    <p class="muted" style="text-align: center;">
      Start service for a farmer from today's queue to open a procurement record.
    </p>
    <a class="btn btn--primary btn--block" href="/operator/queue">{t('op.queue')}</a>
  </div>
{:else}
  <div class="stack" style="gap: var(--space-4);">
    <div class="card stack stack--tight">
      <span class="card__title">{t('op.bookings')} ({rows.length})</span>
      <div class="row" style="gap: var(--space-2); flex-wrap: wrap;">
        {#each rows as row (row.booking_id)}
          <button
            type="button"
            class="btn {selectedId === row.booking_id ? 'btn--primary' : 'btn--ghost'}"
            style="min-height: 40px;"
            onclick={() => (selectedId = row.booking_id)}
          >
            <span>{row.farmer_name}</span>
            <span class="meta">({row.reference})</span>
          </button>
        {/each}
      </div>
    </div>

    {#if selectedBooking && selectedBooking.procurement_id}
      <div class="card stack stack--tight">
        <div class="row row--between">
          <span class="card__title">{selectedBooking.farmer_name}</span>
          <StatusBadge value={selectedBooking.booking_status} />
        </div>
        <div class="kv"><span class="kv__k">{t('label.reference')}</span><span class="kv__v">{selectedBooking.reference}</span></div>
        <div class="kv"><span class="kv__k">{t('label.slot')}</span><span class="kv__v">{formatTimeRange(selectedBooking.slot_start, selectedBooking.slot_end)}</span></div>
        <div class="kv"><span class="kv__k">{t('label.commodity')}</span><span class="kv__v">{selectedBooking.commodity_code}</span></div>
        <div class="kv"><span class="kv__k">{t('label.quantity')}</span><span class="kv__v">{formatQuantity(selectedBooking.expected_quantity_qtl)}</span></div>
      </div>

      <OperatorWorkPanel
        bookingId={selectedBooking.booking_id}
        procurementId={selectedBooking.procurement_id}
        onChange={() => load(true)}
      />
    {/if}
  </div>
{/if}
