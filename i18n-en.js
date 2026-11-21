/* Besan Beauty - English translation layer (hybrid)
 * Order of precedence for product text:
 *   1) curated entries in PRODUCT_EN (keyed by product id)
 *   2) products.title_en / description_en columns, if they exist
 *   3) smart translation: Arabic glossary first, then Google as a fallback for the rest
 * New products added later fall into (3) and still get a sensible English text.
 */
(function () {
  'use strict';

  /* ---------- 1) UI strings (fills the keys the English dictionary was missing) ---------- */
  const UI = {
    logo: 'Besan Beauty',
    search: 'Search for a product or scent...',
    quickSearch: 'Quick search...',
    dedication: 'A Special Gift',
    backToLibrary: 'Back to Shop',
    relatedBooks: 'You May Also Like',
    mostSelling: 'Best Sellers at Besan Beauty',
    developedBy: 'Designed & developed by Haneen \u2728',
    booksCount: 'Items',
    book: 'item(s)',
    totalOrder: 'Order Total',
    shippingCostLabel: 'Shipping',
    grandTotalLabel: 'Grand Total',
    shippingNote: 'Note: shipping cost is',
    shippingDays: 'Shipping takes 3 to 5 business days.',
    confirmOrderHeader: 'Confirm Your Order',
    confirmOrderBtn: 'Confirm Order',
    processingOrder: 'Sending your order...',
    orderSuccess: 'Your order has been received! \uD83C\uDF89 We will contact you soon.',
    orderError: 'Sorry, something went wrong while sending your order:',
    startShopping: 'Start Shopping',
    cartEmptyTitle: 'Your cart is empty',
    cartEmptyDesc: 'Your beauty journey has not started yet',
    discoverNow: 'Discover Now',
    wishlistEmptyTitle: 'Your wishlist is empty',
    wishlistEmptyDesc: 'You have not added any products to your wishlist yet.',
    nameErrorMsg: 'Please enter your full name (at least two words).',
    phoneErrorMsg: 'Enter a valid Egyptian mobile number (11 digits).',
    whatsappErrorMsg: 'Enter a valid Egyptian WhatsApp number (11 digits).',
    provinceErrorMsg: 'Please choose your governorate.',
    addressErrorMsg: 'Please enter your full address so the shipment reaches you.',
    phoneRequiredAlert: 'Please enter your mobile number first.',
    botWelcomeMsg: 'Welcome back! \u2728 How can we help you?',
    cartEmptyAlert: 'Your cart is empty. Add a product before confirming an order.',
    endChatConfirm: 'Are you sure you want to end the chat? Your login details will be cleared.',
    added: 'Added',
    addToCart: 'Add to cart',
    placeholders: {
      name: 'Full name (at least two words)',
      phone: 'Egyptian mobile number (11 digits)',
      whatsapp: 'WhatsApp number (required)',
      province: 'Select governorate',
      address: 'Full address',
      notes: 'Order notes (optional)',
      chat: 'Type your message here...'
    }
  };

  /* ---------- 2) Governorates / shipping zones ---------- */
  const PROVINCES = {
    'مترو': 'Metro', 'القاهرة': 'Cairo', 'الجيزة': 'Giza', 'اكتوبر': '6th of October',
    'التجمع': 'New Cairo (Tagamoa)', 'المقطم': 'Mokattam', 'البدرشين': 'Badrashin',
    'الحوامدية': 'Hawamdeya', 'العبور': 'Obour', 'مدينتي': 'Madinaty', 'الشروق': 'Shorouk',
    'العاشر': '10th of Ramadan', 'اسكندرية': 'Alexandria', 'السويس': 'Suez', 'بورسعيد': 'Port Said',
    'اسماعلية': 'Ismailia', 'الشرقية': 'Sharqia', 'الغربية': 'Gharbia', 'الدقهلية': 'Dakahlia',
    'المنوفية': 'Monufia', 'كفر الشيخ': 'Kafr El Sheikh', 'البحيرة': 'Beheira', 'دمياط': 'Damietta',
    'بني سويف': 'Beni Suef', 'الفيوم': 'Fayoum', 'المنيا': 'Minya', 'اسيوط': 'Assiut',
    'سوهاج': 'Sohag', 'قنا': 'Qena', 'الاقصر': 'Luxor', 'اسوان': 'Aswan', 'الغردقة': 'Hurghada',
    'راس غارب': 'Ras Gharib', 'القصير': 'Quseir', 'مرسي علم': 'Marsa Alam', 'سفاجة': 'Safaga'
  };

  /* ---------- 3) Curated product text, keyed by product id ---------- */
  const PRODUCT_EN = {
    6:  { desc: 'Net weight 100 g\nVanilla musk scent' },
    7:  { desc: '100 g\n\u2022 Talc-free \uD83E\uDD0D\n\u2022 Leaves your body with a soft, long-lasting scent all day\n\u2022 Helps absorb sweat and moisture\n\u2022 Leaves skin soft and silky\n\u2022 Great for summer and hot weather \u2600\uFE0F\n\u2022 Gentle on the skin with a light feel\n\u2022 Reduces friction and keeps you feeling fresh all day' },
    8:  { title: 'Pomegranate Musk Body Powder', desc: '100 g\nTalc-free\nPomegranate scent' },
    14: { title: 'Musk Powder Splash, Full Size 100 ml' },
    19: { title: 'White Musk Splash, Mini Size 30 ml' },
    23: { desc: 'Dupe of Kayali Wedding Silk Santal\n30 ml\nPerfect for brides' },
    25: { desc: 'Glow box\nThe box includes:\n1 body powder of your choice\n1 splash, 100 ml\n4 mini splashes' },
    29: { desc: 'Perfume 30 ml\nPowder 25 g\nSplash 30 ml' },
    30: { desc: 'Perfume 30 ml\nSplash 30 ml\nPowder 25 g' },
    31: { desc: 'Bundle \u2764\uFE0F\nBurgundy Juicy lip product 25 ml\nWith a mini splash 30 ml' },
    32: { desc: '\u2728 Mini splash bundle \u2728\n\nEach one is about 30 ml' },
    34: { desc: 'Body powder 100 g\nDry oil 45 ml\nPerfume 50 ml\nPerfume oil 10 ml' },
    35: { desc: 'Talc-free' },
    37: { desc: 'Body powder, a dupe of Gucci Flora perfume' },
    39: { desc: '1,650.00 EGP (was 1,920.00 EGP)\nBlooming set, perfect if you love fresh floral scents with a touch of white musk \uD83E\uDEE7\u2728\nIdeal for brides \uD83D\uDC70\u200D\u2640\uFE0F\nA fragrance that suits summer and spring \uD83C\uDF38\uD83C\uDF37\nThe set includes:\nBody oil 45 ml\nPerfume 50 ml\nBody powder 120 g\nPerfume oil 10 ml\nBody splash 90 ml' },
    40: { desc: '695.00 EGP (was 975.00 EGP)\nBesan bundle \uD83C\uDF52\nPerfume oil 10 ml\nMini splash 30 ml\nPerfume 20 ml with bag holder\nBurgundy Juicy lip product 25 ml with bag holder' },
    42: { title: 'Flora Burgundy' },
    43: { desc: '550.00 EGP\nDupe of Lattafa Yara \u2728\uD83C\uDF80' },
    45: { title: 'Pomegranate Musk Perfume 50 ml' },
    50: { title: 'White Musk Perfume 30 ml', desc: 'Skin highlighter \uD83D\uDE0D' },
    54: { title: '\uA9C1 Berry Musk \uA9C2' },
    57: { title: 'Lano Heat 20 g', desc: 'Lano Heat is a herbal warming balm rich in natural herb extracts. It gives a gentle warming feel that helps soothe tired muscles and joints and brings local comfort after physical effort.\n\nIts formula, rich in clove, ginger, pepper, mint, menthol and eucalyptus oil, creates a warming effect followed by a refreshing feel, and helps boost local circulation for a relaxed feeling.\n\nIt also contains vitamin E, lanolin and glycerin to help moisturise the skin and keep it soft during use.' },
    58: { desc: 'Alcohol-free hair mist with the scent of Miss Dior Blooming Bouquet' }
  };

  /* ---------- 4) Glossary for the automatic fallback (Arabic -> English) ---------- */
  // Matching is done on normalised Arabic (see norm), longest phrases first.
  const GLOSSARY = [
    ['الروايح الفلوري الشيك', 'chic floral scents'], ['الروايح الفلوري', 'floral scents'],
    ['الوزن الصافي', 'Net weight'], ['خاليه من التلك', 'Talc-free'], ['خالي من التلك', 'Talc-free'],
    ['تلك فري', 'Talc-free'], ['مناسبه جدا للعرايس', 'Perfect for brides'], ['مناسبه للعرايس', 'Perfect for brides'],
    ['مناسبه للصيف', 'Great for summer'], ['لطيفه على البشره', 'Gentle on the skin'],
    ['معطر للشعر', 'Hair mist'], ['خالي من الكحول', 'Alcohol-free'], ['خاليه من الكحول', 'Alcohol-free'],
    ['من اختيارك', 'of your choice'], ['البوكس عباره عن', 'The box includes:'], ['المجموعه مكونه من', 'The set includes:'],
    ['بادي باودر', 'body powder'], ['بادي اويل', 'body oil'], ['بادي اسبلاش', 'body splash'], ['بادي', 'body'],
    ['بادى', 'body'], ['دراي اويل', 'dry oil'], ['برفيوم اويل', 'perfume oil'], ['بيرفيوم اويل', 'perfume oil'],
    ['برفيوم', 'perfume'], ['بيرفيوم', 'perfume'], ['عطر', 'perfume'], ['اسبلاش', 'splash'],
    ['مينى', 'mini'], ['ميني', 'mini'], ['باودر', 'powder'], ['اويل', 'oil'], ['هيلايتر', 'highlighter'],
    ['بوكس', 'box'], ['باندل', 'bundle'], ['سيت', 'set'], ['بلومينج', 'Blooming'],
    ['مسك ابيض', 'white musk'], ['مسك', 'musk'], ['رمان', 'pomegranate'], ['التوت', 'berry'], ['توت', 'berry'],
    ['فراوله', 'strawberry'], ['فانيليا', 'vanilla'], ['الڤانيلا', 'vanilla'], ['جوز الهند', 'coconut'],
    ['اناناس', 'pineapple'], ['ورد', 'rose'], ['خمريه', 'burgundy'], ['فلوري', 'floral'], ['فلورا', 'Flora'],
    ['برائحه', 'with the scent of'], ['رائحه', 'scent'], ['ريحه', 'scent'], ['عبق', ''], ['ابيض', 'white'],
    ['مللي', 'ml'], ['مل', 'ml'], ['جرام', 'g'], ['حجم', 'Size'], ['حوالي', 'about'], ['للبشره', 'for the skin'],
    ['جوسي', 'Juicy'], ['جوتشي', 'Gucci'], ['دوب', 'dupe of'], ['مع', 'with'], ['و', 'and']
  ].filter(function (p) { return p[0].length > 1 || p[0] === 'و'; });

  // 'و' (and) must only match as a standalone word, handled separately below.
  const WORD_ONLY = { 'و': true, 'مل': true, 'مع': true };

  const ARABIC_RE = /[\u0600-\u06FF]/;
  const DIGITS = { '\u0660': '0', '\u0661': '1', '\u0662': '2', '\u0663': '3', '\u0664': '4', '\u0665': '5', '\u0666': '6', '\u0667': '7', '\u0668': '8', '\u0669': '9' };

  function norm(s) {
    return String(s || '')
      .replace(/[\u064B-\u065F\u0640]/g, '')
      .replace(/[\u0623\u0625\u0622]/g, '\u0627')
      .replace(/\u0649/g, '\u064A')
      .replace(/\u0629/g, '\u0647')
      .replace(/\u06A4/g, '\u0641')           // ڤ -> ف
      .replace(/\u0686/g, '\u062C')           // چ -> ج
      .replace(/[\u0660-\u0669]/g, function (d) { return DIGITS[d]; });
  }

  const GLOSS_NORM = GLOSSARY.map(function (p) { return [norm(p[0]), p[1]]; })
    .sort(function (a, b) { return b[0].length - a[0].length; });

  function applyGlossary(text) {
    let out = norm(text);
    GLOSS_NORM.forEach(function (p) {
      const key = p[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = WORD_ONLY[p[0]]
        ? new RegExp('(^|[^\\u0600-\\u06FF])' + key + '(?![\\u0600-\\u06FF])', 'g')
        : new RegExp('(^|[^\\u0600-\\u06FF])' + key + '(?![\\u0600-\\u06FF])', 'g');
      out = out.replace(re, function (m, pre) { return pre + p[1]; });
    });
    return out.replace(/[ \t]{2,}/g, ' ').replace(/ +\n/g, '\n').trim();
  }

  // Fix well-known bad machine output, applied after the automatic fallback.
  const POST_FIXES = [
    [/fluorescent/gi, 'floral'], [/\bkhamria\b/gi, 'burgundy'], [/\bEGP\.?\u200F?/g, 'EGP']
  ];
  function postFix(s) {
    return POST_FIXES.reduce(function (acc, p) { return acc.replace(p[0], p[1]); }, s);
  }

  async function googleTranslate(text) {
    const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=' + encodeURIComponent(text));
    const data = await res.json();
    return data[0].map(function (s) { return s[0]; }).join('');
  }

  // Dictionary first, then automatic translation only for what is still Arabic.
  async function smartTranslate(text) {
    if (!text || !ARABIC_RE.test(text)) return text;
    const pre = applyGlossary(text);
    if (!ARABIC_RE.test(pre)) return postFix(pre);
    try {
      const lines = pre.split('\n');
      const out = [];
      for (const line of lines) out.push(ARABIC_RE.test(line) ? await googleTranslate(line) : line);
      return postFix(out.join('\n'));
    } catch (e) {
      return pre;
    }
  }


  /* ---------- 5) Static page text (footer policy, support drawer, help modal) ---------- */
  const STATIC = {
    'ضمان وصول الإشعارات ✨': 'Make sure you get notifications ✨',
    'لكي تصلكِ رسائل الدعم الفني فوراً حتى والتطبيق مغلق، يرجى اتباع الآتي:': 'To receive support messages instantly even when the app is closed, please follow these steps:',
    '1️⃣ اضغطي مطولاً على أيقونة التطبيق في الشاشة الرئيسية.': '1️⃣ Long-press the app icon on your home screen.',
    '2️⃣ اختاري': '2️⃣ Choose', 'معلومات التطبيق (App Info)': 'App Info',
    '3️⃣ ادخلي على': '3️⃣ Open', 'البطارية (Battery)': 'Battery',
    '4️⃣ اختاري وضع': '4️⃣ Choose', '"غير مقيد" (Unrestricted)': '"Unrestricted"',
    'شكراً لاختياركم Besan Beauty': 'Thank you for choosing Besan Beauty',
    'سيتم الرد عليكم في أقرب وقت.': 'We will reply as soon as possible.',
    'للإطلاع على الأسعار انظروا للكتالوج ♥️': 'For prices, please see the catalog ♥️',
    'تعليمات مهمة 🚩': 'Important instructions 🚩',
    'مافيش أي أوردر بدون ديبوزت.': 'No order without a deposit.',
    'في حالة تأكيد الأوردر برجاء إرسال عنوان كامل.': 'When confirming your order, please send your full address.',
    'رقم موبايل واحد فقط ويكون متاح وفيه شبكة.': 'One mobile number only, available and with signal.',
    'التوصيل بيكون من ٩ لـ ٢ وبعض المناطق ٤.': 'Delivery is between 9 and 2, and until 4 in some areas.',
    'التوصيل عن طريق البريد المصري – خدمة وصلها.': 'Delivery is through Egypt Post (Wasalha service).',
    'لا يوجد استبدال أو استرجاع لأي أوردر ‼️': 'No exchange or return on any order ‼️',
    'ماتنسوش تعملولنا فولو على': "Don't forget to follow us on",
    'صفحة Instagram': 'Instagram page', 'كتالوج WhatsApp': 'WhatsApp catalog',
    'سجّلتي طلب ومحتاجة ترفعي إيصال الدفع؟': 'Placed an order and need to upload your payment receipt?',
    'من فضلكِ أدخلي رقم الموبايل لبدء الدردشة مع الدعم الفني ✨': 'Please enter your mobile number to start chatting with support ✨',
    'أهلاً بكِ! ✨ كيف يمكننا مساعدتكِ اليوم؟': 'Welcome! ✨ How can we help you today?',
    'الدعم يكتب الآن...': 'Support is typing...', 'العميل يكتب الآن...': 'Customer is typing...',
    'الأوردر بتاعي لسه موصلش؟ 🚚': "Hasn't my order arrived yet? 🚚",
    'بدء المحادثة': 'Start chat',
    'ج.م': 'EGP'
  };
  const ORIGINALS = new WeakMap();
  const clean = function (t) { return String(t).replace(/\s+/g, ' ').trim(); };
  function translateDom(toEnglish) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const p = node.parentElement;
      if (!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE') continue;
      if (toEnglish) {
        const key = clean(node.textContent);
        const en = STATIC[key];
        if (en && !ORIGINALS.has(node)) {
          const raw = node.textContent;
          ORIGINALS.set(node, raw);
          node.textContent = raw.match(/^\s*/)[0] + en + raw.match(/\s*$/)[0];
        }
      } else if (ORIGINALS.has(node)) {
        node.textContent = ORIGINALS.get(node); ORIGINALS.delete(node);
      }
    }
  }

  window.BESAN_EN = {
    translateDom: translateDom,
    ui: UI,
    provinces: PROVINCES,
    products: PRODUCT_EN,
    applyGlossary: applyGlossary,
    smartTranslate: smartTranslate,
    province: function (ar) { return PROVINCES[ar] || null; },
    // curated + generic text for a product; returns {title, author, desc} or null for missing fields
    curated: function (id) { return PRODUCT_EN[id] || null; }
  };
})();
