<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n.svelte';

  const items = [
    { href: '/dashboard', key: 'nav.home', icon: '🏠' },
    { href: '/book', key: 'nav.book', icon: '➕' },
    { href: '/queue', key: 'nav.queue', icon: '👥' },
    { href: '/status', key: 'nav.status', icon: '📦' },
    { href: '/payment', key: 'nav.payment', icon: '💳' }
  ];
</script>

<nav class="bottom-nav" aria-label="Farmer navigation">
  {#each items as item (item.href)}
    <a
      class="bottom-nav__item"
      href={item.href}
      aria-current={$page.url.pathname === item.href ? 'page' : undefined}
    >
      <span class="bottom-nav__icon" aria-hidden="true">{item.icon}</span>
      <span>{t(item.key)}</span>
    </a>
  {/each}
</nav>
