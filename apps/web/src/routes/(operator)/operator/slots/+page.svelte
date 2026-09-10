<script lang="ts">
  import { onMount } from 'svelte';
  import type { OperatorSlot } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatDate, formatTimeRange, todayIso, addDaysIso } from '$lib/format';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

  const DATES = Array.from({ length: 5 }, (_, i) => addDaysIso(todayIso(), i));

  let date = $state(todayIso());
  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let slots = $state<OperatorSlot[]>([]);

  let newStart = $state('09:00');
  let newEnd = $state('10:00');
  let newCapacity = $state('10');
  let creating = $state(false);
  let busyId = $state<string | null>(null);

  async function load() {
    status = 'loading';
    error = '';
    try {
      const res = await api.getOperatorSlots({ date });
      slots = res.slots;
      status = 'ready';
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
      status = 'error';
    }
  }
  onMount(load);

  async function addSlot() {
    error = '';
    const cap = Number(newCapacity);
    if (!newStart || !newEnd || !(cap > 0)) return;
    creating = true;
    try {
      await api.createSlot({ date, start: newStart, end: newEnd, capacity: cap });
      await load();
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      creating = false;
    }
  }

  async function toggleActive(slot: OperatorSlot) {
    error = '';
    busyId = slot.id;
    try {
      await api.patchSlot(slot.id, { active: !slot.active });
      await load();
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      busyId = null;
    }
  }
</script>

<PageHeader title={t('op.slots')} />

{#if error}<ErrorBanner message={error} />{/if}

<div class="card stack">
  <div class="field">
    <label class="field__label" for="date">{t('book.date')}</label>
    <select id="date" class="select" bind:value={date} onchange={load}>
      {#each DATES as d (d)}<option value={d}>{formatDate(d)}</option>{/each}
    </select>
  </div>
</div>

<div class="card stack">
  <span class="card__title">{t('op.addSlot')} (1-Hour Schedule)</span>

  <!-- Quick 1-Hour Presets (9 AM to 6 PM) -->
  <div class="field">
    <label class="field__label">Quick 1-Hour Presets (9 AM – 6 PM)</label>
    <div class="row" style="flex-wrap: wrap; gap: var(--space-2);">
      {#each [
        ['09:00', '10:00', '9–10 AM'],
        ['10:00', '11:00', '10–11 AM'],
        ['11:00', '12:00', '11–12 PM'],
        ['12:00', '13:00', '12–1 PM'],
        ['13:00', '14:00', '1–2 PM'],
        ['14:00', '15:00', '2–3 PM'],
        ['15:00', '16:00', '3–4 PM'],
        ['16:00', '17:00', '4–5 PM'],
        ['17:00', '18:00', '5–6 PM']
      ] as [st, et, lbl]}
        <button
          type="button"
          class="btn {newStart === st && newEnd === et ? 'btn--primary' : 'btn--ghost'}"
          style="padding: 4px 10px; font-size: 0.8rem; min-height: 32px;"
          onclick={() => { newStart = st; newEnd = et; }}
        >
          {lbl}
        </button>
      {/each}
    </div>
  </div>

  <div class="row" style="flex-wrap: wrap; gap: var(--space-3);">
    <div class="field grow">
      <label class="field__label" for="start">{t('op.startTime')}</label>
      <input id="start" class="input" type="time" bind:value={newStart} />
    </div>
    <div class="field grow">
      <label class="field__label" for="end">{t('op.endTime')}</label>
      <input id="end" class="input" type="time" bind:value={newEnd} />
    </div>
    <div class="field grow">
      <label class="field__label" for="cap">{t('op.capacity')}</label>
      <input id="cap" class="input" type="number" min="1" inputmode="numeric" bind:value={newCapacity} />
    </div>
  </div>
  <button class="btn btn--primary btn--block" onclick={addSlot} disabled={creating}>
    {creating ? t('common.loading') : t('op.addSlot')}
  </button>
</div>

{#if status === 'loading'}
  <Spinner />
{:else if status === 'error'}
  <button class="btn btn--secondary" onclick={load}>{t('common.retry')}</button>
{:else if slots.length === 0}
  <div class="card"><Empty icon="🗓️" title={t('book.noSlots')} /></div>
{:else}
  {#each slots as s (s.id)}
    <div class="card stack stack--tight">
      <div class="row row--between">
        <span class="card__title">{formatTimeRange(s.start, s.end)}</span>
        <span class="badge badge--{s.active ? 'success' : 'neutral'}">
          {s.active ? t('op.active') : t('op.inactive')}
        </span>
      </div>
      <div class="kv"><span class="kv__k">{t('op.booked')}</span><span class="kv__v">{s.booked_count} / {s.capacity}</span></div>
      <button
        class="btn {s.active ? 'btn--ghost' : 'btn--secondary'} btn--block"
        onclick={() => toggleActive(s)}
        disabled={busyId === s.id}
      >
        {busyId === s.id ? t('common.loading') : s.active ? t('op.disable') : t('op.enable')}
      </button>
    </div>
  {/each}
{/if}
