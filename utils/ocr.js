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
  if (compact1.includes(compact2) || compact2.includes(compact1)) return 0.96; // 包含匹配

  // 基于 Token 的分词匹配
  const tokens1 = getTokens(text1).filter(t => t.length >= 2);
  const tokens2 = getTokens(text2).filter(t => t.length >= 2);

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

  // 综合评分 (各算法取最大加权值)
  return Math.max(0.85 * score1, 0.8 * score2, 0.72 * charScore);
}

/**
 * 从数据库加载 OCR 匹配规则
 */
async function loadOcrRules() {
  try {
    const res = await db.collection('config').doc('ocr_rules').get();
    return res.data || {};
  } catch (err) {
    console.warn('未找到远程 OCR 配置，将使用默认规则');
    return {
      replacements: [
        { pattern: 'ctl-200(?!5)', replacement: 'ctl-205', flags: 'gi' },
        { pattern: 'gl-', replacement: 'ctl-', flags: 'gi' },
        { pattern: 'lm(?=[^a-z])', replacement: 'hm', flags: 'gi' },
        { pattern: '黑色粉', replacement: '黑色硒鼓', flags: 'gi' },
        { pattern: '红色粉', replacement: '红色硒鼓', flags: 'gi' },
        { pattern: '蓝色粉', replacement: '蓝色硒鼓', flags: 'gi' },
        { pattern: '黄色粉', replacement: '黄色硒鼓', flags: 'gi' }
      ],
      colorMaps: {
        'x': { 'xk': '黑', 'xc': '蓝', 'xy': '黄', 'xm': '红' },
        'h': { 'hk': '黑', 'hc': '蓝', 'hy': '黄', 'hm': '红' }
      }
    };
  }
}

/**
 * 提取文本中的颜色词
 */
function extractColor(text, colorConfig) {
  const clean = cleanText(text);
  const xMap = (colorConfig && colorConfig.x) || { 'xk': '黑', 'xc': '蓝', 'xy': '黄', 'xm': '红' };
  const hMap = (colorConfig && colorConfig.h) || { 'hk': '黑', 'hc': '蓝', 'hy': '黄', 'hm': '红' };

  // 格式1: xk/xm/xc/xy
  const xColorMatch = clean.match(/(xk|xc|xy|xm)\s*$/i);
  if (xColorMatch) {
    const val = xColorMatch[1].toLowerCase();
    return { color: xMap[val], suffix: xColorMatch[0], rawSuffix: val };
  }

  // 格式2: HK/HM/HY/HC
  const hColorMatch = clean.match(/(hk|hc|hy|hm)\s*$/i);
  if (hColorMatch) {
    const val = hColorMatch[1].toLowerCase();
    return { color: hMap[val], suffix: hColorMatch[0], rawSuffix: val };
  }

  // 格式3: 中文颜色词
  const colorWords = ['黑', '白', '红', '绿', '蓝', '黄', '青', '紫', '橙', '粉', '灰'];
  for (const c of colorWords) {
    if (clean.includes(c)) {
      return { color: c, suffix: c, rawSuffix: c };
    }
  }
  return null;
}

/**
 * 计算文本与商品名的匹配度（包含 keywords 匹配 + 颜色精确匹配）
 */
function calculateGoodsMatchScore(text, goods, colorConfig) {
  const textColor = extractColor(text, colorConfig);
  const goodsName = goods.name;
  const goodsNameLower = goodsName.toLowerCase();

  // 1. 如果文本有颜色后缀，必须匹配包含相同颜色标识的商品
  if (textColor && textColor.rawSuffix) {
    const colorLower = textColor.rawSuffix.toLowerCase();
    // 检查商品名是否包含这个颜色标识（xk/xc/xy/xm 或 hk/hc/hy/hm）
    const goodsHasColor = goodsNameLower.includes(colorLower);
    if (!goodsHasColor) {
      // 如果识别的文本有颜色，但商品名没有包含，返回0完全排除
      return 0;
    }
  }

  // 2. 无颜色后缀时，排除所有带 xk/xc/xy/xm/hk/hc/hy/hm 的商品
  if (!textColor) {
    const hasColorSuffix = goodsNameLower.match(/(xk|xc|xy|xm|hk|hc|hy|hm)\s*$/i);
    if (hasColorSuffix) {
      // 有颜色后缀但识别时没写颜色，返回0不匹配
      return 0;
    }
  }

  // 3. 直接匹配商品名
  let maxScore = calculateSimilarity(text, goodsName);

  // 4. 匹配 keywords（别名/关联词）
  if (goods.keywords) {
    const keywordList = goods.keywords.split(/[,，,]/).map(k => k.trim()).filter(Boolean);
    keywordList.forEach(keyword => {
      const score = calculateSimilarity(text, keyword);
      if (score > maxScore) {
        maxScore = score;
      }
    });
  }

  return maxScore;
}

/**
 * 将文本块拆分为行
 */
function splitLines(text) {
  return String(text || '').split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
}

/**
 * 解析带有数量特征的文本行
 */
function parseQuantityLine(rawLine) {
  const cleaned = cleanText(rawLine);
  const regexList = [
    /^(.+?)\s*[x:：]\s*(\d+(?:\.\d+)?)(?:\s*[a-z\u4e00-\u9fa5]*)?$/i, // "商品名 x: 10" 或 "商品名: 10"
    /^(.+?)\s*[x]\s*(\d+(?:\.\d+)?)(?:\s*[a-z\u4e00-\u9fa5]*)?$/i,     // "商品名 x 10"
    /^(.+?)\s+(\d+(?:\.\d+)?)(?:\s*(?:件|个|张|箱|包|袋|只|套|卷|本|台|瓶|桶|盒|米|m))?$/i, // "商品名 10件"
    /^(.+?)\s+\d+(?:\.\d+)?\s*x\s*(\d+(?:\.\d+)?).*$/i,             // 兼容多数字混杂场景
  ];

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
  return null;
}

/**
 * 根据 OCR/语音 结果和商品数据库进行匹配
 */
async function matchGoodsFromOcr(ocrResult) {
  if (!ocrResult) return [];
  
  // 1. 加载远程配置
  const config = await loadOcrRules();
  let processedText = ocrResult;
  
  // 2. 预处理：应用替换规则
  if (config.replacements) {
    config.replacements.forEach(rule => {
      try {
        const reg = new RegExp(rule.pattern, rule.flags || 'gi');
        processedText = processedText.replace(reg, rule.replacement);
      } catch(e) {
        console.error('OCR rule error:', e);
      }
    });
  }
  
  // 3. 预处理：将语音/OCR文本按常用分隔符拆分
  processedText = processedText.replace(/各\s*(\d+(?:\.\d+)?)/g, '各$1');
  const segments = processedText.split(/[，,。、\s+|和]/).filter(Boolean);
  
  let intents = [];
  let globalEachQty = null;

  const eachMatch = processedText.match(/各\s*(\d+(?:\.\d+)?)/);
  if (eachMatch) {
    globalEachQty = Number(eachMatch[1]);
  }

  segments.forEach(seg => {
    const info = parseQuantityLine(seg);
    if (info) {
      if (info.quantity <= 50) {
        intents.push({ name: info.name, quantity: info.quantity });
      }
    } else {
      intents.push({ name: seg.replace(/各\d+/, ''), quantity: globalEachQty || '' });
    }
  });

  if (!intents.length) return [];

  // 4. 加载全部商品库进行匹配
  const allGoods = await fetchAll(db.collection('goods'));
  const matchedList = [];

  intents.forEach(intent => {
    let bestMatch = null;
    let maxScore = 0;

    allGoods.forEach(goods => {
      const score = calculateGoodsMatchScore(intent.name, goods, config.colorMaps);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = goods;
      }
    });

    if (bestMatch && maxScore > 0.5) {
      if (!matchedList.some(m => m._id === bestMatch._id)) {
        const result = {
          _id: bestMatch._id,
          name: bestMatch.name,
          unit: bestMatch.unit || '',
          costPrice: bestMatch.costPrice,
          salePrice: bestMatch.salePrice,
          userStock: bestMatch.userStock,
          quantity: intent.quantity || '',
          matchScore: maxScore
        };
        matchedList.push(result);
      }
    }
  });

  return matchedList.sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = {
  matchGoodsFromOcr,
  calculateSimilarity,
  calculateGoodsMatchScore
};
