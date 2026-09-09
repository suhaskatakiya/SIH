<script lang="ts">
  import type { Procurement, Payment } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage, eventLabel } from '$lib/i18n.svelte';
  import { formatMoney, formatQuantity, formatDateTime } from '$lib/format';
  import StatusBadge from './StatusBadge.svelte';
  import Spinner from './Spinner.svelte';
  import ErrorBanner from './ErrorBanner.svelte';

  let {
    bookingId,
    procurementId,
    onChange
  }: { bookingId: string; procurementId: string; onChange: () => void } = $props();

  let loading = $state(true);
  let error = $state('');
  let busy = $state(false);
  let proc = $state<Procurement | null>(null);
  let payment = $state<Payment | null>(null);

  let weighment = $state('');
  let reason = $state('');

  async function load() {
    loading = true;
    error = '';
    try {
      proc = await api.getProcurement(procurementId);
      try {
        payment = await api.getPayment(procurementId);
      } catch {
        payment = null;
      }
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      loading = false;
    }
  }
  $effect(() => {
    // Reload whenever the selected procurement changes.
    procurementId;
    load();
  });

  async function event(type: string, extra: { quantity_qtl?: string | null; reason_code?: string | null } = {}) {
    error = '';
    busy = true;
    try {
      await api.appendProcurementEvent(procurementId, {
        type: type as never,
        quantity_qtl: extra.quantity_qtl ?? null,
        reason_code: extra.reason_code ?? null
      });
      await load();
      onChange();
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      busy = false;
    }
  }

  async function setPayment(status: string) {
    error = '';
    busy = true;
    try {
      await api.setPaymentStatus(procurementId, { status: status as never, reference: null });
      await load();
      onChange();
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      busy = false;
    }
  }

  async function complete() {
    error = '';
    busy = true;
    try {
      await api.completeService(bookingId);
      onChange();
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      busy = false;
    }
  }

  const weighmentValid = $derived(/^\d+(\.\d+)?$/.test(weighment.trim()) && Number(weighment) > 0);
  const procDone = $derived(proc?.status === 'RECEIPT_GENERATED' || proc?.status === 'QUALITY_REJECTED');
</script>

<div class="work-panel stack">
  {#if loading}
    <Spinner />
  {:else if !proc}
    <ErrorBanner message={error || 'Something went wrong.'} />
  {:else}
    {#if error}<ErrorBanner message={error} />{/if}

    <!-- Procurement summary -->
    <div class="stack stack--tight">
      <div class="row row--between">
        <span class="card__title">{t('op.procurement')}</span>
        <StatusBadge value={proc.status} />
      </div>
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

    <!-- Procurement state-machine actions -->
    {#if proc.status === 'NOT_STARTED'}
      <button class="btn btn--primary btn--block" onclick={() => event('QUALITY_STARTED')} disabled={busy}>
        {t('op.recordQuality')}
      </button>
    {:else if proc.status === 'QUALITY_IN_PROGRESS'}
      <button class="btn btn--primary btn--block" onclick={() => event('QUALITY_ACCEPTED')} disabled={busy}>
        {t('op.acceptQuality')}
      </button>
      <div class="field">
        <label class="field__label" for="reason-{bookingId}">{t('op.reason')}</label>
        <input id="reason-{bookingId}" class="input" bind:value={reason} placeholder="MOISTURE_HIGH" />
      </div>
      <button
        class="btn btn--danger btn--block"
        onclick={() => event('QUALITY_REJECTED', { reason_code: reason.trim() })}
        disabled={busy || !reason.trim()}
      >
        {t('op.rejectQuality')}
      </button>
    {:else if proc.status === 'QUALITY_ACCEPTED'}
      <div class="field">
        <label class="field__label" for="weigh-{bookingId}">{t('op.recordWeight')} (qtl)</label>
        <input id="weigh-{bookingId}" class="input" type="text" inputmode="decimal" bind:value={weighment} placeholder="18.40" />
      </div>
      <button
        class="btn btn--primary btn--block"
        onclick={() => event('WEIGHMENT_RECORDED', { quantity_qtl: weighment.trim() })}
        disabled={busy || !weighmentValid}
      >
        {t('op.recordWeight')}
      </button>
    {:else if proc.status === 'WEIGHMENT_RECORDED'}
      <button class="btn btn--primary btn--block" onclick={() => event('PROCUREMENT_ACCEPTED')} disabled={busy}>
        {t('op.acceptProcurement')}
      </button>
    {:else if proc.status === 'PROCUREMENT_ACCEPTED'}
      <button class="btn btn--primary btn--block" onclick={() => event('RECEIPT_GENERATED')} disabled={busy}>
        {t('op.generateReceipt')}
      </button>
    {/if}

    <!-- Timeline -->
    {#if proc.events.length > 0}
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
    {/if}

    <!-- Payment -->
    {#if payment}
      <div class="stack stack--tight" style="border-top: 1px solid var(--color-border); padding-top: var(--space-3);">
        <div class="row row--between">
          <span class="card__title">{t('payment.title')}</span>
          <StatusBadge value={payment.status} />
        </div>
        {#if payment.amount}
          <div class="kv"><span class="kv__k">{t('payment.amount')}</span><span class="kv__v">{formatMoney(payment.amount)}</span></div>
        {/if}

        {#if payment.status === 'NOT_STARTED'}
          <button class="btn btn--secondary btn--block" onclick={() => setPayment('INITIATED')} disabled={busy}>
            {t('op.markInitiated')}
          </button>
        {:else if payment.status === 'INITIATED'}
          <div class="btn-group">
            <button class="btn btn--secondary grow" onclick={() => setPayment('PROCESSING')} disabled={busy}>{t('op.markProcessing')}</button>
            <button class="btn btn--ghost grow" onclick={() => setPayment('FAILED')} disabled={busy}>{t('op.markFailed')}</button>
          </div>
        {:else if payment.status === 'PROCESSING'}
          <div class="btn-group">
            <button class="btn btn--primary grow" onclick={() => setPayment('CREDITED')} disabled={busy}>{t('op.markCredited')}</button>
            <button class="btn btn--ghost grow" onclick={() => setPayment('FAILED')} disabled={busy}>{t('op.markFailed')}</button>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Complete service -->
    {#if procDone}
      <button class="btn btn--primary btn--block" onclick={complete} disabled={busy}>
        {t('op.completeService')}
      </button>
    {/if}
  {/if}
</div>
