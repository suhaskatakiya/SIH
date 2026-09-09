<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n.svelte';
  import { session } from '$lib/session.svelte';
  import { API_MODE } from '$lib/services';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';

  onMount(() => {
    if (session.status === 'authenticated' && session.me) {
      if (session.me.role === 'OPERATOR') goto('/operator/dashboard');
      else if (!session.me.profile_complete) goto('/register');
      else goto('/dashboard');
    }
  });
</script>

<div class="app-shell">
  <div class="public-bar">
    <span class="brand">
      <img class="brand__mark" src="/favicon.svg" alt="" aria-hidden="true" />
      {t('app.name')}
    </span>
    <LanguageToggle />
  </div>

  <main class="app-main">
    <div class="container stack" style="gap: 24px;">
      <div class="stack" style="gap: 12px;">
        <h1>{t('app.name')}</h1>
        <p class="card__title" style="font-weight: 600;">{t('app.tagline')}</p>
        <p class="muted">{t('landing.lede')}</p>
      </div>

      <div class="stack">
        <a class="btn btn--primary btn--block" href="/login">{t('landing.cta')}</a>
        <a class="btn btn--ghost btn--block" href="/login">{t('landing.operator')}</a>
      </div>

      {#if API_MODE === 'mock'}
        <div class="alert alert--info">
          <span aria-hidden="true">ℹ</span>
          <span class="grow">
            Demo mode — no account or SMS needed. Use the demo logins on the next screen.
          </span>
        </div>
      {/if}
    </div>
  </main>
</div>
