/**
 * 시세판 — Cloudflare Worker 한 파일로 돌아가는 시세 PWA
 *
 *  /                     앱 화면 (홈 화면에 추가하면 앱처럼 실행)
 *  /api/group?id=지수ID   탭 하나의 시세(JSON)
 *  /api/quote?s=AAPL,...  관심목록용 야후 심볼 시세(JSON)
 *
 * 데이터 출처 (모두 무료, 일부 지연 시세)
 *  - 야후 파이낸스: 지수·주식·원자재 선물·환율·코인(달러)
 *  - CNBC: 각국 국채금리(장중)
 *  - 한국은행 ECOS: 국고채·회사채 고시금리(일별)  ← 환경변수 ECOS_KEY 필요
 *  - FRED(세인트루이스 연준): 미국·유로·신흥국 회사채 지수(일별)
 *  - 업비트: 원화 코인 시세
 *
 * 종목을 바꾸려면 아래 "설정" 부분의 줄만 고치면 됩니다.
 *   Y('심볼', '표시 이름')  ← 야후 파이낸스 심볼 (예: 005930.KS, AAPL, 7203.T, SAP.DE)
 */

// ═════════════════════════════ 설정 ═════════════════════════════
const Y = (sym, name, o = {}) => ({ src: 'y', sym, name, kind: 'price', ...o });
const C = (sym, name, o = {}) => ({ src: 'c', sym, name, kind: 'yield', ...o });
const F = (sym, name, o = {}) => ({ src: 'f', sym, name, kind: 'yield', ...o });
const E = (sym, name, o = {}) => ({ src: 'e', sym, name, kind: 'yield', ...o });
const U = (sym, name, o = {}) => ({ src: 'u', sym, name, kind: 'price', ...o });
const CALC = (sym, name, fn, o = {}) => ({ src: 'calc', sym, name, fn, kind: 'spread', ...o });

const GROUPS = [
  {
    id: 'indices', title: '지수', sections: [
      { title: '한국', items: [Y('^KS11', '코스피'), Y('^KQ11', '코스닥'), Y('^KS200', '코스피 200')] },
      { title: '미국', items: [
        Y('^GSPC', 'S&P 500'), Y('^IXIC', '나스닥 종합'), Y('^NDX', '나스닥 100'), Y('^DJI', '다우존스'),
        Y('^RUT', '러셀 2000'), Y('^SOX', '필라델피아 반도체'), Y('^VIX', 'VIX 변동성')] },
      { title: '일본·유럽·중화권', items: [
        Y('^N225', '닛케이 225'), Y('^GDAXI', '독일 DAX'), Y('^STOXX50E', '유로스톡스 50'), Y('^FTSE', '영국 FTSE 100'),
        Y('^FCHI', '프랑스 CAC 40'), Y('^SSMI', '스위스 SMI'), Y('^HSI', '홍콩 항셍'), Y('000001.SS', '상하이 종합'), Y('^TWII', '대만 가권')] },
      { title: '지수 선물', items: [
        Y('ES=F', 'S&P 500 선물'), Y('NQ=F', '나스닥 100 선물'), Y('YM=F', '다우 선물'), Y('NIY=F', '닛케이 선물(엔)')] },
    ],
  },
  {
    id: 'stocks', title: '주식', sections: [
      { title: '한국', items: [
        Y('005930.KS', '삼성전자', { dec: 0 }), Y('000660.KS', 'SK하이닉스', { dec: 0 }), Y('373220.KS', 'LG에너지솔루션', { dec: 0 }),
        Y('207940.KS', '삼성바이오로직스', { dec: 0 }), Y('005380.KS', '현대차', { dec: 0 }), Y('012450.KS', '한화에어로스페이스', { dec: 0 }),
        Y('000270.KS', '기아', { dec: 0 }), Y('105560.KS', 'KB금융', { dec: 0 }), Y('035420.KS', 'NAVER', { dec: 0 }), Y('068270.KS', '셀트리온', { dec: 0 })] },
      { title: '미국', items: [
        Y('NVDA', '엔비디아'), Y('AAPL', '애플'), Y('MSFT', '마이크로소프트'), Y('GOOGL', '알파벳'), Y('AMZN', '아마존'),
        Y('META', '메타'), Y('AVGO', '브로드컴'), Y('TSLA', '테슬라'), Y('BRK-B', '버크셔 해서웨이 B'), Y('JPM', 'JP모건')] },
      { title: '일본', items: [
        Y('7203.T', '도요타', { dec: 1 }), Y('8306.T', '미쓰비시UFJ', { dec: 1 }), Y('6758.T', '소니', { dec: 1 }), Y('9984.T', '소프트뱅크그룹', { dec: 0 }),
        Y('6501.T', '히타치', { dec: 1 }), Y('8035.T', '도쿄일렉트론', { dec: 0 }), Y('9983.T', '패스트리테일링', { dec: 0 }), Y('7974.T', '닌텐도', { dec: 0 })] },
      { title: '독일', items: [
        Y('SAP.DE', 'SAP'), Y('SIE.DE', '지멘스'), Y('ALV.DE', '알리안츠'), Y('DTE.DE', '도이치텔레콤'),
        Y('RHM.DE', '라인메탈'), Y('MUV2.DE', '뮌헨재보험'), Y('MBG.DE', '메르세데스-벤츠'), Y('DBK.DE', '도이치방크')] },
    ],
  },
  {
    id: 'commodities', title: '원자재', sections: [
      { title: '귀금속', items: [
        Y('GC=F', '금', { unit: '$/oz' }), Y('SI=F', '은', { unit: '$/oz' }), Y('PL=F', '백금', { unit: '$/oz' }), Y('PA=F', '팔라듐', { unit: '$/oz' })] },
      { title: '에너지', items: [
        Y('CL=F', 'WTI유', { unit: '$/bbl' }), Y('BZ=F', '브렌트유', { unit: '$/bbl' }), Y('NG=F', '천연가스', { unit: '$/MMBtu' }),
        Y('RB=F', '가솔린 RBOB', { unit: '$/gal' }), Y('HO=F', '난방유', { unit: '$/gal' })] },
      { title: '산업금속', items: [Y('HG=F', '구리', { unit: '$/lb' }), Y('ALI=F', '알루미늄', { unit: '$/t' })] },
      { title: '농산물', items: [
        Y('ZC=F', '옥수수', { unit: '¢/bu' }), Y('ZW=F', '밀', { unit: '¢/bu' }), Y('ZS=F', '대두', { unit: '¢/bu' }),
        Y('KC=F', '커피', { unit: '¢/lb' }), Y('CC=F', '코코아', { unit: '$/t' }), Y('SB=F', '설탕', { unit: '¢/lb' })] },
    ],
  },
  {
    id: 'bonds', title: '국채', sections: [
      { title: '미국', items: [
        C('US3M', '3개월', { alt: '^IRX' }), C('US2Y', '2년'), C('US5Y', '5년', { alt: '^FVX' }), C('US10Y', '10년', { alt: '^TNX' }),
        C('US30Y', '30년', { alt: '^TYX' }),
        CALC('us-10-2', '10년−2년 스프레드', (g) => diff(g('c:US10Y'), g('c:US2Y')))] },
      { title: '한국 · 장중', items: [C('KR3Y-KR', '3년'), C('KR10Y-KR', '10년')], optional: true },
      { title: '한국 · 금투협 고시(일별)', needs: 'ECOS_KEY', items: [
        E('010200000', '국고채 3년', { match: '^국고채\\(3년\\)' }), E('010210000', '국고채 10년', { match: '^국고채\\(10년\\)' }),
        E('010230000', '국고채 30년', { match: '^국고채\\(30년\\)' })] },
      { title: '일본', items: [C('JP2Y-JP', '2년'), C('JP10Y-JP', '10년'), C('JP30Y-JP', '30년')] },
      { title: '독일', items: [C('DE2Y-DE', '2년'), C('DE10Y-DE', '10년'), C('DE30Y-DE', '30년')] },
      { title: '기타 10년물', items: [
        C('GB10Y-GB', '영국'), C('FR10Y-FR', '프랑스'), C('IT10Y-IT', '이탈리아'), C('CH10Y-CH', '스위스'), C('CN10Y-CN', '중국')] },
    ],
  },
  {
    id: 'credit', title: '회사채', sections: [
      { title: '한국 · 금투협 고시(일별)', needs: 'ECOS_KEY', items: [
        E('010300000', '회사채 3년 AA-', { match: '^회사채.*AA-' }), E('010320000', '회사채 3년 BBB-', { match: '^회사채.*BBB-' }),
        E('010200000', '국고채 3년', { match: '^국고채\\(3년\\)', hidden: true }),
        CALC('kr-aa-spread', 'AA- 신용스프레드', (g) => diff(g('e:010300000'), g('e:010200000')))] },
      { title: '미국 · ICE BofA 지수(일별)', items: [
        F('BAMLC0A1CAAAEY', 'AAA 등급 수익률'), F('BAMLC0A0CMEY', '투자등급 전체 수익률'), F('BAMLC0A4CBBBEY', 'BBB 등급 수익률'),
        F('BAMLH0A0HYM2EY', '하이일드 수익률'), F('BAMLC0A0CM', '투자등급 스프레드', { kind: 'spread' }),
        F('BAMLH0A0HYM2', '하이일드 스프레드', { kind: 'spread' })] },
      { title: '미국 · 무디스(일별)', items: [F('DAAA', 'Aaa 회사채'), F('DBAA', 'Baa 회사채')] },
      { title: '유로·신흥국 · ICE BofA(일별)', items: [
        F('BAMLHE00EHYIEY', '유로 하이일드 수익률'), F('BAMLHE00EHYIOAS', '유로 하이일드 스프레드', { kind: 'spread' }),
        F('BAMLEMCBPIEY', '신흥국 회사채 수익률')] },
      { title: '장중 참고 · 회사채 ETF', items: [Y('LQD', '미국 투자등급 ETF (LQD)'), Y('HYG', '미국 하이일드 ETF (HYG)')] },
    ],
  },
  {
    id: 'fx', title: '환율', sections: [
      { title: '원화', items: [
        Y('KRW=X', '달러/원', { dec: 2 }), Y('JPYKRW=X', '100엔/원', { dec: 2, mult: 100 }), Y('EURKRW=X', '유로/원', { dec: 2 }),
        Y('CHFKRW=X', '스위스프랑/원', { dec: 2 }), Y('CNYKRW=X', '위안/원', { dec: 2 })] },
      { title: '주요 통화', items: [
        Y('DX-Y.NYB', '달러 인덱스', { dec: 2 }), Y('JPY=X', '달러/엔', { dec: 2 }), Y('EURUSD=X', '유로/달러', { dec: 4 }), Y('CHF=X', '달러/스위스프랑', { dec: 4 })] },
    ],
  },
  {
    id: 'crypto', title: '코인', sections: [
      { title: '업비트 · 원화', items: [
        U('KRW-BTC', '비트코인', { dec: 0 }), U('KRW-ETH', '이더리움', { dec: 0 }), U('KRW-XRP', '리플'),
        U('KRW-SOL', '솔라나', { dec: 0 }), U('KRW-DOGE', '도지코인')] },
      { title: '달러 · 24시간', items: [
        Y('BTC-USD', '비트코인'), Y('ETH-USD', '이더리움'), Y('XRP-USD', '리플', { dec: 4 }), Y('SOL-USD', '솔라나'),
        Y('KRW=X', '달러/원', { hidden: true })] },
      { title: '김치 프리미엄', items: [
        CALC('kimp-btc', '비트코인', (g) => kimp(g('u:KRW-BTC'), g('y:BTC-USD'), g('y:KRW=X')), { kind: 'premium' }),
        CALC('kimp-eth', '이더리움', (g) => kimp(g('u:KRW-ETH'), g('y:ETH-USD'), g('y:KRW=X')), { kind: 'premium' })] },
    ],
  },
];

// 각 탭을 몇 초 동안 재사용할지 (너무 짧게 하면 데이터 제공처에서 막힐 수 있음)
const GROUP_TTL = 20;
// ═══════════════════════════ 설정 끝 ═══════════════════════════

function diff(a, b) {
  if (!a || !b || a.value == null || b.value == null) return null;
  const prev = a.prev != null && b.prev != null ? a.prev - b.prev : null;
  const ts = [a.time, b.time].filter(Boolean);
  return { value: a.value - b.value, prev, asof: a.asof || b.asof, time: ts.length ? Math.min(...ts) : null, live: !!(a.live && b.live) };
}
function kimp(krw, usd, fx) {
  if (!krw || !usd || !fx || !krw.value || !usd.value || !fx.value) return null;
  return { value: (krw.value / (usd.value * fx.value) - 1) * 100, prev: null, time: krw.time };
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MEM = new Map();
const SUBREQ_BUDGET = 46; // 무료 요금제의 요청당 외부 호출 한도(50) 안쪽

function memGet(k) {
  const e = MEM.get(k);
  if (e && e.exp > Date.now()) return e.data;
  return undefined;
}
function memSet(k, data, ttl) {
  if (MEM.size > 400) MEM.clear();
  MEM.set(k, { data, exp: Date.now() + ttl * 1000 });
}

async function fetchRaw(url, { ttl = 30, type = 'json', budget, headers = {} } = {}) {
  const hit = memGet(url);
  if (hit !== undefined) return hit;
  if (budget) {
    if (budget.used >= SUBREQ_BUDGET) throw new Error('호출 한도 초과');
    budget.used++;
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: type === 'json' ? 'application/json,text/plain,*/*' : 'text/csv,text/plain,*/*', ...headers },
    cf: { cacheTtl: ttl, cacheEverything: true },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = type === 'json' ? await res.json() : await res.text();
  memSet(url, data, ttl);
  return data;
}

const num = (s) => {
  if (s == null || s === '') return null;
  const v = parseFloat(String(s).replace(/[,%\s]/g, ''));
  return Number.isFinite(v) ? v : null;
};
function thin(arr, n) {
  if (arr.length <= n) return arr;
  const out = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  return out;
}
const iso = (d) => d.toISOString().slice(0, 10);

// ── 야후 파이낸스
async function yahoo(sym, budget) {
  const path = '/v8/finance/chart/' + encodeURIComponent(sym) + '?range=1d&interval=15m&includePrePost=false';
  let j;
  try {
    j = await fetchRaw('https://query1.finance.yahoo.com' + path, { ttl: 20, budget });
  } catch (e) {
    j = await fetchRaw('https://query2.finance.yahoo.com' + path, { ttl: 20, budget });
  }
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error((j && j.chart && j.chart.error && j.chart.error.description) || '데이터 없음');
  const m = r.meta || {};
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const closes = (q.close || []).filter((v) => v != null && Number.isFinite(v));
  const value = m.regularMarketPrice != null ? m.regularMarketPrice : closes[closes.length - 1];
  const prev = m.previousClose != null ? m.previousClose : m.chartPreviousClose;
  const t = m.regularMarketTime ? m.regularMarketTime * 1000 : null;
  return {
    value, prev, time: t,
    live: t ? Date.now() - t < 20 * 60 * 1000 : false,
    hi: m.regularMarketDayHigh, lo: m.regularMarketDayLow,
    hint: m.priceHint, cur: m.currency, itype: m.instrumentType, spark: thin(closes, 40), from: '야후 파이낸스',
  };
}

// ── CNBC (국채금리)
async function cnbc(list, budget) {
  const url = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=' +
    encodeURIComponent(list.join('|')) + '&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1';
  const j = await fetchRaw(url, { ttl: 30, budget });
  let arr = (j && j.FormattedQuoteResult && j.FormattedQuoteResult.FormattedQuote) || [];
  if (!Array.isArray(arr)) arr = [arr];
  const out = {};
  for (const q of arr) {
    if (!q || !q.symbol) continue;
    const value = num(q.last);
    if (value == null || (q.code != null && String(q.code) !== '0')) continue;
    const ch = /^unch/i.test(String(q.change || '')) ? 0 : num(q.change);
    let prev = num(q.previous_day_closing);
    if (prev == null && ch != null) prev = value - ch;
    let time = null;
    if (q.last_time) {
      const t = Date.parse(String(q.last_time).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
      if (Number.isFinite(t)) time = t;
    }
    out[q.symbol] = {
      value, prev, time, live: time ? Date.now() - time < 20 * 60 * 1000 : false,
      hi: num(q.high), lo: num(q.low), from: 'CNBC',
    };
  }
  return out;
}

// ── FRED (회사채 지수, 일별)
async function fred(id, env, budget) {
  let rows;
  const start = iso(new Date(Date.now() - 45 * 864e5));
  if (env.FRED_KEY) {
    const url = 'https://api.stlouisfed.org/fred/series/observations?series_id=' + id + '&api_key=' + env.FRED_KEY +
      '&file_type=json&observation_start=' + start;
    const j = await fetchRaw(url, { ttl: 3600, budget });
    rows = (j.observations || []).map((o) => [o.date, o.value]);
  } else {
    const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=' + start;
    const txt = await fetchRaw(url, { ttl: 3600, type: 'text', budget });
    rows = String(txt).trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  }
  rows = rows.filter((r) => r[1] != null && r[1] !== '.' && r[1] !== '' && Number.isFinite(+r[1]));
  if (!rows.length) throw new Error('데이터 없음');
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  return { value: +last[1], prev: prev ? +prev[1] : null, asof: last[0], spark: rows.slice(-30).map((r) => +r[1]), from: 'FRED' };
}

// ── 한국은행 ECOS (시장금리 일별, 표 817Y002)
async function ecos(items, env, budget) {
  if (!env.ECOS_KEY) throw new Error('ECOS_KEY 미설정');
  const kst = new Date(Date.now() + 9 * 3600e3);
  const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const base = 'https://ecos.bok.or.kr/api/StatisticSearch/' + encodeURIComponent(env.ECOS_KEY) +
    '/json/kr/1/2000/817Y002/D/' + ymd(new Date(kst - 25 * 864e5)) + '/' + ymd(kst);
  let rows = [];
  try {
    const j = await fetchRaw(base, { ttl: 3600, budget });
    rows = (j && j.StatisticSearch && j.StatisticSearch.row) || [];
    if (!rows.length && j && j.RESULT) throw new Error(j.RESULT.MESSAGE || 'ECOS 오류');
  } catch (e) {
    rows = [];
  }
  if (!rows.length) {
    // 항목코드 없이 표 전체 조회가 안 될 때: 항목별 조회
    const codes = [...new Set(items.map((i) => i.sym))];
    const parts = await Promise.all(codes.map((c) => fetchRaw(base + '/' + c, { ttl: 3600, budget })
      .then((j) => (j && j.StatisticSearch && j.StatisticSearch.row) || []).catch(() => [])));
    rows = parts.flat();
  }
  if (!rows.length) throw new Error('ECOS 응답 없음 (인증키 확인)');
  const out = {};
  for (const it of items) {
    const re = it.match ? new RegExp(it.match) : null;
    let mine = re ? rows.filter((r) => re.test(String(r.ITEM_NAME1 || '').replace(/\s/g, ''))) : [];
    if (!mine.length) mine = rows.filter((r) => r.ITEM_CODE1 === it.sym);
    mine = mine.filter((r) => num(r.DATA_VALUE) != null).sort((a, b) => String(a.TIME).localeCompare(String(b.TIME)));
    if (!mine.length) continue;
    const last = mine[mine.length - 1];
    const prev = mine[mine.length - 2];
    const t = String(last.TIME);
    out[it.sym] = {
      value: num(last.DATA_VALUE), prev: prev ? num(prev.DATA_VALUE) : null,
      asof: t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6, 8),
      spark: mine.slice(-20).map((r) => num(r.DATA_VALUE)), from: '한국은행 ECOS',
    };
  }
  return out;
}

// ── 업비트
async function upbit(list, budget) {
  const j = await fetchRaw('https://api.upbit.com/v1/ticker?markets=' + list.join(','), { ttl: 10, budget });
  const out = {};
  for (const t of j || []) {
    out[t.market] = {
      value: t.trade_price, prev: t.prev_closing_price,
      time: t.trade_timestamp || t.timestamp, live: true,
      hi: t.high_price, lo: t.low_price, from: '업비트',
    };
  }
  return out;
}

async function pool(list, n, fn) {
  const out = new Array(list.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (i < list.length) {
      const k = i++;
      try { out[k] = await fn(list[k]); } catch (e) { out[k] = { error: String((e && e.message) || e) }; }
    }
  }));
  return out;
}

const keyOf = (it) => it.src + ':' + it.sym;

async function fetchItems(items, env, budget, errors) {
  const got = {};
  const bySrc = (s) => items.filter((i) => i.src === s);
  const uniq = (arr) => [...new Set(arr.map((i) => i.sym))];
  const tasks = [];

  const ys = uniq(bySrc('y'));
  if (ys.length) tasks.push(pool(ys, 6, (s) => yahoo(s, budget)).then((res) => {
    let fails = 0;
    ys.forEach((s, k) => { if (res[k] && !res[k].error) got['y:' + s] = res[k]; else fails++; });
    if (fails) errors.push('야후 ' + fails + '건 실패' + (res.find((r) => r && r.error) ? ' (' + res.find((r) => r && r.error).error + ')' : ''));
  }));

  const cs = uniq(bySrc('c'));
  if (cs.length) tasks.push(cnbc(cs, budget).then((m) => {
    for (const s of cs) if (m[s]) got['c:' + s] = m[s];
  }).catch((e) => errors.push('CNBC: ' + e.message)));

  const fs = uniq(bySrc('f'));
  if (fs.length) tasks.push(pool(fs, 6, (s) => fred(s, env, budget)).then((res) => {
    let fails = 0;
    fs.forEach((s, k) => { if (res[k] && !res[k].error) got['f:' + s] = res[k]; else fails++; });
    if (fails) errors.push('FRED ' + fails + '건 실패');
  }));

  const es = bySrc('e');
  if (es.length && env.ECOS_KEY) tasks.push(ecos(es, env, budget).then((m) => {
    for (const it of es) if (m[it.sym]) got['e:' + it.sym] = m[it.sym];
  }).catch((e) => errors.push('ECOS: ' + e.message)));

  const us = uniq(bySrc('u'));
  if (us.length) tasks.push(upbit(us, budget).then((m) => {
    for (const s of us) if (m[s]) got['u:' + s] = m[s];
  }).catch((e) => errors.push('업비트: ' + e.message)));

  await Promise.all(tasks);

  // CNBC가 막히면 미국 국채는 야후 지표로 대체
  const alts = items.filter((i) => i.alt && !got[keyOf(i)]);
  if (alts.length) {
    const res = await pool(alts, 4, (i) => yahoo(i.alt, budget));
    alts.forEach((i, k) => {
      const r = res[k];
      if (r && !r.error) got[keyOf(i)] = { ...r, spark: r.spark, from: '야후 파이낸스(대체)' };
    });
  }
  return got;
}

function shape(it, q) {
  const mult = it.mult || 1;
  const m = (v) => (v == null ? null : v * mult);
  const out = {
    name: it.name, sym: it.sym, tick: tickOf(it), kind: it.kind, unit: it.unit || null,
    dec: it.dec != null ? it.dec : null, ysym: it.src === 'y' ? it.sym : null,
  };
  if (!q || q.value == null) return { ...out, value: null };
  const value = m(q.value);
  const prev = m(q.prev);
  const change = prev != null ? value - prev : null;
  return {
    ...out, value, prev, change,
    pct: change != null && prev ? (change / Math.abs(prev)) * 100 : null,
    time: q.time || null, asof: q.asof || null, live: !!q.live,
    hi: m(q.hi), lo: m(q.lo), hint: q.hint != null ? q.hint : null, cur: q.cur || null, itype: q.itype || null,
    spark: (q.spark || []).map(m), from: q.from || null,
  };
}
function tickOf(it) {
  if (it.src === 'y') return it.sym.replace(/^\^/, '').replace(/=F$|=X$|-USD$/, '');
  if (it.src === 'c') return it.sym.replace(/-[A-Z]{2}$/, '');
  if (it.src === 'u') return it.sym.replace(/^KRW-/, '');
  if (it.src === 'e') return 'ECOS';
  return it.src === 'f' ? 'FRED' : '';
}

async function buildGroup(g, env) {
  const errors = [];
  const budget = { used: 0 };
  const sections = g.sections;
  const all = sections.flatMap((s) => s.items);
  const got = await fetchItems(all.filter((i) => i.src !== 'calc'), env, budget, errors);
  const getter = (k) => got[k] || null;
  for (const it of all.filter((i) => i.src === 'calc')) {
    try { const v = it.fn(getter); if (v) got[keyOf(it)] = v; } catch (e) { /* 계산 불가 */ }
  }
  const outSections = [];
  for (const s of sections) {
    if (s.needs && !env[s.needs]) {
      outSections.push({ title: s.title, items: [], note: s.needs + ' 환경변수를 넣으면 표시됩니다 (한국은행 ECOS 무료 인증키).' });
      continue;
    }
    const items = s.items.filter((i) => !i.hidden).map((i) => shape(i, got[keyOf(i)]));
    if (s.optional && !items.some((i) => i.value != null)) continue;
    outSections.push({ title: s.title, items });
  }
  return { id: g.id, title: g.title, updated: Date.now(), sections: outSections, errors, calls: budget.used };
}

async function buildQuote(syms, env) {
  const errors = [];
  const budget = { used: 0 };
  const items = syms.map((s) => Y(s, s));
  const got = await fetchItems(items, env, budget, errors);
  return { updated: Date.now(), items: items.map((i) => shape(i, got[keyOf(i)])), errors };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function b64bytes(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

const MANIFEST = {
  name: '시세판', short_name: '시세판', lang: 'ko', start_url: '/', scope: '/', display: 'standalone',
  background_color: '#0E1420', theme_color: '#0E1420',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  ],
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === '/api/group') {
        const id = url.searchParams.get('id');
        const g = GROUPS.find((x) => x.id === id);
        if (!g) return json({ error: '알 수 없는 탭: ' + id }, 404);
        const ck = 'group:' + id;
        let data = memGet(ck);
        if (!data) { data = await buildGroup(g, env); memSet(ck, data, GROUP_TTL); }
        return json(data);
      }
      if (p === '/api/quote') {
        const syms = (url.searchParams.get('s') || '').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9.^=\-]{1,24}$/.test(s));
        const uniq = [...new Set(syms)].slice(0, 30);
        if (!uniq.length) return json({ updated: Date.now(), items: [], errors: [] });
        const ck = 'quote:' + uniq.join(',');
        let data = memGet(ck);
        if (!data) { data = await buildQuote(uniq, env); memSet(ck, data, GROUP_TTL); }
        return json(data);
      }
      if (p === '/api/health') return json({ ok: true, ecos: !!env.ECOS_KEY, fredKey: !!env.FRED_KEY, tabs: GROUPS.map((g) => g.id) });
      if (p === '/manifest.webmanifest') {
        return new Response(JSON.stringify(MANIFEST), { headers: { 'content-type': 'application/manifest+json; charset=utf-8' } });
      }
      if (p === '/sw.js') {
        return new Response(SW_JS, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' } });
      }
      if (p === '/icon-180.png' || p === '/icon-192.png' || p === '/icon-512.png' || p === '/favicon.ico') {
        const b = p === '/icon-512.png' ? ICON_512 : p === '/icon-180.png' ? ICON_180 : ICON_192;
        return new Response(b64bytes(b), { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800' } });
      }
      if (p === '/' || p === '/index.html') {
        const tabs = GROUPS.map((g) => ({ id: g.id, title: g.title })).concat([{ id: 'watch', title: '관심' }]);
        const html = APP_HTML.replace('"__TABS__"', JSON.stringify(tabs));
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
      }
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  },
};

// ═══════════════ 아래는 화면·서비스워커·아이콘 (빌드 시 자동 삽입) ═══════════════
const APP_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0E1420" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F5F6F8" media="(prefers-color-scheme: light)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="시세판">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icon-180.png">
<link rel="icon" type="image/png" href="/icon-192.png">
<title>시세판</title>
<style>
:root{
  --bg:#0E1420; --raise:#141B29; --line:#1E2737; --ink:#E9EDF3; --mute:#8590A1; --faint:#4A5466;
  --up:#F04452; --dn:#3E8BFF; --upbg:rgba(240,68,82,.28); --dnbg:rgba(62,139,255,.28); --live:#2BC48A;
  --f:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;
}
@media (prefers-color-scheme: light){
  :root{ --bg:#F5F6F8; --raise:#FFFFFF; --line:#E3E6EB; --ink:#121722; --mute:#6A7383; --faint:#B3BAC5;
    --up:#E0263A; --dn:#1F66E0; --upbg:rgba(224,38,58,.16); --dnbg:rgba(31,102,224,.16); --live:#12A06B; }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f);font-size:16px;line-height:1.35;
  padding-bottom:calc(24px + env(safe-area-inset-bottom));-webkit-tap-highlight-color:transparent}
button,input{font:inherit;color:inherit}
.top{position:sticky;top:0;z-index:5;background:var(--bg);padding-top:env(safe-area-inset-top);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:10px;padding:10px 16px 2px;padding-left:max(16px,env(safe-area-inset-left));padding-right:max(16px,env(safe-area-inset-right))}
.bar h1{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em}
.stamp{margin-left:auto;font-size:13px;color:var(--mute);font-variant-numeric:tabular-nums}
.icon{width:38px;height:38px;border:0;background:none;border-radius:10px;display:grid;place-items:center;cursor:pointer;color:var(--mute)}
.icon svg{width:20px;height:20px}
.icon:focus-visible,.tab:focus-visible,.row:focus-visible,.btn:focus-visible{outline:2px solid var(--dn);outline-offset:-2px}
.busy .icon svg{animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
nav{display:flex;overflow-x:auto;scrollbar-width:none;padding:0 8px;padding-left:max(8px,env(safe-area-inset-left))}
nav::-webkit-scrollbar{display:none}
.tab{flex:0 0 auto;border:0;background:none;padding:12px 10px 11px;font-size:17px;font-weight:600;color:var(--mute);cursor:pointer;
  border-bottom:3px solid transparent;margin-bottom:-1px;white-space:nowrap}
.tab[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--ink);font-weight:800}
main{padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}
section h2{position:sticky;top:var(--hdr,96px);z-index:2;margin:0;padding:14px 16px 6px;font-size:13px;font-weight:700;color:var(--mute);
  background:var(--bg);letter-spacing:.01em}
.row{display:grid;grid-template-columns:minmax(0,1fr) 60px auto;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line);cursor:pointer}
.nm{font-size:17px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta{display:flex;align-items:center;gap:6px;margin-top:4px;font-size:13px;color:var(--mute);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden}
.meta .u{color:var(--faint)}
.dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex:0 0 auto}
.dot.on{background:var(--live)}
.sp{width:60px;height:24px;display:block;overflow:visible}
.sp polyline{fill:none;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round;stroke:var(--mute)}
.sp polyline.up{stroke:var(--up)} .sp polyline.dn{stroke:var(--dn)}
.sp line{stroke:var(--faint);stroke-width:1;stroke-dasharray:2 2}
.r{text-align:right;font-variant-numeric:tabular-nums}
.px{display:inline-block;font-size:18px;font-weight:700;padding:0 3px;margin-right:-3px;border-radius:3px}
.ch{margin-top:3px;font-size:14px;font-weight:600;color:var(--mute);white-space:nowrap}
.ch.up{color:var(--up)} .ch.dn{color:var(--dn)}
.fu{animation:fu 1.4s ease-out} .fd{animation:fd 1.4s ease-out}
@keyframes fu{0%,35%{background:var(--upbg)}100%{background:transparent}}
@keyframes fd{0%,35%{background:var(--dnbg)}100%{background:transparent}}
.det{display:none;padding:10px 16px 14px;background:var(--raise);border-bottom:1px solid var(--line);font-size:13px;color:var(--mute)}
.det.open{display:block}
.det dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:0}
.det dt{color:var(--mute)} .det dd{margin:0;color:var(--ink);font-variant-numeric:tabular-nums}
.btn{margin-top:10px;border:1px solid var(--line);background:var(--bg);border-radius:8px;padding:7px 12px;font-size:14px;font-weight:600;cursor:pointer}
.note,.empty{margin:0;padding:6px 16px 14px;font-size:14px;color:var(--mute)}
.foot{padding:18px 16px 6px;font-size:12px;color:var(--mute);line-height:1.55}
.foot .err{color:var(--up);margin-top:6px}
.add{display:flex;gap:8px;padding:14px 16px 4px}
.add input{min-width:0;flex:1;background:var(--raise);border:1px solid var(--line);border-radius:8px;padding:9px 10px;font-size:16px}
.add input:first-child{flex:1.3}
.hint{padding:4px 16px 8px;font-size:12px;color:var(--mute)}
@media (prefers-reduced-motion: reduce){.fu,.fd,.busy .icon svg{animation:none}}
</style>
</head>
<body>
<header class="top" id="top">
  <div class="bar">
    <h1>시세판</h1>
    <span class="stamp" id="stamp"></span>
    <button class="icon" id="refresh" aria-label="새로고침">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>
    </button>
  </div>
  <nav id="tabs" role="tablist" aria-label="시장"></nav>
</header>
<main id="list"></main>
<script>
const TABS = "__TABS__";
const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
let cur = store.get('sise.tab', TABS[0].id);
if (!TABS.some((t) => t.id === cur)) cur = TABS[0].id;
let watch = store.get('sise.watch', []);
const data = {};
const last = {};
const open = new Set();
let busy = 0;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
function fmt(v, d) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function bp(v) {
  const x = Math.round(v * 1000) / 10;
  return x.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}
const sign = (v) => (v > 0 ? '+' : v < 0 ? '-' : '');
function decOf(it) {
  if (it.dec != null) return it.dec;
  if (it.kind === 'yield') return 3;
  if (it.kind !== 'price') return 2;
  if (it.itype === 'EQUITY' && (it.cur === 'KRW' || it.cur === 'JPY')) return Number.isInteger(it.value) ? 0 : 1;
  if (it.hint != null && it.hint >= 0 && it.hint <= 6) return Math.min(it.hint, 4);
  const a = Math.abs(it.value || 0);
  return a >= 100 ? 2 : a >= 1 ? 3 : 5;
}
function valueText(it) {
  if (it.value == null) return '—';
  if (it.kind === 'yield') return fmt(it.value, decOf(it)) + '%';
  if (it.kind === 'spread') return bp(it.value) + 'bp';
  if (it.kind === 'premium') return sign(it.value) + fmt(Math.abs(it.value), 2) + '%';
  return fmt(it.value, decOf(it));
}
function changeText(it) {
  if (it.value == null) return '';
  if (it.change == null) return it.kind === 'premium' ? '업비트 대비 해외 시세' : '';
  if (it.kind === 'yield' || it.kind === 'spread') return sign(it.change) + bp(Math.abs(it.change)) + 'bp';
  let s = sign(it.change) + fmt(Math.abs(it.change), decOf(it));
  if (it.pct != null) s += ' (' + sign(it.change) + Math.abs(it.pct).toFixed(2) + '%)';
  return s;
}
function timeText(it, long) {
  if (it.asof) {
    const p = it.asof.split('-');
    return long ? it.asof + ' 종가' : (+p[1]) + '/' + (+p[2]) + ' 기준';
  }
  if (!it.time) return '';
  const t = new Date(it.time);
  const now = new Date();
  const hms = pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds());
  if (long) return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()) + ' ' + hms;
  return t.toDateString() === now.toDateString() ? hms : (t.getMonth() + 1) + '/' + t.getDate() + ' ' + hms.slice(0, 5);
}
function dirOf(it) { return it.change > 0 ? 'up' : it.change < 0 ? 'dn' : ''; }

function spark(it) {
  const a = (it.spark || []).filter((v) => v != null && isFinite(v));
  if (a.length < 2) return '<span class="sp"></span>';
  let lo = Math.min.apply(null, a), hi = Math.max.apply(null, a);
  const intraday = !it.asof && it.prev != null;
  if (intraday) { lo = Math.min(lo, it.prev); hi = Math.max(hi, it.prev); }
  const W = 60, H = 24, r = hi - lo || 1;
  const y = (v) => (H - 2 - ((v - lo) / r) * (H - 4)).toFixed(1);
  const pts = a.map((v, i) => ((i * W) / (a.length - 1)).toFixed(1) + ',' + y(v)).join(' ');
  const base = intraday ? '<line x1="0" x2="60" y1="' + y(it.prev) + '" y2="' + y(it.prev) + '"/>' : '';
  const d = intraday ? dirOf(it) : (a[a.length - 1] > a[0] ? 'up' : a[a.length - 1] < a[0] ? 'dn' : '');
  return '<svg class="sp" viewBox="0 0 60 24" aria-hidden="true">' + base + '<polyline class="' + d + '" points="' + pts + '"/></svg>';
}

function row(it) {
  const key = cur + '|' + it.sym + '|' + it.name;
  let flash = '';
  if (it.value != null) {
    if (last[key] != null && last[key] !== it.value) flash = it.value > last[key] ? 'fu' : 'fd';
    last[key] = it.value;
  }
  const d = dirOf(it);
  const meta = [];
  const tt = timeText(it);
  if (tt) meta.push(esc(tt));
  if (it.tick) meta.push(esc(it.tick));
  let metaHtml = '<i class="dot' + (it.live ? ' on' : '') + '"></i>' + meta.join(' · ');
  if (it.unit) metaHtml += ' <span class="u">' + esc(it.unit) + '</span>';
  if (it.value == null) metaHtml = '<i class="dot"></i>데이터를 받지 못했습니다';
  const isOpen = open.has(key);
  let h = '<div class="row" role="button" tabindex="0" aria-expanded="' + isOpen + '" data-k="' + esc(key) + '">' +
    '<div class="l"><div class="nm">' + esc(it.name) + '</div><div class="meta">' + metaHtml + '</div></div>' +
    spark(it) +
    '<div class="r"><div class="px ' + flash + '">' + valueText(it) + '</div><div class="ch ' + d + '">' + esc(changeText(it)) + '</div></div></div>';
  h += '<div class="det' + (isOpen ? ' open' : '') + '"><dl>';
  const add = (k, v) => { if (v != null && v !== '') h += '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>'; };
  if (it.prev != null) add(it.kind === 'price' ? '전일 종가' : '직전 값', it.kind === 'spread' ? bp(it.prev) + 'bp' : fmt(it.prev, decOf(it)) + (it.kind === 'yield' ? '%' : ''));
  if (it.hi != null && it.lo != null) add('당일 범위', fmt(it.lo, decOf(it)) + ' ~ ' + fmt(it.hi, decOf(it)));
  add('기준 시각', timeText(it, true));
  add('심볼', it.ysym || it.sym);
  add('출처', it.from);
  h += '</dl>';
  if (cur === 'watch') h += '<button class="btn" data-act="del" data-s="' + esc(it.sym) + '">관심에서 빼기</button>';
  else if (it.ysym) h += '<button class="btn" data-act="add" data-s="' + esc(it.ysym) + '" data-n="' + esc(it.name) + '">' + (watch.some((w) => w.s === it.ysym) ? '관심에 있음' : '관심에 추가') + '</button>';
  return h + '</div>';
}

function render() {
  const d = data[cur];
  let h = '';
  if (cur === 'watch') {
    h += '<form class="add" id="addf"><input id="ws" placeholder="심볼 (예: AAPL)" autocapitalize="characters" autocomplete="off" spellcheck="false">' +
      '<input id="wn" placeholder="이름 (선택)" autocomplete="off"><button class="btn" style="margin:0">추가</button></form>' +
      '<div class="hint">야후 파이낸스 심볼을 씁니다. 코스피 005930.KS · 코스닥 247540.KQ · 도쿄 7203.T · 독일 SAP.DE · 선물 GC=F. 숫자 6자리만 넣으면 .KS를 붙입니다.</div>';
    if (!watch.length) {
      $('#list').innerHTML = h + '<p class="empty">관심 종목이 없습니다. 위에 심볼을 넣거나, 다른 탭에서 종목을 눌러 관심에 추가하세요.</p>';
      return;
    }
  }
  if (!d) { $('#list').innerHTML = h + '<p class="empty">불러오는 중…</p>'; return; }
  if (d.failed && !d.sections) { $('#list').innerHTML = h + '<p class="empty">시세를 불러오지 못했습니다. 연결을 확인하고 새로고침을 누르세요.</p>'; return; }
  for (const s of d.sections || []) {
    h += '<section><h2>' + esc(s.title) + '</h2>';
    if (s.note) h += '<p class="note">' + esc(s.note) + '</p>';
    for (const it of s.items) h += row(it);
    h += '</section>';
  }
  h += '<div class="foot">장중 시세는 야후 파이낸스·CNBC·업비트, 일별 금리는 한국은행 ECOS·FRED 자료입니다. 거래소에 따라 15~20분 지연될 수 있습니다. 행을 누르면 자세한 정보가 열립니다.';
  if (d.errors && d.errors.length) h += '<div class="err">일부 항목을 못 가져왔습니다: ' + esc(d.errors.join(' / ')) + '</div>';
  h += '</div>';
  $('#list').innerHTML = h;
  stamp();
}

function stamp() {
  const d = data[cur];
  if (!d || !d.updated) { $('#stamp').textContent = ''; return; }
  const t = new Date(d.updated);
  $('#stamp').textContent = (d.offline ? '오프라인 · ' : '') + pad(t.getHours()) + ':' + pad(t.getMinutes()) + ':' + pad(t.getSeconds());
}

function setBusy(on) {
  busy += on ? 1 : -1;
  document.body.classList.toggle('busy', busy > 0);
}

async function load(id) {
  let url;
  if (id === 'watch') {
    if (!watch.length) { data.watch = null; if (id === cur) render(); return; }
    url = '/api/quote?s=' + encodeURIComponent(watch.map((w) => w.s).join(','));
  } else {
    url = '/api/group?id=' + encodeURIComponent(id);
  }
  setBusy(true);
  try {
    const r = await fetch(url, { cache: 'no-store' });
    let d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    if (id === 'watch') {
      const names = {};
      watch.forEach((w) => { names[w.s] = w.n; });
      d = { updated: d.updated, errors: d.errors, sections: [{ title: '관심 종목', items: d.items.map((it) => Object.assign(it, { name: names[it.sym] || it.sym })) }] };
    }
    d.offline = r.headers.get('x-sw-cache') === '1';
    data[id] = d;
  } catch (e) {
    if (!data[id]) data[id] = { failed: true, errors: [String(e.message || e)] };
  } finally {
    setBusy(false);
  }
  if (id === cur) render();
}

function select(id) {
  cur = id;
  store.set('sise.tab', id);
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
  const btn = document.querySelector('.tab[data-id="' + id + '"]');
  if (btn) btn.scrollIntoView({ block: 'nearest', inline: 'center' });
  window.scrollTo(0, 0);
  render();
  stamp();
  const d = data[id];
  if (!d || Date.now() - (d.updated || 0) > 15000) load(id);
}

$('#tabs').innerHTML = TABS.map((t) => '<button class="tab" role="tab" data-id="' + t.id + '" aria-selected="' + (t.id === cur) + '">' + esc(t.title) + '</button>').join('');
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) select(b.dataset.id); });
$('#refresh').addEventListener('click', () => load(cur));

function toggleRow(el) {
  const k = el.dataset.k;
  const det = el.nextElementSibling;
  const on = !open.has(k);
  if (on) open.add(k); else open.delete(k);
  det.classList.toggle('open', on);
  el.setAttribute('aria-expanded', String(on));
}
$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) {
    if (b.dataset.act === 'add' && !watch.some((w) => w.s === b.dataset.s)) {
      watch.push({ s: b.dataset.s, n: b.dataset.n });
      store.set('sise.watch', watch);
      b.textContent = '관심에 있음';
    } else if (b.dataset.act === 'del') {
      watch = watch.filter((w) => w.s !== b.dataset.s);
      store.set('sise.watch', watch);
      load('watch');
    }
    return;
  }
  const r = e.target.closest('.row');
  if (r) toggleRow(r);
});
$('#list').addEventListener('keydown', (e) => {
  const r = e.target.closest('.row');
  if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleRow(r); }
});
$('#list').addEventListener('submit', (e) => {
  if (e.target.id !== 'addf') return;
  e.preventDefault();
  let s = $('#ws').value.trim().toUpperCase();
  const n = $('#wn').value.trim();
  if (!s) return;
  if (/^\\d{6}$/.test(s)) s += '.KS';
  if (!/^[A-Z0-9.^=\\-]{1,24}$/.test(s)) { $('#ws').value = ''; $('#ws').placeholder = '심볼 형식이 맞지 않습니다'; return; }
  if (!watch.some((w) => w.s === s)) watch.push({ s, n: n || s });
  store.set('sise.watch', watch);
  load('watch');
});

function measure() { document.documentElement.style.setProperty('--hdr', $('#top').offsetHeight + 'px'); }
window.addEventListener('resize', measure);
measure();

setInterval(() => { if (document.visibilityState === 'visible') load(cur); }, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const d = data[cur];
    if (!d || Date.now() - (d.updated || 0) > 15000) load(cur);
  }
});

select(cur);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
</script>
</body>
</html>
`;
const SW_JS = `// 시세판 서비스워커: 화면은 오프라인에서도 열리게, 시세는 늘 새로 받되 끊기면 마지막 값을 보여 줌
const V = 'sise-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-180.png', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))));
  self.clients.claim();
});

function fromCache(req) {
  return caches.match(req, { ignoreVary: true }).then((r) => {
    if (!r) return Response.error();
    const h = new Headers(r.headers);
    h.set('x-sw-cache', '1');
    return r.blob().then((b) => new Response(b, { status: r.status, headers: h }));
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(V).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => fromCache(req))
  );
});
`;
const ICON_180 = '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';
const ICON_192 = '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';
const ICON_512 = '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';
