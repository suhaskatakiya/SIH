<script lang="ts">
  import { onMount } from 'svelte';
  import type { OperatorDashboardResponse } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let data = $state<OperatorDashboardResponse | null>(null);
  let refreshing = $state(false);

  async function load(quiet = false) {
    if (quiet) refreshing = true;
    else status = 'loading';
    try {
      data = await api.getOperatorDashboard();
      status = 'ready';
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
      status = 'error';
    } finally {
      refreshing = false;
    }
  }
  onMount(() => load());

  const stats = $derived(
    data
      ? [
          { key: 'op.bookings', value: data.today.bookings },
          { key: 'op.checkedIn', value: data.today.checked_in },
          { key: 'op.waiting', value: data.today.waiting },
          { key: 'op.inService', value: data.today.in_service },
          { key: 'op.completed', value: data.today.completed }
        ]
      : []
  );
</script>

<PageHeader title={data ? data.centre.name : t('op.dashboard')} subtitle={t('op.today')}>
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
{:else if data}
  <div class="stat-grid stat-grid--3">
    {#each stats as s (s.key)}
      <div class="stat">
        <div class="stat__num">{s.value}</div>
        <div class="stat__label">{t(s.key)}</div>
      </div>
    {/each}
  </div>

  <div class="btn-group" style="margin-top: var(--space-4);">
    <a class="btn btn--primary grow" href="/operator/queue">{t('op.queue')}</a>
    <a class="btn btn--secondary grow" href="/operator/slots">{t('op.slots')}</a>
  </div>
{/if}
