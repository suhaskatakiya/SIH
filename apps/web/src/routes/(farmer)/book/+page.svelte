<script lang="ts">
  import type { Booking, CentreListItem, SlotListItem } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatDate, formatTimeRange, todayIso, addDaysIso } from '$lib/format';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

  const COMMODITIES = [
    ['PADDY_COMMON', 'Paddy (Common)'],
    ['PADDY_GRADE_A', 'Paddy (Grade A)'],
    ['WHEAT', 'Wheat']
  ];
  const DATES = Array.from({ length: 5 }, (_, i) => addDaysIso(todayIso(), i));

  let commodity = $state('PADDY_COMMON');
  let date = $state(todayIso());

  let centres = $state<CentreListItem[] | null>(null);
  let centresLoading = $state(false);
  let selectedCentreId = $state<string | null>(null);

  let slots = $state<SlotListItem[] | null>(null);
  let slotsLoading = $state(false);
  let selectedSlotId = $state<string | null>(null);

  let quantity = $state('');
  let submitting = $state(false);
  let error = $state('');
  let booked = $state<Booking | null>(null);

  function resetDownstream() {
    centres = null;
    selectedCentreId = null;
    slots = null;
    selectedSlotId = null;
  }

  async function findCentres() {
    error = '';
    slots = null;
    selectedCentreId = null;
    selectedSlotId = null;
    centresLoading = true;
    try {
      const res = await api.getCentres({ commodity_code: commodity, date });
      centres = res.centres;
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      centresLoading = false;
    }
  }

  async function selectCentre(id: string) {
    error = '';
    selectedCentreId = id;
    selectedSlotId = null;
    slots = null;
    slotsLoading = true;
    try {
      const res = await api.getSlots(id, { date });
      slots = res.slots;
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      slotsLoading = false;
    }
  }

  async function confirm() {
    if (!selectedSlotId) return;
    error = '';
    submitting = true;
    try {
      booked = await api.createBooking({
        slot_id: selectedSlotId,
        commodity_code: commodity,
        expected_quantity_qtl: quantity.trim()
      });
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      submitting = false;
    }
  }

  const quantityValid = $derived(/^\d+(\.\d+)?$/.test(quantity.trim()) && Number(quantity) > 0);
</script>

<PageHeader title={t('book.title')} />

{#if booked}
  <div class="card stack">
    <div class="row"><span class="empty__icon" aria-hidden="true">✅</span><h2>{t('book.success')}</h2></div>
    <div class="stack stack--tight">
      <div class="kv"><span class="kv__k">{t('label.reference')}</span><span class="kv__v">{booked.reference}</span></div>
      <div class="kv"><span class="kv__k">{t('label.centre')}</span><span class="kv__v">{booked.centre_name}</span></div>
      <div class="kv"><span class="kv__k">{t('label.date')}</span><span class="kv__v">{formatDate(booked.slot_date)}</span></div>
      <div class="kv"><span class="kv__k">{t('label.slot')}</span><span class="kv__v">{formatTimeRange(booked.slot_start, booked.slot_end)}</span></div>
      <div class="kv"><span class="kv__k">{t('label.quantity')}</span><span class="kv__v">{booked.expected_quantity_qtl} qtl</span></div>
    </div>
    <a class="btn btn--primary btn--block" href="/dashboard">{t('nav.home')}</a>
  </div>
{:else}
  {#if error}<ErrorBanner message={error} />{/if}

  <div class="card stack">
    <div class="field">
      <label class="field__label" for="commodity">{t('book.commodity')}</label>
      <select id="commodity" class="select" bind:value={commodity} onchange={resetDownstream}>
        {#each COMMODITIES as [code, name] (code)}<option value={code}>{name}</option>{/each}
      </select>
    </div>
    <div class="field">
      <label class="field__label" for="date">{t('book.date')}</label>
      <select id="date" class="select" bind:value={date} onchange={resetDownstream}>
        {#each DATES as d (d)}<option value={d}>{formatDate(d)}</option>{/each}
      </select>
    </div>
    <button class="btn btn--primary btn--block" onclick={findCentres} disabled={centresLoading}>
      {centresLoading ? t('common.loading') : t('book.findCentres')}
    </button>
  </div>

  {#if centresLoading}
    <Spinner />
  {:else if centres}
    <h2>{t('book.centres')}</h2>
    {#if centres.length === 0}
      <div class="card"><p class="muted">{t('book.noCentres')}</p></div>
    {:else}
      {#each centres as c (c.id)}
        <button
          class="card stack stack--tight"
          style="text-align: left; width: 100%; cursor: pointer; border-color: {selectedCentreId === c.id ? 'var(--color-primary)' : 'var(--color-border)'};"
          onclick={() => selectCentre(c.id)}
        >
          <div class="row row--between">
            <span class="card__title">{c.name}</span>
            <StatusBadge value={c.availability} />
          </div>
          <span class="meta">{c.district}, {c.state_code}</span>
        </button>
      {/each}
    {/if}
  {/if}

  {#if selectedCentreId}
    {#if slotsLoading}
      <Spinner />
    {:else if slots}
      <h2>{t('book.chooseSlot')}</h2>
      {#if slots.length === 0}
        <div class="card"><p class="muted">{t('book.noSlots')}</p></div>
      {:else}
        <div class="card">
          <div class="btn-group">
            {#each slots as s (s.id)}
              <button
                class="btn {selectedSlotId === s.id ? 'btn--primary' : 'btn--ghost'}"
                disabled={s.remaining === 0}
                onclick={() => (selectedSlotId = s.id)}
              >
                {formatTimeRange(s.start, s.end)}
                · {s.remaining === 0 ? t('book.full') : `${s.remaining} ${t('book.remaining')}`}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  {/if}

  {#if selectedSlotId}
    <div class="card stack">
      <div class="field">
        <label class="field__label" for="qty">{t('book.quantity')}</label>
        <input id="qty" class="input" type="text" inputmode="decimal" bind:value={quantity} placeholder="18.40" />
      </div>
      <button class="btn btn--primary btn--block" onclick={confirm} disabled={submitting || !quantityValid}>
        {submitting ? t('common.loading') : t('book.confirm')}
      </button>
    </div>
  {/if}
{/if}
