<script lang="ts">
  import { i18n, toggleLang } from '$lib/i18n.svelte';
</script>

<button
  type="button"
  class="btn btn--ghost"
  onclick={toggleLang}
  aria-label="Switch language"
  style="min-height: 40px; padding: 0 12px;"
>
  {i18n.lang === 'hi' ? 'English' : 'हिंदी'}
</button>
