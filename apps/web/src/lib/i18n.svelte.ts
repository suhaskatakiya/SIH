/**
 * Bilingual labels (§5.5). Every user-facing string used in chrome, actions,
 * field labels, and status pills lives here with English + Hindi. `t(key)` reads
 * the current language reactively (this is a `$state`), so switching language
 * anywhere updates every screen.
 *
 * Domain values that are essentially codes (commodity codes, references) are NOT
 * translated. Free-form profile text (names, villages) is user data, not labels.
 */

export type Lang = 'en' | 'hi';

export const i18n = $state<{ lang: Lang }>({ lang: 'en' });

export function setLang(l: string | null | undefined): void {
  i18n.lang = l === 'hi' ? 'hi' : 'en';
}

export function toggleLang(): void {
  i18n.lang = i18n.lang === 'hi' ? 'en' : 'hi';
}

type Entry = { en: string; hi: string };

const dict: Record<string, Entry> = {
  // ---- brand / generic ----
  'app.name': { en: 'CropSaathi', hi: 'क्रॉपसाथी' },
  'app.tagline': {
    en: 'Book a procurement slot. Skip the guesswork.',
    hi: 'खरीद स्लॉट बुक करें। अनुमान लगाना छोड़ें।'
  },
  'common.loading': { en: 'Loading…', hi: 'लोड हो रहा है…' },
  'common.retry': { en: 'Try again', hi: 'फिर से कोशिश करें' },
  'common.back': { en: 'Back', hi: 'वापस' },
  'common.next': { en: 'Next', hi: 'आगे' },
  'common.cancel': { en: 'Cancel', hi: 'रद्द करें' },
  'common.save': { en: 'Save', hi: 'सहेजें' },
  'common.continue': { en: 'Continue', hi: 'जारी रखें' },
  'common.none': { en: 'Nothing yet', hi: 'अभी कुछ नहीं' },
  'common.language': { en: 'भाषा / Language', hi: 'भाषा / Language' },
  'common.logout': { en: 'Log out', hi: 'लॉग आउट' },
  'common.refresh': { en: 'Refresh', hi: 'ताज़ा करें' },
  'common.optional': { en: 'optional', hi: 'वैकल्पिक' },

  // ---- landing ----
  'landing.lede': {
    en: 'Reserve a time at your procurement centre, watch the live queue, and track procurement and payment — all from your phone.',
    hi: 'अपने खरीद केंद्र पर समय आरक्षित करें, लाइव कतार देखें, और खरीद व भुगतान ट्रैक करें — सब आपके फ़ोन से।'
  },
  'landing.cta': { en: 'Get started', hi: 'शुरू करें' },
  'landing.operator': { en: 'I am a centre operator', hi: 'मैं केंद्र संचालक हूँ' },

  // ---- login ----
  'login.title': { en: 'Log in', hi: 'लॉग इन' },
  'login.mobile': { en: 'Mobile number', hi: 'मोबाइल नंबर' },
  'login.mobileHint': { en: 'We will send a one-time code by SMS.', hi: 'हम SMS से एक बार का कोड भेजेंगे।' },
  'login.sendOtp': { en: 'Send code', hi: 'कोड भेजें' },
  'login.otp': { en: 'One-time code', hi: 'एक बार का कोड' },
  'login.otpHint': { en: 'Enter the 6-digit code sent to your phone.', hi: 'फ़ोन पर भेजा गया 6-अंकीय कोड दर्ज करें।' },
  'login.verify': { en: 'Verify & continue', hi: 'सत्यापित करें और जारी रखें' },
  'login.changeNumber': { en: 'Change number', hi: 'नंबर बदलें' },
  'login.resend': { en: 'Resend code', hi: 'कोड फिर भेजें' },
  'login.sentTo': { en: 'Code sent to', hi: 'कोड भेजा गया' },

  // ---- register ----
  'register.title': { en: 'Complete your profile', hi: 'अपनी प्रोफ़ाइल पूरी करें' },
  'register.sub': { en: 'This is used on your procurement records.', hi: 'इसका उपयोग आपके खरीद रिकॉर्ड में होता है।' },
  'register.fullName': { en: 'Full name', hi: 'पूरा नाम' },
  'register.state': { en: 'State', hi: 'राज्य' },
  'register.district': { en: 'District', hi: 'ज़िला' },
  'register.village': { en: 'Village', hi: 'गाँव' },
  'register.externalRef': { en: 'Farmer ID / registration no.', hi: 'किसान आईडी / पंजीकरण संख्या' },
  'register.language': { en: 'Preferred language', hi: 'पसंदीदा भाषा' },
  'register.privacy': {
    en: 'I agree that my details may be used to process procurement at this centre.',
    hi: 'मैं सहमत हूँ कि इस केंद्र पर खरीद के लिए मेरी जानकारी का उपयोग किया जा सकता है।'
  },
  'register.submit': { en: 'Save profile', hi: 'प्रोफ़ाइल सहेजें' },

  // ---- farmer nav ----
  'nav.home': { en: 'Home', hi: 'होम' },
  'nav.book': { en: 'Book', hi: 'बुक' },
  'nav.queue': { en: 'Queue', hi: 'कतार' },
  'nav.status': { en: 'Status', hi: 'स्थिति' },
  'nav.payment': { en: 'Payment', hi: 'भुगतान' },

  // ---- farmer dashboard ----
  'dash.title': { en: 'Your dashboard', hi: 'आपका डैशबोर्ड' },
  'dash.upcoming': { en: 'Upcoming booking', hi: 'आगामी बुकिंग' },
  'dash.noBooking': { en: 'No upcoming booking', hi: 'कोई आगामी बुकिंग नहीं' },
  'dash.noBookingSub': { en: 'Book a slot at your procurement centre to get started.', hi: 'शुरू करने के लिए अपने खरीद केंद्र पर स्लॉट बुक करें।' },
  'dash.bookNow': { en: 'Book a slot', hi: 'स्लॉट बुक करें' },
  'dash.viewQueue': { en: 'View live queue', hi: 'लाइव कतार देखें' },
  'dash.viewStatus': { en: 'View procurement', hi: 'खरीद देखें' },
  'dash.viewPayment': { en: 'View payment', hi: 'भुगतान देखें' },

  // ---- book ----
  'book.title': { en: 'Book a slot', hi: 'स्लॉट बुक करें' },
  'book.commodity': { en: 'Commodity', hi: 'जिंस' },
  'book.date': { en: 'Date', hi: 'तारीख' },
  'book.findCentres': { en: 'Find centres', hi: 'केंद्र खोजें' },
  'book.centres': { en: 'Centres', hi: 'केंद्र' },
  'book.noCentres': { en: 'No centres for this commodity and date.', hi: 'इस जिंस और तारीख के लिए कोई केंद्र नहीं।' },
  'book.chooseSlot': { en: 'Choose a slot', hi: 'स्लॉट चुनें' },
  'book.noSlots': { en: 'No slots open on this date.', hi: 'इस तारीख पर कोई स्लॉट उपलब्ध नहीं।' },
  'book.remaining': { en: 'left', hi: 'शेष' },
  'book.full': { en: 'Full', hi: 'भरा हुआ' },
  'book.quantity': { en: 'Expected quantity (qtl)', hi: 'अनुमानित मात्रा (क्विंटल)' },
  'book.confirm': { en: 'Confirm booking', hi: 'बुकिंग पक्की करें' },
  'book.success': { en: 'Booking confirmed', hi: 'बुकिंग पक्की हुई' },

  // ---- queue ----
  'queue.title': { en: 'Live queue', hi: 'लाइव कतार' },
  'queue.position': { en: 'Your position', hi: 'आपकी स्थिति' },
  'queue.ahead': { en: 'ahead of you', hi: 'आपसे आगे' },
  'queue.eta': { en: 'Estimated wait', hi: 'अनुमानित प्रतीक्षा' },
  'queue.none': { en: 'You are not in a queue right now.', hi: 'अभी आप किसी कतार में नहीं हैं।' },
  'queue.noneSub': { en: 'The centre will check you in when you arrive.', hi: 'पहुँचने पर केंद्र आपको चेक-इन करेगा।' },
  'queue.updated': { en: 'Updated', hi: 'अद्यतन' },

  // ---- status / procurement ----
  'status.title': { en: 'Procurement status', hi: 'खरीद स्थिति' },
  'status.none': { en: 'Procurement has not started.', hi: 'खरीद शुरू नहीं हुई है।' },
  'status.noneSub': { en: 'It begins once the centre calls you in for service.', hi: 'जब केंद्र आपको सेवा के लिए बुलाता है तब यह शुरू होती है।' },
  'status.quality': { en: 'Quality', hi: 'गुणवत्ता' },
  'status.quantity': { en: 'Weighed quantity', hi: 'तौली गई मात्रा' },
  'status.rate': { en: 'Rate per qtl', hi: 'प्रति क्विंटल दर' },
  'status.amount': { en: 'Amount', hi: 'राशि' },
  'status.receipt': { en: 'Receipt', hi: 'रसीद' },
  'status.timeline': { en: 'Timeline', hi: 'समय-रेखा' },

  // ---- payment ----
  'payment.title': { en: 'Payment', hi: 'भुगतान' },
  'payment.none': { en: 'No payment yet.', hi: 'अभी कोई भुगतान नहीं।' },
  'payment.noneSub': { en: 'Payment starts after procurement is accepted.', hi: 'खरीद स्वीकृत होने के बाद भुगतान शुरू होता है।' },
  'payment.reference': { en: 'Reference', hi: 'संदर्भ' },
  'payment.amount': { en: 'Amount', hi: 'राशि' },

  // ---- operator ----
  'op.brand': { en: 'CropSaathi · Operator', hi: 'क्रॉपसाथी · संचालक' },
  'op.dashboard': { en: 'Dashboard', hi: 'डैशबोर्ड' },
  'op.slots': { en: 'Slots', hi: 'स्लॉट' },
  'op.queue': { en: 'Queue', hi: 'कतार' },
  'op.procurement': { en: 'Procurement', hi: 'खरीद' },
  'op.today': { en: 'Today', hi: 'आज' },
  'op.bookings': { en: 'Bookings', hi: 'बुकिंग' },
  'op.checkedIn': { en: 'Checked in', hi: 'चेक-इन' },
  'op.waiting': { en: 'Waiting', hi: 'प्रतीक्षारत' },
  'op.inService': { en: 'In service', hi: 'सेवा में' },
  'op.completed': { en: 'Completed', hi: 'पूर्ण' },
  'op.callNext': { en: 'Call next farmer', hi: 'अगले किसान को बुलाएँ' },
  'op.checkIn': { en: 'Check in', hi: 'चेक-इन' },
  'op.startService': { en: 'Start service', hi: 'सेवा शुरू करें' },
  'op.completeService': { en: 'Complete', hi: 'पूर्ण करें' },
  'op.openProcurement': { en: 'Open procurement', hi: 'खरीद खोलें' },
  'op.noBookings': { en: 'No bookings for this date.', hi: 'इस तारीख के लिए कोई बुकिंग नहीं।' },
  'op.addSlot': { en: 'Add slot', hi: 'स्लॉट जोड़ें' },
  'op.capacity': { en: 'Capacity', hi: 'क्षमता' },
  'op.booked': { en: 'Booked', hi: 'बुक' },
  'op.active': { en: 'Active', hi: 'सक्रिय' },
  'op.inactive': { en: 'Inactive', hi: 'निष्क्रिय' },
  'op.disable': { en: 'Disable', hi: 'बंद करें' },
  'op.enable': { en: 'Enable', hi: 'चालू करें' },
  'op.startTime': { en: 'Start', hi: 'आरंभ' },
  'op.endTime': { en: 'End', hi: 'समाप्ति' },
  'op.recordQuality': { en: 'Start quality check', hi: 'गुणवत्ता जाँच शुरू करें' },
  'op.acceptQuality': { en: 'Accept quality', hi: 'गुणवत्ता स्वीकारें' },
  'op.rejectQuality': { en: 'Reject quality', hi: 'गुणवत्ता अस्वीकारें' },
  'op.recordWeight': { en: 'Record weighment', hi: 'तौल दर्ज करें' },
  'op.acceptProcurement': { en: 'Accept procurement', hi: 'खरीद स्वीकारें' },
  'op.generateReceipt': { en: 'Generate receipt', hi: 'रसीद बनाएँ' },
  'op.reason': { en: 'Reason', hi: 'कारण' },
  'op.selectFarmer': { en: 'Select a farmer from the queue to manage procurement.', hi: 'खरीद प्रबंधन हेतु कतार से किसान चुनें।' },
  'op.markInitiated': { en: 'Mark initiated', hi: 'आरंभ चिह्नित करें' },
  'op.markProcessing': { en: 'Mark processing', hi: 'प्रक्रियाधीन चिह्नित करें' },
  'op.markCredited': { en: 'Mark credited', hi: 'जमा चिह्नित करें' },
  'op.markFailed': { en: 'Mark failed', hi: 'विफल चिह्नित करें' },

  // ---- misc labels ----
  'label.centre': { en: 'Centre', hi: 'केंद्र' },
  'label.reference': { en: 'Reference', hi: 'संदर्भ' },
  'label.farmer': { en: 'Farmer', hi: 'किसान' },
  'label.commodity': { en: 'Commodity', hi: 'जिंस' },
  'label.quantity': { en: 'Quantity', hi: 'मात्रा' },
  'label.slot': { en: 'Slot', hi: 'स्लॉट' },
  'label.date': { en: 'Date', hi: 'तारीख' },
  'label.status': { en: 'Status', hi: 'स्थिति' }
};

const STATUS_LABELS: Record<string, Entry> = {
  // booking
  'BOOKED': { en: 'Booked', hi: 'बुक की गई' },
  'CHECKED_IN': { en: 'Checked in', hi: 'चेक-इन' },
  'IN_QUEUE': { en: 'In queue', hi: 'कतार में' },
  'IN_SERVICE': { en: 'In service', hi: 'सेवा में' },
  'COMPLETED': { en: 'Completed', hi: 'पूर्ण' },
  'CANCELLED': { en: 'Cancelled', hi: 'रद्द' },
  // queue
  'WAITING': { en: 'Waiting', hi: 'प्रतीक्षारत' },
  'CALLED': { en: 'Called', hi: 'बुलाया गया' },
  // procurement status
  'NOT_STARTED': { en: 'Not started', hi: 'शुरू नहीं' },
  'QUALITY_IN_PROGRESS': { en: 'Quality in progress', hi: 'गुणवत्ता जाँच जारी' },
  'QUALITY_ACCEPTED': { en: 'Quality accepted', hi: 'गुणवत्ता स्वीकृत' },
  'QUALITY_REJECTED': { en: 'Quality rejected', hi: 'गुणवत्ता अस्वीकृत' },
  'WEIGHMENT_RECORDED': { en: 'Weighment recorded', hi: 'तौल दर्ज' },
  'PROCUREMENT_ACCEPTED': { en: 'Procurement accepted', hi: 'खरीद स्वीकृत' },
  'RECEIPT_GENERATED': { en: 'Receipt generated', hi: 'रसीद जारी' },
  // quality
  'PENDING': { en: 'Pending', hi: 'लंबित' },
  'ACCEPTED': { en: 'Accepted', hi: 'स्वीकृत' },
  'REJECTED': { en: 'Rejected', hi: 'अस्वीकृत' },
  // payment
  'INITIATED': { en: 'Initiated', hi: 'आरंभ' },
  'PROCESSING': { en: 'Processing', hi: 'प्रक्रियाधीन' },
  'CREDITED': { en: 'Credited', hi: 'जमा' },
  'FAILED': { en: 'Failed', hi: 'विफल' },
  // centre availability
  'AVAILABLE': { en: 'Available', hi: 'उपलब्ध' },
  'FULL': { en: 'Full', hi: 'भरा हुआ' }
};

const EVENT_LABELS: Record<string, Entry> = {
  QUALITY_STARTED: { en: 'Quality check started', hi: 'गुणवत्ता जाँच शुरू' },
  QUALITY_ACCEPTED: { en: 'Quality accepted', hi: 'गुणवत्ता स्वीकृत' },
  QUALITY_REJECTED: { en: 'Quality rejected', hi: 'गुणवत्ता अस्वीकृत' },
  WEIGHMENT_RECORDED: { en: 'Weighment recorded', hi: 'तौल दर्ज' },
  PROCUREMENT_ACCEPTED: { en: 'Procurement accepted', hi: 'खरीद स्वीकृत' },
  RECEIPT_GENERATED: { en: 'Receipt generated', hi: 'रसीद जारी' }
};

const ERROR_MESSAGES: Record<string, Entry> = {
  INVALID_MOBILE: { en: 'Enter a valid mobile number.', hi: 'मान्य मोबाइल नंबर दर्ज करें।' },
  OTP_RATE_LIMITED: { en: 'Too many requests. Wait a moment and try again.', hi: 'बहुत अधिक अनुरोध। थोड़ी देर बाद कोशिश करें।' },
  INVALID_OTP: { en: 'That code is not correct.', hi: 'यह कोड सही नहीं है।' },
  OTP_EXPIRED: { en: 'That code has expired. Request a new one.', hi: 'यह कोड समाप्त हो गया। नया कोड लें।' },
  OTP_ATTEMPTS_EXCEEDED: { en: 'Too many attempts. Request a new code.', hi: 'बहुत अधिक प्रयास। नया कोड लें।' },
  PRIVACY_ACK_REQUIRED: { en: 'Please accept to continue.', hi: 'जारी रखने के लिए कृपया सहमति दें।' },
  SLOT_FULL: { en: 'This slot just filled up. Pick another.', hi: 'यह स्लॉट अभी भर गया। दूसरा चुनें।' },
  DUPLICATE_ACTIVE_BOOKING: { en: 'You already have an active booking.', hi: 'आपके पास पहले से एक सक्रिय बुकिंग है।' },
  INVALID_QUANTITY: { en: 'Enter a quantity greater than zero.', hi: 'शून्य से अधिक मात्रा दर्ज करें।' },
  REJECTION_REASON_REQUIRED: { en: 'A reason is required to reject.', hi: 'अस्वीकार करने के लिए कारण आवश्यक है।' },
  INVALID_PROCUREMENT_TRANSITION: { en: 'That step is not allowed right now.', hi: 'यह चरण अभी संभव नहीं है।' },
  INVALID_PAYMENT_TRANSITION: { en: 'That payment change is not allowed.', hi: 'यह भुगतान परिवर्तन संभव नहीं है।' },
  NO_WAITING_FARMERS: { en: 'No farmers are waiting.', hi: 'कोई किसान प्रतीक्षारत नहीं।' },
  NOT_AVAILABLE_LIVE: {
    en: 'This operator view needs a backend queue-listing endpoint (not in Phase 1). Use mock mode for the full operator demo.',
    hi: 'इस संचालक दृश्य हेतु बैकएंड कतार-सूची एंडपॉइंट चाहिए (फेज़ 1 में नहीं)। पूर्ण संचालक डेमो हेतु मॉक मोड उपयोग करें।'
  },
  UNAUTHENTICATED: { en: 'Please log in again.', hi: 'कृपया फिर से लॉग इन करें।' },
  INTERNAL_ERROR: { en: 'Something went wrong. Please try again.', hi: 'कुछ गलत हुआ। कृपया फिर से कोशिश करें।' }
};

/** Translate a label key. Unknown keys return the key itself (visible in dev). */
export function t(key: string): string {
  const e = dict[key];
  return e ? e[i18n.lang] : key;
}

/** Human label for any status enum value (booking/queue/procurement/quality/payment). */
export function statusLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const e = STATUS_LABELS[value];
  return e ? e[i18n.lang] : value;
}

/** Human label for a procurement event type (timeline). */
export function eventLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const e = EVENT_LABELS[value];
  return e ? e[i18n.lang] : value;
}

/** Friendly message for an error code; falls back to the raw server message. */
export function errorMessage(code: string, fallback: string): string {
  const e = ERROR_MESSAGES[code];
  return e ? e[i18n.lang] : fallback;
}
