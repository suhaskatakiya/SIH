<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n.svelte';
  import { logout } from '$lib/session.svelte';
  import { goto } from '$app/navigation';
  import LanguageToggle from './LanguageToggle.svelte';

  const items = [
    { href: '/operator/dashboard', key: 'op.dashboard' },
    { href: '/operator/slots', key: 'op.slots' },
    { href: '/operator/queue', key: 'op.queue' }
  ];

  async function onLogout() {
    await logout();
    await goto('/login');
  }
</script>

<header class="top-nav">
  <div class="top-nav__inner">
    <a class="top-nav__brand" href="/operator/dashboard">{t('op.brand')}</a>
    <nav class="top-nav__links" aria-label="Operator navigation">
      {#each items as item (item.href)}
        <a
          class="top-nav__link"
          href={item.href}
          aria-current={$page.url.pathname === item.href ? 'page' : undefined}
        >
          {t(item.key)}
        </a>
      {/each}
    </nav>
    <LanguageToggle />
    <button type="button" class="btn btn--ghost" style="min-height: 40px;" onclick={onLogout}>
      {t('common.logout')}
    </button>
  </div>
</header>
