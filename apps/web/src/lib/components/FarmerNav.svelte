<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { t } from '$lib/i18n.svelte';
  import { session, logout } from '$lib/session.svelte';
  import LanguageToggle from './LanguageToggle.svelte';

  const items = [
    { href: '/dashboard', key: 'nav.home', icon: '🏠' },
    { href: '/book', key: 'nav.book', icon: '➕' },
    { href: '/queue', key: 'nav.queue', icon: '👥' },
    { href: '/status', key: 'nav.status', icon: '📦' },
    { href: '/payment', key: 'nav.payment', icon: '💳' }
  ];

  async function onLogout() {
    await logout();
    await goto('/login');
  }

  const farmerName = $derived(session.me?.farmer?.full_name ?? '');
</script>

<header class="farmer-header">
  <div class="farmer-header__inner">
    <!-- Brand & Portal Role -->
    <div class="farmer-header__brand">
      <a class="brand" href="/dashboard">
        <img class="brand__mark" src="/favicon.svg" alt="" aria-hidden="true" />
        <span class="brand__name">{t('app.name')}</span>
      </a>
      <span class="role-pill">🌾 {t('label.farmer')}</span>
    </div>

    <!-- Top Navigation Links -->
    <nav class="farmer-header__nav" aria-label="Farmer navigation">
      {#each items as item (item.href)}
        {@const active = $page.url.pathname === item.href}
        <a
          class="farmer-nav-link"
          class:farmer-nav-link--active={active}
          href={item.href}
          aria-current={active ? 'page' : undefined}
        >
          <span class="farmer-nav-icon" aria-hidden="true">{item.icon}</span>
          <span class="farmer-nav-text">{t(item.key)}</span>
        </a>
      {/each}
    </nav>

    <!-- Controls / Profile / Logout -->
    <div class="farmer-header__controls">
      {#if farmerName}
        <div class="user-chip" title={farmerName}>
          <span class="user-chip__avatar">👤</span>
          <span class="user-chip__name">{farmerName}</span>
        </div>
      {/if}
      <LanguageToggle />
      <button type="button" class="btn btn--ghost btn--sm logout-btn" onclick={onLogout}>
        {t('common.logout')}
      </button>
    </div>
  </div>
</header>

<style>
  .farmer-header {
    position: sticky;
    top: 0;
    z-index: 30;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .farmer-header__inner {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-2) var(--space-4);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    flex-wrap: wrap;
    min-height: 60px;
  }

  .farmer-header__brand {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 700;
    color: var(--color-primary);
    text-decoration: none;
    font-size: var(--text-subheading);
  }

  .brand__mark {
    width: 28px;
    height: 28px;
  }

  .brand__name {
    letter-spacing: -0.2px;
  }

  .role-pill {
    background: var(--color-primary-soft, #ecfdf3);
    color: var(--color-primary, #166534);
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(22, 101, 52, 0.15);
    white-space: nowrap;
  }

  .farmer-header__nav {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .farmer-nav-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: var(--radius-control);
    color: var(--color-muted);
    text-decoration: none;
    font-weight: 600;
    font-size: 14px;
    transition: all 0.15s ease;
  }

  .farmer-nav-link:hover {
    color: var(--color-text);
    background: var(--color-bg);
  }

  .farmer-nav-link--active {
    color: var(--color-primary);
    background: var(--color-primary-soft, #ecfdf3);
    font-weight: 700;
  }

  .farmer-nav-icon {
    font-size: 16px;
    line-height: 1;
  }

  .farmer-header__controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .user-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-chip__avatar {
    font-size: 14px;
  }

  .user-chip__name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .logout-btn {
    min-height: 36px;
    padding: 6px 12px;
    font-size: 13px;
  }

  @media (max-width: 768px) {
    .farmer-header__inner {
      padding: var(--space-2);
    }
    .farmer-header__nav {
      order: 3;
      width: 100%;
      justify-content: space-around;
      padding-top: var(--space-1);
      border-top: 1px solid var(--color-border);
    }
    .farmer-nav-link {
      padding: 6px 8px;
      font-size: 12px;
    }
    .user-chip {
      display: none;
    }
  }
</style>
