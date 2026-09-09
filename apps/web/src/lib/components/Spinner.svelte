<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  let { label }: { label?: string } = $props();
</script>

<span class="row" role="status">
  <span class="spinner" aria-hidden="true"></span>
  <span class="muted">{label ?? t('common.loading')}</span>
</span>
