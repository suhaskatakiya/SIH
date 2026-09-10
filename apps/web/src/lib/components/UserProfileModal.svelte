<!-- Author: suhas katakiya | Enrollment: 24BIT214D -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/services';
  import { session, logout, refreshMe } from '$lib/session.svelte';
  import { t } from '$lib/i18n.svelte';
  import { goto } from '$app/navigation';
  import Spinner from './Spinner.svelte';

  interface Props {
    open: boolean;
    onclose?: () => void;
  }

  let { open = $bindable(false), onclose }: Props = $props();

  let loading = $state(false);
  let error = $state('');

  async function fetchFreshProfile() {
    loading = true;
    error = '';
    try {
      await refreshMe();
    } catch (err: any) {
      error = err?.message || 'Failed to refresh profile.';
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (open) {
      fetchFreshProfile();
    }
  });

  function close() {
    open = false;
    onclose?.();
  }

  async function handleLogout() {
    close();
    await logout();
    await goto('/login');
  }

  const me = $derived(session.me);
  const farmer = $derived(me?.farmer);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div class="modal-backdrop" onclick={close} onkeydown={handleKeydown} role="presentation">
    <div
      class="profile-modal card"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-title"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="profile-modal__header">
        <div class="profile-avatar-row">
          <div class="profile-avatar">
            👤
          </div>
          <div>
            <h2 id="profile-title" class="profile-name">
              {farmer?.full_name || (me?.role === 'OPERATOR' ? 'Centre Operator' : 'Farmer Profile')}
            </h2>
            <div class="profile-pills">
              <span class="role-tag role-tag--{me?.role?.toLowerCase() || 'farmer'}">
                {me?.role === 'OPERATOR' ? '🏢 Operator' : '🌾 Farmer'}
              </span>
              {#if me?.profile_complete}
                <span class="verified-tag">✓ Verified Profile</span>
              {/if}
            </div>
          </div>
        </div>
        <button type="button" class="modal-close-btn" onclick={close} aria-label="Close profile">
          ✕
        </button>
      </div>

      <!-- Body / Details -->
      <div class="profile-modal__body">
        {#if loading && !me}
          <div class="loading-wrap">
            <Spinner />
            <span>Loading profile details...</span>
          </div>
        {:else if error}
          <div class="alert alert--danger">{error}</div>
        {:else if me}
          <div class="details-grid">
            <!-- Full Name -->
            <div class="detail-item">
              <span class="detail-label">Full Name</span>
              <span class="detail-value">{farmer?.full_name || 'N/A'}</span>
            </div>

            <!-- Masked Mobile -->
            <div class="detail-item">
              <span class="detail-label">Registered Mobile</span>
              <span class="detail-value mono">{me.mobile_masked || 'Not available'}</span>
            </div>

            <!-- State -->
            <div class="detail-item">
              <span class="detail-label">State</span>
              <span class="detail-value">{farmer?.state_code || 'GJ (Gujarat)'}</span>
            </div>

            <!-- District -->
            <div class="detail-item">
              <span class="detail-label">District</span>
              <span class="detail-value">{farmer?.district || 'Not provided'}</span>
            </div>

            <!-- Village -->
            <div class="detail-item">
              <span class="detail-label">Village / Location</span>
              <span class="detail-value">{farmer?.village || 'Not provided'}</span>
            </div>

            <!-- Farmer Reference ID -->
            {#if farmer?.external_farmer_ref}
              <div class="detail-item">
                <span class="detail-label">Farmer Reference / ID</span>
                <span class="detail-value mono">{farmer.external_farmer_ref}</span>
              </div>
            {/if}

            <!-- Preferred Language -->
            {#if farmer?.preferred_language}
              <div class="detail-item">
                <span class="detail-label">Preferred Language</span>
                <span class="detail-value text-capitalize">
                  {farmer.preferred_language === 'hi' ? 'हिंदी (Hindi)' : farmer.preferred_language === 'gu' ? 'ગુજરાતી (Gujarati)' : 'English'}
                </span>
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Footer Actions -->
      <div class="profile-modal__footer">
        <button
          type="button"
          class="btn btn--ghost btn--sm"
          onclick={fetchFreshProfile}
          disabled={loading}
        >
          🔄 {loading ? 'Refreshing...' : 'Refresh'}
        </button>
        <div class="footer-actions-right">
          <button type="button" class="btn btn--danger btn--sm" onclick={handleLogout}>
            Log Out
          </button>
          <button type="button" class="btn btn--secondary btn--sm" onclick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .profile-modal {
    width: 100%;
    max-width: 480px;
    background: #ffffff;
    border-radius: var(--radius-lg);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08);
    border: 1px solid var(--color-border);
    overflow: hidden;
    animation: slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideUp {
    from { transform: translateY(12px) scale(0.98); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
  }

  .profile-modal__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: var(--space-4) var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
  }

  .profile-avatar-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .profile-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #e0f2fe;
    color: #0284c7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    box-shadow: inset 0 0 0 1px rgba(2, 132, 199, 0.2);
  }

  .profile-name {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--color-text);
    margin: 0;
  }

  .profile-pills {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .role-tag {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
  }

  .role-tag--farmer { background: #dcfce7; color: #166534; }
  .role-tag--operator { background: #e0e7ff; color: #3730a3; }

  .verified-tag {
    font-size: 0.7rem;
    font-weight: 600;
    background: #f1f5f9;
    color: #475569;
    padding: 2px 7px;
    border-radius: 999px;
  }

  .modal-close-btn {
    background: transparent;
    border: none;
    font-size: 1.1rem;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    line-height: 1;
    transition: background 0.15s;
  }

  .modal-close-btn:hover {
    background: #f1f5f9;
    color: var(--color-text);
  }

  .profile-modal__body {
    padding: var(--space-4);
    max-height: 60vh;
    overflow-y: auto;
  }

  .loading-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4) 0;
    color: var(--color-text-muted);
  }

  .details-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    background: #f8fafc;
    border: 1px solid var(--color-border);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
  }

  .detail-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .detail-value {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text);
    margin-top: 2px;
  }

  .detail-value.mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: 0.02em;
  }

  .text-capitalize {
    text-transform: capitalize;
  }

  .profile-modal__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
    background: #f8fafc;
  }

  .footer-actions-right {
    display: flex;
    gap: var(--space-2);
  }
</style>
