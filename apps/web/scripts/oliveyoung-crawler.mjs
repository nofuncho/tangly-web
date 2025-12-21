#!/usr/bin/env node
import 'dotenv/config';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_CATEGORY_URL =
  process.env.OLIVEYOUNG_CATEGORY_URL ||
  'https://www.oliveyoung.co.kr/store/display/getCategoryShop.do?dispCatNo=10000010001';
const PAGE_PARAM = process.env.OLIVEYOUNG_PAGE_PARAM || 'pageIdx';
const MAX_PAGES = Number.parseInt(process.env.OLIVEYOUNG_MAX_PAGES || '3', 10);
const WAIT_MS = Number.parseInt(process.env.OLIVEYOUNG_WAIT_MS || '2000', 10);
const NAVIGATION_TIMEOUT = Number.parseInt(
  process.env.OLIVEYOUNG_NAV_TIMEOUT || '60000',
  10
);
const DETAIL_WAIT_MS = Number.parseInt(process.env.OLIVEYOUNG_DETAIL_WAIT_MS || '1200', 10);
const OUTPUT_DIR = process.env.OLIVEYOUNG_OUTPUT_DIR || 'crawler-output';
const MODE = process.argv.includes('--write') ? 'write' : 'preview';

const toSelectorArray = (value, fallback) =>
  (value || fallback)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const SELECTORS = {
  productCard: process.env.OLIVEYOUNG_CARD_SELECTOR || 'li .prd_info, .prd_info',
  name: toSelectorArray(process.env.OLIVEYOUNG_NAME_SELECTOR, '.tx_name,.prd_name,.name'),
  brand: toSelectorArray(process.env.OLIVEYOUNG_BRAND_SELECTOR, '.tx_brand,.prd_brand,.brand'),
  price: toSelectorArray(process.env.OLIVEYOUNG_PRICE_SELECTOR, '.tx_price .tx_num,.tx_num,.price'),
  link: toSelectorArray(process.env.OLIVEYOUNG_LINK_SELECTOR, '.prd_thumb a,.prd_info a'),
  image: toSelectorArray(process.env.OLIVEYOUNG_IMAGE_SELECTOR, 'img[data-original],img[data-src],img[src]'),
  tag: toSelectorArray(process.env.OLIVEYOUNG_TAG_SELECTOR, '.tag_area .tag,.tag_list .tag'),
};

const DETAIL_SELECTORS = {
  tabText: process.env.OLIVEYOUNG_INFO_TAB_TEXT || '상품정보 제공고시',
  table: toSelectorArray(
    process.env.OLIVEYOUNG_INFO_TABLE_SELECTOR,
    '.goods_info_area table,.prd_detail_info table,.tbl_info'
  ),
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => !arg.startsWith('--'))
    .map((entry, idx, arr) => {
      if (entry.includes('=')) {
        const [key, value] = entry.split('=');
        return [key.replace(/^--?/, ''), value];
      }
      const next = arr[idx + 1];
      if (next && !next.startsWith('--') && !next.includes('=')) {
        return [entry.replace(/^--?/, ''), next];
      }
      return [entry.replace(/^--?/, ''), true];
    })
);

const categoryUrl = args.url || args.category || DEFAULT_CATEGORY_URL;
const pages = Number.parseInt(args.pages || `${MAX_PAGES}`, 10);

if (!categoryUrl) {
  console.error('카테고리 URL을 찾을 수 없습니다. URL 인자를 지정하거나 OLIVEYOUNG_CATEGORY_URL 환경변수를 설정하세요.');
  process.exit(1);
}

if (MODE === 'write' && !supabase) {
  console.error('Supabase 환경변수가 설정되지 않아 DB에 저장할 수 없습니다.');
  process.exit(1);
}

const ensureOutputDir = () => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
};

const buildPageUrl = (url, index) => {
  const target = new URL(url);
  target.searchParams.set(PAGE_PARAM, `${index}`);
  return target.toString();
};

const deriveEffectTags = (name) => {
  const tags = new Set();
  const normalized = (name || '').toLowerCase();
  if (/수분|워터|hydra|moist/.test(normalized)) tags.add('hydration');
  if (/탄력|리프팅|firm/.test(normalized)) tags.add('elasticity');
  if (/미백|톤|glow|radiance|bright/.test(normalized)) tags.add('radiance');
  if (/트러블|진정|calm|soothing/.test(normalized)) tags.add('soothing');
  if (/모공|pore/.test(normalized)) tags.add('pore_care');
  if (/피지|지성|sebum|oil/.test(normalized)) tags.add('sebum_control');
  return Array.from(tags);
};

const normalizePrice = (priceText) => {
  if (!priceText) return null;
  const digits = priceText.replace(/[^0-9]/g, '');
  return digits ? Number.parseInt(digits, 10) : null;
};

const mapToProductRecord = (item) => ({
  name: item.name,
  brand: item.brand ?? null,
  category: '스킨케어',
  effect_tags: item.effectTags,
  key_ingredients: item.ingredients?.length
    ? item.ingredients
    : item.detail?.ingredients ?? [],
  image_url: item.image ?? null,
  note: `OliveYoung | ${item.price ?? ''} | ${item.link ?? ''}`,
});

const deriveBrandFromName = (name) => {
  if (!name) return null;
  const cleaned = `${name}`.replace(/\[[^\]]+\]/g, '').trim();
  const tokens = cleaned.split(/\s+/);
  if (!tokens.length) return null;
  const first = tokens[0];
  if (/^[0-9]+(ml|g|캡슐)/i.test(first)) {
    return null;
  }
  return first.replace(/[^0-9a-zA-Z가-힣]/g, '') || null;
};

const scrapePage = async (page, pageUrl) => {
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT });
  await page.waitForTimeout(WAIT_MS);
  const pageContext = {
    selectors: SELECTORS,
    goodsDetailBase:
      process.env.OLIVEYOUNG_GOODS_URL ||
      'https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do',
    dispCatNo: new URL(pageUrl).searchParams.get('dispCatNo') || '',
  };

  const data = await page.$$eval(
    SELECTORS.productCard,
    (cards, context) => {
      const selectors = context.selectors;
      const toArray = (selectorList) =>
        selectorList
          .map((selector) => selector.trim())
          .filter(Boolean);

      const nameSelectors = toArray(selectors.name);
      const brandSelectors = toArray(selectors.brand);
      const priceSelectors = toArray(selectors.price);
      const linkSelectors = toArray(selectors.link);
      const imageSelectors = toArray(selectors.image);
      const tagSelectors = toArray(selectors.tag);

      const extractText = (root, selectorsArray) => {
        for (const selector of selectorsArray) {
          const el = root.querySelector(selector);
          const text = el?.textContent?.trim();
          if (text) return text;
        }
        return null;
      };

      const extractHref = (root, selectorsArray) => {
        for (const selector of selectorsArray) {
          const el = root.querySelector(selector);
          const href = el?.href || el?.getAttribute('data-href');
          if (href) return href;
        }
        return null;
      };

      const extractImage = (root, selectorsArray) => {
        for (const selector of selectorsArray) {
          const el = root.querySelector(selector);
          if (!el) continue;
          const src =
            el.getAttribute('data-original') ||
            el.getAttribute('data-src') ||
            el.getAttribute('src');
          if (src) return src;
        }
        return null;
      };

      const tagSelectorString = tagSelectors.join(',');

      const results = cards
        .map((card) => {
          const root = card.closest('li') || card;
          const name = extractText(root, nameSelectors);
          if (!name) return null;
          const brand = extractText(root, brandSelectors);
          const price = extractText(root, priceSelectors);
          let link = extractHref(root, linkSelectors);
          const image = extractImage(root, imageSelectors);
          const tags = tagSelectors.length
            ? Array.from(root.querySelectorAll(tagSelectorString))
                .map((el) => el.textContent?.trim())
                .filter(Boolean)
            : [];

          if (!link) {
            const goodsNo =
              root.getAttribute('data-ref-goodsno') ||
              root.getAttribute('data-goods-no') ||
              root.querySelector('[data-ref-goodsno]')?.getAttribute('data-ref-goodsno');
            if (goodsNo) {
              const dispCat = root.getAttribute('data-ref-dispcatno') || context.dispCatNo;
              const url = new URL(context.goodsDetailBase);
              url.searchParams.set('goodsNo', goodsNo);
              if (dispCat) {
                url.searchParams.set('dispCatNo', dispCat);
              }
              link = url.toString();
            }
          }

          return {
            name,
            brand,
            price,
            link,
            image,
            tags,
          };
        })
        .filter(Boolean);

      return results;
    },
    pageContext
  );

  return data.map((item) => ({
    ...item,
    priceValue: normalizePrice(item.price),
    brand: item.brand ?? deriveBrandFromName(item.name),
    effectTags: item.tags?.length ? item.tags : deriveEffectTags(item.name ?? ''),
  }));
};

const scrapeDetailInfo = async (page, product) => {
  if (!product.link) {
    return { info: null, ingredientText: null, ingredients: [] };
  }
  try {
    await page.goto(product.link, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT,
    });
    await page.waitForTimeout(DETAIL_WAIT_MS);
    const tabLocator = page.locator(`text=${DETAIL_SELECTORS.tabText}`).first();
    if ((await tabLocator.count()) > 0) {
      await tabLocator.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(DETAIL_WAIT_MS);
    }

    const info = await page.evaluate((selectors) => {
      const toRows = (table) => {
        const result = {};
        table.querySelectorAll('tr').forEach((row) => {
          const key = row.querySelector('th')?.textContent?.trim();
          const value = row.querySelector('td')?.textContent?.trim().replace(/\s+/g, ' ');
          if (key && value) {
            result[key] = value;
          }
        });
        return result;
      };

      for (const selector of selectors) {
        const table = document.querySelector(selector);
        if (table) {
          return toRows(table);
        }
      }
      return null;
    }, DETAIL_SELECTORS.table);

    if (!info) {
      return { info: null, ingredientText: null, ingredients: [] };
    }

    const ingredientKey =
      Object.keys(info).find((key) => key.includes('성분')) ?? null;
    const ingredientText = ingredientKey ? info[ingredientKey] : null;
    const ingredients = ingredientText
      ? ingredientText
          .split(/,|·|\u00B7|\n/)
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [];

    return { info, ingredientText, ingredients };
  } catch (error) {
    console.warn(`상세 수집 실패 (${product.link}):`, error.message);
    return { info: null, ingredientText: null, ingredients: [] };
  }
};

const saveToFile = (records) => {
  ensureOutputDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(OUTPUT_DIR, `oliveyoung-${timestamp}.json`);
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
  console.log(`JSON 파일 저장됨: ${filePath}`);
};

const saveToSupabase = async (records) => {
  if (!supabase) return;
  const payload = records.map(mapToProductRecord);
  const { error } = await supabase.from('products').insert(payload);
  if (error) {
    console.error('Supabase insert 오류:', error.message);
    throw error;
  }
};

const main = async () => {
  console.log(`OliveYoung 카테고리 수집 시작: ${categoryUrl} (pages=${pages})`);
  const browser = await chromium.launch({ headless: true });
  const listPage = await browser.newPage();
  await listPage.setExtraHTTPHeaders({
    'User-Agent':
      process.env.OLIVEYOUNG_USER_AGENT ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const scraped = [];
  for (let pageIdx = 1; pageIdx <= pages; pageIdx += 1) {
    const url = buildPageUrl(categoryUrl, pageIdx);
    console.log(`페이지 수집 중: ${url}`);
    try {
      listPage.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
      const items = await scrapePage(listPage, url);
      if (!items.length) {
        console.log(`페이지 ${pageIdx}에서 데이터를 찾지 못했습니다. 수집을 종료합니다.`);
        break;
      }
      scraped.push(...items);
    } catch (error) {
      console.error(`페이지 ${pageIdx} 수집 중 오류:`, error.message);
      break;
    }
  }

  console.log('상품 상세 정보 수집을 시작합니다.');
  const detailPage = await browser.newPage();
  await detailPage.setExtraHTTPHeaders({
    'User-Agent':
      process.env.OLIVEYOUNG_USER_AGENT ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  for (let i = 0; i < scraped.length; i += 1) {
    const item = scraped[i];
    if (!item.link) continue;
    console.log(`상세(${i + 1}/${scraped.length}) -> ${item.link}`);
    const detail = await scrapeDetailInfo(detailPage, item);
    item.detail = detail;
    item.ingredients = detail.ingredients;
  }

  await browser.close();

  if (!scraped.length) {
    console.warn('수집된 데이터가 없습니다.');
    process.exit(1);
  }

  console.log(`총 ${scraped.length}개의 아이템을 수집했습니다.`);

  if (MODE === 'write') {
    try {
      await saveToSupabase(scraped);
      console.log('Supabase products 테이블에 저장했습니다.');
    } catch (error) {
      console.error('Supabase 저장 실패:', error.message);
    }
  } else {
    saveToFile(scraped);
  }
};

main().catch((error) => {
  console.error('Crawler 실행 중 오류:', error);
  process.exit(1);
});
