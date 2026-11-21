/* Besan Beauty - customer reply alerts (opt-in, generic text only). Chat and login are unchanged. */
(function () {
  const isEN = () => document.documentElement.lang === 'en';
  const T = {
    ar: { on: 'فعّلي إشعارات الردود 🔔', done: 'إشعارات الردود مفعّلة ✓', ios: 'لإشعارات الردود على الآيفون: ثبّتي التطبيق من زر المشاركة ثم «إضافة إلى الشاشة الرئيسية» وافتحيه منها.', denied: 'الإشعارات متوقفة من إعدادات المتصفح لهذا الموقع.', err: 'تعذر تفعيل الإشعارات حاليًا، جرّبي مرة أخرى.' },
    en: { on: 'Turn on reply notifications 🔔', done: 'Reply notifications on ✓', ios: 'For notifications on iPhone: install the app via Share, then "Add to Home Screen", and open it from there.', denied: 'Notifications are blocked for this site in browser settings.', err: 'Could not turn notifications on, please try again.' }
  };
  const tr = k => (isEN() ? T.en : T.ar)[k];
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function client() { return window.BESAN_SUPABASE; }
  function keyBytes() {
    const key = (window.APP_CONFIG && window.APP_CONFIG.VAPID_PUBLIC_KEY) || '';
    if (!key || key.includes('PASTE_')) return null;
    const n = key.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(n + '='.repeat((4 - n.length % 4) % 4)), c => c.charCodeAt(0));
  }
  function bar() {
    let el = document.getElementById('cpush-bar');
    if (el) return el;
    const anchor = document.querySelector('#support-drawer .quick-actions');
    if (!anchor) return null;
    el = document.createElement('div');
    el.id = 'cpush-bar';
    el.style.cssText = 'display:none;padding:6px 14px;text-align:center;font-family:inherit;';
    el.innerHTML = '<button type="button" id="cpush-btn" style="border:1px solid rgba(201,30,108,.25);border-radius:14px;padding:7px 14px;background:#fff;color:#bd286d;font:700 .8rem Cairo,Tahoma,sans-serif;cursor:pointer"></button><small id="cpush-note" style="display:block;margin-top:4px;color:#9a7a8b;font-size:.7rem;line-height:1.6"></small>';
    anchor.parentNode.insertBefore(el, anchor);
    el.querySelector('#cpush-btn').addEventListener('click', () => enable(el));
    return el;
  }
  function show(el, btnText, note, disabled) {
    el.style.display = 'block';
    // compact one-line text when there is no button (e.g. "notifications on"); the full padding only for the opt-in button
    el.style.padding = btnText ? '6px 14px' : '0 14px 4px';
    el.querySelector('#cpush-note').style.marginTop = btnText ? '4px' : '0';
    el.querySelector('#cpush-note').style.textAlign = btnText ? 'center' : 'start';
    const b = el.querySelector('#cpush-btn');
    b.textContent = btnText || '';
    b.style.display = btnText ? 'inline-block' : 'none';
    b.disabled = !!disabled;
    el.querySelector('#cpush-note').textContent = note || '';
  }
  async function register(sub, phone) {
    const c = client();
    if (!c) throw new Error('no client');
    const { error } = await c.functions.invoke('push-notifications', { body: { audience: 'customer', phone, subscription: sub.toJSON() } });
    if (error) throw error;
  }
  async function enable(el) {
    const phone = localStorage.getItem('user_chat_phone');
    if (!phone) return;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { show(el, '', tr('denied')); return; }
      const reg = await navigator.serviceWorker.ready;
      const k = keyBytes();
      if (!k) throw new Error('no key');
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: k });
      await register(sub, phone);
      show(el, '', tr('done'));
    } catch (e) { show(el, tr('on'), tr('err')); }
  }
  window.besanCustomerPushInit = async function (phone) {
    try {
      const el = bar();
      if (!el || !phone || !supported) { if (el) el.style.display = 'none'; return; }
      if (isIOS && !standalone) { show(el, '', tr('ios')); return; }
      if (Notification.permission === 'denied') { show(el, '', tr('denied')); return; }
      if (Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) { await register(sub, phone).catch(() => {}); show(el, '', tr('done')); return; }
      }
      show(el, tr('on'), '');
    } catch (_) { /* never break the chat */ }
  };
  window.besanCustomerPushOff = async function () {
    try {
      if (!supported) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      const c = client();
      if (c) await c.functions.invoke('push-notifications', { body: { audience: 'customer', action: 'unregister', subscription: { endpoint: sub.endpoint } } });
      await sub.unsubscribe();
    } catch (_) { /* ignore */ }
  };
})();
