<script lang="ts">
  import { todayIso, formatDate } from '$lib/format';
  import { i18n } from '$lib/i18n.svelte';

  let {
    value = $bindable(todayIso()),
    onchange
  }: {
    value?: string;
    onchange?: (date: string) => void;
  } = $props();

  const today = todayIso();

  // Selected date components
  let viewYear = $state(Number(value ? value.slice(0, 4) : today.slice(0, 4)));
  let viewMonth = $state(Number(value ? value.slice(5, 7) : today.slice(5, 7)) - 1); // 0-indexed (0=Jan, 11=Dec)

  const MONTH_NAMES_EN = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const MONTH_NAMES_HI = [
    'जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
    'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'
  ];

  const WEEK_DAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const WEEK_DAYS_HI = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];

  const monthName = $derived(
    i18n.lang === 'hi' ? MONTH_NAMES_HI[viewMonth] : MONTH_NAMES_EN[viewMonth]
  );
  const weekDays = $derived(i18n.lang === 'hi' ? WEEK_DAYS_HI : WEEK_DAYS_EN);

  function prevMonth() {
    if (viewMonth === 0) {
      viewMonth = 11;
      viewYear -= 1;
    } else {
      viewMonth -= 1;
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      viewMonth = 0;
      viewYear += 1;
    } else {
      viewMonth += 1;
    }
  }

  function prevYear() {
    viewYear -= 1;
  }

  function nextYear() {
    viewYear += 1;
  }

  function goToToday() {
    const [y, m] = today.split('-').map(Number);
    viewYear = y;
    viewMonth = m - 1;
    selectDate(today);
  }

  function selectDate(iso: string) {
    if (iso < today) return; // cannot select past dates
    value = iso;
    onchange?.(iso);
  }

  interface CalendarDay {
    dayNumber: number;
    isoDate: string;
    isCurrentMonth: boolean;
    isPast: boolean;
    isToday: boolean;
    isSelected: boolean;
  }

  const calendarDays = $derived.by<CalendarDay[]>(() => {
    const days: CalendarDay[] = [];

    // First day of month (0 = Sun, ..., 6 = Sat)
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    // Days in current month
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // Days in previous month
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    // Previous month padding days
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const iso = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        dayNumber: dayNum,
        isoDate: iso,
        isCurrentMonth: false,
        isPast: iso < today,
        isToday: iso === today,
        isSelected: iso === value
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dayNumber: d,
        isoDate: iso,
        isCurrentMonth: true,
        isPast: iso < today,
        isToday: iso === today,
        isSelected: iso === value
      });
    }

    // Next month padding to make complete rows (at least 35 or 42 cells)
    const totalCurrent = days.length;
    const targetLength = totalCurrent <= 35 ? 35 : 42;
    const remaining = targetLength - totalCurrent;

    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const iso = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dayNumber: d,
        isoDate: iso,
        isCurrentMonth: false,
        isPast: iso < today,
        isToday: iso === today,
        isSelected: iso === value
      });
    }

    return days;
  });
</script>

<div class="calendar-card">
  <!-- Top Navigation: < Month Year > -->
  <div class="calendar-header">
    <button
      type="button"
      class="nav-arrow-btn"
      onclick={prevMonth}
      aria-label="Previous month"
      title="Previous month"
    >
      ‹
    </button>

    <div class="calendar-title">
      <span class="month-label">{monthName}</span>
      <span class="year-label">{viewYear}</span>
    </div>

    <button
      type="button"
      class="nav-arrow-btn nav-arrow-btn--accent"
      onclick={nextMonth}
      aria-label="Next month"
      title="Next month"
    >
      ›
    </button>
  </div>

  <!-- Weekday Columns Header -->
  <div class="weekdays-grid">
    {#each weekDays as dayName}
      <span class="weekday-cell">{dayName}</span>
    {/each}
  </div>

  <!-- 7-Column Days Grid -->
  <div class="days-grid">
    {#each calendarDays as day (day.isoDate + (day.isCurrentMonth ? '_cur' : '_pad'))}
      <button
        type="button"
        class="day-cell"
        class:day-cell--current-month={day.isCurrentMonth}
        class:day-cell--other-month={!day.isCurrentMonth}
        class:day-cell--today={day.isToday && !day.isSelected}
        class:day-cell--selected={day.isSelected}
        class:day-cell--past={day.isPast}
        disabled={day.isPast}
        onclick={() => selectDate(day.isoDate)}
        aria-label="{formatDate(day.isoDate)}"
      >
        <span class="day-number">{day.dayNumber}</span>
      </button>
    {/each}
  </div>

  <!-- Quick Navigation Footer (Prev Year, Today, Next Year) -->
  <div class="calendar-footer">
    <button type="button" class="quick-btn" onclick={prevYear}>
      {i18n.lang === 'hi' ? 'पिछला वर्ष' : 'Prev Year'}
    </button>
    <button type="button" class="quick-btn quick-btn--today" onclick={goToToday}>
      {i18n.lang === 'hi' ? 'आज' : 'Today'}
    </button>
    <button type="button" class="quick-btn" onclick={nextYear}>
      {i18n.lang === 'hi' ? 'अगला वर्ष' : 'Next Year'}
    </button>
  </div>

  <!-- Selected Date Feedback Badge -->
  <div class="selected-badge">
    <span class="selected-badge__label">{i18n.lang === 'hi' ? 'चयनित तारीख:' : 'Selected Date:'}</span>
    <span class="selected-badge__val">📅 {formatDate(value)}</span>
  </div>
</div>

<style>
  .calendar-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 24px;
    padding: 20px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
    max-width: 360px;
    margin: 0 auto;
    user-select: none;
    transition: all 0.2s ease;
  }

  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    padding: 0 4px;
  }

  .calendar-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .month-label {
    font-size: 19px;
    font-weight: 700;
    color: #1e293b;
    letter-spacing: -0.2px;
  }

  .year-label {
    font-size: 17px;
    font-weight: 600;
    color: #64748b;
  }

  .nav-arrow-btn {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    border: 1.5px solid #e2e8f0;
    background: #ffffff;
    color: #334155;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .nav-arrow-btn:hover {
    border-color: #6366f1;
    color: #6366f1;
    background: #f5f3ff;
    transform: scale(1.05);
  }

  /* Right arrow squircle outline matching the reference photo */
  .nav-arrow-btn--accent {
    border-color: #6366f1;
    color: #6366f1;
    background: #ffffff;
  }

  .nav-arrow-btn--accent:hover {
    background: #6366f1;
    color: #ffffff;
  }

  .weekdays-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    margin-bottom: 10px;
    text-align: center;
  }

  .weekday-cell {
    font-size: 13.5px;
    font-weight: 650;
    color: #334155;
    padding: 4px 0;
  }

  .days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 5px;
    margin-bottom: 16px;
  }

  .day-cell {
    width: 38px;
    height: 38px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 14.5px;
    font-weight: 500;
    color: #1e293b;
    transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0;
  }

  .day-cell--current-month {
    color: #1e293b;
  }

  .day-cell--other-month {
    color: #cbd5e1;
    font-weight: 400;
  }

  .day-cell--past {
    color: #e2e8f0 !important;
    cursor: not-allowed !important;
    pointer-events: none;
  }

  .day-cell--today {
    border: 1.5px solid #6366f1;
    color: #6366f1;
    font-weight: 700;
  }

  /* Selected day matching the vibrant purple circular badge from the reference GIF */
  .day-cell--selected {
    background: #6366f1 !important;
    color: #ffffff !important;
    font-weight: 700 !important;
    box-shadow: 0 4px 14px rgba(99, 102, 241, 0.45) !important;
    transform: scale(1.08);
  }

  .day-cell:not(.day-cell--selected):not(:disabled):hover {
    background: #f5f3ff;
    color: #6366f1;
  }

  .day-number {
    line-height: 1;
  }

  /* Footer matching the sleek toolbar in the reference photo */
  .calendar-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 6px;
    background: #f8fafc;
    border-radius: 14px;
  }

  .quick-btn {
    flex: 1;
    padding: 7px 8px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: #475569;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: center;
    white-space: nowrap;
  }

  .quick-btn:hover {
    background: #ffffff;
    color: #6366f1;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  .quick-btn--today {
    background: #ffffff;
    color: #6366f1;
    font-weight: 700;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  .selected-badge {
    margin-top: 12px;
    padding: 7px 12px;
    background: #f5f3ff;
    border: 1px solid #e0e7ff;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
  }

  .selected-badge__label {
    color: #4338ca;
    font-weight: 600;
  }

  .selected-badge__val {
    color: #6366f1;
    font-weight: 700;
  }
</style>
