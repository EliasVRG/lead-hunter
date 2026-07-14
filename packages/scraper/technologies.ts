export interface TechInfo {
  technologies: string[];
  cms: string | null;
}

const CMS_PATTERNS: Record<string, RegExp[]> = {
  WordPress: [
    /<meta name="generator" content="WordPress/i,
    /wp-content/i,
    /\/wp-json\//i,
  ],
  Joomla: [/<meta name="generator" content="Joomla/i, /\/components\/com_/i],
  Drupal: [/<meta name="generator" content="Drupal/i, /drupal\.js/i],
  Shopify: [/shopify\.com/i, /cdn\.shopify\.com/i, /Shopify\.pay/i],
  Wix: [/wix\.com/i, /Wix\.com/i, /static\.wixstatic\.com/i],
  Squarespace: [/squarespace\.com/i, /static1\.squarespace\.com/i],
  Magento: [/mage\/|Magento/i, /var\/gallery/i],
};

const TECH_PATTERNS: [string, RegExp[]][] = [
  ["React", [/react\.js/i, /react\.min\.js/i, /__REACT_DEVTOOLS/i]],
  ["Vue.js", [/vue\.js/i, /vue\.min\.js/i, /__VUE_DEVTOOLS/i]],
  ["Next.js", [/_next\/static/i, /next\.js/i]],
  ["Nuxt.js", [/_nuxt\//i]],
  ["Angular", [/angular\.js/i, /ng-app/i, /ng-version/i]],
  ["Svelte", [/svelte/i]],
  ["Tailwind CSS", [/tailwindcss/i, /tailwind/i]],
  ["Bootstrap", [/bootstrap\.(min\.)?css/i, /bootstrap\.(min\.)?js/i]],
  ["jQuery", [/jquery\.(min\.)?js/i, /jquery-[0-9]/i]],
  ["Google Analytics", [/google-analytics\.com/i, /gtag\.js/i, /ga\.js/i]],
  ["Google Tag Manager", [/googletagmanager\.com/i, /gtm\.js/i]],
  ["Facebook Pixel", [/facebook\.com\/tr\//i, /fbq\(/i]],
  ["Hotjar", [/hotjar\.com/i, /hotjar-/i]],
  ["Cloudflare", [/cloudflare/i, /cdn-cgi\/|__cfduid/i]],
  ["Vercel", [/vercel\.com/i, /vercel\.app/i]],
  ["Netlify", [/netlify\.com/i]],
  ["Apache", [/apache/i, /\.htaccess/i]],
  ["Nginx", [/nginx/i]],
  ["PHP", [/\.php/i, /laravel/i, /symfony/i]],
  ["Node.js", [/node\.js/i, /express/i]],
  ["Python", [/django/i, /flask/i, /python/i]],
  ["Ruby on Rails", [/rails/i, /ruby/i]],
  ["Java", [/\.jsp/i, /spring/i, /java/i]],
];

export function detectTechnologies(html: string, headers: Record<string, string>): TechInfo {
  const found: string[] = [];
  let cms: string | null = null;

  const text = html + " " + JSON.stringify(headers).toLowerCase();

  for (const [cmsName, patterns] of Object.entries(CMS_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) {
      cms = cmsName;
      found.push(cmsName);
      break;
    }
  }

  for (const [tech, patterns] of TECH_PATTERNS) {
    if (patterns.some((p) => p.test(text)) && !found.includes(tech)) {
      found.push(tech);
    }
  }

  return { technologies: found, cms };
}
