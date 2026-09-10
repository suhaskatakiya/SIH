<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { api, API_MODE, isApiClientError } from '$lib/services';
  import { completeLogin, refreshMe, session } from '$lib/session.svelte';
  import { t, errorMessage, setLang, i18n } from '$lib/i18n.svelte';
  import ErrorBanner from '$lib/components/ErrorBanner.svelte';
  import LanguageToggle from '$lib/components/LanguageToggle.svelte';

  // Role: 'farmer' | 'operator'
  let role = $state<'farmer' | 'operator'>('farmer');

  // State: Tab toggle ('login' | 'register')
  let mode = $state<'login' | 'register'>('login');

  // Auth Method on Login: 'password' | 'otp'
  let authMethod = $state<'password' | 'otp'>('password');
  let loginPassword = $state('DemoPassword123!');
  let showLoginPassword = $state(false);

  // Login steps for OTP: 'phone' | 'otp'
  let loginStep = $state<'phone' | 'otp'>('phone');
  let loginPhoneDigits = $state('9876543210');
  let enteredOtp = $state('');
  let maskedPhone = $state('');

  // Farmer Registration form fields
  let regPhoneDigits = $state('');
  let regFarmerPassword = $state('');
  let showRegFarmerPassword = $state(false);
  let fullName = $state('');
  let stateCode = $state('GJ');
  let district = $state('');
  let village = $state('');
  let externalRef = $state('');
  let preferredLang = $state('hi');
  let privacy = $state(true);

  // Operator Registration form fields
  let regOpMobile = $state('9999900002');
  let regOpPassword = $state('');
  let showRegOpPassword = $state(false);
  let regOpName = $state('');
  let regOpBadge = $state('');
  let regOpCentre = $state('11111111-1111-4111-8111-111111111111');
  let regOpDept = $state('APMC Mandi Committee');
  let opAuthAck = $state(true);

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

  const OPERATOR_CENTRES = [
    { id: '11111111-1111-4111-8111-111111111111', name: 'SIH Demo Procurement Centre 01 (Gandhinagar, GJ)' },
    { id: '11111111-1111-4111-8111-222222222221', name: 'Ahmedabad APMC Grain & Cotton Market Yard Centre (Ahmedabad, GJ)' },
    { id: '11111111-1111-4111-8111-222222222222', name: 'Vadodara Central APMC Agro Procurement Hub (Vadodara, GJ)' },
    { id: '11111111-1111-4111-8111-222222222223', name: 'Rajkot Bedi APMC Modern Commodity Terminal (Rajkot, GJ)' },
    { id: '11111111-1111-4111-8111-222222222224', name: 'Gondal APMC Groundnut & Cotton Marketing Yard (Gondal, GJ)' }
  ];

  const OPERATOR_DEPTS = [
    'APMC Mandi Committee',
    'State Civil Supplies Corporation (FCI)',
    'National Agricultural Co-op Marketing Federation (NAFED)',
    'State Warehousing & Procurement Board'
  ];

  import { getCurrentHourSlot } from '$lib/format';
  const demoSlot = getCurrentHourSlot();

  const demoLogins = [
    {
      mobileDigits: '9812345678',
      label: 'Suresh Kumar',
      role: 'Farmer',
      sub: `Slot ${demoSlot.start}–${demoSlot.end} • Token #1 (At Desk)`,
      icon: '⏳',
      badge: 'At Desk'
    },
    {
      mobileDigits: '9876543210',
      label: 'Ramesh Patel',
      role: 'Farmer',
      sub: `Slot ${demoSlot.start}–${demoSlot.end} • Token #2 (1 ahead)`,
      icon: '🌱',
      badge: 'Waiting #2'
    },
    {
      mobileDigits: '9988112233',
      label: 'Vikram Singh',
      role: 'Farmer',
      sub: `Slot ${demoSlot.start}–${demoSlot.end} • Token #3 (2 ahead)`,
      icon: '🌾',
      badge: 'Waiting #3'
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

  const filteredDemos = $derived(
    demoLogins.filter((d) => (role === 'farmer' ? d.role === 'Farmer' : d.role === 'Operator'))
  );

  onMount(() => {
    const roleParam = $page.url.searchParams.get('role');
    if (roleParam === 'operator') {
      role = 'operator';
      loginPhoneDigits = '9999900001';
    } else if (roleParam === 'farmer') {
      role = 'farmer';
      loginPhoneDigits = '9876543210';
    }

    const tabParam = $page.url.searchParams.get('tab');
    if (tabParam === 'register') {
      mode = 'register';
    }

    if (session.status === 'authenticated' && session.me) {
      redirectHome();
    }
  });

  function switchRole(newRole: 'farmer' | 'operator') {
    if (role === newRole) return;
    role = newRole;
    error = '';
    loginStep = 'phone';
    enteredOtp = '';
    if (newRole === 'farmer') {
      loginPhoneDigits = '9876543210';
    } else {
      loginPhoneDigits = '9999900001';
    }
  }

  function redirectHome() {
    if (session.me?.role === 'OPERATOR') {
      goto('/operator/dashboard');
    } else if (session.me && !session.me.profile_complete) {
      mode = 'register';
      role = 'farmer';
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

  function validatePasswordConstraint(pwd: string): string | null {
    if (!pwd || pwd.length < 8) {
      return 'Password must be at least 8 characters long.';
    }
    if (pwd.length > 64) {
      return 'Password must be at most 64 characters long.';
    }
    return null;
  }

  // Password Login Handler
  async function handlePasswordLogin() {
    error = '';
    const clean = loginPhoneDigits.replace(/\D/g, '');
    if (!clean || clean.length < 10) {
      error = 'Please enter a valid 10-digit mobile number.';
      return;
    }

    const pwdErr = validatePasswordConstraint(loginPassword);
    if (pwdErr) {
      error = pwdErr;
      return;
    }

    loginPhoneDigits = clean.slice(-10);
    const mobileToUse = normalizeMobile(loginPhoneDigits);
    loading = true;

    try {
      const res = await api.loginWithPassword({
        mobile: mobileToUse,
        password: loginPassword
      });
      const me = await completeLogin(res);

      if (me?.role === 'OPERATOR') {
        await goto('/operator/dashboard');
      } else if (me && !me.profile_complete) {
        mode = 'register';
        role = 'farmer';
        regPhoneDigits = loginPhoneDigits;
      } else {
        await goto('/dashboard');
      }
    } catch (err) {
      error = toMessage(err);
    } finally {
      loading = false;
    }
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
      } else if (role === 'operator') {
        if (api.registerOperator) {
          const opRes = await api.registerOperator({
            mobile: mobileToUse,
            password: 'DemoPassword123!',
            fullName: 'Mandi Procurement Officer'
          });
          await completeLogin(opRes);
        }
        await goto('/operator/dashboard');
      } else if (me && !me.profile_complete) {
        mode = 'register';
        role = 'farmer';
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
  async function handleDemoSelect(digits: string, demoRole: string) {
    error = '';
    loginPhoneDigits = digits;
    loginPassword = 'DemoPassword123!';
    if (demoRole === 'Operator') {
      role = 'operator';
    } else {
      role = 'farmer';
    }

    await handlePasswordLogin();
  }

  function changeNumber() {
    loginStep = 'phone';
    enteredOtp = '';
    error = '';
  }

  // Farmer registration with password
  async function handleFarmerRegister() {
    error = '';
    if (!privacy) {
      error = errorMessage('PRIVACY_ACK_REQUIRED', 'Please acknowledge the privacy terms to continue.');
      return;
    }
    if (!fullName.trim() || !district.trim() || !village.trim() || !regPhoneDigits.trim()) {
      error = 'Please complete all required fields (Name, Mobile, District, Village).';
      return;
    }

    const pwdErr = validatePasswordConstraint(regFarmerPassword);
    if (pwdErr) {
      error = pwdErr;
      return;
    }

    const mobileToUse = normalizeMobile(regPhoneDigits);
    loading = true;

    try {
      const res = await api.registerFarmer({
        mobile: mobileToUse,
        password: regFarmerPassword,
        full_name: fullName.trim(),
        state_code: stateCode,
        district: district.trim(),
        village: village.trim(),
        external_farmer_ref: externalRef.trim() || null,
        preferred_language: preferredLang,
        privacy_acknowledged: privacy
      });

      await completeLogin(res);
      setLang(preferredLang);
      await refreshMe();
      await goto('/dashboard');
    } catch (err) {
      error = toMessage(err);
    } finally {
      loading = false;
    }
  }

  // Operator registration with password
  async function handleOperatorRegister() {
    error = '';
    if (!opAuthAck) {
      error = 'Please certify that you are authorized to operate this procurement desk.';
      return;
    }
    if (!regOpName.trim() || !regOpMobile.trim()) {
      error = 'Please enter your Full Name and Mobile Number.';
      return;
    }

    const pwdErr = validatePasswordConstraint(regOpPassword);
    if (pwdErr) {
      error = pwdErr;
      return;
    }

    const mobileToUse = normalizeMobile(regOpMobile);
    loading = true;

    try {
      const res = await api.registerOperator({
        mobile: mobileToUse,
        password: regOpPassword,
        fullName: regOpName.trim(),
        centreId: regOpCentre,
        badgeId: regOpBadge.trim() || undefined,
        department: regOpDept
      });
      await completeLogin(res);
      await goto('/operator/dashboard');
    } catch (err) {
      error = toMessage(err);
    } finally {
      loading = false;
    }
  }
</script>

<div class="auth-page">
  <!-- Top navigation bar -->
  <header class="auth-header">
    <a class="brand-link" href="/">
      <div class="brand-badge-wrapper" class:brand-badge-wrapper--op={role === 'operator'}>
        <span class="brand-badge">{role === 'farmer' ? '🌾' : '🏢'}</span>
      </div>
      <div class="brand-info">
        <span class="brand-text">CropSaathi</span>
        <span class="brand-subtext">{role === 'farmer' ? 'Farmer MSP Portal' : 'Mandi Procurement Portal'}</span>
      </div>
    </a>
    <div class="header-actions">
      <LanguageToggle />
    </div>
  </header>

  <!-- Centered Auth Container -->
  <main class="auth-main">
    <div class="auth-card" class:auth-card--op={role === 'operator'}>

      <!-- ROLE SELECTOR: Choice Whom to Login (Farmer vs Operator) -->
      <div class="role-selector-container">
        <div class="role-selector-label">
          <span>{i18n.lang === 'hi' ? 'अपनी भूमिका चुनें (Whom to Login / Register):' : 'Whom to Login / Register:'}</span>
        </div>
        <div class="role-selector" role="radiogroup" aria-label="Portal Role Selection">
          <!-- 1. Farmer Option -->
          <button
            type="button"
            class="role-card role-card--farmer"
            class:role-card--active={role === 'farmer'}
            onclick={() => switchRole('farmer')}
            aria-checked={role === 'farmer'}
            role="radio"
          >
            <div class="role-icon-box">🌾</div>
            <div class="role-text-box">
              <span class="role-name">{i18n.lang === 'hi' ? 'किसान (Farmer)' : 'Farmer'}</span>
              <span class="role-summary">{i18n.lang === 'hi' ? 'स्लॉट बुक करें व टोकन' : 'Book slots & track tokens'}</span>
            </div>
            {#if role === 'farmer'}
              <span class="role-badge">✓ Selected</span>
            {/if}
          </button>

          <!-- 2. Operator Option -->
          <button
            type="button"
            class="role-card role-card--operator"
            class:role-card--active={role === 'operator'}
            onclick={() => switchRole('operator')}
            aria-checked={role === 'operator'}
            role="radio"
          >
            <div class="role-icon-box role-icon-box--op">🏢</div>
            <div class="role-text-box">
              <span class="role-name">{i18n.lang === 'hi' ? 'मंडी ऑपरेटर (Operator)' : 'Mandi Operator'}</span>
              <span class="role-summary">{i18n.lang === 'hi' ? 'खरीद डेस्क व तौल' : 'Procurement desk & weighment'}</span>
            </div>
            {#if role === 'operator'}
              <span class="role-badge role-badge--op">✓ Selected</span>
            {/if}
          </button>
        </div>
      </div>

      <!-- Title & Subtitle -->
      <div class="card-header">
        {#if role === 'farmer'}
          <div class="header-tag">
            <span class="tag-pulse"></span>
            <span>🌾 MSP Farmer Portal • किसान पोर्टल</span>
          </div>
          <h1 class="auth-title">
            {mode === 'login' ? 'Farmer Sign In' : 'Farmer Registration'}
          </h1>
          <p class="auth-subtitle">
            {mode === 'login'
              ? 'Book procurement slots, view queue positions, and manage digital tokens.'
              : 'Register your farmer profile to schedule MSP crop procurement at government centres.'}
          </p>
        {:else}
          <div class="header-tag header-tag--op">
            <span class="tag-pulse tag-pulse--op"></span>
            <span>🏢 Mandi Procurement Desk • ऑपरेटर पोर्टल</span>
          </div>
          <h1 class="auth-title auth-title--op">
            {mode === 'login' ? 'Mandi Operator Sign In' : 'Operator Desk Registration'}
          </h1>
          <p class="auth-subtitle">
            {mode === 'login'
              ? 'Access your procurement centre desk to call queue tokens, verify arrivals, and record crop weighment.'
              : 'Enroll an authorized procurement officer or desk operator for an APMC mandi centre.'}
          </p>
        {/if}
      </div>

      <!-- Segmented Tab Switcher -->
      <div class="tab-switcher" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          class="tab-btn"
          class:tab-btn--active={mode === 'login'}
          class:tab-btn--active-op={mode === 'login' && role === 'operator'}
          onclick={() => { mode = 'login'; error = ''; }}
        >
          <svg class="tab-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          <span>{role === 'farmer' ? 'Sign In' : 'Operator Sign In'}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          class="tab-btn"
          class:tab-btn--active={mode === 'register'}
          class:tab-btn--active-op={mode === 'register' && role === 'operator'}
          onclick={() => { mode = 'register'; error = ''; }}
        >
          <svg class="tab-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z"/>
          </svg>
          <span>{role === 'farmer' ? 'Register New Farmer' : 'Register Operator Desk'}</span>
        </button>
      </div>

      {#if error}
        <div class="error-container">
          <ErrorBanner message={error} />
        </div>
      {/if}

      <!-- TAB 1: LOGIN (FARMER & OPERATOR) -->
      {#if mode === 'login'}
        <!-- Auth Method Sub-Toggle (Password vs OTP) -->
        <div class="auth-method-nav">
          <button
            type="button"
            class="method-btn"
            class:method-btn--active={authMethod === 'password'}
            onclick={() => { authMethod = 'password'; error = ''; }}
          >
            🔑 Password Sign In
          </button>
          <button
            type="button"
            class="method-btn"
            class:method-btn--active={authMethod === 'otp'}
            onclick={() => { authMethod = 'otp'; error = ''; }}
          >
            📲 SMS OTP
          </button>
        </div>

        {#if authMethod === 'password'}
          <!-- Password Login Form -->
          <form class="auth-form" onsubmit={(e) => { e.preventDefault(); handlePasswordLogin(); }}>
            <div class="field-group">
              <label class="field-label" for="login-mobile-pwd">
                {role === 'farmer' ? t('login.mobile') : 'Operator Mobile Number'} *
              </label>
              <div class="phone-input-box" class:phone-input-box--op={role === 'operator'}>
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
                  id="login-mobile-pwd"
                  class="phone-input"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel"
                  bind:value={loginPhoneDigits}
                  placeholder={role === 'farmer' ? '98765 43210' : '99999 00001'}
                  required
                  maxlength="14"
                />
              </div>
            </div>

            <div class="field-group">
              <div class="field-label-row">
                <label class="field-label" for="login-password">Password *</label>
                <span class="char-constraint" class:char-constraint--valid={loginPassword.length >= 8 && loginPassword.length <= 64}>
                  {loginPassword.length >= 8 && loginPassword.length <= 64 ? '✓ Valid (8–64)' : 'Min 8 characters required'}
                </span>
              </div>
              <div class="password-input-wrapper">
                <input
                  id="login-password"
                  class="form-input password-input"
                  type={showLoginPassword ? 'text' : 'password'}
                  bind:value={loginPassword}
                  placeholder="Enter your account password"
                  required
                  minlength="8"
                  maxlength="64"
                />
                <button
                  type="button"
                  class="toggle-pwd-btn"
                  onclick={() => (showLoginPassword = !showLoginPassword)}
                  aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                >
                  {showLoginPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {#if loginPassword.length > 0 && loginPassword.length < 8}
                <p class="field-error-msg">⚠️ Password must be at least 8 characters ({8 - loginPassword.length} more needed)</p>
              {/if}
            </div>

            <button class="btn-primary" class:btn-primary--op={role === 'operator'} type="submit" disabled={loading}>
              {#if loading}
                <span class="spinner-icon"></span>
                <span>{t('common.loading')}</span>
              {:else}
                <span>Sign In with Password &rarr;</span>
              {/if}
            </button>
          </form>
        {:else if loginStep === 'phone'}
          <form class="auth-form" onsubmit={(e) => { e.preventDefault(); requestLoginOtp(); }}>
            <div class="field-group">
              <div class="field-label-row">
                <label class="field-label" for="login-mobile">
                  {role === 'farmer' ? t('login.mobile') : 'Operator Mobile Number'}
                </label>
                <span class="direct-badge" class:direct-badge--op={role === 'operator'}>
                  <svg viewBox="0 0 16 16" fill="currentColor" class="badge-icon">
                    <path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clip-rule="evenodd"/>
                  </svg>
                  2-Step OTP Verification
                </span>
              </div>

              <div class="phone-input-box" class:phone-input-box--op={role === 'operator'}>
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
                  placeholder={role === 'farmer' ? '98765 43210' : '99999 00001'}
                  required
                  maxlength="14"
                />
              </div>
              <p class="field-help">{t('login.mobileHint')}</p>
            </div>

            <button class="btn-primary" class:btn-primary--op={role === 'operator'} type="submit" disabled={loading}>
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
              <div class="otp-sent-banner" class:otp-sent-banner--op={role === 'operator'}>
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

            <button class="btn-primary" class:btn-primary--op={role === 'operator'} type="submit" disabled={loading}>
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

        <!-- Quick Demo Profiles for Testing / Hackathon Evaluation -->
        <div class="demo-section" class:demo-section--op={role === 'operator'}>
          <div class="demo-header">
            <div class="demo-header-title">
              <span class="demo-spark">⚡</span>
              <span>1-Click Quick Demo ({role === 'farmer' ? 'Farmer Profiles' : 'Operator Desk'})</span>
            </div>
            <span class="demo-badge" class:demo-badge--op={role === 'operator'}>Evaluation Ready</span>
          </div>
          <p class="demo-subtext">Click any test persona to instantly access their dashboard:</p>

          <div class="demo-grid">
            {#each filteredDemos as d (d.mobileDigits)}
              <button
                type="button"
                class="demo-card"
                onclick={() => handleDemoSelect(d.mobileDigits, d.role)}
                disabled={loading}
              >
                <div class="demo-avatar" class:demo-avatar--op={d.role === 'Operator'}>
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
          {#if role === 'farmer'}
            <span class="footer-prompt">Are you a new farmer visiting for the first time?</span>
            <button type="button" class="link-action-btn" onclick={() => { mode = 'register'; error = ''; }}>
              Register your farmer profile &rarr;
            </button>
          {:else}
            <span class="footer-prompt">Need to register a new operator or centre desk?</span>
            <button type="button" class="link-action-btn link-action-btn--op" onclick={() => { mode = 'register'; error = ''; }}>
              Register operator desk &rarr;
            </button>
          {/if}
        </div>

      <!-- TAB 2: REGISTER -->
      {:else}
        {#if role === 'farmer'}
          <!-- Farmer Registration Form -->
          <form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleFarmerRegister(); }}>
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
              <div class="field-label-row">
                <label class="field-label" for="reg-farmer-password">Create Account Password *</label>
                <span class="char-constraint" class:char-constraint--valid={regFarmerPassword.length >= 8 && regFarmerPassword.length <= 64}>
                  {regFarmerPassword.length >= 8 && regFarmerPassword.length <= 64 ? '✓ Valid (8–64)' : 'Min 8 characters required'}
                </span>
              </div>
              <div class="password-input-wrapper">
                <input
                  id="reg-farmer-password"
                  class="form-input password-input"
                  type={showRegFarmerPassword ? 'text' : 'password'}
                  bind:value={regFarmerPassword}
                  placeholder="At least 8 characters"
                  required
                  minlength="8"
                  maxlength="64"
                />
                <button
                  type="button"
                  class="toggle-pwd-btn"
                  onclick={() => (showRegFarmerPassword = !showRegFarmerPassword)}
                  aria-label={showRegFarmerPassword ? 'Hide password' : 'Show password'}
                >
                  {showRegFarmerPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {#if regFarmerPassword.length > 0 && regFarmerPassword.length < 8}
                <p class="field-error-msg">⚠️ Password must be at least 8 characters ({8 - regFarmerPassword.length} more needed)</p>
              {/if}
              <p class="field-help">Used to sign in directly to your farmer portal anytime</p>
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
                <span>Complete Farmer Registration &rarr;</span>
                <svg class="btn-arrow" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              {/if}
            </button>
          </form>

          <div class="switch-footer">
            <span class="footer-prompt">Already have a farmer profile?</span>
            <button type="button" class="link-action-btn" onclick={() => { mode = 'login'; error = ''; }}>
              Farmer Sign In directly &rarr;
            </button>
          </div>
        {:else}
          <!-- Operator Desk Registration Form -->
          <form class="auth-form" onsubmit={(e) => { e.preventDefault(); handleOperatorRegister(); }}>
            <div class="form-section-title">
              <span>1. Operator Identity & Credentials</span>
            </div>

            <div class="field-group">
              <label class="field-label" for="reg-op-mobile">Official Mobile Number *</label>
              <div class="phone-input-box phone-input-box--op">
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
                  id="reg-op-mobile"
                  class="phone-input"
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel"
                  bind:value={regOpMobile}
                  placeholder="99999 00002"
                  required
                  maxlength="14"
                />
              </div>
              <p class="field-help">Registered official mobile for OTP authentication & token calling</p>
            </div>

            <div class="field-group">
              <div class="field-label-row">
                <label class="field-label" for="reg-op-password">Desk Security Password *</label>
                <span class="char-constraint" class:char-constraint--valid={regOpPassword.length >= 8 && regOpPassword.length <= 64}>
                  {regOpPassword.length >= 8 && regOpPassword.length <= 64 ? '✓ Valid (8–64)' : 'Min 8 characters required'}
                </span>
              </div>
              <div class="password-input-wrapper">
                <input
                  id="reg-op-password"
                  class="form-input password-input"
                  type={showRegOpPassword ? 'text' : 'password'}
                  bind:value={regOpPassword}
                  placeholder="Official desk password (8+ chars)"
                  required
                  minlength="8"
                  maxlength="64"
                />
                <button
                  type="button"
                  class="toggle-pwd-btn"
                  onclick={() => (showRegOpPassword = !showRegOpPassword)}
                  aria-label={showRegOpPassword ? 'Hide password' : 'Show password'}
                >
                  {showRegOpPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {#if regOpPassword.length > 0 && regOpPassword.length < 8}
                <p class="field-error-msg">⚠️ Password must be at least 8 characters ({8 - regOpPassword.length} more needed)</p>
              {/if}
              <p class="field-help">Secures operator desk queue calling and weighment entry</p>
            </div>

            <div class="field-group">
              <label class="field-label" for="reg-op-name">Officer / Operator Full Name *</label>
              <input
                id="reg-op-name"
                class="form-input"
                type="text"
                bind:value={regOpName}
                placeholder="e.g. Rajesh Sharma (Procurement Officer)"
                required
                maxlength="120"
              />
            </div>

            <div class="field-group">
              <div class="field-label-row">
                <label class="field-label" for="reg-op-badge">Employee / Operator Badge ID</label>
                <span class="optional-tag">Optional</span>
              </div>
              <input
                id="reg-op-badge"
                class="form-input"
                type="text"
                bind:value={regOpBadge}
                placeholder="e.g. OP-GJ-0412"
                maxlength="60"
              />
            </div>

            <div class="form-section-title">
              <span>2. Procurement Centre Assignment</span>
            </div>

            <div class="field-group">
              <label class="field-label" for="reg-op-centre">Assigned Procurement Centre *</label>
              <select id="reg-op-centre" class="form-select" bind:value={regOpCentre}>
                {#each OPERATOR_CENTRES as centre (centre.id)}
                  <option value={centre.id}>{centre.name}</option>
                {/each}
              </select>
            </div>

            <div class="field-group">
              <label class="field-label" for="reg-op-dept">Department / Mandi Board</label>
              <select id="reg-op-dept" class="form-select" bind:value={regOpDept}>
                {#each OPERATOR_DEPTS as dept}
                  <option value={dept}>{dept}</option>
                {/each}
              </select>
            </div>

            <div class="privacy-box privacy-box--op">
              <label class="privacy-label">
                <input type="checkbox" bind:checked={opAuthAck} class="privacy-checkbox" />
                <span class="privacy-text">
                  I certify that I am authorized by the Mandi Committee / State Procurement Agency to operate this procurement desk, verify farmer arrivals, and record crop weighment.
                </span>
              </label>
            </div>

            <button class="btn-primary btn-primary--op" type="submit" disabled={loading}>
              {#if loading}
                <span class="spinner-icon"></span>
                <span>Registering Operator Desk...</span>
              {:else}
                <span>Register Operator Desk & Enter &rarr;</span>
                <svg class="btn-arrow" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
              {/if}
            </button>
          </form>

          <div class="switch-footer">
            <span class="footer-prompt">Already have an operator account?</span>
            <button type="button" class="link-action-btn link-action-btn--op" onclick={() => { mode = 'login'; error = ''; }}>
              Operator Sign In directly &rarr;
            </button>
          </div>
        {/if}
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
    max-width: 540px;
    padding: 32px 30px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .auth-card--op {
    border-color: rgba(67, 56, 202, 0.16);
    box-shadow: 0 20px 40px -15px rgba(67, 56, 202, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.03);
  }

  .brand-badge-wrapper--op {
    background: #eef2ff !important;
    border-color: #c7d2fe !important;
  }

  /* Role Selector (Choice Whom to Login / Register) */
  .role-selector-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #edf0ee;
  }

  .role-selector-label {
    font-size: 11.5px;
    font-weight: 750;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
  }

  .role-selector {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .role-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 2px solid #e2e8f0;
    background: #f8fafc;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    text-align: left;
    position: relative;
    user-select: none;
  }

  .role-card:hover {
    border-color: #cbd5e1;
    background: #ffffff;
    transform: translateY(-1px);
  }

  .role-card--farmer.role-card--active {
    border-color: #166534;
    background: #f0fdf4;
    box-shadow: 0 4px 14px rgba(22, 101, 52, 0.12);
  }

  .role-card--operator.role-card--active {
    border-color: #4338ca;
    background: #eef2ff;
    box-shadow: 0 4px 14px rgba(67, 56, 202, 0.12);
  }

  .role-icon-box {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: #dcfce7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }

  .role-icon-box--op {
    background: #e0e7ff;
  }

  .role-text-box {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    overflow: hidden;
  }

  .role-name {
    font-size: 13.5px;
    font-weight: 750;
    color: #1e293b;
  }

  .role-summary {
    font-size: 11px;
    color: #64748b;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .role-badge {
    position: absolute;
    top: -8px;
    right: 10px;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 999px;
    background: #166534;
    color: #ffffff;
    letter-spacing: 0.03em;
    box-shadow: 0 2px 5px rgba(22, 101, 52, 0.3);
  }

  .role-badge--op {
    background: #4338ca;
    box-shadow: 0 2px 5px rgba(67, 56, 202, 0.3);
  }

  @media (max-width: 500px) {
    .auth-card {
      padding: 24px 18px;
      border-radius: 16px;
    }
    .role-selector {
      grid-template-columns: 1fr;
      gap: 8px;
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

  .header-tag--op {
    background: #eef2ff !important;
    border-color: #c7d2fe !important;
    color: #4338ca !important;
  }

  .tag-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #16a34a;
    box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25);
  }

  .tag-pulse--op {
    background: #4338ca !important;
    box-shadow: 0 0 0 2px rgba(67, 56, 202, 0.25) !important;
  }

  .auth-title {
    font-size: 24px;
    font-weight: 800;
    color: #143521;
    letter-spacing: -0.02em;
    margin: 0;
  }

  .auth-title--op {
    color: #1e1b4b !important;
  }

  .auth-subtitle {
    font-size: 14px;
    color: var(--color-muted);
    margin: 0;
    line-height: 1.45;
    max-width: 440px;
  }

  .tab-btn--active-op {
    background: #ffffff !important;
    color: #4338ca !important;
    border-color: #c7d2fe !important;
    box-shadow: 0 1px 3px rgba(67, 56, 202, 0.12) !important;
  }

  .direct-badge--op {
    background: #eef2ff !important;
    border-color: #c7d2fe !important;
    color: #4338ca !important;
  }

  .phone-input-box--op:focus-within {
    border-color: #4338ca !important;
    box-shadow: 0 0 0 3px rgba(67, 56, 202, 0.12) !important;
  }

  .btn-primary--op {
    background: #4338ca !important;
    box-shadow: 0 4px 12px rgba(67, 56, 202, 0.25) !important;
  }

  .btn-primary--op:hover:not(:disabled) {
    background: #3730a3 !important;
    box-shadow: 0 8px 20px -4px rgba(67, 56, 202, 0.4) !important;
  }

  .otp-sent-banner--op {
    background: #eef2ff !important;
    border-color: #c7d2fe !important;
  }

  .demo-section--op {
    border-color: #c7d2fe !important;
    background: #f8faff !important;
  }

  .demo-badge--op {
    background: #eef2ff !important;
    color: #4338ca !important;
    border-color: #c7d2fe !important;
  }

  .demo-avatar--op {
    background: #e0e7ff !important;
    border-color: #c7d2fe !important;
  }

  .link-action-btn--op {
    color: #4338ca !important;
  }

  .link-action-btn--op:hover {
    background: #eef2ff !important;
  }

  .privacy-box--op {
    background: #f8faff !important;
    border-left: 3px solid #4338ca !important;
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

  /* Sub-tab Auth Method Nav (Password vs OTP) */
  .auth-method-nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    background: #f1f5f9;
    padding: 4px;
    border-radius: 10px;
    margin-bottom: 4px;
  }

  .method-btn {
    border: none;
    background: transparent;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .method-btn:hover:not(.method-btn--active) {
    color: #1e293b;
    background: rgba(255, 255, 255, 0.6);
  }

  .method-btn--active {
    background: #ffffff;
    color: #0f172a;
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }

  /* Password Input & Constraint Indicator */
  .password-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input {
    padding-right: 44px !important;
    width: 100%;
  }

  .toggle-pwd-btn {
    position: absolute;
    right: 10px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    transition: transform 0.1s ease;
  }

  .toggle-pwd-btn:hover {
    transform: scale(1.1);
  }

  .char-constraint {
    font-size: 11.5px;
    font-weight: 600;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
    padding: 2px 7px;
    border-radius: 6px;
    transition: all 0.2s ease;
  }

  .char-constraint--valid {
    color: #15803d;
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .field-error-msg {
    font-size: 12px;
    font-weight: 600;
    color: #b91c1c;
    margin: 2px 0 0;
  }
</style>
