// Regenerate after public catalog edits: node .build/catalog.mjs
// Public product data only. No service credential and no customer/order reads.
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const config=fs.readFileSync(new URL('config.js',root),'utf8');
const box={window:{}};vm.runInNewContext(config,box);
const c=box.window.APP_CONFIG || box.APP_CONFIG;
let products;
if(process.env.BESAN_CATALOG_FILE) products=JSON.parse(fs.readFileSync(process.env.BESAN_CATALOG_FILE,'utf8'));
else {const r=await fetch(c.SUPABASE_URL+'/rest/v1/products?select=id,title,brand,description,image_url,image_url2&order=id',{headers:{apikey:c.SUPABASE_ANON_KEY}});if(!r.ok)throw new Error('Catalog read failed '+r.status);products=await r.json();}
if(!Array.isArray(products)||!products.length)throw new Error('Empty catalog refused');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=x=>JSON.stringify(x).replace(/</g,'\\u003c');
const canonical='https://hanien6608-web.github.io/Besan-Beauty/';
let index=fs.readFileSync(new URL('index.html',root),'utf8');
index=index.replace(/<script id="besan-product-pages">[\s\S]*?<\/script>/,'').replace(/<noscript><style>#splash\{display:none!important\}\.loading-msg\{display:none\}<\/style><\/noscript>/g,'');
index=index.replace(/\s*<\/head>/,'\n</head>');
index=index.replace('</head>','<script id="besan-product-pages">window.BESAN_PRODUCT_PAGES='+json(products.map(p=>String(p.id)))+'</script><noscript><style>#splash{display:none!important}.loading-msg{display:none}</style></noscript>\n</head>');
index=index.replace(/\s*<!-- CATALOG LINKS START -->[\s\S]*?<!-- CATALOG LINKS END -->\s*/,'');
const links='<noscript><nav aria-label="المنتجات">'+products.map(p=>'<a href="product-'+esc(p.id)+'.html">'+esc(p.title)+'</a>').join(' · ')+'</nav></noscript>';
index=index.replace('</main>', '\n<!-- CATALOG LINKS START -->'+links+'<!-- CATALOG LINKS END -->\n</main>');
fs.writeFileSync(new URL('index.html',root),index);
for(const file of fs.readdirSync(root)) if(/^product-\d+\.html$/.test(file))fs.unlinkSync(new URL(file,root));
const urls=[canonical];
for(const p of products){
 if(!/^\d{1,12}$/.test(String(p.id)))throw new Error('Invalid product ID');
 const url=canonical+'product-'+p.id+'.html';urls.push(url);
 const title=p.title+' | Besan Beauty', description=p.description||p.title;
 const schema={'@context':'https://schema.org','@type':'Product',name:p.title,url};
 if(p.brand)schema.brand={'@type':'Brand',name:p.brand};
 if(p.description)schema.description=p.description;
 if(/^https:\/\//.test(p.image_url||''))schema.image=[p.image_url];
 let html=index.replace(/<title>[\s\S]*?<\/title>/,'<title>'+esc(title)+'</title>');
 html=html.replace(/(<meta name="description" content=")[^"]*/,'$1'+esc(description));
 html=html.replace(/(<link rel="canonical" href=")[^"]*/,'$1'+url);
 html=html.replace(/(<meta property="(?:og|twitter):url" content=")[^"]*/g,'$1'+url);
 html=html.replace(/(<meta property="(?:og|twitter):title" content=")[^"]*/g,'$1'+esc(title));
 html=html.replace(/(<meta property="(?:og|twitter):description" content=")[^"]*/g,'$1'+esc(description));
 html=html.replace('<body>','<body data-product-id="'+p.id+'">');
 html=html.replace('</head>', '<style>.js-product-page .product-search-content{display:none}</style><script>document.documentElement.classList.add("js-product-page")</script>\n</head>');
 html=html.replace('</head>','<script type="application/ld+json">'+json(schema)+'</script>\n</head>');
 const snapshot='<section id="product-search-content" class="product-search-content"><h1>'+esc(p.title)+'</h1>'+(p.brand?'<p>'+esc(p.brand)+'</p>':'')+(p.description?'<p style="white-space:pre-line">'+esc(p.description)+'</p>':'')+'<a href="index.html?id='+p.id+'">عرض المنتج في المتجر</a></section>';
 html=html.replace('<main class="shelf-section">','<main class="shelf-section">'+snapshot);
 fs.writeFileSync(new URL('product-'+p.id+'.html',root),html);
}
fs.writeFileSync(new URL('sitemap.xml',root),'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(x=>'<url><loc>'+esc(x)+'</loc></url>').join('')+'</urlset>\n');
fs.writeFileSync(new URL('robots.txt',root),'User-agent: *\nAllow: /\nSitemap: '+canonical+'sitemap.xml\n');
console.log('Generated '+products.length+' product pages and sitemap. Canonical stays on the existing GitHub Pages origin.');
