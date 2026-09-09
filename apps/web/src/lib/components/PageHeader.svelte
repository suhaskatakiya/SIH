<script lang="ts">
  import type { Snippet } from 'svelte';
  let {
    title,
    subtitle,
    actions
  }: { title: string; subtitle?: string; actions?: Snippet } = $props();
</script>

<header class="page-header row row--between">
  <div>
    <h1>{title}</h1>
    {#if subtitle}<p class="page-header__sub">{subtitle}</p>{/if}
  </div>
  {#if actions}<div class="row">{@render actions()}</div>{/if}
</header>
