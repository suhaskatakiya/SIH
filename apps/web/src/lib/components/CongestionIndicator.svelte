<!-- Author: suhas katakiya | Enrollment: 24BIT214D -->
<script lang="ts">
  import { formatWait } from '$lib/format';

  interface Props {
    waitMinutes: number;
    farmersAhead?: number;
    showAdvice?: boolean;
    compact?: boolean;
  }

  let {
    waitMinutes = 0,
    farmersAhead = 0,
    showAdvice = true,
    compact = false
  }: Props = $props();

  type CongestionLevel = 'LOW' | 'MEDIUM' | 'HIGH';

  const level = $derived<CongestionLevel>(
    waitMinutes < 20 ? 'LOW' : waitMinutes <= 45 ? 'MEDIUM' : 'HIGH'
  );

  const meta = $derived.by(() => {
    switch (level) {
      case 'LOW':
        return {
          title: 'Low Congestion',
          sub: 'Smooth Queue Flow',
          badgeClass: 'badge--success',
          dotColor: '#16a34a',
          meterWidth: Math.min(Math.max((waitMinutes / 60) * 100, 20), 35),
          advice: 'Optimal arrival window. The centre has minimal waiting time right now.'
        };
      case 'MEDIUM':
        return {
          title: 'Moderate Congestion',
          sub: 'Steady Processing',
          badgeClass: 'badge--warning',
          dotColor: '#d97706',
          meterWidth: Math.min(Math.max((waitMinutes / 60) * 100, 45), 70),
          advice: 'Moderate queue moving steadily. Expect standard verification turnaround.'
        };
      case 'HIGH':
      default:
        return {
          title: 'High Congestion',
          sub: 'Heavy Crowding Alert',
          badgeClass: 'badge--danger',
          dotColor: '#dc2626',
          meterWidth: Math.min(Math.max((waitMinutes / 60) * 100, 80), 100),
          advice: 'Centre is currently crowded. We strongly recommend delaying arrival by 30–45 mins to avoid long physical waiting.'
        };
    }
  });
</script>

{#if compact}
  <div class="congestion-compact {meta.badgeClass}">
    <span class="congestion-dot" style="background-color: {meta.dotColor};"></span>
    <span class="congestion-compact__text">
      <strong>{meta.title}</strong> · {formatWait(waitMinutes)}
    </span>
  </div>
{:else}
  <div class="congestion-widget card--elevated {level.toLowerCase()}">
    <div class="congestion-widget__top">
      <div class="congestion-status">
        <span class="congestion-pulse" style="--pulse-color: {meta.dotColor}"></span>
        <div>
          <span class="congestion-title">{meta.title}</span>
          <span class="congestion-sub">{meta.sub}</span>
        </div>
      </div>
      <div class="congestion-badge {meta.badgeClass}">
        {level} CROWDING
      </div>
    </div>

    <!-- Crowding Meter Bar -->
    <div class="congestion-meter" role="progressbar" aria-valuenow={waitMinutes} aria-valuemin={0} aria-valuemax={120}>
      <div class="congestion-meter__track">
        <div
          class="congestion-meter__fill {level.toLowerCase()}"
          style="width: {meta.meterWidth}%"
        ></div>
      </div>
      <div class="congestion-meter__labels">
        <span class:active={level === 'LOW'}>🟢 Low (&lt;20m)</span>
        <span class:active={level === 'MEDIUM'}>🟡 Moderate (20-45m)</span>
        <span class:active={level === 'HIGH'}>🔴 Heavy (&gt;45m)</span>
      </div>
    </div>

    <!-- Prominent Wait & Ahead Stats -->
    <div class="congestion-stats">
      <div class="c-stat">
        <span class="c-stat__label">⏱️ Estimated Wait Time</span>
        <span class="c-stat__val">{formatWait(waitMinutes)}</span>
      </div>
      <div class="c-stat">
        <span class="c-stat__label">👥 Farmers Ahead</span>
        <span class="c-stat__val">{farmersAhead} {farmersAhead === 1 ? 'farmer' : 'farmers'}</span>
      </div>
    </div>

    {#if showAdvice}
      <div class="congestion-advice {level.toLowerCase()}">
        <span class="advice-icon">{level === 'HIGH' ? '⚠️' : level === 'MEDIUM' ? 'ℹ️' : '✨'}</span>
        <p class="advice-text">{meta.advice}</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .congestion-widget {
    background: #ffffff;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.04);
  }

  .congestion-widget.high {
    border-color: rgba(220, 38, 38, 0.35);
    background: linear-gradient(180deg, #fffefe 0%, #fff7f7 100%);
  }

  .congestion-widget.medium {
    border-color: rgba(217, 119, 6, 0.35);
    background: linear-gradient(180deg, #ffffff 0%, #fffdfa 100%);
  }

  .congestion-widget.low {
    border-color: rgba(22, 163, 74, 0.35);
    background: linear-gradient(180deg, #ffffff 0%, #f7fdf9 100%);
  }

  .congestion-widget__top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .congestion-status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .congestion-pulse {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--pulse-color);
    box-shadow: 0 0 0 0 var(--pulse-color);
    animation: pulse-ring 1.8s infinite cubic-bezier(0.66, 0, 0, 1);
  }

  @keyframes pulse-ring {
    0% { box-shadow: 0 0 0 0 var(--pulse-color); }
    70% { box-shadow: 0 0 0 8px rgba(0, 0, 0, 0); }
    100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
  }

  .congestion-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text);
    display: block;
  }

  .congestion-sub {
    font-size: 0.78rem;
    color: var(--color-text-muted);
    display: block;
  }

  .congestion-badge {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 3px 9px;
    border-radius: 999px;
  }

  .badge--success { background: #dcfce7; color: #166534; }
  .badge--warning { background: #fef3c7; color: #92400e; }
  .badge--danger { background: #fee2e2; color: #991b1b; }

  .congestion-meter {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .congestion-meter__track {
    height: 9px;
    background: #e2e8f0;
    border-radius: 999px;
    overflow: hidden;
  }

  .congestion-meter__fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.4s ease;
  }

  .congestion-meter__fill.low { background: linear-gradient(90deg, #86efac, #22c55e); }
  .congestion-meter__fill.medium { background: linear-gradient(90deg, #fde047, #f59e0b); }
  .congestion-meter__fill.high { background: linear-gradient(90deg, #f87171, #ef4444); }

  .congestion-meter__labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    color: var(--color-text-muted);
  }

  .congestion-meter__labels span.active {
    font-weight: 700;
    color: var(--color-text);
  }

  .congestion-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    padding: var(--space-2) 0;
  }

  .c-stat {
    background: rgba(0, 0, 0, 0.025);
    border: 1px solid var(--color-border);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    display: flex;
    flex-direction: column;
  }

  .c-stat__label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    font-weight: 500;
  }

  .c-stat__val {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--color-text);
    margin-top: 2px;
  }

  .congestion-advice {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
    line-height: 1.4;
  }

  .congestion-advice.low {
    background: #f0fdf4;
    color: #14532d;
    border: 1px solid #bbf7d0;
  }

  .congestion-advice.medium {
    background: #fffbeb;
    color: #78350f;
    border: 1px solid #fde68a;
  }

  .congestion-advice.high {
    background: #fef2f2;
    color: #7f1d1d;
    border: 1px solid #fecaca;
  }

  .advice-icon { font-size: 1.05rem; }
  .advice-text { margin: 0; }

  /* Compact variation */
  .congestion-compact {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.8rem;
  }

  .congestion-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
