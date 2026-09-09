<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { session, logout } from '$lib/session.svelte';
  import { t } from '$lib/i18n.svelte';
  import FarmerNav from '$lib/components/FarmerNav.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';

  let { children } = $props();
  let allowed = $state(false);

  onMount(async () => {
    if (session.status !== 'authenticated' || !session.me) {
      await goto('/login');
      return;
    }
    if (session.me.role === 'OPERATOR') {
      await goto('/operator/dashboard');
      return;
    }
    if (!session.me.profile_complete) {
      await goto('/register');
      return;
    }
    allowed = true;
  });

  async function onLogout() {
    await logout();
    await goto('/login');
  }
</script>

{#if allowed}
  <div class="app-shell">
    <div class="public-bar">
      <span class="brand">
        <img class="brand__mark" src="/favicon.svg" alt="" aria-hidden="true" />
        {t('app.name')}
      </span>
      <div class="row">
        <LanguageToggle />
        <button class="btn btn--ghost" style="min-height: 40px;" onclick={onLogout}>
          {t('common.logout')}
        </button>
      </div>
    </div>

    <main class="app-main has-bottom-nav">
      <div class="container">
        {@render children()}
      </div>
    </main>

    <FarmerNav />
  </div>
{/if}
