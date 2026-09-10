<script lang="ts">
  /**
   * Author: suhas katakiya | Enrollment: 24BIT214D
   *
   * Operator Slot Management Screen
   * - Provides 1-click standardized 1-hour slot generation (09:00 to 18:00).
   * - Clean visual capacity meters, 12h/24h time formatting, and instant active toggling.
   * - Connects seamlessly with live Supabase PostgreSQL slots table.
   */
  import { onMount } from 'svelte';
  import type { OperatorSlot } from '@cropsaathi/contracts';
  import { api, isApiClientError } from '$lib/services';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import { formatDate, formatTimeSlotLabel, todayIso, addDaysIso } from '$lib/format';
  import Spinner from '$lib/components/Spinner.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import Empty from '$lib/components/Empty.svelte';
  import PageHeader from '$lib/components/PageHeader.svelte';

  const DATES = Array.from({ length: 5 }, (_, i) => addDaysIso(todayIso(), i));

  let date = $state(todayIso());
  let status = $state<'loading' | 'error' | 'ready'>('loading');
  let error = $state('');
  let successMessage = $state('');
  let slots = $state<OperatorSlot[]>([]);

  let newStart = $state('09:00');
  let newEnd = $state('10:00');
  let newCapacity = $state('10');
  let creating = $state(false);
  let generating = $state(false);
  let busyId = $state<string | null>(null);

  async function load() {
    status = 'loading';
    error = '';
    try {
      const res = await api.getOperatorSlots({ date });
      slots = res.slots || [];
      status = 'ready';
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
      status = 'error';
    }
  }

  onMount(load);

  async function generateStandard() {
    error = '';
    successMessage = '';
    generating = true;
    try {
      const res = await api.generateStandardSlots(date, 10);
      slots = res.slots || [];
      successMessage = 'Standard 1-hour slots generated successfully (09:00 – 18:00)!';
      setTimeout(() => (successMessage = ''), 4000);
      status = 'ready';
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Failed to generate slots.';
    } finally {
      generating = false;
    }
  }

  async function addSlot() {
    error = '';
    successMessage = '';
    const cap = Number(newCapacity);
    if (!newStart || !newEnd || !(cap > 0)) return;
    creating = true;
    try {
      await api.createSlot({ date, start: newStart, end: newEnd, capacity: cap });
      successMessage = `Slot ${newStart} - ${newEnd} created!`;
      setTimeout(() => (successMessage = ''), 3000);
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

<PageHeader title={t('op.slots')}>
  {#snippet actions()}
    <button
      class="btn btn--primary btn--sm"
      onclick={generateStandard}
      disabled={generating}
      title="Reset or create all 9 one-hour slots for this date"
    >
      <span style="font-size: 1rem;">⚡</span>
      {generating ? t('common.loading') : 'Generate 1-Hour Schedule (9–6)'}
    </button>
  {/snippet}
</PageHeader>

{#if error}<ErrorBanner message={error} />{/if}
{#if successMessage}
  <div class="alert alert--success" style="margin-bottom: var(--space-3); padding: var(--space-3); border-radius: var(--radius-md); background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; font-weight: 500;">
    ✓ {successMessage}
  </div>
{/if}

<!-- Date Selection Card -->
<div class="card stack" style="margin-bottom: var(--space-4);">
  <div class="field">
    <label class="field__label" for="date">{t('book.date')}</label>
    <select id="date" class="select" bind:value={date} onchange={load}>
      {#each DATES as d (d)}
        <option value={d}>{formatDate(d)} {d === todayIso() ? '(Today)' : ''}</option>
      {/each}
    </select>
  </div>
</div>

<!-- Add Custom Slot / 1-Hour Presets Card -->
<div class="card stack" style="margin-bottom: var(--space-4);">
  <div class="row row--between">
    <span class="card__title">{t('op.addSlot')} (1-Hour Standard)</span>
    <button
      type="button"
      class="btn btn--ghost btn--sm"
      onclick={generateStandard}
      disabled={generating}
    >
      ⚡ Fill Standard 9 Slots
    </button>
  </div>

  <!-- Quick 1-Hour Preset Chips (09:00 to 18:00) -->
  <div class="field">
    <span class="field__label">Quick 1-Hour Slot Presets</span>
    <div class="preset-grid">
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
          class="preset-chip {newStart === st && newEnd === et ? 'preset-chip--active' : ''}"
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
    {creating ? t('common.loading') : `+ ${t('op.addSlot')}`}
  </button>
</div>

<!-- Slot List Header -->
<div class="row row--between" style="margin-bottom: var(--space-2); padding: 0 var(--space-1);">
  <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700;">📅 Configured Time Slots ({slots.length})</h3>
  <span style="font-size: 0.85rem; color: var(--color-muted);">Capacity per Slot: 10 Farmers</span>
</div>

{#if status === 'loading'}
  <Spinner />
{:else if status === 'error'}
  <button class="btn btn--secondary" onclick={load}>{t('common.retry')}</button>
{:else if slots.length === 0}
  <div class="card stack text-center" style="padding: var(--space-6);">
    <Empty icon="🗓️" title={t('book.noSlots')} />
    <p style="color: var(--color-muted); margin: var(--space-2) 0;">
      No slots have been configured for this date yet.
    </p>
    <button class="btn btn--primary" onclick={generateStandard} disabled={generating}>
      ⚡ Generate Standard 1-Hour Slots Now
    </button>
  </div>
{:else}
  <div class="slots-grid">
    {#each slots as s (s.id)}
      {@const percent = Math.min(100, Math.round((s.booked_count / (s.capacity || 10)) * 100))}
      {@const isFull = s.booked_count >= s.capacity}
      <div class="card slot-card" class:slot-card--inactive={!s.active}>
        <div class="row row--between" style="align-items: flex-start;">
          <div>
            <div class="slot-time-badge">
              <span class="slot-clock">⏰</span>
              <strong>{formatTimeSlotLabel(s.start, s.end)}</strong>
            </div>
            <span class="slot-sub-time">{s.start} – {s.end} (1 Hour Window)</span>
          </div>
          <span class="badge badge--{s.active ? (isFull ? 'warning' : 'success') : 'neutral'}">
            {s.active ? (isFull ? 'Slot Full' : t('op.active')) : t('op.inactive')}
          </span>
        </div>

        <!-- Capacity Utilization Bar -->
        <div class="capacity-meter">
          <div class="row row--between" style="font-size: 0.85rem; margin-bottom: 4px;">
            <span class="capacity-meter__label">{t('op.booked')}</span>
            <span class="capacity-meter__val">
              <strong>{s.booked_count}</strong> / {s.capacity} Farmers
              <span style="color: var(--color-muted); font-size: 0.8rem;">({percent}%)</span>
            </span>
          </div>
          <div class="progress-track">
            <div
              class="progress-fill"
              class:progress-fill--full={isFull}
              style="width: {percent}%;"
            ></div>
          </div>
        </div>

        <!-- Toggle Active Action -->
        <button
          class="btn {s.active ? 'btn--ghost' : 'btn--secondary'} btn--block btn--sm"
          onclick={() => toggleActive(s)}
          disabled={busyId === s.id}
        >
          {#if busyId === s.id}
            {t('common.loading')}
          {:else if s.active}
            🚫 {t('op.disable')} Slot
          {:else}
            ✓ {t('op.enable')} Slot
          {/if}
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .preset-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .preset-chip {
    padding: 6px 12px;
    font-size: 0.82rem;
    font-weight: 600;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .preset-chip:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-light, #eef2ff);
  }

  .preset-chip--active {
    background: var(--color-primary, #1e40af);
    color: white;
    border-color: var(--color-primary, #1e40af);
  }

  .slots-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-3);
  }

  .slot-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .slot-card:hover {
    box-shadow: var(--shadow-md);
  }

  .slot-card--inactive {
    opacity: 0.65;
    background: var(--color-bg, #f9fafb);
    border-style: dashed;
  }

  .slot-time-badge {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 1.05rem;
    color: var(--color-text);
  }

  .slot-clock {
    font-size: 1.1rem;
  }

  .slot-sub-time {
    display: block;
    font-size: 0.8rem;
    color: var(--color-muted);
    margin-top: 2px;
    font-family: var(--font-mono, monospace);
  }

  .capacity-meter {
    background: var(--color-bg, #f3f4f6);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
  }

  .progress-track {
    width: 100%;
    height: 8px;
    background: #e5e7eb;
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary, #2563eb);
    border-radius: var(--radius-full);
    transition: width 0.3s ease;
  }

  .progress-fill--full {
    background: var(--color-warning, #f59e0b);
  }
</style>
