<script lang="ts">
  import { onMount } from 'svelte';
  import type { FarmerDashboardResponse } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatWait, formatDateTime, formatTimeRange, formatDate } from '$lib/format';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let data = $state<FarmerDashboardResponse | null>(null);
  let refreshing = $state(false);

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
  onMount(() => load());
</script>

<PageHeader title={t('queue.title')}>
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
{:else if data?.active_queue}
  {@const q = data.active_queue}
  <div class="card stack">
    <div class="row row--between">
      <span class="card__title">{data.upcoming_booking?.centre_name ?? t('queue.title')}</span>
      <StatusBadge value={q.state} />
    </div>

    <div class="center-screen" style="min-height: auto; padding: var(--space-4) 0;">
      <div class="big-number">{q.position}</div>
      <div class="stat__label">{t('queue.position')}</div>
    </div>

    <div class="stat-grid">
      <div class="stat">
        <div class="stat__num">{q.farmers_ahead}</div>
        <div class="stat__label">{t('queue.ahead')}</div>
      </div>
      <div class="stat">
        <div class="stat__num">{formatWait(q.estimated_wait_min)}</div>
        <div class="stat__label">{t('queue.eta')}</div>
      </div>
    </div>

    <p class="meta">{t('queue.updated')}: {formatDateTime(q.updated_at)}</p>
  </div>

  {#if data.upcoming_booking}
    {@const b = data.upcoming_booking}
    <div class="card stack stack--tight">
      <div class="kv"><span class="kv__k">{t('label.reference')}</span><span class="kv__v">{b.reference}</span></div>
      <div class="kv"><span class="kv__k">{t('label.slot')}</span><span class="kv__v">{formatDate(b.slot_date)} · {formatTimeRange(b.slot_start, b.slot_end)}</span></div>
    </div>
  {/if}
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
    <div class="alert alert--info">{t('queue.noneSub')}</div>
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
