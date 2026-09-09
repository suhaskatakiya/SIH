<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    icon = '📭',
    title,
    subtitle,
    action
  }: { icon?: string; title: string; subtitle?: string; action?: Snippet } = $props();
</script>

<div class="empty stack" style="align-items: center;">
  <div class="empty__icon" aria-hidden="true">{icon}</div>
  <p class="card__title">{title}</p>
  {#if subtitle}<p class="muted">{subtitle}</p>{/if}
  {#if action}{@render action()}{/if}
</div>
