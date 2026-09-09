<script lang="ts">
  /**
   * Status is always conveyed as color + icon + text (§5.3) — never color alone.
   * One map covers every status enum (booking / queue / procurement / quality /
   * payment / availability); overlapping values share intent.
   */
  import { statusLabel } from '$lib/i18n.svelte';

  let { value }: { value: string | null | undefined } = $props();

  type Meta = { variant: 'neutral' | 'info' | 'success' | 'warning' | 'danger'; icon: string };

  const META: Record<string, Meta> = {
    // booking
    BOOKED: { variant: 'info', icon: '🗓' },
    CHECKED_IN: { variant: 'info', icon: '✔' },
    IN_QUEUE: { variant: 'warning', icon: '⏳' },
    IN_SERVICE: { variant: 'info', icon: '🔧' },
    COMPLETED: { variant: 'success', icon: '✅' },
    CANCELLED: { variant: 'neutral', icon: '✖' },
    // queue
    WAITING: { variant: 'warning', icon: '⏳' },
    CALLED: { variant: 'info', icon: '🔔' },
    // procurement
    NOT_STARTED: { variant: 'neutral', icon: '○' },
    QUALITY_IN_PROGRESS: { variant: 'warning', icon: '🔬' },
    QUALITY_ACCEPTED: { variant: 'success', icon: '✔' },
    QUALITY_REJECTED: { variant: 'danger', icon: '✖' },
    WEIGHMENT_RECORDED: { variant: 'info', icon: '⚖' },
    PROCUREMENT_ACCEPTED: { variant: 'success', icon: '✅' },
    RECEIPT_GENERATED: { variant: 'success', icon: '🧾' },
    // quality
    PENDING: { variant: 'warning', icon: '⏳' },
    ACCEPTED: { variant: 'success', icon: '✔' },
    REJECTED: { variant: 'danger', icon: '✖' },
    // payment
    INITIATED: { variant: 'info', icon: '➤' },
    PROCESSING: { variant: 'warning', icon: '⏳' },
    CREDITED: { variant: 'success', icon: '✅' },
    FAILED: { variant: 'danger', icon: '✖' },
    // availability
    AVAILABLE: { variant: 'success', icon: '✔' },
    FULL: { variant: 'neutral', icon: '●' }
  };

  const meta = $derived<Meta>(
    (value && META[value]) || { variant: 'neutral', icon: '•' }
  );
</script>

<span class="badge badge--{meta.variant}">
  <span class="badge__icon" aria-hidden="true">{meta.icon}</span>
  {statusLabel(value)}
</span>
