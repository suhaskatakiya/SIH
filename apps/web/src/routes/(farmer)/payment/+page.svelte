<script lang="ts">
  import { onMount } from 'svelte';
  import type { FarmerDashboardResponse, Payment } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatMoney, formatDateTime } from '$lib/format';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let payment = $state<Payment | null>(null);
  let dash = $state<FarmerDashboardResponse | null>(null);
  let refreshing = $state(false);

  async function load(quiet = false) {
    if (quiet) refreshing = true;
    else status = 'loading';
    try {
      dash = await api.getFarmerDashboard();
      payment = dash.payment ? await api.getPayment(dash.payment.procurement_id) : null;
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

<PageHeader title={t('payment.title')}>
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
{:else if payment}
  <div class="card stack">
    <div class="center-screen" style="min-height: auto; padding: var(--space-3) 0 var(--space-2);">
      <div class="big-number">{formatMoney(payment.amount)}</div>
      <div style="margin-top: var(--space-3);"><StatusBadge value={payment.status} /></div>
    </div>
    <div class="stack stack--tight">
      {#if payment.reference}
        <div class="kv"><span class="kv__k">{t('payment.reference')}</span><span class="kv__v">{payment.reference}</span></div>
      {/if}
      <div class="kv"><span class="kv__k">{t('queue.updated')}</span><span class="kv__v">{formatDateTime(payment.updated_at)}</span></div>
    </div>
  </div>

  <a class="btn btn--secondary btn--block" href="/status">{t('dash.viewStatus')}</a>
{:else if dash?.upcoming_booking}
  <div class="card">
    <Empty icon="💳" title={t('payment.none')} subtitle={t('payment.noneSub')} />
  </div>
{:else}
  <div class="card">
    <Empty icon="💳" title={t('payment.none')} subtitle={t('dash.noBookingSub')}>
      {#snippet action()}
        <a class="btn btn--primary" href="/book">{t('dash.bookNow')}</a>
      {/snippet}
    </Empty>
  </div>
{/if}
