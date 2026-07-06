import fs from "node:fs/promises";
import path from "node:path";
import {gzipSync, gunzipSync} from "node:zlib";

const outputDir = path.join(process.cwd(), "outputs");
const htmlPath = process.env.DASHBOARD_HTML_PATH || path.join(outputDir, "hot_trends_bi_dashboard.html");
const latestPath = process.env.LATEST_DATA_PATH || path.join(outputDir, "hot_trends_latest.json");
const reportDate = process.env.REPORT_DATE || formatDateInZone(new Date(), "America/New_York");
const sourceTimeoutMs = Number(process.env.SOURCE_TIMEOUT_MS || 12000);
const payloadPattern = /window\.__HOT_TRENDS_DASHBOARD_GZIP__\s*=\s*"([A-Za-z0-9+/=]+)"/;

const sourceConfigs = [
  ["Google Trends US RSS", "https://trends.google.com/trending/rss?geo=US", "Google Trends"],
  ["Reddit r/popular", "https://www.reddit.com/r/popular.json?limit=50", "Reddit"],
  ["GDELT US News", "https://api.gdeltproject.org/api/v2/doc/doc?query=United%20States&mode=ArtList&format=json&maxrecords=50&sort=HybridRel", "News"],
  ["Trends24 United States", "https://trends24.in/united-states/", "X"]
];

const profileRules = [
  {
    key: "soccer",
    match: /world cup|copa mundial|soccer|football|usmnt|fifa|premier league|champions league|colombia|england|kane/i,
    category: "体育 / 足球 / 赛事热点",
    platforms: "X, TikTok, Instagram, Sports News",
    viral: 9,
    commerce: 8,
    longTerm: 8,
    persona: "体育迷、球队粉丝、轻度赛事观众、体育酒吧人群、球衣和周边消费者。",
    age: "16-44 岁，18-34 岁传播最活跃。",
    countriesText: "美国、英国、加拿大、墨西哥、巴西、欧洲主要足球市场。",
    countries: {"美国": 100, "英国": 56, "加拿大": 42, "墨西哥": 40, "巴西": 34, "德国": 28},
    spending: "中高；球衣、观赛用品、酒吧消费、体育订阅和城市观赛活动都有转化空间。",
    playbook: {
      tiktok: "做 30-60 秒赛前/赛后拆解，开头直接抛争议问题，结尾引导评论区预测比分。",
      instagram: "Carousel 做对阵卡、关键球员、晋级路线和球迷穿搭；Reels 做街访或酒吧反应。",
      x: "实时跟进首发、伤停、裁判、采访和球迷情绪，事实与观点分层。",
      store: "球衣、围巾、观赛派对用品、体育酒吧地图、赛事旅行清单。"
    }
  },
  {
    key: "nba",
    match: /nba|celtics|lakers|warriors|knicks|lebron|basketball|76ers|embiid|sixers/i,
    category: "NBA / 交易 / 球迷讨论",
    platforms: "X, TikTok, Instagram, YouTube, Sports News",
    viral: 9,
    commerce: 9,
    longTerm: 8,
    persona: "NBA 球迷、球队粉丝、篮球播客受众、球鞋球衣和收藏卡消费者。",
    age: "16-39 岁为主。",
    countriesText: "美国、加拿大、菲律宾、英国、澳大利亚、日本。",
    countries: {"美国": 100, "加拿大": 58, "菲律宾": 54, "英国": 36, "澳大利亚": 32, "日本": 26},
    spending: "高；球衣、球鞋、收藏卡、会员订阅和球星周边转化都强。",
    playbook: {
      tiktok: "把消息分成已确认、可靠记者、球迷流言三层，再做阵容模拟。",
      instagram: "Carousel 做交易评级、薪资空间和球员适配度；Stories 做投票。",
      x: "只引用源头记者和官方账号，实时更新签约、筹码和球迷情绪。",
      store: "球星球衣、球鞋、收藏卡、球队海报、交易追踪 newsletter。"
    }
  },
  {
    key: "nfl",
    match: /nfl|seahawks|chiefs|cowboys|eagles|packers|steelers|patriots/i,
    category: "NFL / 球队动态 / 球迷讨论",
    platforms: "X, TikTok, Instagram, YouTube, Sports News",
    viral: 8,
    commerce: 8,
    longTerm: 8,
    persona: "NFL 球迷、球队粉丝、Fantasy Football 玩家、球衣和周边消费者。",
    age: "18-49 岁为主。",
    countriesText: "美国、加拿大、英国、墨西哥、德国、澳大利亚。",
    countries: {"美国": 100, "加拿大": 38, "英国": 26, "墨西哥": 22, "德国": 18, "澳大利亚": 14},
    spending: "高；球衣、帽子、Fantasy 工具、会员订阅、比赛门票和观赛用品可承接。",
    playbook: {
      tiktok: "做训练营/交易/伤病/赛程的 30 秒解释，结尾问球迷新赛季预期。",
      instagram: "Carousel 做阵容深度图、赛程、球员变动和球迷穿搭。",
      x: "实时跟进记者源、球队公告、伤病和球迷情绪。",
      store: "球衣、帽子、Fantasy draft kit、观赛用品和球队专题页。"
    }
  },
  {
    key: "f1",
    match: /f1|formula 1|grand prix|silverstone|verstappen|ferrari|mclaren/i,
    category: "体育 / F1 / 赛车粉圈",
    platforms: "X, TikTok, Instagram, YouTube",
    viral: 8,
    commerce: 8,
    longTerm: 8,
    persona: "F1 粉丝、赛车游戏玩家、车队周边消费者、体育短视频用户。",
    age: "16-44 岁，18-34 岁社媒互动更强。",
    countriesText: "英国、美国、意大利、荷兰、澳大利亚、加拿大。",
    countries: {"英国": 100, "美国": 78, "意大利": 56, "荷兰": 48, "澳大利亚": 34, "加拿大": 28},
    spending: "中高；车队服饰、模型、F1 订阅、赛车游戏设备和观赛用品可承接。",
    playbook: {
      tiktok: "赛后做事故/策略/无线电三类短视频，标题让粉丝判断谁背锅。",
      instagram: "Carousel 做名次变化、车队策略、事故时间线和车手评分。",
      x: "实时跟进处罚、事故、天气、车队声明和粉丝争议。",
      store: "F1 周边、模型车、游戏方向盘、车队穿搭、观赛订阅。"
    }
  },
  {
    key: "gaming",
    match: /game|gaming|playstation|xbox|nintendo|steam|fortnite|roblox/i,
    category: "游戏 / 主机 / 发售节点",
    platforms: "TikTok, YouTube, Twitch, X",
    viral: 8,
    commerce: 9,
    longTerm: 7,
    persona: "主机玩家、手游/PC 玩家、直播观众、游戏硬件和周边消费者。",
    age: "13-34 岁为主。",
    countriesText: "美国、加拿大、英国、日本、澳大利亚、德国。",
    countries: {"美国": 100, "加拿大": 44, "英国": 38, "日本": 34, "澳大利亚": 28, "德国": 24},
    spending: "高；游戏本体、豪华版、主机、手柄、耳机、直播设备和会员都有直接转化。",
    playbook: {
      tiktok: "做新手设置、值不值得买、版本对比和第一天避坑。",
      instagram: "Carousel 做版本对比、发售时间线、装备清单；Reels 做高燃片段。",
      x: "跟进服务器、补丁、平台差异、玩家热梗和评分争议。",
      store: "主机/手柄、兑换码、耳机、直播设备、攻略电子书和社群会员。"
    }
  },
  {
    key: "travel",
    match: /travel|trip|city break|flight|hotel|barcelona|paris|london|new york/i,
    category: "旅行 / 城市生活 / 本地攻略",
    platforms: "TikTok, Instagram, Pinterest, Google Trends",
    viral: 8,
    commerce: 8,
    longTerm: 8,
    persona: "旅行计划用户、城市生活方式受众、本地活动用户、酒店/门票/餐厅消费人群。",
    age: "18-44 岁为主。",
    countriesText: "美国、英国、加拿大、西班牙、法国、澳大利亚。",
    countries: {"美国": 92, "英国": 48, "加拿大": 36, "西班牙": 34, "法国": 32, "澳大利亚": 28},
    spending: "高；酒店、门票、餐厅、交通、旅行用品和城市地图都有明确转化。",
    playbook: {
      tiktok: "一条热点拆成景点、餐厅、路线、预算、避坑 5 条短视频。",
      instagram: "Carousel 做地图和清单；Reels 做一天行程和 before/after。",
      x: "跟进航班、天气、活动和本地突发提醒。",
      store: "城市地图、行程 PDF、酒店/门票/餐厅联盟链接、旅行用品专题页。"
    }
  },
  {
    key: "holiday",
    match: /july 4|fourth of july|independence day|fireworks|bbq|halloween|thanksgiving|christmas/i,
    category: "节日 / 消费 / 本地生活",
    platforms: "TikTok, Instagram, X, Google Trends",
    viral: 9,
    commerce: 10,
    longTerm: 6,
    persona: "本地家庭、派对主理人、亲子用户、户外用品买家、食品饮料消费者。",
    age: "18-49 岁为主，25-44 岁转化最强。",
    countriesText: "美国、加拿大、英国、澳大利亚。",
    countries: {"美国": 100, "加拿大": 30, "英国": 16, "澳大利亚": 12},
    spending: "高；食品饮料、户外家具、派对装饰、服饰、美妆、防晒和本地活动都能承接。",
    playbook: {
      tiktok: "做节日布置、菜单、安全提醒、出行避坑和普通衣服变节日穿搭。",
      instagram: "Carousel 做购物清单、桌面布置、儿童活动、拍照姿势；Reels 做派对前后对比。",
      x: "发布实时出行、天气、活动、禁令和促销提醒。",
      store: "节日专题页：烧烤、冷饮杯、户外灯、一次性餐具、服饰和家庭游戏。"
    }
  },
  {
    key: "entertainment",
    match: /love island|netflix|hbo|movie|tv show|trailer|celebrity|award|music|song|album|cher|sebastian rulli/i,
    category: "娱乐 / 影视音乐 / 粉圈讨论",
    platforms: "TikTok, Instagram, X, YouTube",
    viral: 9,
    commerce: 6,
    longTerm: 7,
    persona: "娱乐八卦受众、粉圈用户、影视剧观众、音乐用户、穿搭和美妆消费人群。",
    age: "16-34 岁传播最活跃。",
    countriesText: "美国、英国、加拿大、澳大利亚、菲律宾、巴西。",
    countries: {"美国": 100, "英国": 48, "加拿大": 36, "澳大利亚": 30, "菲律宾": 26, "巴西": 22},
    spending: "中；可承接穿搭、美妆、歌单、周边、会员订阅和社群。",
    playbook: {
      tiktok: "用 15-30 秒讲清冲突点、名场面或争议，结尾让用户站队。",
      instagram: "Carousel 做角色关系图、红黑榜、穿搭同款和剧情时间线。",
      x: "跟进实时热梗、粉圈争议和官方物料，注意事实与猜测分层。",
      store: "穿搭同款、美妆清单、歌单、周边、剧情复盘专题和 newsletter。"
    }
  },
  {
    key: "local",
    match: /ohio|rittman|seattle|new york|los angeles|chicago|houston|miami|local/i,
    category: "本地新闻 / 城市话题 / 社区关注",
    platforms: "Google Trends, X, Local News, Reddit",
    viral: 6,
    commerce: 5,
    longTerm: 6,
    persona: "本地居民、家庭用户、社区新闻关注者、城市生活内容受众。",
    age: "25-54 岁为主。",
    countriesText: "美国为核心，按城市/州扩散。",
    countries: {"美国": 100, "加拿大": 8, "英国": 5},
    spending: "中低；适合本地清单、地图、服务信息和 newsletter，不适合硬带货。",
    playbook: {
      tiktok: "先讲清地点、事件、影响人群和下一步看什么，避免无来源猜测。",
      instagram: "Carousel 做时间线、地图、本地资源和 FAQ。",
      x: "只转官方/本地媒体源，标注未确认信息。",
      store: "本地资源页、地图、服务清单、社区 newsletter。"
    }
  },
  {
    key: "public",
    match: /supreme court|scotus|election|law|lawsuit|military|religion|recall|fda|salmonella/i,
    category: "公共议题 / 新闻解释 / 高风险话题",
    platforms: "X, Reddit, News, YouTube",
    viral: 7,
    commerce: 3,
    longTerm: 7,
    persona: "新闻关注者、公共议题讨论用户、专业解释内容受众。",
    age: "25-54 岁为主。",
    countriesText: "美国、加拿大、英国、澳大利亚。",
    countries: {"美国": 100, "加拿大": 24, "英国": 20, "澳大利亚": 14},
    spending: "低；更适合信息服务、newsletter、资料库和事实核查，不建议硬带货。",
    playbook: {
      tiktok: "只做中性解释：发生了什么、哪些说法未证实、下一步看什么。",
      instagram: "Carousel 做术语解释、时间线和关键问题。",
      x: "严格引用源头，标注未证实内容，不扩散截图流言。",
      store: "FAQ、资料库、newsletter；不建议直接带货。"
    }
  }
];

function describeOpportunity(title, profile) {
  const lower = String(title || "").toLowerCase();
  if (/is colombia still in the world cup|colombia/.test(lower)) {
    return "用户在搜索哥伦比亚是否还留在世界杯赛程里，说明赛果/晋级形势没有被普通观众理解清楚；适合做“哥伦比亚还在吗、下一场是谁、晋级条件是什么”的解释卡和短视频。";
  }
  if (/copa mundial/.test(lower)) {
    return "西语用户在集中搜索世界杯，核心需求是赛程、晋级表、球队状态和西语解读；适合做双语 World Cup 日历、拉美球队追踪和观赛清单。";
  }
  if (/england|kane/.test(lower)) {
    return "England/Kane 代表英格兰队与 Harry Kane 相关赛事讨论升温，用户关心首发、进球、晋级路线和球迷争议；适合做赛前预测、球星表现评分和英格兰球迷内容。";
  }
  if (/76ers|embiid|sixers/.test(lower)) {
    return "76ers/Embiid trade rumors 是 NBA 自由市场和交易流言话题，用户关心真假消息、薪资空间、下家和球队重建方向；适合做流言分层、阵容模拟和球迷投票。";
  }
  if (/seahawks/.test(lower)) {
    return "Seattle Seahawks 代表 NFL 球队动态升温，可能来自训练营、交易、伤病、赛程或球迷社区讨论；适合先核验具体新闻点，再做阵容变化、赛季预期和 Fantasy Football 内容。";
  }
  if (/cher/.test(lower)) {
    return "Cher 是经典娱乐人物名搜索上升，用户通常在追最新露面、纪念节点、演出/传记/关系话题或 viral clip；适合做“为什么又上热搜”的时间线、经典作品回顾和粉丝向短内容。";
  }
  if (/sebastian rulli/.test(lower)) {
    return "Sebastian Rulli 是拉美影视明星搜索上升，受众多为西语剧集/明星粉丝，需求集中在新剧、感情动态、采访或片段二创；适合做西语娱乐快讯和角色/作品盘点。";
  }
  if (/rittman ohio/.test(lower)) {
    return "Rittman Ohio 是本地地名搜索上升，说明当地新闻、事故、天气、学校或社区事件正在被集中查询；适合做本地事实核验、时间线和资源清单，不适合未核实就情绪化传播。";
  }
  if (/iron bird seed/.test(lower)) {
    return "Iron bird seed 看起来像商品/园艺/宠物鸟食相关搜索词，用户可能在找品牌、召回、评测或购买入口；适合先核验具体触发原因，再做产品解释、替代款和购买指南。";
  }
  if (/world cup|nba|nfl|f1|wimbledon|sports|soccer|football|basketball/.test([lower, profile.category].join(" "))) {
    return `「${title}」是体育赛事/球队/球员相关搜索上升，用户核心需求是赛程、结果、首发、伤病、晋级条件和球迷争议；适合做解释卡、赛前预测、赛后评分和观赛/周边承接。`;
  }
  if (/娱乐|celebrity|music|movie|tv|show/.test(profile.category.toLowerCase())) {
    return `「${title}」是娱乐人物或作品相关搜索上升，用户想知道“为什么突然火、发生了什么、有哪些片段可看”；适合做时间线、作品盘点、粉圈反应和穿搭/美妆/歌单承接。`;
  }
  if (/本地|local|ohio|city/.test([lower, profile.category].join(" "))) {
    return `「${title}」是本地地名或社区事件搜索上升，必须先核验事件源，再做地点、影响、时间线和资源清单；适合本地资讯号，不适合硬带货。`;
  }
  return `「${title}」是公开趋势里的上升搜索词，当前需要先回答用户最关心的三个问题：它是什么、为什么今天突然火、普通用户下一步要看什么；内容上先做背景解释和来源核验，再拆成短视频、图卡和专题页。`;
}

function formatDateInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function decodeText(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || `trend-${Date.now()}`;
}

function profileFor(text) {
  return profileRules.find(profile => profile.match.test(text)) || {
    key: "general",
    category: "综合热点 / 社交讨论 / 内容机会",
    platforms: "Google Trends, Reddit, X, News",
    viral: 7,
    commerce: 6,
    longTerm: 6,
    persona: "热点关注用户、短视频浏览用户、资讯消费人群和可被垂类内容聚合的人群。",
    age: "18-44 岁为主。",
    countriesText: "美国、加拿大、英国、澳大利亚及英语内容市场。",
    countries: {"美国": 100, "加拿大": 32, "英国": 30, "澳大利亚": 22, "印度": 18, "巴西": 14},
    spending: "中；需要先拆到具体垂类，再承接到清单、工具、周边或订阅。",
    playbook: {
      tiktok: "先做 3 秒钩子解释为什么突然火，再给背景、争议点和评论问题。",
      instagram: "Carousel 做信息卡、时间线、关键观点和可保存清单。",
      x: "跟进源头、事实更新和社区讨论，避免无来源扩散。",
      store: "用 newsletter、资料包、垂类清单或工具页承接。"
    }
  };
}

async function fetchSource([name, url, platform]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), sourceTimeoutMs);
  try {
    const response = await fetch(url, {signal: controller.signal, headers: {"user-agent": "Mozilla/5.0 hot-trends-dashboard"}});
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return {name, platform, url, ok: true, text};
  } catch (error) {
    return {name, platform, url, ok: false, error: error.message || String(error), text: ""};
  } finally {
    clearTimeout(timer);
  }
}

function parseRows(source) {
  if (!source.ok) return [];
  if (source.name.includes("Reddit")) {
    try {
      const json = JSON.parse(source.text);
      return (json.data?.children || []).map((item, index) => ({
        title: item.data?.title,
        url: item.data?.url || `https://reddit.com${item.data?.permalink || ""}`,
        platform: source.platform,
        description: item.data?.selftext || item.data?.subreddit_name_prefixed || "",
        weight: Math.max(1, 30 - index) + Math.log10((item.data?.ups || 1) + 1)
      }));
    } catch {
      return [];
    }
  }
  if (source.name.includes("GDELT")) {
    try {
      const json = JSON.parse(source.text);
      return (json.articles || []).map((item, index) => ({
        title: item.title,
        url: item.url,
        platform: source.platform,
        description: item.seendate || item.domain || "",
        weight: Math.max(1, 28 - index)
      }));
    } catch {
      return [];
    }
  }
  if (source.name.includes("Trends24")) {
    return [...source.text.matchAll(/<a[^>]+href="([^"]+)"[^>]*>(#[^<]+|[^<]{2,80})<\/a>/gi)]
      .slice(0, 50)
      .map((match, index) => ({
        title: decodeText(match[2]),
        url: match[1].startsWith("http") ? match[1] : `https://trends24.in${match[1]}`,
        platform: source.platform,
        description: "Trends24 US snapshot",
        weight: Math.max(1, 35 - index)
      }));
  }
  return [...source.text.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?(?:<link>([\s\S]*?)<\/link>)?[\s\S]*?<\/item>/gi)]
    .slice(0, 50)
    .map((match, index) => ({
      title: decodeText(match[1]),
      url: decodeText(match[2] || source.url),
      platform: source.platform,
      description: source.name,
      weight: Math.max(1, 40 - index)
    }));
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const title = decodeText(row.title);
    if (!title || title.length < 3) continue;
    const key = slugify(title.replace(/^#/, ""));
    const existing = groups.get(key) || {title, url: row.url, descriptions: [], platforms: new Set(), sourceNames: new Set(), weight: 0};
    existing.weight += row.weight || 1;
    existing.platforms.add(row.platform);
    existing.sourceNames.add(row.platform);
    if (row.description) existing.descriptions.push(row.description);
    groups.set(key, existing);
  }
  return [...groups.values()].sort((a, b) => b.weight - a.weight).slice(0, 10);
}

function buildTrend(group, index) {
  const profile = profileFor([group.title, ...group.descriptions].join(" "));
  const heat = Math.max(58, Math.min(99, Math.round(96 - index * 3 + Math.min(6, Math.log2(group.weight + 1)))));
  const viral = profile.viral;
  const commerce = profile.commerce;
  const longTerm = profile.longTerm;
  return {
    id: slugify(group.title),
    name: group.title,
    platforms: [...new Set([...group.platforms, ...profile.platforms.split(",").map(item => item.trim())])].slice(0, 5).join(", "),
    category: profile.category,
    heat,
    viral,
    commerce,
    longTerm,
    source: group.url || "",
    opportunity: describeOpportunity(group.title, profile),
    persona: profile.persona,
    age: profile.age,
    countriesText: profile.countriesText,
    interests: `${group.title}, ${profile.category}, social trend, viral discussion`,
    spending: profile.spending,
    ageBuckets: {"13-17": 8, "18-24": 30, "25-34": 34, "35-44": 18, "45+": 10},
    countries: profile.countries,
    playbook: profile.playbook,
    score: Number(((heat / 10) * 0.35 + viral * 0.25 + commerce * 0.22 + longTerm * 0.18).toFixed(1))
  };
}

function fallbackTrends(data) {
  const latestDate = Object.keys(data).sort().at(-1);
  return (data[latestDate]?.trends || []).slice(0, 10).map((trend, index) => ({
    ...trend,
    heat: Math.max(50, Number(trend.heat || 70) - 8 - index)
  }));
}

function unwrap(rawHtml) {
  const match = rawHtml.match(payloadPattern);
  if (!match) return {html: rawHtml, wrapped: false};
  return {html: gunzipSync(Buffer.from(match[1], "base64")).toString("utf8"), wrapped: true};
}

function wrap(html) {
  const payload = gzipSync(Buffer.from(html, "utf8"), {level: 9}).toString("base64");
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>热点趋势 BI 看板</title></head>
<body>
<p style="font-family:system-ui,sans-serif;padding:24px;">正在加载热点趋势 BI 看板...</p>
<script>
window.__HOT_TRENDS_DASHBOARD_GZIP__="${payload}";
(async()=>{try{const b=atob(window.__HOT_TRENDS_DASHBOARD_GZIP__);const bytes=Uint8Array.from(b,c=>c.charCodeAt(0));const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));const html=await new Response(stream).text();document.open();document.write(html);document.close();}catch(e){document.body.innerHTML="<pre style='white-space:pre-wrap;font-family:system-ui,sans-serif;padding:24px;color:#991b1b;'>看板加载失败："+String(e&&e.message?e.message:e)+"</pre>";}})();
</script>
</body>
</html>
`;
}

function extractData(html) {
  const match = html.match(/const dataByDate = ([\s\S]*?\n\};)\s*\n\s*let selectedDate/);
  if (!match) throw new Error("Cannot find dataByDate block.");
  return Function(`return (${match[1].trim().replace(/;\s*$/, "")})`)();
}

function replaceData(html, data) {
  return html.replace(/const dataByDate = [\s\S]*?\n\};\s*\n\s*let selectedDate/, `const dataByDate = ${JSON.stringify(data, null, 6)};\n\n    let selectedDate`);
}

async function main() {
  await fs.mkdir(outputDir, {recursive: true});
  const {html, wrapped} = unwrap(await fs.readFile(htmlPath, "utf8"));
  const data = extractData(html);
  const sources = await Promise.all(sourceConfigs.map(fetchSource));
  const rows = sources.flatMap(parseRows);
  let trends = groupRows(rows).map(buildTrend).sort((a, b) => b.score - a.score || b.heat - a.heat);
  let status = `云端自动更新完成。采集 ${rows.length} 条公开源候选，生成 Top${trends.length}。`;
  if (trends.length < 5) {
    trends = fallbackTrends(data);
    status = "云端自动更新降级：公开源候选不足，暂用上一日报兜底。";
  }
  const sourceRows = sources.map(source => [source.name, source.ok ? "成功" : "失败", source.ok ? source.platform : source.error, source.url]);
  data[reportDate] = {status: `${status} 更新时间：${new Date().toISOString()}。`, sources: sourceRows, trends};
  const updatedHtml = replaceData(html, data);
  await fs.writeFile(htmlPath, wrapped ? wrap(updatedHtml) : updatedHtml, "utf8");
  await fs.writeFile(latestPath, JSON.stringify({reportDate, status, sources: sourceRows, trends}, null, 2), "utf8");
  console.log(`Updated dashboard for ${reportDate}: ${trends.length} trends.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
