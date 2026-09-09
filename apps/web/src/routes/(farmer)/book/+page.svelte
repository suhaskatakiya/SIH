<script lang="ts">
  import type { Booking, CentreListItem, SlotListItem } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, i18n, errorMessage } from '$lib/i18n.svelte';
  import { formatDate, formatTimeRange, formatMoney, todayIso, addDaysIso } from '$lib/format';
  import { getCommodityGroups, getCommodityRate, formatCommodity } from '$lib/commodities';
  import CalendarPicker from '$lib/components/CalendarPicker.svelte';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

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

  const commodityGroups = $derived(getCommodityGroups(i18n.lang));
  const activeRate = $derived(getCommodityRate(commodity));

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
  const estimatedTotal = $derived(
    quantityValid && activeRate ? (Number(quantity) * Number(activeRate)).toFixed(2) : null
  );
</script>

<PageHeader title={t('book.title')} />

{#if booked}
  <div class="card stack">
    <div class="row"><span class="empty__icon" aria-hidden="true">✅</span><h2>{t('book.success')}</h2></div>
    <div class="stack stack--tight">
      <div class="kv"><span class="kv__k">{t('label.reference')}</span><span class="kv__v mono-ref">{booked.reference}</span></div>
      <div class="kv"><span class="kv__k">{t('label.commodity')}</span><span class="kv__v">{formatCommodity(booked.commodity_code, i18n.lang)}</span></div>
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
      <div class="row row--between">
        <label class="field__label" for="commodity">{t('book.commodity')}</label>
        {#if activeRate}
          <span class="msp-tag">MSP: ₹{activeRate} / qtl</span>
        {/if}
      </div>
      <select id="commodity" class="select" bind:value={commodity} onchange={resetDownstream}>
        {#each commodityGroups as group}
          <optgroup label={group.name}>
            {#each group.items as item (item.code)}
              <option value={item.code}>
                {item.icon} {i18n.lang === 'hi' ? `${item.nameHi} (${item.nameEn})` : `${item.nameEn} (${item.nameHi})`} · ₹{item.ratePerQtl}
              </option>
            {/each}
          </optgroup>
        {/each}
      </select>
    </div>

    <div class="field">
      <span class="field__label">{t('book.date')}</span>
      <CalendarPicker bind:value={date} onchange={resetDownstream} />
    </div>

    <button class="btn btn--primary btn--block" onclick={findCentres} disabled={centresLoading}>
      {centresLoading ? t('common.loading') : t('book.findCentres')}
    </button>
  </div>

  {#if centresLoading}
    <Spinner />
  {:else if centres}
    <div class="section-head">
      <h2>{t('book.centres')}</h2>
      <span class="meta">{centres.length} {centres.length === 1 ? 'centre available' : 'centres available'}</span>
    </div>

    {#if centres.length === 0}
      <div class="card"><p class="muted">{t('book.noCentres')}</p></div>
    {:else}
      {#each centres as c (c.id)}
        <button
          class="card stack stack--tight centre-card"
          class:centre-card--selected={selectedCentreId === c.id}
          onclick={() => selectCentre(c.id)}
        >
          <div class="row row--between">
            <span class="card__title">{c.name}</span>
            <StatusBadge value={c.availability} />
          </div>
          <span class="meta">📍 {c.district}, {c.state_code}</span>
        </button>
      {/each}
    {/if}
  {/if}

  {#if selectedCentreId}
    {#if slotsLoading}
      <Spinner />
    {:else if slots}
      <div class="section-head">
        <h2>{t('book.chooseSlot')}</h2>
        <span class="meta">{slots.length} time windows</span>
      </div>

      {#if slots.length === 0}
        <div class="card"><p class="muted">{t('book.noSlots')}</p></div>
      {:else}
        <div class="card">
          <div class="slot-picker">
            {#each slots as s (s.id)}
              <button
                class="slot-btn btn {selectedSlotId === s.id ? 'btn--primary' : 'btn--ghost'}"
                disabled={s.remaining === 0}
                onclick={() => (selectedSlotId = s.id)}
              >
                <span class="slot-btn__time">{formatTimeRange(s.start, s.end)}</span>
                <span class="slot-btn__rem">{s.remaining === 0 ? t('book.full') : `${s.remaining} ${t('book.remaining')}`}</span>
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
        <input id="qty" class="input" type="text" inputmode="decimal" bind:value={quantity} placeholder="e.g. 50" />
      </div>

      {#if estimatedTotal}
        <div class="estimate-banner">
          <span class="estimate-label">💰 Estimated MSP Payout:</span>
          <span class="estimate-value">{formatMoney(estimatedTotal)}</span>
          <span class="estimate-sub">({quantity} qtl × ₹{activeRate}/qtl)</span>
        </div>
      {/if}

      <button class="btn btn--primary btn--block" onclick={confirm} disabled={submitting || !quantityValid}>
        {submitting ? t('common.loading') : t('book.confirm')}
      </button>
    </div>
  {/if}
{/if}

<style>
  .msp-tag {
    font-size: 12px;
    font-weight: 700;
    color: var(--color-primary);
    background: #ecfdf3;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid #bbf7d0;
  }

  .mono-ref {
    font-family: monospace;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-top: var(--space-4);
    margin-bottom: var(--space-2);
  }

  .section-head h2 {
    font-size: var(--text-subheading);
    margin: 0;
  }

  .centre-card {
    text-align: left;
    width: 100%;
    cursor: pointer;
    border: 1px solid var(--color-border);
    transition: all 0.15s ease;
  }

  .centre-card:hover {
    border-color: var(--color-primary);
    transform: translateY(-1px);
  }

  .centre-card--selected {
    border-color: var(--color-primary) !important;
    border-left: 4px solid var(--color-primary) !important;
    background: #fcfdfc;
  }

  .slot-picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: var(--space-2);
  }

  .slot-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 10px 12px;
    height: auto;
    min-height: 52px;
  }

  .slot-btn__time {
    font-weight: 700;
    font-size: 14px;
  }

  .slot-btn__rem {
    font-size: 12px;
    opacity: 0.85;
  }

  .estimate-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: var(--radius-control);
    flex-wrap: wrap;
  }

  .estimate-label {
    font-size: 13px;
    font-weight: 600;
    color: #166534;
  }

  .estimate-value {
    font-size: 16px;
    font-weight: 750;
    color: #15803d;
  }

  .estimate-sub {
    font-size: 12px;
    color: var(--color-muted);
  }
</style>
