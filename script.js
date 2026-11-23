// تجربة تثبيت التطبيق وإدارة الإشعارات موحّدة في pwa.js

// إعدادات الربط مع Supabase
const supabaseUrl = APP_CONFIG.SUPABASE_URL;
const supabaseKey = APP_CONFIG.SUPABASE_ANON_KEY;
// الموقع للعميلات دايماً زائر عادي: مفيش جلسة محفوظة (حتى لو لوحة الأدمن مفتوحة على نفس المتصفح)
const _supabase = supabase.createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
window.BESAN_SUPABASE = _supabase;

// متغيرات الحالة العامة للموقع
// Storefront is Arabic-only: force Arabic and drop any old English preference/cache
(function () { try { document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; ['lang','language','site_lang','besan_lang','autoTranslationCache_v2'].forEach(function (k) { localStorage.removeItem(k); sessionStorage.removeItem(k); }); } catch (e) {} })();
function LT(ar, en) { return document.documentElement.lang === 'en' ? en : ar; }
let cart = []; // مصفوفة لتخزين عناصر السلة
let wishlist = JSON.parse(localStorage.getItem('wishlist')) || []; // قائمة المفضلة من التخزين المحلي
let wishlistNewCount = parseInt(localStorage.getItem('wishlistNewCount')) || 0; // عداد المفضلة الجديد
let supportNewCount = parseInt(localStorage.getItem('supportNewCount')) || 0; // عداد رسائل الدعم الجديدة مع حفظ الحالة
let currentView = 'home'; // العرض الحالي (الرئيسية أو المفضلة)
let currentPage = 0;
const itemsPerPage = 8;
let hasMore = true;
let lastProcessedBroadcastId = null; // تعريف المتغير المفقود
let lastProcessedMsgText = null; // تعريف المتغير المفقود

// قفل السكرول بيتحسب من الحالة الفعلية للطبقات المفتوحة (مش عدّاد) عشان ما يعلقش أبداً
function syncScrollLock() {
    const isOpen = id => { const el = document.getElementById(id); return !!(el && el.classList.contains('open')); };
    const details = document.getElementById('book-details-page');
    const pay = document.getElementById('pay-overlay');
    const locked = isOpen('cart-drawer') || isOpen('support-drawer') ||
        !!(details && details.classList.contains('active')) ||
        !!(pay && pay.style.display !== 'none' && pay.style.display !== '');
    document.body.classList.toggle('lock-scroll', locked);
    document.documentElement.classList.toggle('lock-scroll', locked);
}
function addLockScroll() { syncScrollLock(); setTimeout(syncScrollLock, 60); }
function removeLockScroll() { syncScrollLock(); setTimeout(syncScrollLock, 60); setTimeout(syncScrollLock, 600); }
// شبكة أمان: لو أي حاجة حصلت غلط، القفل بيتصلّح لوحده
document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(syncScrollLock);
    ['cart-drawer', 'support-drawer', 'book-details-page', 'pay-overlay'].forEach(id => {
        const element = document.getElementById(id);
        if (element) observer.observe(element, { attributes: true, attributeFilter: ['class', 'style'] });
    });
    syncScrollLock();
});
window.addEventListener('pageshow', syncScrollLock);
document.addEventListener('visibilitychange', syncScrollLock);

// وظيفة ذكية للتحكم في سكرول الطبقات: تمنع سكرول صفحة التفاصيل إذا كانت السلة أو الدعم مفتوحين فوقها
function updateLayersScroll() {
    const detailsPage = document.getElementById('book-details-page');
    const isCartOpen = document.getElementById('cart-drawer').classList.contains('open');
    const isSupportOpen = document.getElementById('support-drawer').classList.contains('open');

    if (detailsPage) {
        // إذا كانت السلة أو الدعم مفتوحين، نغلق سكرول صفحة التفاصيل تماماً
        detailsPage.style.overflowY = (isCartOpen || isSupportOpen) ? 'hidden' : 'auto';
    }
}

// مخزن لترجمات المحافظات لتجنب تكرار الطلبات
let provinceTranslationCache = {};

// مخزن للترجمات الآلية لتجنب تكرار الطلبات
// v2: old cached machine translations (e.g. 'fluorescent') are dropped
try { localStorage.removeItem('autoTranslationCache'); localStorage.removeItem('provinceTranslationCache'); } catch (e) {}
let autoTranslationCache = JSON.parse(localStorage.getItem('autoTranslationCache_v2')) || {};
// curated English text always wins over cached machine output
if (window.BESAN_EN) {
    Object.keys(window.BESAN_EN.products).forEach(id => {
        autoTranslationCache[id] = Object.assign({}, autoTranslationCache[id], window.BESAN_EN.products[id]);
    });
}

// تعريف وتحميل صوت الشات مسبقاً
const chatSound = new Audio(APP_CONFIG.SOUND_CHAT);

// تفعيل الصوت عند أول نقرة (متطلبات الأمان للمتصفح)
function primeChatAudio() {
    chatSound.muted = true;
    chatSound.play().then(() => {
        chatSound.pause();
        chatSound.muted = false;
    }).catch(() => {});
}
document.addEventListener('click', primeChatAudio, { once: true });
document.addEventListener('touchstart', primeChatAudio, { once: true });

// حاول تحميل السلة من LocalStorage عند بدء التشغيل
try {
    const storedCart = localStorage.getItem('cart');
    if (storedCart) {
        cart = JSON.parse(storedCart);
    }
} catch (e) {
    console.error("Failed to load cart from localStorage:", e);
    cart = []; // في حالة وجود خطأ، ابدأ بسلة فارغة
}
let shippingCost = 0; // تكلفة الشحن الافتراضية

// قائمة المحافظات وأسعار الشحن
let shippingPrices = {};
let shippingRatesReady = false;
async function loadShippingRates() {
    shippingRatesReady = false;
    const { data, error } = await _supabase.rpc('get_shipping_rates');
    if (error || !data || Array.isArray(data) || typeof data !== 'object' || !Object.keys(data).length ||
        Object.values(data).some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
        throw new Error('shipping-unavailable');
    }
    shippingPrices = data; shippingRatesReady = true;
    return data;
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    getMyLibraryData(); // جلب البيانات عند فتح الصفحة
    populateProvinces().catch(() => {
        const select = document.getElementById('customer-province');
        select.options[0].textContent = 'تعذّر تحميل الشحن، حدّثي الصفحة';
    }); // ملء قائمة المحافظات عند تحميل الصفحة
    updateGlobalCartCount(); // تحديث عداد السلة عند تحميل الصفحة
    updateGlobalWishCount(); // تحديث عداد المفضلة

    // تفعيل المزامنة الخلفية للشات إذا كان المستخدم معروفاً
    chatAutoExpiryCheck();
    updateGlobalSupportCount();
    if (chatSess()) startChatSync();

    // فحص إذا كان المستخدم قادماً من إشعار (والموقع كان مغلقاً)
    if (urlParams.get('openSupport') === 'true') {
        setTimeout(() => showSupport(true), 1000); // تأكد من تمرير true لـ shouldPush
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // الاستماع للرسائل القادمة من Service Worker (والموقع كان مفتوحاً)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.action === 'open-support') showSupport();
        });
    }

    // ضمان وجود حالة "الرئيسية" في التاريخ فور فتح الموقع لمنع الخروج المفاجئ
    if (!window.history.state || window.history.state.view !== 'home') {
        window.history.replaceState({ view: 'home' }, "");
    }

    // مراقب السكرول لإظهار الشريط العلوي الثابت وزر العودة للأعلى
    window.addEventListener('scroll', () => {
        const stickyHeader = document.getElementById('sticky-header');
        const scrollBtn = document.getElementById('scroll-top-btn');
        const triggerArea = document.querySelector('.categories-container');
        if (!triggerArea || !stickyHeader) return;

        // إظهار زر العودة للأعلى بعد نزول 400 بيكسل
        if (window.scrollY > 400) {
            scrollBtn.classList.add('visible');
        } else {
            scrollBtn.classList.remove('visible');
        }

        const rect = triggerArea.getBoundingClientRect();
        if (window.scrollY > 150 || rect.top <= 0) {
            stickyHeader.classList.add('visible');
        } else {
            stickyHeader.classList.remove('visible');
        }
    });

    // إغلاق القائمة عند النقر في أي مكان آخر
    document.addEventListener('click', () => {
        const dropdown = document.getElementById('cat-dropdown-menu');
        if(dropdown) dropdown.classList.remove('open');
    });

    // إرسال الرسالة في الشات عند الضغط على Enter
    document.getElementById('chat-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
});

// وظيفة العودة للقمة بانسيابية
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- نظام الملاحة الذكي (الرجوع للخلف) ---
// هذه الوظيفة تراقب ضغط زر الرجوع في المتصفح أو الهاتف
window.addEventListener('popstate', function(event) {
    const state = event.state || { view: 'home' };

    // إغلاق النوافذ فقط إذا لم تكن هي الوجهة المطلوبة في الحالة الجديدة
    // هذا يضمن بقاء صفحة التفاصيل مفتوحة عند إغلاق السلة أو الدعم
    if (state.view !== 'cart') closeCart(false);
    if (state.view !== 'support') closeSupport(false);
    if (state.view !== 'details') closeBookDetails(false);

    // فتح الحالة المطلوبة بناءً على التاريخ (الرجوع أو التقديم)
    if (state.view === 'cart') openCart(false);
    else if (state.view === 'support') showSupport(false);
    else if (state.view === 'wishlist') showWishlist(false);
    else if (state.view === 'details' && state.id) showBookDetails(state.id, false);
    else if (state.view === 'home') {
        // العودة للرئيسية وإعادة ضبط شكل الفوتر والبحث
        showCategoriesAndHome(false);
    }
});

// تثبيت الحالة الأولية عند تحميل الصفحة
window.addEventListener('load', () => {
    if (!window.history.state) {
        window.history.replaceState({ view: 'home' }, "");
    }
});

// وظيفة مساعدة لإضافة حالة في تاريخ المتصفح عند فتح أي نافذة
function pushNavigationState(stateName, extraData = {}) {
    const state = { view: stateName, ...extraData };
    const currentState = window.history.state;

    // منع تكرار نفس الحالة في التاريخ
    if (!currentState || currentState.view !== stateName || (stateName === 'details' && currentState.id !== extraData.id)) {
        window.history.pushState(state, '', stateName === 'details' ? `?id=${encodeURIComponent(extraData.id)}` : window.location.pathname);
        // تحديث الرابط في المتصفح ليصبح قابلاً للمشاركة
        if (stateName === 'details') {
            window.history.replaceState(state, "", `?id=${encodeURIComponent(extraData.id)}`);
        }
    }
}

// تثبيت الحالة الأولية عند تحميل الموقع
window.addEventListener('load', () => {
    if (!window.history.state) window.history.replaceState({ view: 'home' }, "");
});

// وظيفة فتح/إغلاق المربع الصغير من الشريط السفلي
function toggleBottomCats(e) {
    e.stopPropagation();
    document.getElementById('cat-dropdown-menu').classList.toggle('open');
}

// وظيفة موحدة لاختيار القسم (تعمل مع الشريط العلوي والمربع السفلي)
function handleCategorySelect(category, element) {
    // 1. إخفاء المربع السفلي فوراً
    const dropdown = document.getElementById('cat-dropdown-menu');
    if(dropdown) dropdown.classList.remove('open');

    const topItems = document.querySelectorAll('.category-item');
    const bottomItems = document.querySelectorAll('.dropdown-item');

    // 2. إزالة حالة النشاط من جميع العناصر في الموقع
    topItems.forEach(i => i.classList.remove('active'));
    bottomItems.forEach(i => i.classList.remove('active'));

    // 3. تحديد الـ Index للمزامنة بين القائمتين
    let targetIdx = -1;
    if (element.classList.contains('category-item')) {
        targetIdx = Array.from(topItems).indexOf(element);
    } else {
        targetIdx = Array.from(bottomItems).indexOf(element);
    }

    // 4. تفعيل (إنارة) العناصر المقابلة في كلا الشريطين
    if (targetIdx !== -1) {
        if (topItems[targetIdx]) {
            topItems[targetIdx].classList.add('active');
            // سحر الحركة: جعل الشريط العلوي يتحرك ليظهر القسم المختار في المنتصف
            topItems[targetIdx].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
        if (bottomItems[targetIdx]) bottomItems[targetIdx].classList.add('active');
    }

    filterByCategory(category);
}

// وظيفة فلترة الكتب حسب القسم
function filterByCategory(category) {
    let filtered;
    if ((category === 'All' || category === 'الكل')) {
        filtered = window.fullData;
    } else {
        filtered = window.fullData.filter(book => {
            if (!book.category) return false;
            // تقسيم التصنيفات والتأكد من وجود القسم المختار
            return book.category.split(',').map(c => c.trim()).includes(category);
        });
    }
    // ترتيب عشوائي في كل مرة
    const shuffled = [...filtered];
    renderBooksList(shuffled);
}

// وظيفة جلب البيانات من Supabase
async function getMyLibraryData() {
    window.fullData = [];
    const container = document.getElementById('books-list');
    const { data, error } = await _supabase.from('products').select('*').order('id');

    if (error) {
        console.error("Error connecting:", error.message);
        container.innerHTML = `<div class="error-msg">${LT('تعذّر تحميل المنتجات دلوقتي. حدّثي الصفحة بعد شوية.', 'We could not load the products right now. Please refresh the page in a moment.')}</div>`;
        return;
    }

    // ترتيب الكتب عشوائياً في كل مرة يتم فيها تحميل الموقع
    const shuffledData = [...data].sort((a, b) => Number(a.id) - Number(b.id));

    window.fullData = shuffledData;
    renderBooksList(shuffledData);

    // فحص الرابط عند التحميل لفتح كتاب معين مباشرة (Deep Linking) بعد جلب البيانات
    const urlParams = new URLSearchParams(window.location.search);
    const bookId = urlParams.get('id');
    if (bookId) showBookDetails(bookId, false);

    // تفعيل التحديث اللحظي للكتب (إضافة، تعديل، حذف)
    _supabase.channel('realtime-books', {
        config: {
            broadcast: { self: true } // السماح بالبث الذاتي لتحديث الكتب المضافة حديثاً
        }
    }).on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'products'
    }, payload => {
        console.log('تحديث في الكتب:', payload);
        // إذا كان التحديث من نفس العميل (مثلاً إضافة كتاب جديد)، لا نحدث القائمة بالكامل
        // هذا يمنع الـ flicker عند إضافة كتاب جديد من لوحة التحكم
        if (payload.new && payload.new.id && window.currentOpenedBookId === payload.new.id) return;

        if (payload.eventType === 'INSERT') {
            window.fullData.unshift(payload.new);
        } else if (payload.eventType === 'UPDATE') {
            const idx = window.fullData.findIndex(b => String(b.id) === String(payload.new.id));
            if (idx !== -1) window.fullData[idx] = payload.new;
        } else if (payload.eventType === 'DELETE') {
            window.fullData = window.fullData.filter(b => String(b.id) !== String(payload.old.id));
        }

        // إعادة عرض الكتب بناءً على القسم المختار حالياً
        if (currentView === 'home') {
            const activeCat = (document.querySelector('.category-item.active')?.innerText || 'الكل').replace(/^All$/, 'الكل');
            filterByCategory(activeCat);
        } else if (currentView === 'wishlist') {
            showWishlist();
        }
    }).subscribe();
}

// وظيفة عرض قائمة الكتب في الصفحة
function renderBooksList(data) {
    const container = document.getElementById('books-list');
    const lang = document.documentElement.lang || 'ar';
    const t = translations[lang];

    if (data.length === 0) {
        if (currentView === 'wishlist') {
            container.innerHTML = `
                <div style="text-align:center; padding:0 20px; margin-top:-20px; color: var(--paper-light); grid-column: 1/-1;">
                    <i class="bi bi-bookmark-heart" style="font-size: 2.5rem; color: var(--accent-wood); opacity: 0.3; margin-bottom: 5px; display: block;"></i>
                    <h3 style="margin-bottom: 0px;">${t.wishlistEmptyTitle}</h3>
                    <p style="opacity: 0.7; margin-bottom: 15px; font-size: 0.9rem;">${t.wishlistEmptyDesc}</p>
                    <button class="shop-now-btn" onclick="shopNow()">${t.discoverNow} <i class="bi ${lang === 'ar' ? 'bi-arrow-left-short' : 'bi-arrow-right-short'}"></i></button>
                </div>`;
        } else {
            const activeCat = (document.querySelector('.category-item.active')?.innerText || 'الكل').replace(/^All$/, 'الكل');
            const isOffers = activeCat === 'العروض' || activeCat === 'Offers';
            if (isOffers) {
                 const msg = document.documentElement.lang === 'en' ? 'No offers available currently.. stay tuned! ✨' : 'لا توجد عروض حالياً.. انتظرونا قريباً! ✨';
                 container.innerHTML = `<div class="error-msg" style="padding: 100px 20px;">
                    <i class="bi bi-percent" style="font-size: 3.5rem; display: block; margin-bottom: 15px; color: var(--accent-wood);"></i>
                    ${msg}
                 </div>`;
            } else {
                 const q = ((document.getElementById('main-search') || {}).value || '').trim() || ((document.getElementById('sticky-search') || {}).value || '').trim();
                 const emptyMsg = q ? LT('لا توجد منتجات مطابقة لبحثك.', 'No products match your search.')
                     : (activeCat !== 'الكل' ? LT('لا توجد منتجات في هذا القسم حالياً.', 'No products in this section right now.')
                     : LT('منتجات جديدة قريباً ✨', 'New products coming soon ✨'));
                 container.innerHTML = `<div class="error-msg">${emptyMsg}</div>`;
            }
        }
        return;
    }

    container.innerHTML = data.map((book, index) => renderBookCard(book, index)).join('');

    updateCartUI(); // لضمان ظهور علامات الصح
}

// وظيفة بناء HTML لكارت الكتاب الواحد
function safeProductId(value) { const id = String(value ?? ''); return /^[0-9]{1,12}$/.test(id) ? id : ''; }
// Smaller delivery copies only. Original database URLs and pixel dimensions are retained.
const optimizedProductImages = Object.freeze({"https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795074744093.jpg":"assets/product-images/15c68078b7ba5bdf8994.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795076500481.jpg":"assets/product-images/c6dbaade417593b266cf.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795148426435.jpg":"assets/product-images/3289d85d2611ed2269f7.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795168159076.jpg":"assets/product-images/8099c71e4051bdf80920.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795168213236.jpg":"assets/product-images/cc39018ab575ad7667d3.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795168278767.jpg":"assets/product-images/879a144ca345d6ab58fb.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795172536379.jpg":"assets/product-images/f9834bf20b648a97bc07.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795172649796.jpg":"assets/product-images/4b50607447f2e852ae80.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795173036985.jpg":"assets/product-images/ecc92a1044b8731e12f0.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795173043640.jpg":"assets/product-images/5d95f0ea5b9b59776633.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795173123463.jpg":"assets/product-images/9478d4a1ab6d3990e5dc.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795173238581.jpg":"assets/product-images/c748f1b741f2caa4ff93.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795173390058.jpg":"assets/product-images/3c3b07c9acc1e2d606a8.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795185296895.png":"assets/product-images/dd4bd2b49eaaf11e60ac.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795185544876.png":"assets/product-images/4d4fc093e405da4e3655.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795185648424.png":"assets/product-images/a2b01fe14d272b43192a.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795185782130.png":"assets/product-images/a2bf6e3400f01ec4d8e0.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795185979410.jpg":"assets/product-images/285fbd54ab9076f89fb9.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795186303689.jpg":"assets/product-images/204f55f2bc881fe30913.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795186467337.jpg":"assets/product-images/85a58968fc3cbdbd7f70.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795186602046.jpg":"assets/product-images/26062511646d5cdfc340.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795186771105.jpg":"assets/product-images/99652004c49a1d057a43.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795186777265.jpg":"assets/product-images/397996a53e193ab3d6d1.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795186927153.jpg":"assets/product-images/2a6fba0f23bb6ae5b4fe.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795186933238.jpg":"assets/product-images/beffff2fabd19dd0c6c1.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188078078.jpg":"assets/product-images/425ee55432821a2a4b62.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188243528.jpg":"assets/product-images/911759e5b59aeb3adb4f.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188249767.jpg":"assets/product-images/44464c52c0ce727e8903.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188364726.jpg":"assets/product-images/23bbc5e4c688f1c2ef6f.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188370622.jpg":"assets/product-images/093cf8f7e4b414ca38de.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188496654.jpg":"assets/product-images/ee8fb62f13632be6ec66.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188635010.jpg":"assets/product-images/bdaa428befb03c53ad8d.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188729567.jpg":"assets/product-images/f9152103415ac0be61da.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188852130.jpg":"assets/product-images/6409a68baaee95e12aa2.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795188932046.jpg":"assets/product-images/f1909635177f0e8e4b00.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795189385089.jpg":"assets/product-images/9ca9e67c7b05b4db34f6.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795189522589.jpg":"assets/product-images/85e43c184da51472b639.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795189528484.jpg":"assets/product-images/7e12570ffcc9af0e02e6.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795189609459.jpg":"assets/product-images/cf80a3413e18170e0f43.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795189746199.jpg":"assets/product-images/f7a4fbf8e14a0326e58e.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795189751732.jpg":"assets/product-images/26189a0fbbf4a317743d.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795189883459.jpg":"assets/product-images/69180a1bf19f0a572b12.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795189970129.jpg":"assets/product-images/7858129cf066d483e216.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795190146692.jpg":"assets/product-images/21e1e944cd22a3ddf4b0.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795190295241.jpg":"assets/product-images/663cf0db89d1492c7bd4.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795190301501.jpg":"assets/product-images/a0647c7df5e357cea365.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795437550393.png":"assets/product-images/fe63c7de2673611aa514.webp","https://gagjylyqxihrwdibslfu.supabase.co/storage/v1/object/public/product-images/1795437550708.png":"assets/product-images/42d81166a1d4870ed3b2.webp"});
const originalProductImages = new Map(Object.entries(optimizedProductImages).map(([original, local]) => [new URL(local, document.baseURI).href, original]));
// If a delivery copy cannot load, use the untouched original once.
document.addEventListener('error', function (event) {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const original = originalProductImages.get(image.src);
    if (original && image.dataset.originalFallback !== '1') {
        image.dataset.originalFallback = '1';
        image.src = original;
    }
}, true);

function getValidImageUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return 'logo-192.png';
    try {
        const url = new URL(value, APP_CONFIG.STORAGE_PUBLIC_BASE);
        return url.protocol === 'https:' && !url.username && !url.password ? (optimizedProductImages[url.href] || url.href) : 'logo-192.png';
    } catch (_) { return 'logo-192.png'; }
}

function renderBookCard(book, index) {
    if (!safeProductId(book.id)) return '';
    book = { ...book, id: safeProductId(book.id) };
    const img1 = getValidImageUrl(book.image_url);
    const img2 = getValidImageUrl(book.image_url2);
    const has2nd = book.image_url2 && book.image_url2 !== book.image_url;
    const isInWishlist = wishlist.some(id => String(id) === String(book.id));
    const lang = document.documentElement.lang || 'ar';
    const t = translations[lang];
    const isSoldOut = book.in_stock === false;

    // نظام الترجمة الذكي: يستخدم الكاش أولاً، ثم البيانات اليدوية إن وجدت، ثم الأصل
    let displayTitle = book.title;
    let displayAuthor = book.brand;
    let displayDesc = book.description || '';

    if (lang === 'en') {
        const cache = autoTranslationCache[book.id];
        displayTitle = cache?.title || (book.title_en || (t.bookData[book.id]?.title || book.title));
        displayAuthor = cache?.author || (book.brand_en || (t.bookData[book.id]?.author || book.brand));
        displayDesc = cache?.desc || (book.description_en || (t.bookData[book.id]?.desc || displayDesc));

        // إذا لم تكن الترجمة موجودة في أي مكان، نطلق عملية الترجمة الآلية في الخلفية
        if (!cache && !book.title_en && !t.bookData[book.id]) {
            triggerAutoTranslate(book);
        }
    }

    return `
       <div class="book-card" style="animation: fadeInUp ${0.3 + (Math.min(index, 3) * 0.05)}s ease-out;" onclick="showBookDetails('${book.id}')" itemscope itemtype="https://schema.org/Product">
            <div class="image-box">
                ${has2nd ? `<div class="hover-trigger trigger-right"></div><div class="hover-trigger trigger-left"></div>` : ''}
                <img src="${pendingEsc(img1)}" class="main-img" loading="lazy" decoding="async" alt="${pendingEsc(displayTitle)} - ${pendingEsc(displayAuthor)}" itemprop="image"> <!-- تحميل ذكي حسب الصف -->
                ${has2nd ? `<img src="${pendingEsc(img2)}" class="hover-img" loading="lazy" decoding="async" alt="${LT('صورة إضافية لـ', 'Additional photo of')} ${pendingEsc(displayTitle)}">` : ''}
                <div class="image-indicators"><div class="dot active"></div>${has2nd ? `<div class="dot"></div>` : ''}</div>
            </div>
            <div class="book-actions">
                <span id="wish-btn-${book.id}" role="button" tabindex="0" aria-label="${LT('تغيير المفضلة', 'Toggle wishlist')}" class="action-icon ${isInWishlist ? 'active' : ''}" title="${LT('المفضلة', 'Wishlist')}"
                      onclick="event.stopPropagation(); toggleWishlist(${book.id})">
                    <i id="wish-icon-${book.id}" class="bi bi-bookmark-heart"></i>
                </span>
            </div>
            <h3 itemprop="name"><button type="button" class="product-title-btn" onclick="event.stopPropagation(); showBookDetails('${book.id}')">${pendingEsc(displayTitle)}</button></h3>
            <p class="author-name">${t.by}: <span itemprop="brand" itemscope itemtype="https://schema.org/Brand"><span itemprop="name">${pendingEsc(displayAuthor)}</span></span></p>
            <p class="book-desc" itemprop="description">${pendingEsc(displayDesc)}</p>
            ${isSoldOut ?
                `<div class="out-of-stock-badge">${lang === 'en' ? 'Sold out' : 'نفذت الكمية'}</div>` :
                `<button class="cart-btn" aria-label="${LT('إضافة للسلة', 'Add to cart')}" id="add-btn-${book.id}" data-id="${book.id}" onclick="event.stopPropagation(); addItemToCart('${book.id}')">
                    <i class="bi bi-cart-plus"></i>
                </button>`
            }
            <div class="price-cart-container" itemprop="offers" itemscope itemtype="https://schema.org/Offer"><div class="price"><span itemprop="price">${pendingEsc(book.price)}</span> <span itemprop="priceCurrency" content="EGP">${t.currency}</span></div></div>
        </div>`;
}

function getRandomBooks(count) {
    if (!window.fullData) return [];
    return [...window.fullData].sort(() => 0.5 - Math.random()).slice(0, count);
}

function getRelatedBooks(currentBook) {
    if (!window.fullData || !currentBook || !currentBook.category) return [];

    return window.fullData.filter(b => {
        // منتجات قد تعجبك تكون من نفس تصنيف الكتاب المفتوح (مطابقة تامة لسلسلة التصنيف)
        return String(b.category || '').split(',').map(c => c.trim()).some(c => String(currentBook.category).split(',').map(x => x.trim()).includes(c)) && String(b.id) !== String(currentBook.id);
    }).slice(0, 4);
}

function renderSmallCard(book) {
    if (!safeProductId(book.id)) return '';
    book = { ...book, id: safeProductId(book.id) };
    const lang = document.documentElement.lang || 'ar';
    const t = translations[lang];
    const img = getValidImageUrl(book.image_url);
    const isInCart = cart.find(i => String(i.id) === String(book.id));
    return `
        <div class="book-card" style="padding: 8px; font-size: 0.8rem;" onclick="event.stopPropagation(); showBookDetails('${book.id}')">
            <div class="image-box" style="height: 120px;">
                <img src="${pendingEsc(img)}" loading="lazy" decoding="async" alt="${pendingEsc(book.title)}" style="object-fit: cover;">
            </div>
            <h3 style="font-size: 0.8rem; height: 35px; overflow: hidden;"><button type="button" class="product-title-btn" onclick="event.stopPropagation(); showBookDetails('${book.id}')">${pendingEsc(book.title)}</button></h3>
            <div class="price" style="font-size: 0.9rem;">${pendingEsc(book.price)} ${t.currency}</div>
            <button class="cart-btn ${isInCart ? 'success' : ''}" data-id="${book.id}" style="width: 25px; height: 25px; font-size: 0.8rem; bottom: 8px; left: 8px;" onclick="event.stopPropagation(); addItemToCart('${book.id}')">
                <i class="bi ${isInCart ? 'bi-check-lg' : 'bi-cart-plus'}"></i>
            </button>
        </div>
    `;
}

let currentDetailsQty = 1;
async function showBookDetails(id, shouldPush = true) {
    clearTimeout(detailsCloseTimer);
    const detailsPage = document.getElementById('book-details-page');
    const isAlreadyOpen = detailsPage.classList.contains('active');
    const isSameBook = String(window.currentOpenedBookId) === String(id);

    // إذا كانت صفحة التفاصيل مفتوحة بالفعل لنفس الكتاب، نكتفي بالتأكد من الحالة ولا نعيد بناء المحتوى
    if (isAlreadyOpen && isSameBook) {
        if (shouldPush) pushNavigationState('details', { id });
        return;
    }

    if (!safeProductId(id)) return;
    const book = window.fullData.find(b => String(b.id) === String(id));
    if (!book) return;

    const lang = document.documentElement.lang || 'ar';
    const t = translations[lang];

    window.currentOpenedBookId = book.id;
    currentDetailsQty = 1;
    const content = document.getElementById('details-content');

    // تطبيق الترجمة الذكية داخل صفحة التفاصيل
    let displayTitle = book.title;
    let displayAuthor = book.brand;
    let displayDesc = book.description || (lang === 'ar' ? 'لا يوجد وصف متاح.' : 'No description available.');

    if (lang === 'en') {
        const cache = autoTranslationCache[book.id];
        displayTitle = cache?.title || (book.title_en || (t.bookData[book.id]?.title || book.title));
        displayAuthor = cache?.author || (book.brand_en || (t.bookData[book.id]?.author || book.brand));
        displayDesc = cache?.desc || (book.description_en || (t.bookData[book.id]?.desc || displayDesc));
    }

    const isInWishlist = wishlist.some(id => String(id) === String(book.id));
    const isInCart = cart.find(i => String(i.id) === String(book.id));
    const isSoldOut = book.in_stock === false;
    const img1 = getValidImageUrl(book.image_url);
    const img2 = getValidImageUrl(book.image_url2);
    const has2nd = book.image_url2 && book.image_url2 !== book.image_url;

    // تحسين SEO: تغيير عنوان الصفحة عند فتح تفاصيل الكتاب
    const originalTitle = document.title;
    document.title = `${book.title} | Besan Beauty`;
    // تتبع في جوجل أن الزائر شاهد هذا الكتاب
    if (typeof gtag === 'function') gtag('event', 'view_item', { items: [{ item_name: book.title, price: book.price }] });

    content.innerHTML = `
        <div class="details-image">
            <div class="details-image-container" id="details-img-container">
                <div class="details-slider" id="details-slider">
                    <img src="${pendingEsc(img1)}" alt="${pendingEsc(book.title)} - ${pendingEsc(book.brand)}">
                    ${has2nd ? `<img src="${pendingEsc(img2)}" alt="${LT('عرض إضافي لـ', 'Additional view of')} ${pendingEsc(book.title)}">` : ''}
                </div>
                ${has2nd ? `
                <button class="slider-arrow arrow-prev" aria-label="الصورة الأولى" onclick="event.stopPropagation(); slideDetails(0)"><i class="bi bi-chevron-right"></i></button>
                <button class="slider-arrow arrow-next" aria-label="الصورة الثانية" onclick="event.stopPropagation(); slideDetails(1)"><i class="bi bi-chevron-left"></i></button>
                <div class="slider-dots">
                    <div class="slider-dot active" onclick="slideDetails(0)"></div>
                    <div class="slider-dot" onclick="slideDetails(1)"></div>
                </div>` : ''}
            </div>
        </div>
        <div class="details-info">
            <div class="star-rating">
                <i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i><i class="bi bi-star-fill"></i>
                <span style="color: var(--desc-color); font-size: 0.9rem; margin-right: 10px;">(5.0)</span>
            </div>
            <h1>${pendingEsc(displayTitle)}</h1>
            <p class="author">${t.by}: ${pendingEsc(displayAuthor)}</p>
            <p class="full-desc">${pendingEsc(displayDesc)}</p>
            <div style="font-size: 2rem; color: var(--paper-light); margin-bottom: 25px; font-weight: bold;">${pendingEsc(book.price)} ${t.currency}</div>
            <div class="details-actions">
                ${isSoldOut ?
                    `<div class="out-of-stock-badge" style="font-size: 1.3rem; padding: 15px 40px; flex: 1; text-align: center;">${lang === 'en' ? 'Sold out' : 'نفذت الكمية من Besan Beauty 🌸'}</div>` :
                    `<div class="details-qty-container">
                        <button class="qty-btn-det" aria-label="تقليل الكمية" onclick="updateDetQty(-1)"><i class="bi bi-dash"></i></button>
                        <span id="det-qty-val" style="font-size: 1.6rem; font-weight: bold; color: var(--paper-light); min-width: 30px; text-align: center;">1</span>
                        <button class="qty-btn-det" aria-label="زيادة الكمية" onclick="updateDetQty(1)"><i class="bi bi-plus"></i></button>
                    </div>
                    <button id="details-add-btn" class="shop-now-btn ${isInCart ? 'success' : ''}" style="flex: 1; min-width: 200px;" onclick="addItemToCart('${book.id}', currentDetailsQty)">
                        ${isInCart ? `<i class="bi bi-check-lg"></i> ${lang === 'en' ? t.added : 'تم الإضافة'}` : `<i class="bi bi-cart-plus"></i> ${lang === 'en' ? t.addToCart : 'إضافة للسلة'}`}
                    </button>`
                }
                <button id="details-wish-btn" aria-label="${LT('تغيير المفضلة', 'Toggle wishlist')}" class="wish-btn-large ${isInWishlist ? 'active' : ''}" onclick="toggleWishlist(${book.id}); updateDetailsWishBtn(${book.id})">
                    <i id="details-wish-icon" class="bi bi-bookmark-heart"></i>
                </button>
            </div>
        </div>
        <div class="extra-sections-wrapper" style="grid-column: 1 / -1;">
            <div class="section-header"><i class="bi bi-fire"></i><span>${t.mostSelling}</span></div>
            <div class="books-grid" style="gap: 15px; margin-bottom: 40px;">
                ${getRandomBooks(4).map((b, i) => renderBookCard(b, i)).join('')}
            </div>
            <div class="section-header"><i class="bi bi-lightbulb-fill"></i><span>${t.relatedBooks}</span></div>
            <div class="books-grid" style="gap: 15px;">
                ${getRelatedBooks(book).map((b, i) => renderBookCard(b, i)).join('')}
            </div>
        </div>
    `;

    if (window.innerWidth >= 1024) {
        const grids = content.querySelectorAll('.extra-sections-wrapper .books-grid');
        grids.forEach(g => g.style.gridTemplateColumns = 'repeat(4, 1fr)');
    }

    detailsPage.style.display = 'flex';
    setTimeout(() => detailsPage.classList.add('active'), 10);
    if (!isAlreadyOpen) addLockScroll();

    updateLayersScroll(); // التأكد من حالة السكرول عند فتح الصفحة

    if (shouldPush) pushNavigationState('details', { id: book.id });
    detailsPage.scrollTo(0,0);
    setTimeout(observeBookCards, 300); // تفعيل ظهور الكروت الصغيرة في صفحة التفاصيل
}

function slideDetails(index) {
    const slider = document.getElementById('details-slider');
    const dots = document.querySelectorAll('.slider-dot');
    if (slider) {
        slider.style.transform = `translateX(${index * 100}%)`;
        if (document.documentElement.dir === 'ltr') slider.style.transform = `translateX(-${index * 100}%)`;
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    }
}

function updateDetQty(delta) {
    currentDetailsQty += delta;
    if (currentDetailsQty < 1) currentDetailsQty = 1;
    const qtyDisplay = document.getElementById('det-qty-val');
    if (qtyDisplay) qtyDisplay.innerText = currentDetailsQty;
}

let detailsCloseTimer;
function closeBookDetails(shouldGoBack = true) {
    const detailsPage = document.getElementById('book-details-page');
    if (!detailsPage.classList.contains('active')) return;
    detailsPage.classList.remove('active');
    clearTimeout(detailsCloseTimer);
    detailsCloseTimer = setTimeout(() => {
        if (detailsPage.classList.contains('active')) return;
        detailsPage.style.display = 'none';
        window.currentOpenedBookId = null;
        document.title = LT('Besan Beauty - عالم الجمال والعطور', 'Besan Beauty - World of Beauty & Fragrance');
    }, 500);
    removeLockScroll();
    if (shouldGoBack && window.history.state?.view === 'details') window.history.back();
}

function updateDetailsWishBtn(id) {
    const btn = document.getElementById('details-wish-btn');
    const icon = document.getElementById('details-wish-icon');
    const isActive = wishlist.includes(id);
    if (btn) btn.classList.toggle('active', isActive);
    if (icon) icon.className = 'bi bi-bookmark-heart';
}

function normalizeArabic(text) {
    if (!text) return "";
    return text.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").trim();
}

function syncSearch(val) {
    document.getElementById('main-search').value = val;
    document.getElementById('sticky-search').value = val;
    const term = val.trim();
    if (!term) {
        renderBooksList(window.fullData);
        return;
    }
    const norm = t => normalizeArabic(String(t || '')).replace(/[\u064B-\u0652\u0640]/g, '').replace(/ى/g, 'ي').toLowerCase();
    const words = norm(term).split(/\s+/).filter(Boolean);
    const filtered = window.fullData.filter(book => {
        const hay = norm([book.title, book.brand, book.category, book.description].join(' '));
        return words.every(w => hay.includes(w));
    });
    renderBooksList(filtered);
}

const translations = {
    ar: {
        logo: "Besan Beauty", search: "ابحث عن منتج أو رايحة...", quickSearch: "بحث سريع...",
        categories: ["All", "Body Powder", "Body Splash", "Mini Splash", "Bundles"],
        home: "الرئيسية", cart: "السلة", wishlist: "المفضلة", support: "الدعم",
        dedication: "إهداء خاص", categoriesBottomBar: "تصنيفات", by: "الماركة", currency: "ج.م",
        dedicationText: "جمالك يبدأ من التفاصيل الصغيرة.. عطر يشبهك، وهدية تفرّح قلب اللي بتحبيها. Besan Beauty من صيدلانية مصرية تهتم بجودة كل منتج، ونوصّل لكل المحافظات.",
        backToLibrary: "العودة للمتجر",
        supportHeader: "مركز الدعم",
        developedBy: "تمت البرمجة والتطوير بواسطة حنين ✨",
        wishlistEmptyTitle: "قائمة المفضلة فارغة",
        wishlistEmptyDesc: "لم تقم بإضافة أي منتجات لمفضلتك بعد.",
        discoverNow: "اكتشف الآن",
        mostSelling: "الأكثر مبيعاً في Besan Beauty", relatedBooks: "منتجات قد تعجبك",
        booksCount: "عدد المنتجات", book: "منتج", totalOrder: "إجمالي الطلب",
        shippingCostLabel: "تكلفة الشحن", grandTotalLabel: "الإجمالي الكلي",
        shippingNote: "ملحوظة: سعر الشحن", shippingDays: "الشحن يستغرق من 3 إلى 5 أيام عمل.",
        confirmOrderHeader: "تأكيد طلبك", confirmOrderBtn: "تأكيد الطلب",
        processingOrder: "جاري إرسال الطلب...", orderSuccess: "تم استلام طلبك بنجاح! 🎉 سيتم التواصل معك قريباً.",
        orderError: "عذراً، حدث خطأ أثناء إرسال الطلب:", startShopping: "ابدأ التسوق الآن",
        cartEmptyTitle: "سلتك خالية من الكنوز..", cartEmptyDesc: "رحلتك مع الجمال لم تبدأ بعد",
        nameErrorMsg: "الاسم يجب أن يتكون من كلمتين على الأقل.",
        phoneErrorMsg: "أدخل رقم موبايل مصري صحيح (11 رقم).",
        whatsappErrorMsg: "أدخل رقم واتساب مصري صحيح (11 رقم).",
        provinceErrorMsg: "من فضلك اختر المحافظة.",
        addressErrorMsg: "من فضلك أدخلي العنوان بالتفصيل لضمان وصول الشحن.",
        phoneRequiredAlert: "من فضلكِ أدخلي رقم الموبايل أولاً.",
        botWelcomeMsg: "أهلاً بكِ مجدداً! ✨ كيف يمكننا مساعدتكِ؟",
        placeholders: {
            name: "الاسم الثنائي على الأقل", phone: "رقم الموبايل المصري (11 رقم)", whatsapp: "رقم الواتساب (إجباري)",
            province: "اختر المحافظة", address: "العنوان بالتفصيل", notes: "ملاحظات العميل (اختياري)", chat: "اكتبي استفسارك هنا..."
        },
        bookData: {}
    },
    en: {
        logo: "Besan Beauty", search: "Search for a product...", quickSearch: "Quick search...",
        categories: ["All", "Body Powder", "Body Splash", "Mini Splash", "Bundles"],
        home: "Home", cart: "Cart", wishlist: "Wishlist", support: "Support",
        dedication: "A Royal Dedication", categoriesBottomBar: "Categories", by: "By", currency: "EGP",
        dedicationText: "Your beauty is in the little details.. a scent that feels like you and a gift that makes someone smile. Besan Beauty is run by an Egyptian pharmacist who cares about every product, with delivery across all governorates.",
        backToLibrary: "Back to Library",
        supportHeader: "Support Center",
        developedBy: "Designed & Developed with Excellence by Haneen ✨",
        mostSelling: "Best Sellers at Besan Beauty",
        relatedBooks: "Books You May Like",
        placeholders: {
            name: "Full Name", phone: "Phone Number", whatsapp: "WhatsApp Number",
            province: "Select Province", address: "Full Address Details", notes: "Order Notes (Optional)", chat: "Type your message here..."
        },
        bookData: {}
    }
};

// English layer (i18n-en.js): fills missing keys, drops leftover book data
if (window.BESAN_EN) { Object.assign(translations.en, window.BESAN_EN.ui); translations.en.bookData = {}; }

// وظيفة الترجمة الآلية باستخدام محرك Google (بدون مفتاح API لسهولة الاستخدام)
async function translateText(text) {
    if (window.BESAN_EN) return window.BESAN_EN.smartTranslate(text);
    return text;
}

async function triggerAutoTranslate(book) {
    // تجنب الطلبات المتكررة لنفس الكتاب في نفس الجلسة
    if (book._isTranslating) return;
    book._isTranslating = true;

    const translatedTitle = await translateText(book.title);
    const translatedAuthor = await translateText(book.brand);
    const translatedDesc = await translateText(book.description);

    autoTranslationCache[book.id] = {
        title: translatedTitle,
        author: translatedAuthor,
        desc: translatedDesc
    };

    localStorage.setItem('autoTranslationCache_v2', JSON.stringify(autoTranslationCache));

    // تحديث الواجهة فقط إذا كان المستخدم ما زال على اللغة الإنجليزية
    if (document.documentElement.lang === 'en') {
        renderBooksList(window.fullData);
    }
}

async function toggleLanguage() {
    const html = document.documentElement;
    const langBtn = document.getElementById('lang-toggle');
    const isAr = html.dir === "rtl";
    const newLang = isAr ? "en" : "ar";
    const t = translations[newLang];
    html.dir = isAr ? "ltr" : "rtl";
    html.lang = newLang;
    // تحديث زر اللغة نفسه
    langBtn.innerText = isAr ? "AR" : "EN";
    // تحديث اللوجو (تم تعديل الكلاس ليتطابق مع الـ HTML)


    // ترجمة زر العودة للمتجر
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) { backBtn.innerHTML = `<i class="bi ${newLang === 'ar' ? 'bi-arrow-right' : 'bi-arrow-left'}"></i>`; backBtn.title = t.backToLibrary; backBtn.setAttribute('aria-label', t.backToLibrary); }

    // ترجمة زر "ابدأ التسوق الآن" في السلة الفارغة
    const shopNowBtnInCart = document.querySelector('#cart-items-container .shop-now-btn');
    if (shopNowBtnInCart) shopNowBtnInCart.innerHTML = `${t.startShopping} <i class="bi bi-bag-check-fill"></i>`;

    document.getElementById('main-search').placeholder = t.search;
    document.getElementById('sticky-search').placeholder = t.quickSearch;

    // ترجمة النصوص الشبحية (Placeholders)
    document.getElementById('customer-name').placeholder = t.placeholders.name;
    document.getElementById('customer-phone').placeholder = t.placeholders.phone;
    document.getElementById('customer-whatsapp').placeholder = t.placeholders.whatsapp;
    document.getElementById('customer-address').placeholder = t.placeholders.address;
    document.getElementById('customer-notes').placeholder = t.placeholders.notes;
    document.getElementById('chat-input').placeholder = t.placeholders.chat;
    document.querySelector('#customer-province option[value=""]').innerText = t.placeholders.province;

    const topCatItems = document.querySelectorAll('.category-item');
    const bottomCatItems = document.querySelectorAll('.dropdown-item');
    t.categories.forEach((name, i) => {
        if(topCatItems[i]) topCatItems[i].innerText = name;
        if(bottomCatItems[i]) bottomCatItems[i].innerText = name;
    });
    // تحديث نصوص الشريط السفلي بدقة
    // تحديث نصوص الشريط السفلي بدقة (استهداف الـ span الثاني مباشرة)
    const barItems = document.querySelectorAll('.bottom-bar-item > span:nth-of-type(2)');
    const barTexts = [t.categoriesBottomBar, t.cart, t.wishlist, t.support];
    barTexts.forEach((text, i) => { if(barItems[i]) barItems[i].innerText = text; });

    // تحديث المحافظات في القائمة المنسدلة
    const provinceSelect = document.getElementById('customer-province');
    if (provinceSelect) {
        Array.from(provinceSelect.options).forEach(async (opt) => {
            const arName = opt.getAttribute('data-ar');
            if (arName) opt.innerText = (newLang === 'en') ? (await translateProvinceName(arName)) : arName;
        });
    }

    // تحديث عناوين النوافذ الجانبية (السلة والدعم)
    const cartHeader = document.querySelector('#cart-drawer .cart-header h3');
    if(cartHeader) cartHeader.innerHTML = `${t.confirmOrderHeader} <i class="bi bi-bag-check-fill"></i>`;

    const supportHeader = document.getElementById('client-chat-header');
    if(supportHeader) supportHeader.innerHTML = `${t.supportHeader} <i class="bi bi-headset"></i>`;

    // ترجمة نصوص السلة (إجمالي الطلب، عدد المنتجات، تكلفة الشحن، الإجمالي الكلي) والقوالب الخاصة بها
    const booksCountLabel = document.querySelector('#total-sec p');
    if (booksCountLabel) booksCountLabel.innerHTML = `${t.booksCount}: <span id="books-count-val" style="font-weight: bold; color: var(--accent-wood);">0</span> ${t.book}`;
    const totalOrderLabel = document.querySelector('#total-sec h4');
    if (totalOrderLabel) totalOrderLabel.innerHTML = `${t.totalOrder}: <span id="total-val">0</span>`;
    const shippingSecLabel = document.querySelector('#shipping-sec h4');
    if (shippingSecLabel) shippingSecLabel.innerHTML = `${t.shippingCostLabel}: <span id="shipping-val">0</span>`;
    const grandTotalSecLabel = document.querySelector('#grand-total-sec h4');
    if (grandTotalSecLabel) grandTotalSecLabel.innerHTML = `${t.grandTotalLabel}: <span id="grand-total-val">0</span>`;
    const shippingInfoMessageP = document.querySelector('#shipping-info-message p:first-child');
    if (shippingInfoMessageP) shippingInfoMessageP.innerHTML = `${t.shippingNote} <span id="shipping-message-cost">0</span> ${t.currency}`;
    const shippingInfoMessageP2 = document.querySelector('#shipping-info-message p:last-child');
    if (shippingInfoMessageP2) shippingInfoMessageP2.innerText = t.shippingDays;

    // ترجمة جميع أزرار "تأكيد الطلب" (في السلة، مودال البطارية، والدعم) لضمان ترجمتها جميعاً فوراً
    document.querySelectorAll('.confirm-order-btn').forEach(btn => {
        btn.innerHTML = `${t.confirmOrderBtn} <i class="bi bi-bag-check-fill"></i>`;
    });

    // ترجمة الإهداء
    const dedicationH3 = document.querySelector('.dedication-box h3');
    if(dedicationH3) dedicationH3.innerHTML = `${t.dedication} <i class="bi bi-feather"></i>`;
    const dedicationP = document.querySelector('.dedication-box p');
    if(dedicationP) dedicationP.innerText = t.dedicationText;

    // ترجمة كارت المبرمج
    const devBadge = document.getElementById('dev-badge');
    if(devBadge) devBadge.innerText = t.developedBy;

    // تحديث السلة والكتب والواجهة فوراً
    if (window.currentOpenedBookId) showBookDetails(window.currentOpenedBookId, false);
    updateCartUI();

    const currentData = (currentView === 'wishlist') ? window.fullData.filter(b => wishlist.includes(b.id)) : window.fullData;
    renderBooksList(currentData);
}

// وظيفة لترجمة المحافظات ديناميكياً
async function translateProvinceName(provinceName) {
    const known = window.BESAN_EN && window.BESAN_EN.province(provinceName);
    if (known) return known;
    if (provinceTranslationCache[provinceName]) return provinceTranslationCache[provinceName];
    const translated = await translateText(provinceName);
    provinceTranslationCache[provinceName] = translated;
    return translated;
}

// Server rejected the order because prices or shipping changed: refresh cart prices from the live catalog and ask her to reconfirm
function isPriceMismatch(e) { return !!(e && /price_mismatch/.test((e.message || '') + ' ' + (e.details || '') + ' ' + (e.hint || ''))); }
async function handlePriceMismatch() {
    try {
        await populateProvinces();
        const { data } = await _supabase.from('products').select('id,price,in_stock');
        if (Array.isArray(data)) {
            cart.forEach(it => { const f = data.find(b => String(b.id) === String(it.id)); if (f) { it.price = f.price; } });
            (window.fullData || []).forEach(b => { const f = data.find(x => String(x.id) === String(b.id)); if (f) { b.price = f.price; b.in_stock = f.in_stock; } });
            saveCartToLocalStorage(); updateCartUI();
        }
    } catch (e) { console.error(e); }
    alert('الأسعار أو الشحن اتحدّثوا. راجعي السلة والإجمالي الجديد وأكدي الطلب تاني.');
}

function addItemToCart(id, customQty = 1) {
    if (orderSubmitting || PAY.busy) return;
    if (!safeProductId(id)) return;
    const book = window.fullData.find(b => String(b.id) === String(id));
    if (!book || book.in_stock === false) return;
    const inCart = cart.find(i => String(i.id) === String(id));
    if (inCart) inCart.qty += customQty;
    else cart.push({ ...book, qty: customQty });
    updateCartUI();
    saveCartToLocalStorage();
    setTimeout(openCart, 600);
}

function updateCartUI() {
    const container = document.getElementById('cart-items-container');
    const totalVal = document.getElementById('total-val');
    const booksCountVal = document.getElementById('books-count-val');
    const shippingSec = document.getElementById('shipping-sec');
    const shippingVal = document.getElementById('shipping-val');
    const grandTotalSec = document.getElementById('grand-total-sec');
    const grandTotalVal = document.getElementById('grand-total-val');
    const shippingInfoMessageDiv = document.getElementById('shipping-info-message');
    const shippingMessageCostSpan = document.getElementById('shipping-message-cost');
    const provinceSelect = document.getElementById('customer-province');
    const orderUI = document.getElementById('order-ui-wrapper');

    const lang = document.documentElement.lang || 'ar';
    const t = translations[lang];

    if (window.fullData) {
        window.fullData.forEach(book => {
            if (!safeProductId(book.id)) return;
            const isInCart = cart.find(i => String(i.id) === String(book.id));
            const btns = document.querySelectorAll(`[data-id="${book.id}"]`);
            btns.forEach(btn => {
                btn.classList.toggle('success', !!isInCart);
                btn.innerHTML = isInCart ? '<i class="bi bi-check-lg"></i>' : '<i class="bi bi-cart-plus"></i>';
            });
        });
    }
    const detailsBtn = document.getElementById('details-add-btn');
    if (detailsBtn && window.currentOpenedBookId) {
        const isInCart = cart.find(i => String(i.id) === String(window.currentOpenedBookId));
        detailsBtn.classList.toggle('success', !!isInCart);
        detailsBtn.innerHTML = isInCart ? `<i class="bi bi-check-lg"></i> ${lang === 'en' ? t.added : 'تم الإضافة'}` : `<i class="bi bi-cart-plus"></i> ${lang === 'en' ? t.addToCart : 'إضافة للسلة'}`;
    }
    updateGlobalCartCount(); updateGlobalWishCount();
    if (cart.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:80px 20px; color: var(--paper-light); display: flex; flex-direction: column; align-items: center; justify-content: center;"><i class="bi bi-cart-x" style="font-size: 4.5rem; color: var(--accent-wood); opacity: 0.4; margin-bottom: 20px;"></i><h3 style="font-size: 1.4rem; font-weight: bold; margin-bottom: 10px;">${t.cartEmptyTitle}</h3><p style="font-size: 0.95rem; opacity: 0.7; margin-bottom: 25px;">${t.cartEmptyDesc}</p><button class="shop-now-btn" onclick="shopNow()">${t.startShopping} <i class="bi bi-bag-check-fill"></i></button></div>`;
        orderUI.style.display = 'none'; updateGlobalCartCount(); return;
    }
    orderUI.style.display = 'flex';

    container.innerHTML = cart.map((item, idx) => {
        // ترجمة اسم الكتاب داخل السلة تلقائياً
        let displayTitle = (lang === 'en' && autoTranslationCache[item.id]) ? autoTranslationCache[item.id].title : item.title;
        return `<div class="cart-item">
            <img src="${pendingEsc(getValidImageUrl(item.image_url))}" alt="${pendingEsc(displayTitle)}">
            <div class="cart-item-details">
                <h4>${pendingEsc(displayTitle)}</h4>
                <p>${pendingEsc(item.price)} ${t.currency}</p>
            </div>
            <div class="cart-controls">
                <button class="qty-btn" aria-label="تقليل الكمية" onclick="changeQty(${idx}, -1)"><i class="bi bi-dash-circle-fill"></i></button>
                <span class="qty-val">${pendingEsc(item.qty)}</span>
                <button class="qty-btn" aria-label="زيادة الكمية" onclick="changeQty(${idx}, 1)"><i class="bi bi-plus-circle-fill"></i></button>
            </div>
            <i class="bi bi-trash3 remove-item-btn" role="button" tabindex="0" aria-label="حذف المنتج من السلة" onclick="deleteFromCart(${idx})"></i>
        </div>`;
    }).join('');

    const booksTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    totalVal.innerText = `${booksTotal} ${t.currency}`;
    const totalBooksQty = cart.reduce((acc, item) => acc + item.qty, 0);
    booksCountVal.innerText = `${totalBooksQty}`;
    const selectedProvinceName = provinceSelect.value;
    shippingCost = shippingPrices[selectedProvinceName] || 0;
    if (selectedProvinceName && shippingCost > 0) {
        shippingMessageCostSpan.innerText = shippingCost;
        shippingInfoMessageDiv.style.display = 'block'; shippingSec.style.display = 'block'; grandTotalSec.style.display = 'block';
    } else {
        shippingInfoMessageDiv.style.display = 'none'; shippingSec.style.display = 'none'; grandTotalSec.style.display = 'none';
    }
    // تحديث الأرقام والعملة المترجمة داخل القوالب التي تم إنشاؤها في toggleLanguage
    if (shippingVal) shippingVal.innerText = `${shippingCost} ${t.currency}`;
    if (grandTotalVal) grandTotalVal.innerText = `${booksTotal + shippingCost} ${t.currency}`;
}

function changeQty(idx, delta) {
    cart[idx].qty += delta;
    if (cart[idx].qty < 1) deleteFromCart(idx);
    else { updateCartUI(); saveCartToLocalStorage(); }
}

function deleteFromCart(idx) {
    cart.splice(idx, 1); updateCartUI(); saveCartToLocalStorage();
    if (cart.length === 0) closeCart();
}

function saveCartToLocalStorage() { localStorage.setItem('cart', JSON.stringify(cart)); }

function updateGlobalCartCount() {
    const globalCountElement = document.getElementById('global-cart-count');
    const stickyCountElement = document.getElementById('sticky-cart-count');
    const totalQty = cart.reduce((acc, item) => acc + item.qty, 0);
    if (globalCountElement) { globalCountElement.innerText = totalQty; globalCountElement.style.display = totalQty > 0 ? 'flex' : 'none'; }
    if (stickyCountElement) { stickyCountElement.innerText = totalQty; stickyCountElement.style.display = totalQty > 0 ? 'flex' : 'none'; }
}

function toggleWishlist(id) {
    const idx = wishlist.indexOf(id);
    if (idx === -1) { wishlist.push(id); wishlistNewCount++; }
    else { wishlist.splice(idx, 1); if (wishlistNewCount > 0) wishlistNewCount--; }
    localStorage.setItem('wishlist', JSON.stringify(wishlist)); localStorage.setItem('wishlistNewCount', wishlistNewCount);
    updateGlobalWishCount();
    const icon = document.getElementById(`wish-icon-${id}`);
    const btn = document.getElementById(`wish-btn-${id}`);
    const isNowInWishlist = wishlist.includes(id);
    if (icon) icon.className = 'bi bi-bookmark-heart';
    if (btn) btn.classList.toggle('active', isNowInWishlist);
    updateDetailsWishBtn(id);
    if (currentView === 'wishlist') showWishlist();
}

function updateGlobalWishCount() {
    const el = document.getElementById('global-wish-count');
    const stickyEl = document.getElementById('sticky-wish-count');
    if (el) { el.innerText = wishlistNewCount; el.style.display = wishlistNewCount > 0 ? 'flex' : 'none'; }
    if (stickyEl) { stickyEl.innerText = wishlistNewCount; stickyEl.style.display = wishlistNewCount > 0 ? 'flex' : 'none'; }
}

function updateGlobalSupportCount() {
    const el = document.getElementById('global-support-count');
    if (!el) return;
    el.innerText = supportNewCount;
    el.style.display = (supportNewCount > 0) ? 'flex' : 'none';
    el.style.backgroundColor = "var(--accent-wood)"; el.style.color = "var(--wood-dark)";
}

function showWishlist(shouldPush = true) {
    currentView = 'wishlist'; wishlistNewCount = 0;
    localStorage.setItem('wishlistNewCount', 0); updateGlobalWishCount();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelectorAll('.bottom-bar-item').forEach(i => i.classList.remove('active'));
    document.getElementById('wishlist-tab').classList.add('active');
    if (shouldPush) pushNavigationState('wishlist');
    const filtered = window.fullData.filter(b => wishlist.includes(b.id)); renderBooksList(filtered);
}

function showCategoriesAndHome(shouldPush = true) {
    currentView = 'home'; closeCart(false); closeSupport(false); closeBookDetails(false);
    document.getElementById('main-search').value = ''; document.getElementById('sticky-search').value = '';
    const topItems = document.querySelectorAll('.category-item'); const bottomItems = document.querySelectorAll('.dropdown-item');
    topItems.forEach(i => i.classList.remove('active')); bottomItems.forEach(i => i.classList.remove('active'));
    if(topItems[0]) topItems[0].classList.add('active'); if(bottomItems[0]) bottomItems[0].classList.add('active');
    document.querySelectorAll('.bottom-bar-item').forEach(i => i.classList.remove('active'));
    document.getElementById('categories-bottom-tab').classList.add('active');
    if (shouldPush) pushNavigationState('home');
    renderBooksList(window.fullData); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openCart(shouldPush = true) {
    document.getElementById('cart-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    addLockScroll();
    updateLayersScroll(); // تحديث السكرول فور فتح السلة
    if (shouldPush) pushNavigationState('cart'); updateCartUI();
    // never show checkout errors just because the cart was opened
    document.querySelectorAll('#cart-drawer .validation-error').forEach(e => { e.style.display = 'none'; });
}

// hide a field's error as soon as the customer edits that field
['name', 'phone', 'whatsapp', 'address'].forEach(k => {
    document.addEventListener('input', ev => {
        if (ev.target && ev.target.id === 'customer-' + k) { const e = document.getElementById(k + '-error'); if (e) e.style.display = 'none'; }
    });
});
document.addEventListener('change', ev => {
    if (ev.target && ev.target.id === 'customer-province') { const e = document.getElementById('province-error'); if (e) e.style.display = 'none'; }
});

function closeCart(shouldGoBack = true) {
    if (!document.getElementById('cart-drawer').classList.contains('open')) return;
    document.getElementById('cart-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
    removeLockScroll();
    updateLayersScroll(); // إعادة السكرول لما تحته فور إغلاق السلة
    if (shouldGoBack && window.history.state?.view === 'cart') window.history.back();
}

function shopNow() { showCategoriesAndHome(); }

async function populateProvinces() {
    const provinceSelect = document.getElementById('customer-province');
    const selected = provinceSelect.value;
    await loadShippingRates();
    while (provinceSelect.options.length > 1) provinceSelect.remove(1);
    const lang = document.documentElement.lang || 'ar';
    for (const [provinceName, cost] of Object.entries(shippingPrices)) {
        const option = document.createElement('option');
        option.value = provinceName;
        option.innerText = (lang === 'en') ? (await translateProvinceName(provinceName)) : provinceName;
        option.setAttribute('data-ar', provinceName); // حفظ الاسم العربي كـ Data Attribute
        provinceSelect.appendChild(option);
    }
    provinceSelect.value = selected;
    provinceSelect.onchange = updateCartUI;
    updateCartUI();
}

let orderSubmitting = false;
async function confirmOrder() {
    if (orderSubmitting || PAY.busy || document.getElementById('pay-overlay').style.display === 'flex') return;
    if (cart.length === 0) { alert(document.documentElement.lang === 'en' ? translations.en.cartEmptyAlert : "السلة فارغة! لا يمكن تأكيد طلب بدون منتجات."); return; }
    const nameInput = document.getElementById('customer-name'); const phoneInput = document.getElementById('customer-phone');
    const whatsappInput = document.getElementById('customer-whatsapp'); const provinceSelect = document.getElementById('customer-province');
    const addressTextarea = document.getElementById('customer-address'); const addressError = document.getElementById('address-error');
    const notesTextarea = document.getElementById('customer-notes'); const nameError = document.getElementById('name-error');
    const phoneError = document.getElementById('phone-error'); const whatsappError = document.getElementById('whatsapp-error');
    const provinceError = document.getElementById('province-error');
    const confirmBtn = document.getElementById('confirm-order-submit');
    const lang = document.documentElement.lang || 'ar';
    const t = translations[lang];
    nameError.style.display = 'none'; phoneError.style.display = 'none'; whatsappError.style.display = 'none'; provinceError.style.display = 'none'; addressError.style.display = 'none';
    let isValid = true;
    if (nameInput.value.trim().split(/\s+/).length < 2) { nameError.innerText = t.nameErrorMsg; nameError.style.display = 'block'; isValid = false; }
    const egyptianPhoneRegex = /^(010|011|012|015)[0-9]{8}$/;
    if (!egyptianPhoneRegex.test(phoneInput.value.trim())) { phoneError.innerText = t.phoneErrorMsg; phoneError.style.display = 'block'; isValid = false; }
    if (!egyptianPhoneRegex.test(whatsappInput.value.trim())) { whatsappError.innerText = t.whatsappErrorMsg; whatsappError.style.display = 'block'; isValid = false; }
    if (provinceSelect.value === "") { provinceError.innerText = t.provinceErrorMsg; provinceError.style.display = 'block'; isValid = false; }
    if (addressTextarea.value.trim().length < 5) { addressError.innerText = t.addressErrorMsg; addressError.style.display = 'block'; isValid = false; }
    if (!isValid) return;
    if (!shippingRatesReady || !Object.hasOwn(shippingPrices, provinceSelect.value)) { alert('تعذّر تحميل تكلفة الشحن. حدّثي الصفحة وحاولي تاني.'); return; }
    const booksTotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const totalAmount = booksTotal + shippingCost;
    const orderData = { customer_name: nameInput.value.trim(), customer_phone: phoneInput.value.trim(), customer_whatsapp: whatsappInput.value.trim(), province: provinceSelect.value, address: addressTextarea.value.trim(), notes: notesTextarea ? notesTextarea.value.trim() : "", items: cart.map(item => ({ ...item })), total_amount: totalAmount, shipping_cost: shippingCost, status: 'pending' };

    orderSubmitting = true;
    confirmBtn.disabled = true; confirmBtn.textContent = t.processingOrder;
    try {
    // هل المطلوب عربون؟ (الإعدادات بتيجي من لوحة الأدمن)
    let settings = null, legacy = false;
    try { settings = await loadPaymentSettings(); }
    catch (e) {
        if (isMissingPaymentTable(e)) legacy = true;   // الـ SQL لسه ما اتشغّلش: الموقع يشتغل بالطريقة القديمة
        else { alert(payT('settingsError')); return; }
    }
    const deposit = (!legacy && settings && settings.deposit_enabled) ? calcDeposit(settings, booksTotal) : 0;
    if (deposit > 0) { openPayModal({ mode: 'order', orderData, settings, deposit, booksTotal }); return; }

        confirmBtn.disabled = true; confirmBtn.innerHTML = `${t.processingOrder} <i class="bi bi-hourglass-split"></i>`;
        const { data: placed, error } = await _supabase.rpc('place_order', { p: orderData });
        if (isPriceMismatch(error)) { await handlePriceMismatch(); return; }
        if (error || !placed) { console.error('order insert failed', error); throw new Error('order-failed'); }
        chatSessionStart(placed);
        alert(t.orderSuccess);
        resetOrderForm();
        closeCart();
    } catch (err) { console.error(err); alert(`${t.orderError} ${LT('جرّبي تاني بعد شوية، أو كلمينا على واتساب.', 'Please try again in a moment, or contact us on WhatsApp.')}`); }
    finally { orderSubmitting = false; confirmBtn.disabled = false; confirmBtn.innerHTML = `${t.confirmOrderBtn} <i class="bi bi-bag-check-fill"></i>`; }
}

function resetOrderForm() {
    cart = []; updateCartUI(); saveCartToLocalStorage();
    ['customer-name', 'customer-phone', 'customer-whatsapp', 'customer-province', 'customer-address', 'customer-notes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

/* =====================================================================
   شاشة دفع العربون
   ===================================================================== */
const PAY_TEXT = {
    ar: {
        title: 'ادفعي العربون لتأكيد طلبك', titleAttach: 'ارفعي إيصال الدفع',
        sub: 'الطلب بيتسجّل بعد ما تبعتي إيصال التحويل، وهنراجعه ونأكد لحضرتك.',
        subAttach: 'لو مش داخلة للطلب، اكتبي الموبايل والكود السري اللي ظهر وقت تسجيله، وبعدها ارفعي الإيصال.',
        amountLabel: 'العربون المطلوب', copy: 'نسخ', copied: 'تم ✓', cur: 'ج.م',
        products: 'قيمة المنتجات', shipping: 'الشحن', deposit: 'العربون', remaining: 'الباقي عند الاستلام',
        walletLabel: 'فودافون كاش', instapayLabel: 'إنستاباي',
        steps: ['انسخي رقم المحفظة أو عنوان إنستاباي من فوق.', 'حوّلي مبلغ العربون بالظبط.', 'صوّري شاشة التحويل (سكرين شوت) واحفظيها.', 'ارفعي صورة الإيصال هنا واضغطي "تأكيد".'],
        upload: 'اضغطي لرفع صورة الإيصال', uploadChange: 'تغيير الصورة', phonePh: 'رقم الموبايل المسجّل على الطلب',
        submit: 'تأكيد وإرسال الطلب', submitAttach: 'رفع الإيصال', later: 'هحوّل وأرفع الإيصال بعدين',
        expiry: 'لو ما وصلناش الإيصال خلال {h} ساعة الطلب بيتلغي تلقائياً.',
        needFile: 'من فضلك ارفعي صورة الإيصال الأول.', badFile: 'الملف لازم يكون صورة (JPG / PNG / WEBP).', bigFile: 'الصورة كبيرة قوي، جرّبي صورة أصغر.',
        needPhone: 'اكتبي رقم موبايل مصري صحيح (11 رقم).', noOrder: 'مفيش طلب منتظر إيصال على الرقم ده. اتأكدي من الرقم أو كلمينا في الشات.',
        uploadFail: 'تعذّر رفع الصورة، جرّبي تاني.', sending: 'جاري الإرسال...',
        doneTitle: 'وصلنا طلبك 🎉', doneReceipt: 'استلمنا الإيصال وهنراجعه ونأكد طلبك في أقرب وقت. هتلاقي حالته "في انتظار تأكيد الدفع" لحد ما نأكده.',
        doneNoReceipt: 'الطلب اتسجّل وفي انتظار الإيصال. بعد ما تحوّلي، ارفعي الإيصال من زرار "سجّلتي طلب ومحتاجة ترفعي إيصال الدفع؟" في السلة.',
        doneAttachTitle: 'تم رفع الإيصال ✅', doneAttach: 'هنراجع الإيصال ونأكد طلبك قريباً.', ok: 'تمام',
        settingsError: 'تعذّر تحميل بيانات الدفع، جرّبي تاني بعد شوية.'
    },
    en: {
        title: 'Pay the deposit to confirm your order', titleAttach: 'Upload your payment receipt',
        sub: 'Your order is placed once you send the transfer receipt. We will review and confirm it.',
        subAttach: 'Sign in to your order with its phone number and 6-digit code, then upload your receipt.',
        amountLabel: 'Deposit due', copy: 'Copy', copied: 'Done ✓', cur: 'EGP',
        products: 'Items', shipping: 'Shipping', deposit: 'Deposit', remaining: 'Remaining on delivery',
        walletLabel: 'Vodafone Cash', instapayLabel: 'InstaPay',
        steps: ['Copy the wallet number or InstaPay address above.', 'Transfer the exact deposit amount.', 'Take a screenshot of the transfer.', 'Upload the receipt here and tap "Confirm".'],
        upload: 'Tap to upload the receipt photo', uploadChange: 'Change photo', phonePh: 'Phone number on the order',
        submit: 'Confirm & place order', submitAttach: 'Upload receipt', later: "I'll transfer and upload the receipt later",
        expiry: 'If we do not receive the receipt within {h} hours the order is cancelled automatically.',
        needFile: 'Please upload the receipt photo first.', badFile: 'The file must be an image (JPG / PNG / WEBP).', bigFile: 'The image is too large, try a smaller one.',
        needPhone: 'Enter a valid Egyptian mobile number (11 digits).', noOrder: 'No order is waiting for a receipt on this number. Check the number or chat with us.',
        uploadFail: 'Could not upload the image, please try again.', sending: 'Sending...',
        doneTitle: 'We got your order 🎉', doneReceipt: 'We received your receipt and will review it shortly. The order shows "Awaiting payment confirmation" until then.',
        doneNoReceipt: 'Your order is saved and waiting for the receipt. After you transfer, upload it from the receipt link inside the cart.',
        doneAttachTitle: 'Receipt uploaded ✅', doneAttach: 'We will review the receipt and confirm your order soon.', ok: 'OK',
        settingsError: 'Could not load payment details, please try again shortly.'
    }
};
const payT = k => (PAY_TEXT[document.documentElement.lang === 'en' ? 'en' : 'ar'])[k];
const PAY = { settings: null, orderData: null, deposit: 0, mode: 'order', file: null, busy: false };
const RECEIPT_BUCKET = 'receipts';

async function loadPaymentSettings() {
    const { data, error } = await _supabase.from('payment_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data;
}
function isMissingPaymentTable(e) {
    const m = String((e && (e.message || '')) + ' ' + (e && e.code || ''));
    return /PGRST205|42P01|payment_settings/.test(m) && /does not exist|not find|PGRST205|42P01|schema cache/i.test(m);
}
// نفس معادلة الـ trigger في قاعدة البيانات (الحساب الرسمي هناك): نسبة/مبلغ ثابت من قيمة المنتجات بدون الشحن، مُقرَّب لأعلى
function calcDeposit(settings, base) {
    if (!settings || !settings.deposit_enabled || !(base > 0)) return 0;
    const v = parseFloat(settings.deposit_value) || 0;
    const d = settings.deposit_mode === 'fixed' ? Math.min(v, base) : base * v / 100;
    return Math.max(0, Math.ceil(d - 1e-9));
}

function payFmt(n) { return Number(n).toLocaleString('en-US'); }
function payCopyText(text, btn) {
    text = String(text || '').trim();
    const done = () => { const old = btn.innerHTML; btn.classList.add('copied'); btn.innerHTML = payT('copied'); setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '<i class="bi bi-clipboard"></i> ' + payT('copy'); }, 1500); };
    const legacy = () => { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0;top:0;left:0;'; document.body.appendChild(t); t.focus(); t.select(); try { document.execCommand('copy'); done(); } catch (e) {} t.remove(); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(legacy); else legacy();
}

function payFillStatic() {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('pay-amount-label', payT('amountLabel')); set('pay-cur', payT('cur'));
    set('pay-wallet-label', payT('walletLabel')); set('pay-instapay-label', payT('instapayLabel'));
    document.querySelectorAll('#pay-overlay .pay-copy').forEach(b => { b.classList.remove('copied'); b.innerHTML = '<i class="bi bi-clipboard"></i> ' + payT('copy'); });
    document.getElementById('pay-steps').innerHTML = payT('steps').map(x => `<li>${x}</li>`).join('');
    document.getElementById('pay-phone').placeholder = payT('phonePh');
    document.getElementById('pay-later').textContent = payT('later');
    document.getElementById('pay-done-btn').textContent = payT('ok');
}

function openPayModal(opts) {
    if (PAY.busy) return;
    PAY.targetOrderId = safeProductId(opts.targetOrderId);
    PAY.requireAuth = !!(PAY.targetOrderId && String(chatSess()?.order_id) !== PAY.targetOrderId);
    PAY.mode = opts.mode; PAY.settings = opts.settings; PAY.orderData = opts.orderData || null; PAY.deposit = opts.deposit || 0; PAY.file = null; PAY.busy = false; PAY.completed = false;
    payFillStatic();
    const s = opts.settings || {};
    const isOrder = opts.mode === 'order';
    document.getElementById('pay-title').textContent = payT(isOrder ? 'title' : 'titleAttach');
    document.getElementById('pay-sub').textContent = payT(isOrder ? 'sub' : 'subAttach');
    document.getElementById('pay-amount-box').style.display = isOrder ? 'block' : 'none';
    document.getElementById('pay-attach-fields').style.display = isOrder ? 'none' : 'block';
    document.getElementById('pay-later').style.display = isOrder ? 'block' : 'none';
    document.getElementById('pay-submit').textContent = payT(isOrder ? 'submit' : 'submitAttach');
    const expiryNote = document.getElementById('pay-expiry-note');
    expiryNote.textContent = 'احتفظي بالكود السري. رفع الإيصال بيتطلب الدخول لنفس الطلب بالموبايل والكود.';
    expiryNote.style.display = 'block';
    if (isOrder) {
        document.getElementById('pay-deposit').textContent = payFmt(PAY.deposit);
        const total = opts.orderData.total_amount;
        document.getElementById('pay-breakdown').innerHTML =
            `<div><span>${payT('products')}</span><span>${payFmt(opts.booksTotal)} ${payT('cur')}</span></div>` +
            `<div><span>${payT('shipping')}</span><span>${payFmt(opts.orderData.shipping_cost)} ${payT('cur')}</span></div>` +
            `<div class="pay-b-dep"><span>${payT('deposit')}</span><span>${payFmt(PAY.deposit)} ${payT('cur')}</span></div>` +
            `<div><span>${payT('remaining')}</span><span>${payFmt(Math.max(0, total - PAY.deposit))} ${payT('cur')}</span></div>`;
    } else {
        const saved = localStorage.getItem('pendingReceiptPhone');
        document.getElementById('pay-phone').value = saved || '';
        document.getElementById('pay-code').value = '';
        const session = chatSess();
        document.getElementById('pay-attach-fields').style.display = session && !PAY.requireAuth ? 'none' : 'block';
        if (session && !PAY.requireAuth) document.getElementById('pay-sub').textContent = 'الإيصال هيرتبط بالطلب رقم ' + String(session.order_id) + ' اللي إنتِ داخلة عليه.';
    }
    const w = (s.wallet_number || '').trim(), ip = (s.instapay_address || '').trim();
    document.getElementById('pay-wallet').textContent = w; document.getElementById('pay-method-wallet').style.display = w ? 'flex' : 'none';
    document.getElementById('pay-instapay').textContent = ip; document.getElementById('pay-method-instapay').style.display = ip ? 'flex' : 'none';
    payResetUpload(); payError('');
    document.getElementById('pay-submit').disabled = false; document.getElementById('pay-later').disabled = false;
    document.getElementById('pay-view-form').style.display = 'block';
    document.getElementById('pay-view-done').style.display = 'none';
    const ov = document.getElementById('pay-overlay'); ov.style.display = 'flex'; ov.scrollTop = 0; syncScrollLock();
}
async function openReceiptOnly(targetOrderId) {
    let settings = null;
    try { settings = await loadPaymentSettings(); } catch (e) { alert(payT('settingsError')); return; }
    openPayModal({ mode: 'attach', settings, targetOrderId });
}
function closePayModal() { if (PAY.busy) return; document.getElementById('pay-overlay').style.display = 'none'; PAY.busy = false; syncScrollLock(); }

function payError(msg) { const el = document.getElementById('pay-error'); el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
function payResetUpload() {
    PAY.file = null; document.getElementById('pay-file').value = '';
    const img = document.getElementById('pay-preview'); img.style.display = 'none'; img.removeAttribute('src');
    document.getElementById('pay-upload-text').textContent = payT('upload');
    document.getElementById('pay-upload-label').classList.remove('has-file');
}
function payPickFile(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) { payResetUpload(); payError(payT('badFile')); return; }
    if (f.size > 25 * 1024 * 1024) { payResetUpload(); payError(payT('bigFile')); return; }
    payError(''); PAY.file = f;
    const img = document.getElementById('pay-preview'); img.src = URL.createObjectURL(f); img.style.display = 'block';
    document.getElementById('pay-upload-text').textContent = payT('uploadChange');
    document.getElementById('pay-upload-label').classList.add('has-file');
}

// تصغير الصورة قبل الرفع (أسرع على النت الضعيف، وتحت حد الـ 5MB)
async function payCompress(file) {
    try {
        const bmp = await createImageBitmap(file);
        const max = 1600, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
        if (blob && blob.size <= 5 * 1024 * 1024) return blob;
    } catch (e) { /* نكمّل بالأصل لو التصغير فشل */ }
    if (file.size <= 5 * 1024 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    throw new Error('big');
}
async function payUploadReceipt(file) {
    const blob = await payCompress(file);
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const rid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
    const path = rid + '.' + ext;
    const { error } = await _supabase.storage.from(RECEIPT_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw error;
    return path;
}

async function payConfirm(withReceipt) {
    if (PAY.busy || PAY.completed) return;
    payError('');
    const submitBtn = document.getElementById('pay-submit'), laterBtn = document.getElementById('pay-later');
    const lock = on => { PAY.busy = on; submitBtn.disabled = on; laterBtn.disabled = on; if (on) submitBtn.textContent = payT('sending'); else submitBtn.textContent = payT(PAY.mode === 'order' ? 'submit' : 'submitAttach'); };
    try {
        if (PAY.mode === 'attach') {
            if (!PAY.file) { payError(payT('needFile')); return; }
            lock(true);
            let sess = PAY.requireAuth ? null : chatSess();
            if (!sess) {
                const phone = normalizePhone(document.getElementById('pay-phone').value);
                const code = document.getElementById('pay-code').value.trim();
                if (!/^(010|011|012|015)[0-9]{8}$/.test(phone)) throw new Error(payT('needPhone'));
                if (!/^[0-9]{6}$/.test(code)) throw new Error('اكتبي الكود السري المكوّن من 6 أرقام.');
                const result = await loginOrderSession(phone, code);
                if (!result) throw new Error('الموبايل أو الكود غير صحيح، أو الدخول موقوف مؤقتًا. جرّبي من مركز الدعم.');
                document.getElementById('pay-code').value = '';
                sess = chatSess();
            }
            if (PAY.targetOrderId && String(sess?.order_id) !== PAY.targetOrderId) throw new Error('الكود ده لطلب تاني. استخدمي كود الطلب الظاهر في الملخّص.');
            const path = await payUploadReceipt(PAY.file);
            const { data, error } = await _supabase.rpc('chat_attach_receipt_s', { p_token: sess.token, p_path: path });
            if (error) throw error;
            if (!data) { lock(false); payError(payT('noOrder')); return; }
            localStorage.removeItem('pendingReceiptPhone'); { const pp = pendingLoad(); if (pp && String(pp.orderId) === String(sess.order_id)) { pp.receiptUploaded = true; localStorage.setItem(PENDING_KEY, JSON.stringify(pp)); } } renderPendingBox();
            payShowDone(payT('doneAttachTitle'), payT('doneAttach')); lock(false); return;
        }
        if (withReceipt && !PAY.file) { payError(payT('needFile')); return; }
        lock(true);
        let path = null;
        if (withReceipt) path = await payUploadReceipt(PAY.file);
        const row = Object.assign({}, PAY.orderData, { status: 'awaiting_payment', deposit_amount: PAY.deposit, receipt_path: path });
        const { data: placed, error } = await _supabase.rpc('place_order', { p: row });
        if (isPriceMismatch(error)) { lock(false); closePayModal(); await handlePriceMismatch(); return; }
        if (error || !placed) throw error || new Error('order');
        const od = PAY.orderData;
        if (!withReceipt) localStorage.setItem('pendingReceiptPhone', od.customer_phone); else localStorage.removeItem('pendingReceiptPhone');
        const info = { phone: od.customer_phone, createdAt: Date.now(), receiptUploaded: !!withReceipt, province: od.province,
            deposit: PAY.deposit, total: od.total_amount, shipping: od.shipping_cost, booksTotal: od.total_amount - od.shipping_cost,
            orderId: placed.id || placed.order_id, items: (od.items || []).map(i => ({ title: i.title, qty: i.qty, price: i.price })) };
        localStorage.setItem(PENDING_KEY, JSON.stringify(info));
        const detail = pendingHTML(info, false);
        chatSessionStart(placed);   // دخول تلقائي للدعم 72 ساعة (جلسة على السيرفر)
        resetOrderForm(); closeCart(); renderPendingBox();
        payShowDone(payT('doneTitle'), payT(withReceipt ? 'doneReceipt' : 'doneNoReceipt'), detail); lock(false);
    } catch (err) {
        lock(false);
        payError(err && err.message === 'big' ? payT('bigFile') : (err && err.message ? payT('uploadFail') + ' (' + err.message + ')' : payT('uploadFail')));
    }
}

/* ---------- رسالة الطلب المنتظر للإيصال + العدّاد التنازلي ---------- */
const PENDING_KEY = 'pendingReceiptOrder';
function pendingLoad() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { return null; } }
function pendingDeadline(p) { return p.expiresAt ? Date.parse(p.expiresAt) : null; }
function pendingFmt(ms) {
    ms = Math.max(0, ms); const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function pendingEsc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function pendingHTML(p, withBtn) {
    const cur = payT('cur'), isAr = document.documentElement.lang !== 'en';
    const items = (p.items || []).map(i => `<li>${pendingEsc(i.title)} × ${pendingEsc(i.qty)}${i.price != null ? ' — ' + payFmt((parseFloat(i.price) || 0) * (parseFloat(i.qty) || 1)) + ' ' + cur : ''}</li>`).join('');
    const rem = Math.max(0, (p.total || 0) - (p.deposit || 0));
    const L = isAr ? {
        h: p.receiptUploaded ? 'استلمنا إيصال الدفع وجاري مراجعة طلبك' : 'طلبك مسجّل وفي انتظار إيصال العربون',
        prod: 'تفاصيل الطلب', pt: 'قيمة المنتجات', sh: 'الشحن', tot: 'الإجمالي',
        dep: 'العربون', rem: 'الباقي عند الاستلام', prov: 'المحافظة',
        how: p.receiptUploaded ? 'هنراجع الإيصال ونأكد طلبك في الشات، وهتلاقي كل التفاصيل في محادثة الدعم.'
            : 'بعد ما تحوّلي العربون، ارفعي صورة الإيصال من هنا (زرار \"ارفعي الإيصال دلوقتي\") وبنراجعه ونأكد طلبك. وهتلاقي تفاصيل الطلب كمان في محادثة الدعم.',
        btn: 'ارفعي الإيصال دلوقتي'
    } : {
        h: p.receiptUploaded ? 'We received your receipt and are reviewing your order' : 'Your order is saved and waiting for the deposit receipt',
        prod: 'Order details', pt: 'Products', sh: 'Shipping', tot: 'Total',
        dep: 'Deposit', rem: 'Remaining on delivery', prov: 'Province',
        how: p.receiptUploaded ? 'We will review the receipt and confirm your order in the chat.'
            : 'After you transfer the deposit, upload the receipt photo here (\"Upload receipt now\"). We will review it and confirm your order. The details are also in the support chat.',
        btn: 'Upload receipt now'
    };
    return `<h4><i class="bi bi-${p.receiptUploaded ? 'receipt' : 'hourglass-split'}"></i> ${L.h}</h4>
        <div>${L.prod}${p.province ? ' — ' + L.prov + ': ' + pendingEsc(p.province) : ''}</div><ul>${items}</ul>
        <div class="pm-rows">
            <div><span>${L.pt}</span><span>${payFmt(p.booksTotal || 0)} ${cur}</span></div>
            <div><span>${L.sh}</span><span>${payFmt(p.shipping || 0)} ${cur}</span></div>
            <div><span>${L.tot}</span><span>${payFmt(p.total || 0)} ${cur}</span></div>
            <div class="pm-dep"><span>${L.dep}</span><span>${payFmt(p.deposit || 0)} ${cur}</span></div>
            <div><span>${L.rem}</span><span>${payFmt(rem)} ${cur}</span></div>
        </div>
        <p class="pm-how">${L.how}</p>
        ${(withBtn && !p.receiptUploaded) ? `<button type="button" class="pm-btn" data-order-id="${pendingEsc(safeProductId(p.orderId))}" onclick="openReceiptOnly(this.dataset.orderId)"><i class="bi bi-paperclip"></i> ${L.btn}</button>` : ''}`;
}

function normalizePhone(value) {
    let phone = String(value || '').replace(/\D/g, '');
    if (phone.startsWith('20') && phone.length > 11) phone = phone.slice(2);
    if (phone.length === 10 && !phone.startsWith('0')) phone = '0' + phone;
    return phone;
}
async function loginOrderSession(phone, code) {
    const response = await fetch(supabaseUrl + '/functions/v1/chat-login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey },
        body: JSON.stringify({ phone, code })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok || !data.token) return false;
    chatStopSync();
    chatSessSave({ token: data.token, order_id: data.order_id, expires_at: data.expires_at });
    return true;
}

/* ---------- جلسة الدعم: تتحقق من السيرفر وتنتهي بعد 72 ساعة ---------- */
const SESS_KEY = 'chat_session';
function chatSess() {
    try {
        const o = JSON.parse(localStorage.getItem(SESS_KEY) || 'null');
        if (o && o.token && Date.parse(o.expires_at) > Date.now()) return o;
    } catch (e) {}
    return null;
}
function chatSessSave(o) { try { localStorage.setItem(SESS_KEY, JSON.stringify(o)); } catch (e) {} }
function chatCodeFor(oid) { try { return localStorage.getItem('chat_code_' + oid) || ''; } catch (e) { return ''; } }
function chatStopSync() { if (_chatPoll) { clearInterval(_chatPoll); _chatPoll = null; } chatSubscription = null; try { rtStop(); } catch (e) {} }
function chatSessClear() {
    if (window.besanCustomerPushOff) besanCustomerPushOff();
    localStorage.removeItem(SESS_KEY); localStorage.removeItem(OUTBOX_KEY); localStorage.removeItem(SEEN_KEY);
    chatStopSync();
}
function chatAutoExpiryCheck() {
    const raw = localStorage.getItem(SESS_KEY);
    if (raw && !chatSess()) { chatSessClear(); const cb = document.getElementById('chat-body'); if (cb) cb.querySelectorAll('.msg').forEach(m => m.remove()); }
}
function chatSessionStart(placed) {
    try {
        if (!placed || !placed.token) return;
        const old = chatSess();
        if (old && old.token !== placed.token) { chatStopSync(); localStorage.removeItem(OUTBOX_KEY); }
        chatSessSave({ token: placed.token, order_id: placed.id || placed.order_id, expires_at: placed.expires_at });
        if (placed.code) { localStorage.setItem('chat_code_' + (placed.id || placed.order_id), placed.code); }
        startChatSync();
        setTimeout(() => { try { if (chatSess() && !isSupportOpen()) { showSupport(); const po = document.getElementById('pay-overlay'); if (po && po.style.display !== 'none') { document.getElementById('support-drawer').classList.add('over-pay'); document.getElementById('drawer-overlay').classList.add('over-pay'); } } } catch (e) {} }, 350);
    } catch (e) { console.error(e); }
}

function renderPendingBox() {
    const box = document.getElementById('pending-receipt-box'); if (!box) return;
    const p = pendingLoad();
    if (!p) { box.style.display = 'none'; box.innerHTML = ''; return; }
    box.innerHTML = pendingHTML(p, true); box.style.display = 'block';
}
document.addEventListener('DOMContentLoaded', renderPendingBox);

function payShowDone(title, text, detailHTML) {
    PAY.completed = true;
    document.getElementById('pay-done-title').textContent = title; document.getElementById('pay-done-text').textContent = text;
    const dd = document.getElementById('pay-done-detail');
    if (dd) { dd.innerHTML = detailHTML || ''; dd.style.display = detailHTML ? 'block' : 'none'; }
    document.getElementById('pay-done-text').style.display = detailHTML ? 'none' : 'block';
    document.getElementById('pay-view-form').style.display = 'none'; document.getElementById('pay-view-done').style.display = 'block';
    document.getElementById('pay-overlay').scrollTop = 0;
}

let chatSubscription = null;
let typingTimer;
function showSupport(shouldPush = true) {
    chatAutoExpiryCheck();
    document.getElementById('support-drawer').classList.add('open'); document.getElementById('drawer-overlay').classList.add('open');
    addLockScroll();
    updateLayersScroll(); // تحديث السكرول فور فتح الدعم
    // لا نصفر العداد هنا، بل عند قراءة الرسائل
    // supportNewCount = 0; localStorage.setItem('supportNewCount', 0); updateGlobalSupportCount();
    // سيتم تصفير العداد عند تحميل الرسائل في startChatSync

    // سكرول لآخر المحادثة فور فتح الشات
    setTimeout(() => { const cb = document.getElementById('chat-body'); if(cb) cb.scrollTop = cb.scrollHeight; }, 100);

    document.querySelectorAll('.bottom-bar-item').forEach(i => i.classList.remove('active'));
    document.getElementById('support-tab').classList.add('active'); if (shouldPush) pushNavigationState('support');
    if (chatSess()) {
        document.getElementById('chat-auth-section').style.display = 'none'; document.getElementById('end-chat-btn').style.display = 'block';
        document.getElementById('chat-body').style.display = 'flex'; document.getElementById('support-drawer').classList.remove('logged-out');
        supportNewCount = 0; localStorage.setItem('supportNewCount', 0); markSeenNow(); updateGlobalSupportCount();
        if (_chatPoll) loadChatHistory(); else startChatSync();
        flushOutbox();
        if (window.besanCustomerPushInit) besanCustomerPushInit(true);
    } else {
        document.getElementById('chat-auth-section').style.display = 'block'; document.getElementById('end-chat-btn').style.display = 'none';
        document.getElementById('chat-body').style.display = 'none'; document.getElementById('support-drawer').classList.add('logged-out');
    }
}

function closeSupport(shouldGoBack = true) {
    if (!document.getElementById('support-drawer').classList.contains('open')) return;
    document.getElementById('support-drawer').classList.remove('open'); document.getElementById('drawer-overlay').classList.remove('open'); document.getElementById('support-drawer').classList.remove('over-pay'); document.getElementById('drawer-overlay').classList.remove('over-pay');
    removeLockScroll();
    updateLayersScroll(); // إعادة السكرول لما تحته فور إغلاق الدعم
    if (shouldGoBack && window.history.state?.view === 'support') window.history.back();
}

async function identifyChatUser() {
    const phoneInput = document.getElementById('chat-phone-input');
    const codeInput = document.getElementById('chat-code-input');
    const errorDiv = document.getElementById('chat-auth-error');
    const btn = phoneInput.closest('#chat-auth-section').querySelector('.confirm-order-btn');
    const wa = '<a href="https://wa.me/201067826270" target="_blank" style="color:inherit;font-weight:bold;text-decoration:underline">' + LT('كلمينا على واتساب', 'message us on WhatsApp') + '</a>';
    let cleanPhone = phoneInput.value.trim().replace(/\D/g, '');
    if (cleanPhone.startsWith('20') && cleanPhone.length > 11) cleanPhone = cleanPhone.substring(2);
    if (!cleanPhone.startsWith('0') && cleanPhone.length === 10) cleanPhone = '0' + cleanPhone;
    const code = (codeInput ? codeInput.value : '').trim().replace(/\D/g, '');
    errorDiv.style.display = 'none'; errorDiv.innerHTML = '';
    const showErr = h => { errorDiv.innerHTML = h; errorDiv.style.display = 'block'; };
    if (!/^(010|011|012|015)[0-9]{8}$/.test(cleanPhone)) { showErr('<i class="bi bi-exclamation-triangle-fill"></i> ' + LT('يرجى إدخال رقم موبايل مصري صحيح (11 رقم) 📱', 'Please enter a valid Egyptian mobile number (11 digits) 📱')); return; }
    if (!/^[0-9]{6}$/.test(code)) { showErr('<i class="bi bi-exclamation-triangle-fill"></i> ' + LT('اكتبي الكود السري المكوّن من 6 أرقام 🔑', 'Enter your 6-digit secret code 🔑')); return; }
    try {
        btn.disabled = true; btn.innerHTML = LT('جاري التحقق...', 'Verifying...') + ' <i class="bi bi-hourglass-split"></i>';
        const r = await fetch(supabaseUrl + '/functions/v1/chat-login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }, body: JSON.stringify({ phone: cleanPhone, code }) });
        const d = await r.json().catch(() => null);
        if (d && d.ok && d.token) {
            chatSessSave({ token: d.token, order_id: d.order_id, expires_at: d.expires_at });
            localStorage.setItem('chat_code_' + d.order_id, code);
            codeInput.value = ''; chatStopSync();
            showSupport();
        } else if (d && d.error === 'locked') {
            showErr('<i class="bi bi-lock-fill"></i> ' + LT('الدخول موقوف مؤقتًا بعد محاولات غلط كتير. جرّبي بعد 15 دقيقة، أو ' + wa + ' وهنتحقق منك ونساعدك.', 'Sign-in is paused for a while after too many wrong attempts. Try again in 15 minutes, or ' + wa + ' and we will verify you and help.'));
        } else if (d && d.error === 'invalid') {
            showErr('<i class="bi bi-exclamation-triangle-fill"></i> ' + LT('الموبايل أو الكود غير صحيح. لو ضاع الكود ' + wa + ' وهنتحقق منك ونرجعهولك.', 'The mobile number or code is incorrect. If you lost the code, ' + wa + ' and we will verify you and send it again.'));
        } else {
            showErr(LT('حدث خطأ بسيط في الاتصال، حاولي مرة أخرى.', 'A small connection error occurred. Please try again.'));
        }
    } catch (err) {
        console.error(err); showErr(LT('حدث خطأ بسيط في الاتصال، حاولي مرة أخرى.', 'A small connection error occurred. Please try again.'));
    } finally {
        btn.disabled = false; btn.innerHTML = LT('دخول', 'Sign in');
    }
}

// منع تكرار الرسالة الواحدة لو وصلت من مسارين (بث مباشر + قاعدة بيانات)
// من غير ما نمنع إرسال نفس النص مرتين: كل مسار بيلغي نسخة المسار التاني بس
const _dupMarks = [];
function isDuplicateArrival(text, src) {
    const now = Date.now();
    for (let i = _dupMarks.length - 1; i >= 0; i--) if (now - _dupMarks[i].t > 6000) _dupMarks.splice(i, 1);
    const other = src === 'b' ? 'd' : 'b';
    const idx = _dupMarks.findIndex(m => m.text === text && m.src === other);
    if (idx !== -1) { _dupMarks.splice(idx, 1); return true; }
    _dupMarks.push({ text, src, t: now });
    return false;
}

/* ===== ضمان وصول الرسائل: صندوق صادر محفوظ + معرّف فريد لكل رسالة + عدّاد غير المقروء ===== */
(function () {
    const st = document.createElement('style');
    st.textContent = '.msg-pending{opacity:.55}.msg-failed{opacity:.75;outline:1px dashed #e74c3c}';
    document.head.appendChild(st);
})();

const OUTBOX_KEY = 'chat_outbox';
const SEEN_KEY = 'chat_seen_at';
const renderedCids = new Set();
let _flushing = false, _flushTimer = null, _chatStarting = false, _historyLoading = false;

function newMsgId() {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function getOutbox() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || []; } catch (e) { return []; } }
function setOutbox(a) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(a)); } catch (e) {} }
function isSupportOpen() { const d = document.getElementById('support-drawer'); return !!(d && d.classList.contains('open')); }
function markSeenNow() { try { localStorage.setItem(SEEN_KEY, String(Date.now())); } catch (e) {} }

// منع تكرار نفس الرسالة لو وصلت من مسارين: بالمعرّف الفريد، وللرسائل القديمة بالمصدر
function isDupMsg(cid, text, src) {
    if (cid) { if (renderedCids.has(cid)) return true; renderedCids.add(cid); return false; }
    return isDuplicateArrival(text, src);
}
function setMsgState(cid, state) {
    document.querySelectorAll('[data-cid="' + cid + '"]').forEach(el => {
        el.classList.remove('msg-pending', 'msg-failed');
        if (state) el.classList.add('msg-' + state);
    });
}
function scheduleFlush() { clearTimeout(_flushTimer); _flushTimer = setTimeout(flushOutbox, 8000); }

// إرسال كل الرسائل المعلّقة: لو مفيش نت بتفضل محفوظة وتتبعت لوحدها لما النت يرجع
async function flushOutbox() {
    if (_flushing) return;
    _flushing = true;
    try {
        for (const item of getOutbox()) {
            let error = null;
            try {
                const sess = chatSess(); if (!sess) break;
                ({ error } = await _supabase.rpc('chat_send_s', { p_token: sess.token, p_text: item.text, p_client_id: item.cid }));
            } catch (e) { error = { message: String(e) }; }
            if (!error) {
                setOutbox(getOutbox().filter(i => i.cid !== item.cid));
                setMsgState(item.cid, null);
                continue;
            }
            const retryable = !navigator.onLine || !error.code || ['PGRST202', '42883'].includes(error.code)
                || /fetch|network|load failed|timeout/i.test(error.message || '');
            if (retryable) break;
            item.attempts = (item.attempts || 0) + 1;
            if (item.attempts >= 5) {
                setOutbox(getOutbox().filter(i => i.cid !== item.cid));
                setMsgState(item.cid, 'failed');
            } else {
                setOutbox(getOutbox().map(i => i.cid === item.cid ? item : i));
            }
        }
    } finally { _flushing = false; }
    if (getOutbox().length) scheduleFlush();
}

// حساب غير المقروء من السيرفر: رسائل الأدمن الأحدث من آخر مرة العميل شافها
function updateUnreadFromHistory(rows, drawerOpen) {
    const ts = m => Date.parse(m.created_at) || 0;
    const latest = rows.reduce((a, m) => Math.max(a, ts(m)), 0);
    let seen = parseInt(localStorage.getItem(SEEN_KEY)) || 0;
    if (drawerOpen) {
        supportNewCount = 0;
        localStorage.setItem(SEEN_KEY, String(Math.max(latest, Date.now())));
    } else {
        if (!seen) {
            const lastUser = rows.filter(m => m.sender === 'user').reduce((a, m) => Math.max(a, ts(m)), 0);
            seen = lastUser || latest;
            localStorage.setItem(SEEN_KEY, String(seen));
        }
        supportNewCount = rows.filter(m => m.sender === 'admin' && ts(m) > seen).length;
    }
    localStorage.setItem('supportNewCount', supportNewCount);
    updateGlobalSupportCount();
}

// تحميل المحادثة من السيرفر وعرضها (ومعاها الرسائل اللي لسه ما اتبعتتش)
async function loadChatHistory() {
    if (_historyLoading) return;
    _historyLoading = true;
    try {
        const chatBody = document.getElementById('chat-body');
        const sess = chatSess(); if (!sess) { chatAutoExpiryCheck(); return; }
        const { data, error } = await _supabase.rpc('chat_history_s', { p_token: sess.token });
        if (error) { console.error('Error loading history:', error); if (/session/i.test(error.message || '')) { chatSessClear(); chatBody.querySelectorAll('.msg').forEach(m => m.remove()); if (isSupportOpen()) showSupport(); } return; } // لو فشل التحميل منمسحش اللي معروض
        const rows = data || [];
        updateUnreadFromHistory(rows, isSupportOpen());
        chatBody.querySelectorAll('.msg').forEach(m => m.remove());
        renderedCids.clear();
        if (rows.length) {
            rows.forEach(m => { if (m.client_id) renderedCids.add(m.client_id); appendMessage(m.text, m.sender, m.client_id); });
            _lastAdminCount = rows.filter(x => x.sender === 'admin').length;
        } else {
            appendMessage(LT('أهلاً بكِ مجدداً! ✨ كيف يمكننا مساعدتكِ؟', 'Welcome back! ✨ How can we help you?'), 'admin');
        }
        getOutbox().filter(i => !renderedCids.has(i.cid)).forEach(i => { renderedCids.add(i.cid); appendMessage(i.text, 'user', i.cid, 'pending'); });
        setTimeout(() => { chatBody.scrollTop = chatBody.scrollHeight; }, 100);
    } finally { _historyLoading = false; }
}
function resyncChat() { if (chatSess() && _chatPoll) loadChatHistory(); }
window.addEventListener('online', () => { flushOutbox(); resyncChat(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { flushOutbox(); resyncChat(); } });
setTimeout(() => { if (getOutbox().length) flushOutbox(); }, 3000);

let _chatPoll = null, _lastAdminCount = null;
let _rtc = null, _rtCh = null, _rtTimer = null, _rtOrder = null, _rtLastTyping = 0;
async function rtFetchToken() {
    const sess = chatSess(); if (!sess) return null;
    const r = await fetch(supabaseUrl + '/functions/v1/chat-login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }, body: JSON.stringify({ action: 'rt', token: sess.token }) });
    const d = await r.json().catch(() => null);
    if (r.status === 401) { chatSessClear(); const cb = document.getElementById('chat-body'); if (cb) cb.querySelectorAll('.msg').forEach(m => m.remove()); if (isSupportOpen()) showSupport(); return null; }
    return (d && d.ok) ? d : null;
}
function rtStop() {
    clearTimeout(_rtTimer); _rtTimer = null;
    try { if (_rtc && _rtCh) _rtc.removeChannel(_rtCh); } catch (e) {}
    _rtCh = null; _rtOrder = null;
}
// قناة بث محمية خاصة بطلب واحد (توكن قصير العمر): رسائل فورية + "بيكتب" بدون أي قناة عامة
async function rtConnect() {
    try {
        const d = await rtFetchToken(); if (!d) return;
        if (!_rtc) _rtc = supabase.createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
        _rtc.realtime.setAuth(d.jwt);
        if (!_rtCh || _rtOrder !== d.topic) {
            rtStop();
            _rtOrder = d.topic;
            _rtCh = _rtc.channel(d.topic, { config: { private: true, broadcast: { self: false } } })
                .on('broadcast', { event: 'msg' }, p => rtOnMsg(p.payload || {}))
                .on('broadcast', { event: 'typing' }, p => rtOnTyping(p.payload || {}))
                .on('broadcast', { event: 'delete_chat' }, () => { const cb = document.getElementById('chat-body'); if (cb) { cb.querySelectorAll('.msg').forEach(m => m.remove()); renderedCids.clear(); } appendMessage('تم تنظيف المحادثة', 'admin'); })
                .subscribe(st => { if (st === 'SUBSCRIBED') loadChatHistory(); });
        }
        // تجديد التوكن قبل ما ينتهي (الجلسة نفسها لسه صالحة 72 ساعة)
        clearTimeout(_rtTimer);
        _rtTimer = setTimeout(rtConnect, Math.max(60000, (d.exp * 1000 - Date.now()) - 120000));
    } catch (e) { console.error(e); _rtTimer = setTimeout(rtConnect, 30000); }
}
function rtOnMsg(m) {
    if (!m || !m.text) return;
    if (isDupMsg(m.cid, m.text, 'b')) return;
    const indicator = document.getElementById('client-typing-indicator'); if (indicator) indicator.style.display = 'none';
    if (m.sender === 'admin') {
        if (!isSupportOpen()) { supportNewCount++; localStorage.setItem('supportNewCount', supportNewCount); updateGlobalSupportCount(); }
        try { chatSound.currentTime = 0; chatSound.play().catch(() => {}); } catch (e) {}
        appendMessage(m.text, 'admin', m.cid);
        if (document.hidden || !isSupportOpen()) triggerBrowserNotification(m.text);
    } else {
        appendMessage(m.text, 'user', m.cid);
    }
}
function rtOnTyping(p) {
    if (p.sender !== 'admin') return;
    const indicator = document.getElementById('client-typing-indicator'); if (!indicator) return;
    if (p.typing === false) { indicator.style.display = 'none'; return; }
    indicator.style.display = 'flex';
    const cb = document.getElementById('chat-body'); cb.scrollTop = cb.scrollHeight;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { indicator.style.display = 'none'; }, 4000);
}
document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('chat-input');
    if (inp) inp.addEventListener('input', () => {
        if (!_rtCh || Date.now() - _rtLastTyping < 1500) return;
        _rtLastTyping = Date.now();
        try { _supabase.rpc('chat_typing_s', { p_token: (chatSess() || {}).token || '', p_typing: true }).then(() => {}, () => {}); } catch (e) {}
    });
});
async function startChatSync() {
    if (_chatPoll || _chatStarting || !chatSess()) return;
    _chatStarting = true;
    primeChatAudio();
    try { await loadChatHistory(); } catch (e) { console.error(e); }
    await rtConnect();
    // شبكة أمان بطيئة جداً فقط (الوصول الفوري بيتم من القناة المحمية)
    _chatPoll = setInterval(() => { if (!chatSess()) { chatAutoExpiryCheck(); return; } if (document.visibilityState === 'visible') loadChatHistory(); }, 60000);
    chatSubscription = _chatPoll;
    _chatStarting = false;
}

function endChat() {
    if(!confirm(document.documentElement.lang === 'en' ? translations.en.endChatConfirm : "هل أنتِ متأكدة من إنهاء الدردشة؟ سيتم مسح بيانات الدخول.")) return;
    const sess = chatSess();
    if (sess) { try { _supabase.rpc('chat_logout', { p_token: sess.token }); } catch (e) {} }
    chatSessClear();
    document.getElementById('chat-body').querySelectorAll('.msg').forEach(m => m.remove()); showSupport();
}

function sendQuickMsg(text) { const input = document.getElementById('chat-input'); input.value = text; sendMessage(); }

async function sendMessage() {
    const input = document.getElementById('chat-input'); const text = input.value.trim();
    if (!text) return;
    if (!chatSess()) { showSupport(); return; }
    if (!_chatPoll) await startChatSync();
    const cid = newMsgId();
    renderedCids.add(cid);
    appendMessage(text, 'user', cid, 'pending'); input.value = '';
    const ob = getOutbox(); ob.push({ cid, text, ts: Date.now(), attempts: 0 }); setOutbox(ob);
    try { _supabase.rpc('chat_typing_s', { p_token: (chatSess() || {}).token || '', p_typing: false }).then(() => {}, () => {}); } catch (e) {}
    await flushOutbox();
    if (/^\d{1,9}$/.test(text) || /(طلب|اوردر|أوردر|شحن|توصيل|وصل|order|ship|deliver)/i.test(text)) {
        setTimeout(() => handleBotReply(text), 800);
    }
}

async function handleBotReply(text) {
    try {
        const sess = chatSess(); if (!sess) return;
        const { data, error } = await _supabase.rpc('chat_bot_reply_s', { p_token: sess.token, p_text: text });
        if (error || !data || !data.text) return;
        if (data.cid) { if (renderedCids.has(data.cid)) return; renderedCids.add(data.cid); }
        appendMessage(data.text, 'admin', data.cid);
    } catch (e) { console.error(e); }
}

// وظيفة إرسال إشعار للمتصفح مثل الواتساب
async function triggerBrowserNotification(messageText) {
    if (Notification.permission === 'granted') {
        const options = {
            body: messageText,
            icon: "logo-192.png",
            badge: "", // حذف الرابط لمنع المربع الأبيض
            vibrate: [300, 100, 300, 100, 400], // نفس الاهتزاز المميز
            tag: 'new-message', // تجميع الإشعارات المتكررة
            renotify: true
        };

        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification(LT("Besan Beauty - رسالة جديدة", "Besan Beauty - New message"), options);
        } else {
            new Notification(LT("Besan Beauty - رسالة جديدة", "Besan Beauty - New message"), options);
        }
    }
}

// تحديث دالة toggleLanguage لتحديث خيارات المحافظات
const originalToggleLanguage = toggleLanguage;
toggleLanguage = async function() {
    await originalToggleLanguage(); // استدعاء الدالة الأصلية أولاً

    const lang = document.documentElement.lang || 'ar';
    const provinceSelect = document.getElementById('customer-province');
    if (provinceSelect) {
        for (let i = 0; i < provinceSelect.options.length; i++) {
            const option = provinceSelect.options[i];
            const arabicName = option.getAttribute('data-ar');
            if (arabicName) {
                if (lang === 'en') {
                    option.innerText = await translateProvinceName(arabicName);
                } else {
                    option.innerText = arabicName;
                }
            }
        }
    }
};

// وظيفة مراقبة الكروت لظهورها صف بصف عند السكرول
let cardsObserver;
function observeBookCards() {
    if (cardsObserver) cardsObserver.disconnect();
    const observer = cardsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.book-card').forEach(card => observer.observe(card));
}

// تعديل دالة renderBooksList لتشغيل المراقب
const originalRenderBooksList = renderBooksList;
renderBooksList = function(data) {
    originalRenderBooksList(data);
    observeBookCards();
};

function appendMessage(text, side, cid, state) {
    const chatBody = document.getElementById('chat-body');
    const indicator = document.getElementById('client-typing-indicator');
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg msg-${side}` + (state ? ` msg-${state}` : '');
    if (cid) msgDiv.dataset.cid = cid;
    if (side === 'admin' && typeof text === 'string' && text.indexOf('[[CODE]]') !== -1) {
        const parts = text.split('[[CODE]]');
        msgDiv.innerText = parts[0].replace(/\s+$/, '');
        const sess = chatSess(); const code = sess ? chatCodeFor(sess.order_id) : '';
        const box = document.createElement('div');
        box.style.cssText = 'margin-top:10px;border:2px dashed #f6006f;border-radius:14px;padding:10px;text-align:center;background:#fff;color:#333';
        if (code) {
            box.innerHTML = '<div style="font-size:.8rem">' + LT('كود دخولك السري (٦ أرقام)', 'Your secret login code (6 digits)') + '</div><div class="code-digits" style="font-size:2rem;font-weight:800;letter-spacing:6px;direction:ltr"></div>' +
              '<div style="margin-top:4px;font-size:.78rem;color:#8a3a62;line-height:1.5">📸 ' + LT('صوّري الشاشة (سكرين شوت) علشان تحتفظي بالكود', 'Take a screenshot to keep the code') + '</div>' +
              '<button type="button" class="confirm-order-btn code-copy" style="padding:6px 22px;margin-top:6px;font-size:.85rem;width:auto">' + LT('نسخ الكود', 'Copy code') + '</button>' +
              '<div style="margin-top:8px;padding:8px;border-radius:10px;background:#fff6d6;color:#7a5b00;font-size:.75rem;line-height:1.6">' + LT('احفظي الكود ده. بعد 72 ساعة هتحتاجيه مع رقم موبايلك علشان تفتحي محادثة الطلب ده تاني.', 'Save this code. After 72 hours you will need it with your mobile number to open this order chat again.') + '</div>';
            box.querySelector('.code-digits').textContent = code;
            box.querySelector('.code-copy').addEventListener('click', ev => { const b = ev.currentTarget; const done = () => { b.textContent = LT('تم النسخ ✓', 'Copied ✓'); setTimeout(() => { b.textContent = LT('نسخ الكود', 'Copy code'); }, 2000); }; try { navigator.clipboard.writeText(code).then(done, done); } catch (e) { done(); } });
        } else {
            box.innerHTML = '<div style="font-size:.8rem">' + LT('🔑 كود الدخول السري ظهر وقت تسجيل الطلب. لو ضاع كلمي الفريق على واتساب وهنتحقق منك.', '🔑 Your secret login code was shown when you placed the order. If you lost it, message the team on WhatsApp and we will verify you.') + '</div>';
        }
        msgDiv.appendChild(box);
    } else {
        msgDiv.innerText = text;
    }

    // ضمان إضافة الرسالة قبل فقاعة "جاري الكتابة" لتبقى الفقاعة دائماً في الأسفل
    if (indicator) {
        chatBody.insertBefore(msgDiv, indicator);
    } else {
        chatBody.appendChild(msgDiv);
    }
    chatBody.scrollTop = chatBody.scrollHeight;
    if (side === 'admin' && isSupportOpen()) markSeenNow(); // الرسالة اتشافت لأن الشات مفتوح
}

// وظيفة لإغلاق الدرج العلوي عند النقر على الـ overlay
function closeBatteryGuide() {
    const modal = document.getElementById('battery-modal');
    if (modal) { modal.classList.remove('open', 'active'); modal.style.display = 'none'; }
    syncScrollLock();
}

function closeTopmostDrawer() {
    const supportDrawer = document.getElementById('support-drawer');
    const cartDrawer = document.getElementById('cart-drawer');

    if (supportDrawer && supportDrawer.classList.contains('open')) closeSupport();
    else if (cartDrawer && cartDrawer.classList.contains('open')) closeCart();
}



// translate static page text (footer policy, support drawer, help modal) with the language toggle
(function () {
    if (!window.BESAN_EN) return;
    const prev = toggleLanguage;
    toggleLanguage = async function () {
        await prev.apply(this, arguments);
        window.BESAN_EN.translateDom(document.documentElement.lang === 'en');
    };
})();

// Keyboard access for non-button cards and existing navigation controls.
document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][tabindex="0"], [role="link"][tabindex="0"]')) {
        event.preventDefault(); event.target.click();
    }
});

// A short horizontal swipe previews the secondary image without opening details.
let cardTouchStart = null;
let swipedCardImage = null;
document.addEventListener('pointerdown', event => {
    const image = event.target.closest('.book-card .image-box');
    cardTouchStart = event.pointerType === 'touch' && image?.querySelector('.hover-img') ? { image, x: event.clientX, y: event.clientY } : null;
}, { passive: true });
document.addEventListener('pointerup', event => {
    const start = cardTouchStart; cardTouchStart = null;
    if (!start || !start.image.contains(event.target)) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) < 35 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    start.image.classList.toggle('show-secondary', dx < 0);
    swipedCardImage = start.image;
    setTimeout(() => { swipedCardImage = null; }, 500);
}, { passive: true });
document.addEventListener('pointercancel', () => { cardTouchStart = null; }, { passive: true });
document.addEventListener('click', event => {
    if (swipedCardImage?.contains(event.target)) { event.preventDefault(); event.stopPropagation(); swipedCardImage = null; }
}, true);
