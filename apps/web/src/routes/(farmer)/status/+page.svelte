<script lang="ts">
  import { onMount } from 'svelte';
  import type { FarmerDashboardResponse, Procurement } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage, eventLabel } from '$lib/i18n.svelte';
  import { formatMoney, formatQuantity, formatDateTime } from '$lib/format';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let proc = $state<Procurement | null>(null);
  let dash = $state<FarmerDashboardResponse | null>(null);
  let refreshing = $state(false);

  async function load(quiet = false) {
    if (quiet) refreshing = true;
    else status = 'loading';
    try {
      dash = await api.getFarmerDashboard();
      proc = dash.procurement ? await api.getProcurement(dash.procurement.id) : null;
      status = 'ready';
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
      status = 'error';
    } finally {
      refreshing = false;
    }
  }
  onMount(() => load());
</script>

<PageHeader title={t('status.title')}>
  {#snippet actions()}
    {#if status === 'ready'}
      <button class="btn btn--ghost" style="min-height: 40px;" onclick={() => load(true)} disabled={refreshing}>
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
{:else if proc}
  <div class="card stack">
    <div class="row row--between">
      <span class="card__title">{proc.commodity_code}</span>
      <StatusBadge value={proc.status} />
    </div>
    <div class="stack stack--tight">
      {#if proc.quality_status}
        <div class="kv"><span class="kv__k">{t('status.quality')}</span><span class="kv__v"><StatusBadge value={proc.quality_status} /></span></div>
      {/if}
      {#if proc.quantity_qtl}
        <div class="kv"><span class="kv__k">{t('status.quantity')}</span><span class="kv__v">{formatQuantity(proc.quantity_qtl)}</span></div>
      {/if}
      {#if proc.rate_per_qtl}
        <div class="kv"><span class="kv__k">{t('status.rate')}</span><span class="kv__v">{formatMoney(proc.rate_per_qtl)}</span></div>
      {/if}
      {#if proc.amount}
        <div class="kv"><span class="kv__k">{t('status.amount')}</span><span class="kv__v"><strong>{formatMoney(proc.amount)}</strong></span></div>
      {/if}
      {#if proc.receipt_reference}
        <div class="kv"><span class="kv__k">{t('status.receipt')}</span><span class="kv__v">{proc.receipt_reference}</span></div>
      {/if}
    </div>
  </div>

  {#if proc.events.length > 0}
    <div class="card stack">
      <span class="card__title">{t('status.timeline')}</span>
      <ol class="timeline">
        {#each proc.events as ev (ev.type + ev.created_at)}
          <li class="timeline__item">
            <span class="timeline__dot" aria-hidden="true"></span>
            <div>
              <div class="timeline__label">{eventLabel(ev.type)}</div>
              <div class="meta">{formatDateTime(ev.created_at)}</div>
            </div>
          </li>
        {/each}
      </ol>
    </div>
  {/if}

  {#if dash?.payment}
    <a class="btn btn--secondary btn--block" href="/payment">{t('dash.viewPayment')}</a>
  {/if}
{:else if dash?.upcoming_booking}
  <div class="card">
    <Empty icon="📦" title={t('status.none')} subtitle={t('status.noneSub')} />
  </div>
{:else}
  <div class="card">
    <Empty icon="📦" title={t('status.none')} subtitle={t('dash.noBookingSub')}>
      {#snippet action()}
        <a class="btn btn--primary" href="/book">{t('dash.bookNow')}</a>
      {/snippet}
    </Empty>
  </div>
{/if}
