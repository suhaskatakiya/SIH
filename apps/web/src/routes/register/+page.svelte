<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api, isApiClientError } from '$lib/services';
  import { refreshMe, session } from '$lib/session.svelte';
  import { t, errorMessage, setLang } from '$lib/i18n.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';

  // A small, hackathon-friendly subset of state codes.
  const STATES = [
    ['GJ', 'Gujarat'], ['MH', 'Maharashtra'], ['PB', 'Punjab'], ['HR', 'Haryana'],
    ['UP', 'Uttar Pradesh'], ['MP', 'Madhya Pradesh'], ['RJ', 'Rajasthan'],
    ['KA', 'Karnataka'], ['TN', 'Tamil Nadu'], ['AP', 'Andhra Pradesh'],
    ['TG', 'Telangana'], ['WB', 'West Bengal'], ['BR', 'Bihar'], ['OD', 'Odisha']
  ];
  const LANGS = [['en', 'English'], ['hi', 'हिंदी'], ['gu', 'ગુજરાતી']];

  let full_name = $state('');
  let state_code = $state('GJ');
  let district = $state('');
  let village = $state('');
  let external_farmer_ref = $state('');
  let preferred_language = $state('en');
  let privacy = $state(false);
  let loading = $state(false);
  let error = $state('');

  onMount(() => {
    if (session.status !== 'authenticated' || !session.me) {
      goto('/login');
      return;
    }
    if (session.me.role === 'OPERATOR') {
      goto('/operator/dashboard');
      return;
    }
    const f = session.me.farmer;
    if (f) {
      full_name = f.full_name;
      state_code = f.state_code;
      district = f.district;
      village = f.village;
      external_farmer_ref = f.external_farmer_ref ?? '';
      preferred_language = f.preferred_language;
    }
  });

  async function submit() {
    error = '';
    if (!privacy) {
      error = errorMessage('PRIVACY_ACK_REQUIRED', 'Please accept to continue.');
      return;
    }
    loading = true;
    try {
      await api.updateFarmer({
        full_name: full_name.trim(),
        state_code,
        district: district.trim(),
        village: village.trim(),
        external_farmer_ref: external_farmer_ref.trim() || null,
        preferred_language,
        privacy_acknowledged: privacy
      });
      setLang(preferred_language);
      await refreshMe();
      await goto('/dashboard');
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Something went wrong.';
    } finally {
      loading = false;
    }
  }
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
    <div class="container stack">
      <div>
        <h1>{t('register.title')}</h1>
        <p class="page-header__sub">{t('register.sub')}</p>
      </div>

      {#if error}<ErrorBanner message={error} />{/if}

      <form class="card stack" onsubmit={(e) => { e.preventDefault(); submit(); }}>
        <div class="field">
          <label class="field__label" for="full_name">{t('register.fullName')}</label>
          <input id="full_name" class="input" bind:value={full_name} required maxlength="120" />
        </div>

        <div class="field">
          <label class="field__label" for="state">{t('register.state')}</label>
          <select id="state" class="select" bind:value={state_code}>
            {#each STATES as [code, name] (code)}
              <option value={code}>{name} ({code})</option>
            {/each}
          </select>
        </div>

        <div class="field">
          <label class="field__label" for="district">{t('register.district')}</label>
          <input id="district" class="input" bind:value={district} required maxlength="120" />
        </div>

        <div class="field">
          <label class="field__label" for="village">{t('register.village')}</label>
          <input id="village" class="input" bind:value={village} required maxlength="120" />
        </div>

        <div class="field">
          <label class="field__label" for="ref">
            {t('register.externalRef')} <span class="muted">({t('common.optional')})</span>
          </label>
          <input id="ref" class="input" bind:value={external_farmer_ref} maxlength="120" />
        </div>

        <div class="field">
          <label class="field__label" for="lang">{t('register.language')}</label>
          <select id="lang" class="select" bind:value={preferred_language}>
            {#each LANGS as [code, name] (code)}
              <option value={code}>{name}</option>
            {/each}
          </select>
        </div>

        <label class="checkbox-row">
          <input type="checkbox" bind:checked={privacy} />
          <span>{t('register.privacy')}</span>
        </label>

        <button class="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? t('common.loading') : t('register.submit')}
        </button>
      </form>
    </div>
  </main>
</div>
