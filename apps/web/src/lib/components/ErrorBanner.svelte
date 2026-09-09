<script lang="ts">
  /** Inline error banner. Pass a human message (already localized by the caller). */
  let { message, variant = 'danger' }: { message: string; variant?: 'danger' | 'warning' | 'info' } =
    $props();
  const icon = $derived(variant === 'danger' ? '⚠' : variant === 'warning' ? '⚠' : 'ℹ');
</script>

<div class="alert alert--{variant}" role="alert">
  <span aria-hidden="true">{icon}</span>
  <span class="grow break-anywhere">{message}</span>
</div>
