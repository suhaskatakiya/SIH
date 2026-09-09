<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api, API_MODE, isApiClientError } from '$lib/services';
  import { completeLogin, refreshMe, session } from '$lib/session.svelte';
  import { t, errorMessage, setLang } from '$lib/i18n.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';

  // State: Tab toggle ('login' | 'register')
  let mode = $state<'login' | 'register'>('login');

  // Login steps: 'phone' (enter mobile) | 'otp' (verify 6-digit OTP)
  let loginStep = $state<'phone' | 'otp'>('phone');
  let loginPhoneDigits = $state('9876543210');
  let enteredOtp = $state('');
  let maskedPhone = $state('');

  // Registration form fields
  let regPhoneDigits = $state('');
  let fullName = $state('');
  let stateCode = $state('GJ');
  let district = $state('');
  let village = $state('');
  let externalRef = $state('');
  let preferredLang = $state('hi');
  let privacy = $state(true);

  // Common UI state
  let loading = $state(false);
  let error = $state('');

  const STATES = [
    ['GJ', 'Gujarat (ગુજરાત)'],
    ['MH', 'Maharashtra (महाराष्ट्र)'],
    ['PB', 'Punjab (ਪੰਜਾਬ)'],
    ['HR', 'Haryana (हरियाणा)'],
    ['UP', 'Uttar Pradesh (उत्तर प्रदेश)'],
    ['MP', 'Madhya Pradesh (मध्य प्रदेश)'],
    ['RJ', 'Rajasthan (राजस्थान)'],
    ['KA', 'Karnataka (ಕರ್ನಾಟಕ)'],
    ['TN', 'Tamil Nadu (தமிழ்நாடு)'],
    ['AP', 'Andhra Pradesh (ఆంధ్రప్రదేశ్)']
  ];

  const LANGS = [
    ['hi', 'हिंदी (Hindi)'],
    ['en', 'English'],
    ['gu', 'ગુજરાતી (Gujarati)']
  ];

  const demoLogins = [
    {
      mobileDigits: '9876543210',
      label: 'Ramesh Patel',
      role: 'Farmer',
      sub: 'Gujarat • Ready to book a slot',
      icon: '🌱',
      badge: 'Active Profile'
    },
    {
      mobileDigits: '9812345678',
      label: 'Suresh Kumar',
      role: 'Farmer',
      sub: 'In today queue • Token #1',
      icon: '⏳',
      badge: 'In Queue'
    },
    {
      mobileDigits: '9999900001',
      label: 'SIH Centre 01',
      role: 'Operator',
      sub: 'Procurement desk & queue manager',
      icon: '🏢',
      badge: 'Centre Desk'
    }
  ];

  onMount(() => {
    const tabParam = $page.url.searchParams.get('tab');
    if (tabParam === 'register') {
      mode = 'register';
    }

    if (session.status === 'authenticated' && session.me) {
      redirectHome();
    }
  });

  function redirectHome() {
    if (session.me?.role === 'OPERATOR') {
      goto('/operator/dashboard');
    } else if (session.me && !session.me.profile_complete) {
      mode = 'register';
      regPhoneDigits = loginPhoneDigits;
    } else {
      goto('/dashboard');
    }
  }

  function normalizeMobile(input: string): string {
    let clean = input.replace(/\s+/g, '').replace(/-/g, '');
    if (clean.startsWith('+91')) return clean;
    if (clean.startsWith('91') && clean.length === 12) return '+' + clean;
    clean = clean.replace(/^0+/, '');
    return '+91' + clean;
  }

  function toMessage(err: unknown): string {
    if (isApiClientError(err)) return errorMessage(err.code, err.message);
    return errorMessage('INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }

  // Step 1: Request OTP for login
  async function requestLoginOtp(targetDigits?: string) {
    error = '';
    const digits = (targetDigits ?? loginPhoneDigits).trim();
    const clean = digits.replace(/\D/g, '');
    if (!clean || clean.length < 10) {
      error = 'Please enter a valid 10-digit mobile number.';
      return;
    }

    loginPhoneDigits = clean.slice(-10);
    const mobileToUse = normalizeMobile(loginPhoneDigits);
    loading = true;

    try {
      const res = await api.requestOtp({ mobile: mobileToUse });
      maskedPhone = res.mobile_masked;
      loginStep = 'otp';
      if (API_MODE === 'mock') {
        enteredOtp = '123456';
      } else {
        enteredOtp = '';
      }
    } catch (err) {
      error = toMessage(err);
    } finally {
      loading = false;
    }
  }

  // Step 2: Verify OTP
  async function verifyLoginOtp() {
    error = '';
    const cleanOtp = enteredOtp.trim();
    if (!cleanOtp) {
      error = 'Please enter the 6-digit verification code.';
      return;
    }

    const mobileToUse = normalizeMobile(loginPhoneDigits);
    loading = true;

    try {
      const res = await api.verifyOtp({ mobile: mobileToUse, otp: cleanOtp });
      const me = await completeLogin(res);

      if (me?.role === 'OPERATOR') {
        await goto('/operator/dashboard');
      } else if (me && !me.profile_complete) {
        mode = 'register';
        regPhoneDigits = loginPhoneDigits;
        loginStep = 'phone';
      } else {
        await goto('/dashboard');
      }
    } catch (err) {
      error = toMessage(err);
    } finally {
      loading = false;
    }
  }

  // Quick Demo profile action
  async function handleDemoSelect(digits: string) {
    error = '';
    loginPhoneDigits = digits;

    if (API_MODE === 'mock') {
      // In mock mode, complete login instantly for seamless evaluation
      loading = true;
      try {
        const mobileToUse = normalizeMobile(digits);
        await api.requestOtp({ mobile: mobileToUse });
        const res = await api.verifyOtp({ mobile: mobileToUse, otp: '123456' });
        const me = await completeLogin(res);
        if (me?.role === 'OPERATOR') {
          await goto('/operator/dashboard');
        } else if (me && !me.profile_complete) {
          mode = 'register';
          regPhoneDigits = digits;
        } else {
          await goto('/dashboard');
        }
      } catch (err) {
        error = toMessage(err);
      } finally {
        loading = false;
      }
    } else {
      // In live mode, request OTP and prompt user for code
      await requestLoginOtp(digits);
    }
  }

  function changeNumber() {
    loginStep = 'phone';
    enteredOtp = '';
    error = '';
  }

  // Farmer registration
  async function handleRegister() {
    error = '';
    if (!privacy) {
      error = errorMessage('PRIVACY_ACK_REQUIRED', 'Please acknowledge the privacy terms to continue.');
      return;
    }
    if (!fullName.trim() || !district.trim() || !village.trim() || !regPhoneDigits.trim()) {
      error = 'Please complete all required fields (Name, Mobile, District, Village).';
      return;
    }

    const mobileToUse = normalizeMobile(regPhoneDigits);
    loading = true;

    try {
      // 1. Authenticate with mobile number if not already logged in
      if (session.status !== 'authenticated') {
        try {
          await api.requestOtp({ mobile: mobileToUse });
        } catch {
          /* proceed */
        }
        const authRes = await api.verifyOtp({ mobile: mobileToUse, otp: '123456' });
        await completeLogin(authRes);
      }

      // 2. Save farmer profile details
      await api.updateFarmer({
        full_name: fullName.trim(),
        state_code: stateCode,
        district: district.trim(),
        village: village.trim(),
        external_farmer_ref: externalRef.trim() || null,
        preferred_language: preferredLang,
        privacy_acknowledged: privacy
      });

      setLang(preferredLang);
      await refreshMe();
      await goto('/dashboard');
    } catch (err) {
      error = isApiClientError(err) ? errorMessage(err.code, err.message) : 'Registration failed. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <!-- Top navigation bar -->
  <header class="auth-header">
    <a class="brand-link" href="/">
      <div class="brand-badge-wrapper">
        <span class="brand-badge">🌾</span>
      </div>
      <div class="brand-info">
        <span class="brand-text">CropSaathi</span>
        <span class="brand-subtext">Procurement Portal</span>
      </div>
    </a>
    <div class="header-actions">
      <LanguageToggle />
    </div>
  </header>

  <!-- Centered Auth Container -->
  <main class="auth-main">
    <div class="auth-card">
      <!-- Title & Subtitle -->
      <div class="card-header">
        <div class="header-tag">
          <span class="tag-pulse"></span>
          <span>MSP Procurement Booking System</span>
        </div>
        <h1 class="auth-title">
          {mode === 'login' ? 'Sign in to CropSaathi' : 'Farmer Registration'}
        </h1>
        <p class="auth-subtitle">
          {mode === 'login'
            ? 'Book procurement slots, view queue positions, and manage digital tokens.'
            : 'Register your farmer profile to schedule MSP crop procurement at government centres.'}
        </p>
      </div>

      <!-- Segmented Tab Switcher -->
      <div class="tab-switcher" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          class="tab-btn"
          class:tab-btn--active={mode === 'login'}
          onclick={() => { mode = 'login'; error = ''; }}
        >
          <svg class="tab-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          <span>Sign In</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          class="tab-btn"
          class:tab-btn--active={mode === 'register'}
          onclick={() => { mode = 'register'; error = ''; }}
        >
          <svg class="tab-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z"/>
          </svg>
          <span>Register New Farmer</span>
        </button>
      </div>

      {#if error}
        <div class="error-container">
          <ErrorBanner message={error} />
        </div>
      {/if}

      <!-- TAB 1: LOGIN -->
      {#if mode === 'login'}
        {#if loginStep === 'phone'}
          <form class="auth-form" onsubmit={(e) => { e.preventDefault(); requestLoginOtp(); }}>
            <div class="field-group">
              <div class="field-label-row">
                <label class="field-label" for="login-mobile">
                  {t('login.mobile')}
                </label>
                <span class="direct-badge">
                  <svg viewBox="0 0 16 16" fill="currentColor" class="badge-icon">
                    <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clip-rule="evenodd"/>
                  </svg>
                  2-Step OTP Verification
                </span>
              </div>

              <div class="phone-input-box">
                <div class="country-prefix">
                  <!-- Clean SVG Indian Flag -->
                  <svg class="flag-svg" viewBox="0 0 36 24" width="22" height="15">
                    <rect width="36" height="8" fill="#FF9933"/>
                    <rect y="8" width="36" height="8" fill="#FFFFFF"/>
                    <rect y="16" width="36" height="8" fill="#138808"/>
                    <circle cx="18" cy="12" r="3.2" fill="none" stroke="#000080" stroke-width="0.8"/>
                    <circle cx="18" cy="12" r="0.8" fill="#000080"/>
                  </svg>
                  <span class="prefix-number">+91</span>
                  <span class="prefix-divider"></span>
                </div>
                <input
                  id="login-mobile"
                  class="phone-input"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel"
                  bind:value={loginPhoneDigits}
                  placeholder="98765 43210"
                  required
                  maxlength="14"
                />
              </div>
              <p class="field-help">{t('login.mobileHint')}</p>
            </div>

            <button class="btn-primary" type="submit" disabled={loading}>
              {#if loading}
                <span class="spinner-icon"></span>
                <span>{t('common.loading')}</span>
              {:else}
                <span>{t('login.sendOtp')}</span>
                <svg class="btn-arrow" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              {/if}
            </button>
          </form>
        {:else}
          <!-- Step 2: OTP Entry -->
          <form class="auth-form" onsubmit={(e) => { e.preventDefault(); verifyLoginOtp(); }}>
            <div class="field-group">
              <div class="otp-sent-banner">
                <span class="otp-sent-icon">📱</span>
                <div>
                  <span class="otp-sent-title">{t('login.sentTo')}</span>
                  <span class="otp-sent-target">{maskedPhone || normalizeMobile(loginPhoneDigits)}</span>
                </div>
              </div>

              <label class="field-label" for="login-otp">
                {t('login.otp')}
              </label>

              <input
                id="login-otp"
                class="form-input otp-input"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                bind:value={enteredOtp}
                placeholder="123456"
                maxlength="8"
                required
              />
              <p class="field-help">{t('login.otpHint')}</p>
            </div>

            <button class="btn-primary" type="submit" disabled={loading}>
              {#if loading}
                <span class="spinner-icon"></span>
                <span>{t('common.loading')}</span>
              {:else}
                <span>{t('login.verify')}</span>
                <svg class="btn-arrow" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              {/if}
            </button>

            <div class="otp-action-row">
              <button type="button" class="link-btn" onclick={changeNumber} disabled={loading}>
                ← {t('login.changeNumber')}
              </button>
              <button type="button" class="link-btn" onclick={() => requestLoginOtp()} disabled={loading}>
                ↻ {t('login.resend')}
              </button>
            </div>
          </form>
        {/if}

        <!-- Quick Demo Profiles for Testing / Hackathon Judges -->
        <div class="demo-section">
          <div class="demo-header">
            <div class="demo-header-title">
              <span class="demo-spark">⚡</span>
              <span>1-Click Quick Demo Profiles</span>
            </div>
            <span class="demo-badge">Evaluation Ready</span>
          </div>
          <p class="demo-subtext">Click any test persona to experience their personalized dashboard:</p>

          <div class="demo-grid">
            {#each demoLogins as d (d.mobileDigits)}
              <button
                type="button"
                class="demo-card"
                onclick={() => handleDemoSelect(d.mobileDigits)}
                disabled={loading}
              >
                <div class="demo-avatar">
                  <span>{d.icon}</span>
                </div>
                <div class="demo-info">
                  <div class="demo-title-row">
                    <span class="demo-name">{d.label}</span>
                    <span class="demo-chip demo-chip--{d.role.toLowerCase()}">{d.role}</span>
                  </div>
                  <span class="demo-detail">{d.sub}</span>
                </div>
                <div class="demo-action">
                  <span class="demo-login-btn">Log In &rarr;</span>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <div class="switch-footer">
          <span class="footer-prompt">Are you a new farmer visiting for the first time?</span>
          <button type="button" class="link-action-btn" onclick={() => { mode = 'register'; error = ''; }}>
            Register your farmer profile &rarr;
          </button>
        </div>

      <!-- TAB 2: REGISTER -->
      {:else}
        <form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleRegister(); }}>
          <div class="form-section-title">
            <span>1. Contact & Identity</span>
          </div>

          <div class="field-group">
            <label class="field-label" for="reg-mobile">Mobile Number *</label>
            <div class="phone-input-box">
              <div class="country-prefix">
                <svg class="flag-svg" viewBox="0 0 36 24" width="22" height="15">
                  <rect width="36" height="8" fill="#FF9933"/>
                  <rect y="8" width="36" height="8" fill="#FFFFFF"/>
                  <rect y="16" width="36" height="8" fill="#138808"/>
                  <circle cx="18" cy="12" r="3.2" fill="none" stroke="#000080" stroke-width="0.8"/>
                  <circle cx="18" cy="12" r="0.8" fill="#000080"/>
                </svg>
                <span class="prefix-number">+91</span>
                <span class="prefix-divider"></span>
              </div>
              <input
                id="reg-mobile"
                class="phone-input"
                type="tel"
                inputmode="numeric"
                autocomplete="tel"
                bind:value={regPhoneDigits}
                placeholder="98765 43210"
                required
                maxlength="14"
              />
            </div>
            <p class="field-help">Your mobile number will receive booking SMS confirmations</p>
          </div>

          <div class="field-group">
            <label class="field-label" for="full-name">{t('register.fullName')} *</label>
            <input
              id="full-name"
              class="form-input"
              type="text"
              bind:value={fullName}
              placeholder="e.g. Ramesh Patel"
              required
              maxlength="120"
            />
          </div>

          <div class="form-section-title">
            <span>2. Farm Location</span>
          </div>

          <div class="grid-2col">
            <div class="field-group">
              <label class="field-label" for="state-code">{t('register.state')} *</label>
              <select id="state-code" class="form-select" bind:value={stateCode}>
                {#each STATES as [code, name] (code)}
                  <option value={code}>{name}</option>
                {/each}
              </select>
            </div>

            <div class="field-group">
              <label class="field-label" for="district">{t('register.district')} *</label>
              <input
                id="district"
                class="form-input"
                type="text"
                bind:value={district}
                placeholder="e.g. Gandhinagar"
                required
                maxlength="120"
              />
            </div>
          </div>

          <div class="grid-2col">
            <div class="field-group">
              <label class="field-label" for="village">{t('register.village')} *</label>
              <input
                id="village"
                class="form-input"
                type="text"
                bind:value={village}
                placeholder="e.g. Demo Village"
                required
                maxlength="120"
              />
            </div>

            <div class="field-group">
              <label class="field-label" for="preferred-lang">{t('register.language')}</label>
              <select id="preferred-lang" class="form-select" bind:value={preferredLang}>
                {#each LANGS as [code, name] (code)}
                  <option value={code}>{name}</option>
                {/each}
              </select>
            </div>
          </div>

          <div class="field-group">
            <div class="field-label-row">
              <label class="field-label" for="ext-ref">Kisan / Land Reference ID</label>
              <span class="optional-tag">Optional</span>
            </div>
            <input
              id="ext-ref"
              class="form-input"
              type="text"
              bind:value={externalRef}
              placeholder="e.g. GJ-GNR-004821 or PM-KISAN ID"
              maxlength="120"
            />
            <p class="field-help">If you have a PM-KISAN, Krushak, or state land record number</p>
          </div>

          <div class="privacy-box">
            <label class="privacy-label">
              <input type="checkbox" bind:checked={privacy} class="privacy-checkbox" />
              <span class="privacy-text">
                I hereby declare that the crop produce is harvested from my registered landholding and agree to terms under Government MSP procurement.
              </span>
            </label>
          </div>

          <button class="btn-primary" type="submit" disabled={loading}>
            {#if loading}
              <span class="spinner-icon"></span>
              <span>Registering Profile...</span>
            {:else}
              <span>Complete Registration & Continue</span>
              <svg class="btn-arrow" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
            {/if}
          </button>
        </form>

        <div class="switch-footer">
          <span class="footer-prompt">Already have a farmer profile?</span>
          <button type="button" class="link-action-btn" onclick={() => { mode = 'login'; error = ''; }}>
            Sign In directly &rarr;
          </button>
        </div>
      {/if}

      <!-- Trust Badges Footer -->
      <div class="trust-bar">
        <div class="trust-item">
          <span class="trust-icon">🏛️</span>
          <span>Govt MSP Centres</span>
        </div>
        <div class="trust-dot">•</div>
        <div class="trust-item">
          <span class="trust-icon">⚡</span>
          <span>Zero-Wait Token</span>
        </div>
        <div class="trust-dot">•</div>
        <div class="trust-item">
          <span class="trust-icon">🔒</span>
          <span>Secured Records</span>
        </div>
      </div>
    </div>
  </main>
</div>

<style>
  /* -------------------------------------------------------------------------
   * Auth Page Layout & Modern Design Tokens
   * ------------------------------------------------------------------------- */
  .auth-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: #f7f8f5;
    color: var(--color-text);
  }

  /* Header */
  .auth-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    max-width: 1040px;
    margin: 0 auto;
    width: 100%;
  }

  .brand-link {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: inherit;
  }

  .brand-badge-wrapper {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: #ecfdf3;
    border: 1px solid #bbf7d0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(22, 101, 52, 0.08);
  }

  .brand-badge {
    font-size: 20px;
    line-height: 1;
  }

  .brand-info {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }

  .brand-text {
    font-weight: 800;
    font-size: 18px;
    letter-spacing: -0.02em;
    color: var(--color-primary-dark);
  }

  .brand-subtext {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .header-actions {
    display: flex;
    align-items: center;
  }

  /* Main Container */
  .auth-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 16px 40px;
  }

  /* Main Card */
  .auth-card {
    background: var(--color-surface);
    border: 1px solid rgba(22, 101, 52, 0.12);
    border-radius: 20px;
    box-shadow: 0 20px 40px -15px rgba(22, 101, 52, 0.07), 0 4px 12px -2px rgba(0, 0, 0, 0.03);
    width: 100%;
    max-width: 520px;
    padding: 32px 30px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    transition: box-shadow 0.2s ease;
  }

  @media (max-width: 500px) {
    .auth-card {
      padding: 24px 18px;
      border-radius: 16px;
    }
  }

  /* Card Header */
  .card-header {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .header-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #ecfdf3;
    border: 1px solid #bbf7d0;
    color: #166534;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 10px;
    border-radius: 12px;
  }

  .tag-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #16a34a;
    box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25);
  }

  .auth-title {
    font-size: 24px;
    font-weight: 800;
    color: #143521;
    letter-spacing: -0.02em;
    margin: 0;
  }

  .auth-subtitle {
    font-size: 14px;
    color: var(--color-muted);
    margin: 0;
    line-height: 1.45;
    max-width: 420px;
  }

  /* Segmented Tab Switcher */
  .tab-switcher {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    background: #eef2ee;
    padding: 4px;
    border-radius: 12px;
  }

  .tab-btn {
    border: none;
    background: transparent;
    padding: 10px 14px;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 600;
    color: var(--color-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .tab-btn:hover:not(.tab-btn--active) {
    color: var(--color-text);
  }

  .tab-btn--active {
    background: var(--color-surface);
    color: var(--color-primary-dark);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    font-weight: 700;
  }

  .tab-icon {
    width: 16px;
    height: 16px;
    opacity: 0.85;
  }

  .error-container {
    animation: fadeIn 0.2s ease;
  }

  /* Form */
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-section-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-primary);
    border-bottom: 1px solid #e8ede9;
    padding-bottom: 4px;
    margin-top: 4px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .field-label {
    font-size: 14px;
    font-weight: 600;
    color: #243329;
  }

  .direct-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #15803d;
    background: #ecfdf3;
    border: 1px solid #bbf7d0;
    padding: 2px 7px;
    border-radius: 8px;
  }

  .badge-icon {
    width: 12px;
    height: 12px;
  }

  .optional-tag {
    font-size: 12px;
    color: var(--color-muted);
    font-weight: 500;
  }

  /* Phone Input Box with Integrated Flag and Code */
  .phone-input-box {
    display: flex;
    align-items: center;
    height: 50px;
    background: var(--color-surface);
    border: 1.5px solid var(--color-border);
    border-radius: 10px;
    padding: 0 12px;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .phone-input-box:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
  }

  .country-prefix {
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }

  .flag-svg {
    border-radius: 2px;
    box-shadow: 0 0.5px 1.5px rgba(0, 0, 0, 0.15);
  }

  .prefix-number {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--color-text);
  }

  .prefix-divider {
    width: 1px;
    height: 20px;
    background: var(--color-border);
    margin: 0 8px;
  }

  .phone-input {
    flex: 1;
    height: 100%;
    border: none;
    outline: none;
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text);
    background: transparent;
    letter-spacing: 0.03em;
  }

  .phone-input::placeholder {
    color: #9aa39d;
    letter-spacing: 0;
  }

  /* OTP Screen Specifics */
  .otp-sent-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    padding: 12px 14px;
    border-radius: 10px;
    margin-bottom: 4px;
  }

  .otp-sent-icon {
    font-size: 24px;
  }

  .otp-sent-title {
    display: block;
    font-size: 12px;
    color: var(--color-muted);
    font-weight: 500;
  }

  .otp-sent-target {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: var(--color-primary-dark);
  }

  .otp-input {
    font-size: 20px !important;
    letter-spacing: 0.3em;
    text-align: center;
    font-weight: 700;
  }

  .otp-action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 4px;
  }

  .link-btn {
    border: none;
    background: transparent;
    color: var(--color-primary);
    font-weight: 600;
    font-size: 13.5px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
    transition: background-color 0.15s ease;
  }

  .link-btn:hover:not(:disabled) {
    background: #ecfdf3;
    text-decoration: underline;
  }

  /* Standard Inputs & Selects */
  .form-input,
  .form-select {
    height: 48px;
    border: 1.5px solid var(--color-border);
    border-radius: 10px;
    padding: 0 14px;
    font-size: 14.5px;
    color: var(--color-text);
    background: var(--color-surface);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
    width: 100%;
    outline: none;
  }

  .form-input:focus,
  .form-select:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(22, 101, 52, 0.12);
  }

  .field-help {
    font-size: 12px;
    color: var(--color-muted);
    margin: 0;
    line-height: 1.35;
  }

  .grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  @media (max-width: 460px) {
    .grid-2col {
      grid-template-columns: 1fr;
    }
  }

  /* Privacy Box */
  .privacy-box {
    background: #f8faf8;
    border: 1px solid #e2e8e4;
    border-radius: 10px;
    padding: 12px 14px;
  }

  .privacy-label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
    font-size: 13px;
    color: #3b4840;
    line-height: 1.45;
    user-select: none;
  }

  .privacy-checkbox {
    margin-top: 2px;
    width: 17px;
    height: 17px;
    accent-color: var(--color-primary);
    cursor: pointer;
    flex-shrink: 0;
  }

  /* Primary Action Button */
  .btn-primary {
    height: 52px;
    border: none;
    border-radius: 10px;
    background: var(--color-primary);
    color: #ffffff;
    font-size: 15.5px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: background-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
    box-shadow: 0 3px 6px -1px rgba(22, 101, 52, 0.25);
    margin-top: 4px;
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--color-primary-dark);
    box-shadow: 0 5px 12px -2px rgba(22, 101, 52, 0.35);
    transform: translateY(-1px);
  }

  .btn-primary:active:not(:disabled) {
    transform: scale(0.99);
  }

  .btn-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn-arrow {
    width: 18px;
    height: 18px;
    transition: transform 0.15s ease;
  }

  .btn-primary:hover:not(:disabled) .btn-arrow {
    transform: translateX(2px);
  }

  .spinner-icon {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #ffffff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* 1-Click Quick Demo Profiles */
  .demo-section {
    background: #fbfdfb;
    border: 1px dashed #c6d9cb;
    border-radius: 14px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .demo-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .demo-header-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #1e3a29;
  }

  .demo-spark {
    font-size: 14px;
  }

  .demo-badge {
    font-size: 11px;
    font-weight: 600;
    color: #15803d;
    background: #ecfdf3;
    border: 1px solid #bbf7d0;
    padding: 2px 8px;
    border-radius: 8px;
  }

  .demo-subtext {
    font-size: 12.5px;
    color: var(--color-muted);
    margin: 0;
    line-height: 1.35;
  }

  .demo-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .demo-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--color-surface);
    border: 1px solid #e1e7e2;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .demo-card:hover {
    border-color: var(--color-primary);
    background: #f9fdfa;
    box-shadow: 0 2px 8px rgba(22, 101, 52, 0.08);
    transform: translateY(-1px);
  }

  .demo-avatar {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #f0fdf4;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }

  .demo-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .demo-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .demo-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--color-text);
  }

  .demo-chip {
    font-size: 11px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 5px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .demo-chip--farmer {
    background: #ecfdf3;
    color: #166534;
  }

  .demo-chip--operator {
    background: #eff6ff;
    color: #1d4ed8;
  }

  .demo-detail {
    font-size: 12px;
    color: var(--color-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .demo-action {
    flex-shrink: 0;
  }

  .demo-login-btn {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--color-primary);
    background: #ecfdf3;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .demo-card:hover .demo-login-btn {
    background: var(--color-primary);
    color: #ffffff;
  }

  /* Switch Footer */
  .switch-footer {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding-top: 4px;
  }

  .footer-prompt {
    font-size: 13px;
    color: var(--color-muted);
  }

  .link-action-btn {
    border: none;
    background: transparent;
    color: var(--color-primary);
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    padding: 3px 6px;
    border-radius: 6px;
    transition: background-color 0.15s ease;
  }

  .link-action-btn:hover {
    background: #ecfdf3;
    text-decoration: underline;
  }

  /* Trust Bar */
  .trust-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid #edf0ee;
    font-size: 12px;
    font-weight: 500;
    color: #64746a;
    flex-wrap: wrap;
  }

  .trust-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .trust-icon {
    font-size: 14px;
  }

  .trust-dot {
    color: #cbd5ce;
  }
</style>
