<script lang="ts">
  import { onMount } from 'svelte';
  import type { FarmerDashboardResponse } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatDate, formatTimeRange, formatMoney, formatWait } from '$lib/format';
  import { session } from '$lib/session.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

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

  const firstName = $derived(session.me?.farmer?.full_name?.split(' ')[0] ?? '');
</script>

<PageHeader title={firstName ? `${t('dash.title')} · ${firstName}` : t('dash.title')} />

{#if status === 'loading'}
  <Spinner />
{:else if status === 'error'}
  <ErrorBanner message={error} />
  <button class="btn btn--secondary" onclick={load}>{t('common.retry')}</button>
{:else if data}
  {#if !data.upcoming_booking}
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
    {@const b = data.upcoming_booking}
    <div class="card stack">
      <div class="row row--between">
        <span class="card__title">{t('dash.upcoming')}</span>
        <StatusBadge value={b.status} />
      </div>
      <div class="stack stack--tight">
        <div class="kv"><span class="kv__k">{t('label.reference')}</span><span class="kv__v">{b.reference}</span></div>
        <div class="kv"><span class="kv__k">{t('label.centre')}</span><span class="kv__v">{b.centre_name}</span></div>
        <div class="kv"><span class="kv__k">{t('label.commodity')}</span><span class="kv__v">{b.commodity_code}</span></div>
        <div class="kv"><span class="kv__k">{t('label.quantity')}</span><span class="kv__v">{b.expected_quantity_qtl} qtl</span></div>
        <div class="kv"><span class="kv__k">{t('label.date')}</span><span class="kv__v">{formatDate(b.slot_date)}</span></div>
        <div class="kv"><span class="kv__k">{t('label.slot')}</span><span class="kv__v">{formatTimeRange(b.slot_start, b.slot_end)}</span></div>
      </div>
    </div>

    {#if data.active_queue}
      {@const q = data.active_queue}
      <div class="card stack">
        <div class="row row--between">
          <span class="card__title">{t('queue.title')}</span>
          <StatusBadge value={q.state} />
        </div>
        <div class="stat-grid">
          <div class="stat"><div class="stat__num">{q.position}</div><div class="stat__label">{t('queue.position')}</div></div>
          <div class="stat"><div class="stat__num">{formatWait(q.estimated_wait_min)}</div><div class="stat__label">{t('queue.eta')}</div></div>
        </div>
        <a class="btn btn--secondary btn--block" href="/queue">{t('dash.viewQueue')}</a>
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
  {/if}
{/if}
