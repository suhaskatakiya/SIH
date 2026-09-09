<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api, API_MODE, isApiClientError } from '$lib/services';
  import { completeLogin, session } from '$lib/session.svelte';
  import { t, errorMessage } from '$lib/i18n.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';

  let step = $state<'mobile' | 'otp'>('mobile');
  let mobile = $state('+91');
  let otp = $state('');
  let masked = $state('');
  let loading = $state(false);
  let error = $state('');

  const demoLogins = [
    { mobile: '+919876543210', label: 'Ramesh Patel', role: 'Farmer' },
    { mobile: '+919999900001', label: 'Centre 01', role: 'Operator' },
    { mobile: '+919812345678', label: 'Suresh Kumar', role: 'Farmer · in queue' }
  ];

  onMount(() => {
    if (session.status === 'authenticated' && session.me) redirectHome();
  });

  function redirectHome() {
    if (session.me?.role === 'OPERATOR') goto('/operator/dashboard');
    else if (session.me && !session.me.profile_complete) goto('/register');
    else goto('/dashboard');
  }

  function toMessage(err: unknown): string {
    if (isApiClientError(err)) return errorMessage(err.code, err.message);
    return errorMessage('INTERNAL_ERROR', 'Something went wrong.');
  }

  async function sendOtp() {
    error = '';
    loading = true;
    try {
      const res = await api.requestOtp({ mobile: mobile.trim() });
      masked = res.mobile_masked;
      step = 'otp';
      if (API_MODE === 'mock') otp = '123456';
    } catch (err) {
      error = toMessage(err);
    } finally {
      loading = false;
    }
  }

  async function verify() {
    error = '';
    loading = true;
    try {
      const res = await api.verifyOtp({ mobile: mobile.trim(), otp: otp.trim() });
      const me = await completeLogin(res);
      if (me?.role === 'OPERATOR') await goto('/operator/dashboard');
      else if (me && !me.profile_complete) await goto('/register');
      else await goto('/dashboard');
    } catch (err) {
      error = toMessage(err);
    } finally {
      loading = false;
    }
  }

  async function useDemo(m: string) {
    mobile = m;
    await sendOtp();
  }

  function changeNumber() {
    step = 'mobile';
    otp = '';
    error = '';
  }
</script>

<div class="app-shell">
  <div class="public-bar">
    <a class="brand" href="/">
      <img class="brand__mark" src="/favicon.svg" alt="" aria-hidden="true" />
      {t('app.name')}
    </a>
    <LanguageToggle />
  </div>

  <main class="app-main">
    <div class="container stack">
      <h1>{t('login.title')}</h1>

      {#if error}<ErrorBanner message={error} />{/if}

      {#if step === 'mobile'}
        <form class="card stack" onsubmit={(e) => { e.preventDefault(); sendOtp(); }}>
          <div class="field">
            <label class="field__label" for="mobile">{t('login.mobile')}</label>
            <input
              id="mobile"
              class="input"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              bind:value={mobile}
              placeholder="+919876543210"
              required
            />
            <span class="field__hint">{t('login.mobileHint')}</span>
          </div>
          <button class="btn btn--primary btn--block" type="submit" disabled={loading}>
            {loading ? t('common.loading') : t('login.sendOtp')}
          </button>
        </form>

        {#if API_MODE === 'mock'}
          <div class="card stack stack--tight">
            <p class="field__label">Demo logins</p>
            <p class="meta">Tap to sign in instantly. Any code works in demo mode.</p>
            {#each demoLogins as d (d.mobile)}
              <button
                type="button"
                class="btn btn--ghost row row--between"
                style="justify-content: space-between;"
                onclick={() => useDemo(d.mobile)}
                disabled={loading}
              >
                <span>{d.label}</span>
                <span class="meta">{d.role}</span>
              </button>
            {/each}
          </div>
        {/if}
      {:else}
        <form class="card stack" onsubmit={(e) => { e.preventDefault(); verify(); }}>
          <p class="meta">{t('login.sentTo')} <strong>{masked}</strong></p>
          <div class="field">
            <label class="field__label" for="otp">{t('login.otp')}</label>
            <input
              id="otp"
              class="input"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              bind:value={otp}
              maxlength="8"
              placeholder="######"
              required
            />
            <span class="field__hint">{t('login.otpHint')}</span>
          </div>
          <button class="btn btn--primary btn--block" type="submit" disabled={loading}>
            {loading ? t('common.loading') : t('login.verify')}
          </button>
          <div class="btn-group">
            <button type="button" class="btn btn--ghost grow" onclick={changeNumber} disabled={loading}>
              {t('login.changeNumber')}
            </button>
            <button type="button" class="btn btn--ghost grow" onclick={sendOtp} disabled={loading}>
              {t('login.resend')}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </main>
</div>
