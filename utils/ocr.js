/**
 * OCR 识别匹配工具类
 * 功能：通过模糊匹配算法，将 OCR 识别出的文本与数据库中的商品进行关联
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const { fetchAll } = require('./db');

/**
 * 文本清洗逻辑
 */
function cleanText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[×*]/g, 'x') // 统一乘号
    .replace(/[（）()【】\[\]{}]/g, ' ') // 移除括号
    .replace(/[，,。.!！?？;；:："'`~、\\/|-]/g, ' ') // 移除常用标点
    .replace(/\s+/g, ' ') // 缩减空格
    .trim();
}

/**
 * 智能别名映射 - 将用户输入的别名映射到标准商品名称
 * 调试版本 - 增强日志
 */
function mapAliases(text) {
  console.log('【mapAliases】原始输入:', text);
  let mapped = text.toLowerCase();
  
  console.log('【mapAliases】转小写后:', mapped);

  // 预检查：是否包含 200 系列
  if (/ctl\s*[-]?\s*200/i.test(mapped)) {
    console.log('【mapAliases】检测到 CTL-200 系列!');
  }

  // 系列号别名映射 - 支持有空格或无空格
  const seriesAliases = [
    // CTL-200 系 -> CTL-205 (支持 ctl200, ctl 200, ctl-200)
    { from: /ctl\s*[-]?\s*200/gi, to: 'ctl-205' },
    // CTL-300 系 -> CTL-350
    { from: /ctl\s*[-]?\s*300/gi, to: 'ctl-350' },
    // CTL-350 本身也要加连字符
    { from: /ctl\s*[-]?\s*350/gi, to: 'ctl-350' },
    // CTL-500 系 -> CTL-355 (也支持单独写 355)
    { from: /ctl\s*[-]?\s*500/gi, to: 'ctl-355' },
    { from: /(?<![a-z])\s*355\s*(?=hk|hc|hm|hy)/gi, to: 'ctl-355' }, // 单独的 355 后面跟颜色码
    { from: /ctl\s*[-]?\s*355/gi, to: 'ctl-355' },
    // GL -> CTL (GL系列不存在)
    { from: /gl\s*[-]?\s*(\d+)/gi, to: 'ctl-$1' },
    // LM -> HM (颜色码写反)
    { from: /lm(?=[a-z]|\s|$)/gi, to: 'hm' },
  ];

  seriesAliases.forEach(alias => {
    const before = mapped;
    mapped = mapped.replace(alias.from, alias.to);
    if (before !== mapped) {
      console.log('【mapAliases】系列替换:', alias.from.source, '->', alias.to);
    }
  });

  // 产品类型别名映射
  const typeAliases = [
    // 粉盒 -> 硒鼓
    { from: /粉盒/gi, to: '硒鼓' },
    // 墨盒 -> 硒鼓
    { from: /墨盒/gi, to: '硒鼓' },
  ];

  typeAliases.forEach(alias => {
    const before = mapped;
    mapped = mapped.replace(alias.from, alias.to);
    if (before !== mapped) {
      console.log('【mapAliases】类型替换:', alias.from.source, '->', alias.to);
    }
  });

  // 颜色码别名
  const colorAliases = [
    { from: /黑色粉/gi, to: '黑色硒鼓' },
    { from: /红色粉/gi, to: '红色硒鼓' },
    { from: /蓝色粉/gi, to: '蓝色硒鼓' },
    { from: /黄色粉/gi, to: '黄色硒鼓' },
  ];

  colorAliases.forEach(alias => {
    const before = mapped;
    mapped = mapped.replace(alias.from, alias.to);
    if (before !== mapped) {
      console.log('【mapAliases】颜色替换:', alias.from.source, '->', alias.to);
    }
  });

  console.log('【mapAliases】最终结果:', mapped);
  return mapped;
}

/**
 * 紧凑文本清洗（移除所有空格，用于精确对比）
 */
function compactText(text) {
  return cleanText(text).replace(/\s+/g, '');
}

/**
 * 词素提取（按中文字符或连续字母数字拆分）
 */
function getTokens(text) {
  return cleanText(text).match(/[a-z0-9]+|[\u4e00-\u9fa5]+/g) || [];
}

/**
 * 模糊匹配核心算法：计算两个文本的相似度分值 (0-1)
 */
function calculateSimilarity(text1, text2) {
  const compact1 = compactText(text1);
  const compact2 = compactText(text2);

  if (!compact1 || !compact2) return 0;
  if (compact1 === compact2) return 1; // 完美匹配

  // 用 token 真子集判断"包含关系"，避免误判
  // 要求：短字符串的 token 是长字符串 compact 的真子串，且 token 集合是长字符串 token 集合的真子集
  const allTokens1 = getTokens(text1);
  const allTokens2 = getTokens(text2);
  if (allTokens1.length > 0 && allTokens2.length > 0) {
    const [shorter, longer] = allTokens1.length <= allTokens2.length ? [allTokens1, allTokens2] : [allTokens2, allTokens1];
    const longerSet = new Set(longer);
    const overlap = shorter.filter(t => longerSet.has(t)).length;
    // 短的全部 token 都在长的里面，且短的 token 数更少（真子集），才认为是包含匹配
    // 同时要求 shorter 的所有 token 都是 longer compact 的子串（确保真的有关联）
    const compactLonger = allTokens1.length <= allTokens2.length ? compact2 : compact1;
    const allTokensInLonger = shorter.every(t => compactLonger.includes(t));
    if (overlap === shorter.length && shorter.length < longer.length && allTokensInLonger) {
      return 0.96;
    }
  }

  // 基于 Token 的分词匹配（保留所有数字，不做长度过滤）
  const tokens1 = getTokens(text1);
  const tokens2 = getTokens(text2);

  const hits1 = tokens1.filter(t => compact2.includes(compactText(t))).length;
  const hits2 = tokens2.filter(t => compact1.includes(compactText(t))).length;

  const score1 = tokens1.length ? hits1 / tokens1.length : 0;
  const score2 = tokens2.length ? hits2 / tokens2.length : 0;

  // 基于字符集的重合度匹配
  let charHit = 0;
  const charSet1 = Array.from(new Set(compact1.split('')));
  charSet1.forEach(c => {
    if (compact2.includes(c)) charHit += 1;
  });
  const charScore = charSet1.length ? charHit / charSet1.length : 0;

  // 提取尾部数字做精确对比（产品型号的关键区分部分，如 205 vs 350）
  const numMatch = extractTrailingNumbers(compact1, compact2);
  const numScore = numMatch.matchRate;

  // 综合评分：数字精确匹配分数权重最高
  return Math.max(
    0.85 * score1,
    0.8 * score2,
    0.72 * charScore,
    numScore
  );
}

/**
 * 提取两个字符串尾部的连续数字段，比较是否一致
 * 例如 "ctl205" vs "ctl350" -> 数字不同，返回低分
 * "ctl205" vs "ctl205" -> 数字相同，返回高分
 */
function extractTrailingNumbers(s1, s2) {
  // 找到最后一个连续数字段
  const m1 = s1.match(/(\d+)$/);
  const m2 = s2.match(/(\d+)$/);
  const n1 = m1 ? m1[1] : '';
  const n2 = m2 ? m2[1] : '';

  if (!n1 && !n2) return { n1: '', n2: '', matchRate: 0.5 }; // 都无数字，中立
  if (!n1 || !n2) return { n1, n2, matchRate: 0.1 }; // 一个有数字一个没有，低分
  if (n1 === n2) return { n1, n2, matchRate: 1.0 }; // 数字完全一致，高分

  // 数字不一致：根据数字长度给予不同惩罚
  // 3位数字（如 205 vs 350）差异大，返回极低分
  // 1-2位数字差异惩罚稍轻
  const len = Math.max(n1.length, n2.length);
  const editDist = levenshteinDistance(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  const similarity = 1 - (editDist / maxLen);

  // 3位数字差异大（editDist ≈ 3），给 0.1-0.2 分
  // 1-2位数字给 0.3-0.5 分
  return { n1, n2, matchRate: len >= 3 ? Math.max(0.1, similarity * 0.15) : Math.max(0.2, similarity * 0.5) };
}

/**
 * 计算两个字符串的编辑距离
 */
function levenshteinDistance(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * 提取文本中的颜色词（支持从任意位置提取）
 * 商品颜色格式：xk(黑), xm(红), xc(蓝), xy(黄) 或 HK(黑), HM(红), HY(黄), HC(蓝) 或中文"黑色/红色/蓝色/黄色"
 */
function extractColor(text) {
  const clean = cleanText(text);

  // 颜色码映射
  const xColorMap = { 'xk': '黑', 'xc': '蓝', 'xy': '黄', 'xm': '红' };
  const hColorMap = { 'hk': '黑', 'hc': '蓝', 'hy': '黄', 'hm': '红' };
  const colorWords = ['黑色', '红色', '蓝色', '黄色', '白色', '绿色', '青色', '紫色', '橙色', '粉色', '灰色'];

  // 优先查找中文颜色词（最可靠）
  for (const cw of colorWords) {
    if (clean.includes(cw)) {
      // 提取颜色码（在中文颜色词之前的）
      const idx = clean.indexOf(cw);
      const before = clean.substring(0, idx);
      const xMatch = before.match(/\s*(xk|xc|xy|xm)\s*$/i);
      if (xMatch) {
        return { color: cw, colorCode: xMatch[1].toLowerCase(), source: 'both' };
      }
      const hMatch = before.match(/\s*(hk|hc|hy|hm)\s*$/i);
      if (hMatch) {
        return { color: cw, colorCode: hMatch[1].toLowerCase(), source: 'both' };
      }
      return { color: cw, colorCode: null, source: 'cn' };
    }
  }

  // 查找单独的颜色码（末尾）
  const xMatch = clean.match(/\s*(xk|xc|xy|xm)\s*$/i);
  if (xMatch) {
    return { color: xColorMap[xMatch[1].toLowerCase()], colorCode: xMatch[1].toLowerCase(), source: 'code' };
  }
  const hMatch = clean.match(/\s*(hk|hc|hy|hm)\s*$/i);
  if (hMatch) {
    return { color: hColorMap[hMatch[1].toLowerCase()], colorCode: hMatch[1].toLowerCase(), source: 'code' };
  }

  return null;
}

/**
 * 从文本中提取产品系列（去掉颜色码和中文颜色词）
 */
function extractSeries(text) {
  let result = text
    .replace(/^(巨威|原装|奔图|惠普|佳能|兄弟|三星|联想|戴尔|华为|小米|荣耀|realme|iQOO|一加|OPPO|vivo|苹果)\s*/gi, '') // 去掉品牌前缀
    .replace(/(xk|xc|xy|xm|hk|hc|hy|hm)\s*/gi, '') // 颜色码直接去掉
    .replace(/(黑色|红色|蓝色|黄色|白色|绿色|青色|紫色|橙色|粉色|灰色)/g, '') // 中文颜色直接去掉
    .replace(/(硒鼓|粉盒|粉|鼓|鼓架|粉筒|芯片|墨盒|墨水)/g, '') // 产品类型直接去掉
    .replace(/[-\s]+/g, '') // 多个连字符/空格全部合并去掉
    .trim()
    .toLowerCase(); // 统一转小写
  return result;
}

/**
 * 计算文本与商品名的匹配度
 * 核心逻辑：先匹配产品系列（分数权重高），再用颜色二次校验
 */
function calculateGoodsMatchScore(text, goods, debug = false) {
  const textColor = extractColor(text);
  const textSeries = extractSeries(text);
  const goodsName = goods.name;
  const goodsNameLower = goodsName.toLowerCase();
  const goodsSeries = extractSeries(goodsNameLower);

  // 1. 产品系列相似度（核心权重）
  const seriesSimilarity = calculateSimilarity(textSeries, goodsSeries);
  console.log(`  [匹配] intent=${text} goods=${goodsName} series=${textSeries} vs ${goodsSeries} sim=${seriesSimilarity.toFixed(3)}`);
  
  // 特殊处理：精确匹配系列号时给高分
  if (textSeries && goodsSeries && textSeries === goodsSeries) {
    console.log(`  [匹配] 系列号精确匹配! textSeries=${textSeries} goodsSeries=${goodsSeries}`);
  }
  
  // 也检查 goodsSeries 是否包含 textSeries（更宽松的匹配）
  if (textSeries && goodsSeries && goodsSeries.includes(textSeries)) {
    console.log(`  [匹配] 商品系列包含输入系列! textSeries=${textSeries} goodsSeries=${goodsSeries}`);
  }
  
  // 如果系列完全不匹配（相似度极低），直接排除
  // 系列号完全匹配（>=0.9）或完全没匹配（<0.3）
  if (seriesSimilarity >= 0.9) {
    // 完全匹配，继续计算
  } else if (seriesSimilarity < 0.3) {
    if (debug) console.log(`  [${goodsName}] 系列${seriesSimilarity.toFixed(3)}<0.3 淘汰`);
    return 0;
  }

  let colorPenalty = 1.0;
  // 2. 颜色校验（软校验，不是硬排除）
  if (textColor && textColor.color) {
    const goodsColorCode = goodsNameLower.match(/(xk|xc|xy|xm|hk|hc|hy|hm)/i);
    const goodsColorCn = goodsNameLower.match(/(黑色|红色|蓝色|黄色|白色|绿色|青色|紫色|橙色|粉色|灰色)/);

    const goodsHasColorCode = goodsColorCode ? goodsColorCode[1].toLowerCase() : null;
    const goodsHasColorCn = goodsColorCn ? goodsColorCn[1] : null;

    // OCR 有明确颜色词时，商品名必须有对应颜色
    if (textColor.source === 'cn' || textColor.source === 'both') {
      if (goodsHasColorCn && goodsHasColorCn !== textColor.color) {
        colorPenalty = 0.4;
        if (debug) console.log(`    颜色不符: OCR=${textColor.color} vs 商品=${goodsHasColorCn}, 降权x0.4`);
      }
    }

    // 有颜色码的，商品也必须有颜色码
    if (textColor.colorCode && !goodsHasColorCode) {
      colorPenalty = Math.min(colorPenalty, 0.5);
      if (debug) console.log(`    商品缺颜色码, 降权x0.5`);
    }
  }

  // 3. 整体字符串相似度
  const overallSimilarity = calculateSimilarity(text, goodsName);

  // 4. keywords 匹配
  let keywordMaxScore = 0;
  if (goods.keywords) {
    const keywordList = goods.keywords.split(/[,，]/).map(k => k.trim()).filter(Boolean);
    keywordList.forEach(keyword => {
      const score = calculateSimilarity(text, keyword);
      if (score > keywordMaxScore) {
        keywordMaxScore = score;
      }
    });
  }

  // 综合评分：系列相似度权重最高
  let finalScore = Math.max(
    seriesSimilarity * 1.0,
    overallSimilarity * 0.8,
    keywordMaxScore * 0.7
  ) * colorPenalty;
  
  // 特殊处理：系列精确匹配时给满分
  if (textSeries && goodsSeries && textSeries === goodsSeries) {
    finalScore = 1.0;
    console.log(`  [${goodsName}] 系列精确匹配，给满分!`);
  }

  // 防御 NaN
  if (isNaN(finalScore)) finalScore = 0;

  if (debug) {
    console.log(`  [${goodsName}] series=${seriesSimilarity.toFixed(3)} overall=${overallSimilarity.toFixed(3)} colorPenalty=${colorPenalty} final=${finalScore.toFixed(3)}`);
  }

  return finalScore;
}

/**
 * 将文本块拆分为行
 */
function splitLines(text) {
  return String(text || '').split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
}

/**
 * 解析带有数量特征的文本行
 * 示例： "CTL-205HK黑色硒鼓 x 1" -> { name: "CTL-205HK黑色硒鼓", quantity: 1 }
 */
function parseQuantityLine(rawLine) {
  const cleaned = cleanText(rawLine);

  // 模式4: 自然语言 "一个 CTL-205黑色" 或 "CTL-205黑色一个"
  const naturalPatterns = [
    /(?:一个|两个|三个|四个|五个|六个|七个|八个|九个|十个|若干|\d+个?)\s*(.+?)(?:一个|两个|三个|四个|五个|六个|七个|八个|九个|十个)?$/i,
    /(.+?)\s*(?:一个|两个|三个|四个|五个|六个|七个|八个|九个|十个|若干|\d+个?)$/i,
  ];

  // 数字映射
  const numMap = {
    '一个': 1, '俩': 2, '两个': 2, '仨': 3, '三个': 3,
    '四个': 4, '五个': 5, '六个': 6, '七个': 7, '八个': 8,
    '九个': 9, '十个': 10, '若干': 1
  };

  // 先尝试原有的标准化格式
  const regexList = [
    /^(.+?)\s*[x:：]\s*(\d+(?:\.\d+)?)(?:\s*[a-z\u4e00-\u9fa5]*)?$/i, // "商品名 x: 10"
    /^(.+?)\s+(\d+(?:\.\d+)?)(?:\s*(?:件|个|张|箱|包|袋|只|套|卷|本|台|瓶|桶|盒|米|m|支|个))?$/i, // "商品名 10件"
  ];

  // 新增：支持中文数量开头 "一个CTL205黑色" 或 "一个ctl200"
  const frontQtyPatterns = [
    // 一个 + 商品
    /^(一|二|三|四|五|六|七|八|九|十)\s*(?:个|只|台|支|件|张)?\s+(.+)$/i,
    // 1个 + 商品
    /^(\d+)\s*(?:个|只|台|支|件|张)?\s+(.+)$/i,
  ];

  for (const regex of frontQtyPatterns) {
    const match = cleaned.match(regex);
    if (match) {
      let qty = 1;
      const numStr = match[1];
      if (numStr === '一') qty = 1;
      else if (numStr === '二') qty = 2;
      else if (numStr === '三') qty = 3;
      else if (numStr === '四') qty = 4;
      else if (numStr === '五') qty = 5;
      else if (numStr === '六') qty = 6;
      else if (numStr === '七') qty = 7;
      else if (numStr === '八') qty = 8;
      else if (numStr === '九') qty = 9;
      else if (numStr === '十') qty = 10;
      else qty = Number(numStr) || 1;
      
      return {
        name: match[2].trim(),
        quantity: qty,
        sourceLine: rawLine
      };
    }
  }

  for (const regex of regexList) {
    const match = cleaned.match(regex);
    if (match) {
      return {
        name: match[1].trim(),
        quantity: Number(match[2]),
        sourceLine: rawLine
      };
    }
  }

  // 新增：支持 "一个ctl205黑色" 格式（数量在前面）
  const frontQtyMatch = cleaned.match(/^(一|二|三|四|五|六|七|八|九|十|\d+)\s*(?:个|只|台|支|件|张)?\s+(.+)$/);
  if (frontQtyMatch) {
    const qty = Number(frontQtyMatch[1]) || numMap[frontQtyMatch[1]] || 1;
    return {
      name: frontQtyMatch[2].trim(),
      quantity: qty,
      sourceLine: rawLine
    };
  }

  // 尝试自然语言模式
  for (const regex of naturalPatterns) {
    const match = cleaned.match(regex);
    if (match) {
      let qty = 1;
      // 提取数量
      const qtyMatch = cleaned.match(/(一个|两个|三个|四个|五个|六个|七个|八个|九个|十个|若干)|(\d+)个?/);
      if (qtyMatch) {
        if (qtyMatch[1] && numMap[qtyMatch[1]]) {
          qty = numMap[qtyMatch[1]];
        } else if (qtyMatch[2]) {
          qty = Number(qtyMatch[2]);
        }
      }
      return {
        name: match[1].trim(),
        quantity: qty,
        sourceLine: rawLine
      };
    }
  }
  return null;
}

/**
 * 改进版：先按行拆分，每行再提取商品名和数量
 * 处理 "CTL-205HK黑色硒鼓 x 1" 这种 OCR 常见格式
 * 也处理 "光驱 x 1 CTL-205HK黑色硒鼓 x 1" 或 "光驱 x 1、CTL-205HK黑色硒鼓 x 1" 等多种分隔方式
 * 支持自然语言："我今天借货了一个ctl205黑色墨盒"
 * 调试版本
 */
function extractIntentsFromText(text) {
  let segments = [];
  
  console.log('【extractIntentsFromText】原始输入:', text);

  // 清理文本 - 保持简单
  const cleaned = text.replace(/我今天借货了|我今天把|各借了|各拿了/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('【extractIntentsFromText】清理后:', cleaned);

  // 简单方案：整个作为一段
  if (cleaned && cleaned.length > 0) {
    segments = [cleaned];
  }
  
  console.log('【extractIntentsFromText】分段结果:', segments);

  return parseSegmentsToIntents(segments);
}

function parseSegmentsToIntents(segments) {
  const intents = [];

  // 检查全局"各"数量
  let globalEachQty = null;
  for (const seg of segments) {
    const eachMatch = seg.match(/各\s*(\d+(?:\.\d+)?)/);
    if (eachMatch) {
      globalEachQty = Number(eachMatch[1]);
      break;
    }
  }

  segments.forEach(seg => {
    const info = parseQuantityLine(seg);
    if (info) {
      if (info.quantity <= 50) {
        intents.push({ name: info.name, quantity: info.quantity, sourceLine: seg });
      }
    } else if (seg.replace(/\s+/g, '').length >= 2) {
      // 无法提取数量时，记下名称（数量待定）
      intents.push({ name: seg, quantity: globalEachQty || '', sourceLine: seg });
    }
  });

  return intents;
}

/**
 * 在所有 OCR 识别出的文本中找到与指定关键词最匹配的那一行
 */
function findBestLine(keyword, ocrLines) {
  let bestLine = '';
  let bestScore = 0;

  ocrLines.forEach(line => {
    const score = calculateSimilarity(line, keyword);
    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  });

  return { bestLine, bestScore };
}

/**
 * 根据 OCR/语音 结果和商品数据库进行匹配
 * 支持"各X个"、"和"、"、"等复杂自然语言解析
 * 注意：别名映射已在 ocrRecognize 云函数中预处理
 */
async function matchGoodsFromOcr(ocrResult) {
  if (!ocrResult) return [];

  let processedText = ocrResult;

  // 智能别名映射：自动转换用户输入的别名
  processedText = mapAliases(processedText);

  // 预处理：将语音/OCR文本按常用分隔符拆分
  processedText = processedText.replace(/各\s*(\d+(?:\.\d+)?)/g, '各$1');

  // 使用 extractIntentsFromText 提取意图列表 [{name: '', quantity: '', sourceLine: ''}]
  const intents = extractIntentsFromText(processedText);
  
  if (!intents.length) return [];

  const allGoods = await fetchAll(db.collection('goods'));
  console.log('【matchGoodsFromOcr】意图列表:', intents);
  console.log('【matchGoodsFromOcr】商品库:', allGoods.length, '个');
  console.log('【商品库所有商品】:', allGoods.map(g => g.name).join(', '));
  console.log('【商品库前5个】:', allGoods.slice(0, 5).map(g => g.name).join(', '));
  // 调试：检查是否有人 CTL-205
  const has205 = allGoods.filter(g => g.name.includes('205'));
  console.log('【含205的商品】:', has205.length, '个', has205.map(g => g.name).join(', '));

  const matchedList = [];

  // 调试信息汇总（存到 storage，页面可显示）
  let debugInfo = `【输入】:${processedText}\n【意图】:${JSON.stringify(intents)}\n【商品库】:${allGoods.length}个\n\n`;

  intents.forEach(intent => {
    let bestMatch = null;
    let maxScore = 0;
    let allScores = [];

    allGoods.forEach((goods, idx) => {
      const isFirstIntent = intents.indexOf(intent) === 0;
      // 调试：总是显示前几个商品的匹配详情
      const showDebug = idx < 5;
      const score = calculateGoodsMatchScore(intent.name, goods, showDebug);
      // 临时调试：打出每个 intent 和每个商品的匹配详情
      const intentSeries = extractSeries(intent.name);
      const goodsSeries = extractSeries(goods.name);
      const sim = calculateSimilarity(intentSeries, goodsSeries);
      const numInfo = extractTrailingNumbers(intentSeries.replace(/\s+/g, ''), goodsSeries.replace(/\s+/g, ''));
      // 防御：如果 score 是 NaN，设为 0
      const safeScore = isNaN(score) ? 0 : score;
      allScores.push({ name: goods.name, score: safeScore, seriesSim: isNaN(sim) ? 0 : sim, numInfo: numInfo });
    });

    // 额外输出 intent 系列提取结果，方便调试
    const intentSeries = extractSeries(intent.name);
    debugInfo += `【匹配"${intent.name}"]\n  [意图系列]:"${intentSeries}"\n`;

    // 检查 mapAliases 结果
    const aliasCheck = intent.name.match(/ctl[-]?(\d+)/i);
    if (aliasCheck) {
      debugInfo += `  [别名检查] 提取到系列: ${aliasCheck[1]}\n`;
    }

    // 额外输出所有含 "205" 的商品的排名（方便定位问题）
    const ctl205Ranks = allScores
      .map((s, i) => ({ idx: i + 1, ...s }))
      .filter(s => s.name.toLowerCase().includes('205'));
    if (ctl205Ranks.length > 0) {
      debugInfo += `  [CTL-205相关商品排名]\n`;
      ctl205Ranks.forEach(s => {
        debugInfo += `    排名${s.idx}: ${s.name} (总${s.score.toFixed(3)} | 系列${(s.seriesSim || 0).toFixed(3)} | 尾数${s.numInfo ? s.numInfo.n1+'vs'+s.numInfo.n2+'('+s.numInfo.matchRate.toFixed(2)+')' : 'N/A'})\n`;
      });
    } else {
      debugInfo += `  [CTL-205相关商品] 商品库中未找到！\n`;
    }

    allScores.sort((a, b) => b.score - a.score);
    const top5 = allScores.slice(0, 5);

    console.log(`【匹配】intent="${intent.name}", Top5:`, top5.map(s => `${s.name}(${s.score.toFixed(3)})`).join(', '));

    debugInfo += `  [Top5]\n`;
    top5.forEach((s, i) => {
      debugInfo += `    ${i + 1}. ${s.name} (总${s.score.toFixed(3)} | 系列${(s.seriesSim || 0).toFixed(3)} | 尾数${s.numInfo ? s.numInfo.n1+'vs'+s.numInfo.n2+'('+s.numInfo.matchRate.toFixed(2)+')' : 'N/A'})\n`;
    });

    const topScore = allScores[0];
    if (topScore) {
      maxScore = topScore.score;
      bestMatch = allGoods.find(g => g.name === topScore.name);
    }

    if (bestMatch && maxScore > 0.5) {
      if (!matchedList.some(m => m._id === bestMatch._id)) {
        matchedList.push({
          _id: bestMatch._id,
          name: bestMatch.name,
          unit: bestMatch.unit || '',
          costPrice: bestMatch.costPrice,
          salePrice: bestMatch.salePrice,
          userStock: bestMatch.userStock,
          quantity: intent.quantity || '',
          matchScore: maxScore
        });
        debugInfo += `  → 命中: ${bestMatch.name} (分数:${maxScore.toFixed(3)})\n\n`;
      }
    } else {
      debugInfo += `  → 未命中(最高${maxScore.toFixed(3)} < 0.5)\n\n`;
    }
  });

  debugInfo += `【最终结果】:${matchedList.length}个商品`;

  // 存入 storage，页面可读取显示
  wx.setStorageSync('ocrDebugInfo', debugInfo);
  console.log('【匹配调试信息】:' + debugInfo);

  return matchedList.sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = {
  matchGoodsFromOcr,
  calculateSimilarity,
  calculateGoodsMatchScore
};
