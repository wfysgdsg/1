/**
 * OCR 识别匹配工具类
 * 功能：通过模糊匹配算法，将 OCR 识别出的文本与数据库中的商品进行关联
 * 整理日期：2024-03-27
 */
const db = wx.cloud.database();
const { fetchAll } = require('./db');

/**
 * 颜色映射表：用于标准化颜色识别和双向映射
 */
const COLOR_VARIANTS = [
  { key: 'black', label: '黑', patterns: ['xk', 'hk', 'black', '黑色', '黑'] },
  { key: 'cyan', label: '蓝', patterns: ['xc', 'hc', 'cyan', '蓝色', '蓝', '青'] },
  { key: 'yellow', label: '黄', patterns: ['xy', 'hy', 'yellow', '黄色', '黄'] },
  { key: 'magenta', label: '红', patterns: ['xm', 'hm', 'magenta', '红色', '红', '粉'] },
];

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
 * 提取型号中的数字片段，用于强制校验
 */
function getNumbers(text) {
  if (!text) return [];
  // 提取所有连续数字
  return text.match(/\d+/g) || [];
}

/**
 * 模糊匹配核心算法：计算两个文本的相似度分值 (0-1)
 */
function calculateSimilarity(text1, text2) {
  const compact1 = compactText(text1);
  const compact2 = compactText(text2);

  if (!compact1 || !compact2) return 0;
  if (compact1 === compact2) return 1; // 完美匹配
  
  // 1. 型号数字强制校验
  const nums1 = getNumbers(compact1);
  const nums2 = getNumbers(compact2);
  let numMismatch = false;
  if (nums1.length > 0 && nums2.length > 0) {
    // 检查是否存在数字上的交集 (如 "205" vs "205xk" 有交集, "205" vs "350" 无交集)
    const hasOverlap = nums1.some(n1 => nums2.some(n2 => n1.includes(n2) || n2.includes(n1)));
    if (!hasOverlap) {
      numMismatch = true;
    }
  }

  // 包含匹配逻辑
  if (compact1.includes(compact2) || compact2.includes(compact1)) {
    return numMismatch ? 0.4 : 0.96;
  }

  // 2. 基于 Token 的分词匹配
  const tokens1 = getTokens(text1).filter(t => t.length >= 2);
  const tokens2 = getTokens(text2).filter(t => t.length >= 2);

  const hits1 = tokens1.filter(t => compact2.includes(compactText(t))).length;
  const hits2 = tokens2.filter(t => compact1.includes(compactText(t))).length;

  const score1 = tokens1.length ? hits1 / tokens1.length : 0;
  const score2 = tokens2.length ? hits2 / tokens2.length : 0;

  // 3. 基于字符集的重合度匹配
  let charHit = 0;
  const charSet1 = Array.from(new Set(compact1.split('')));
  charSet1.forEach(c => {
    if (compact2.includes(c)) charHit += 1;
  });
  const charScore = charSet1.length ? charHit / charSet1.length : 0;

  // 4. 综合评分 (各算法取最大加权值)
  let finalScore = Math.max(0.85 * score1, 0.8 * score2, 0.72 * charScore);
  
  // 如果数字不匹配，给予大幅度降权，防止型号混淆
  if (numMismatch) {
    finalScore *= 0.4;
  }

  return finalScore;
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
      ]
    };
  }
}

/**
 * 获取文本所属的标准化颜色 Key
 */
function getColorKey(text) {
  if (!text) return null;
  const clean = cleanText(text);
  for (const c of COLOR_VARIANTS) {
    for (const p of c.patterns) {
      if (p.length <= 2) {
        // 短后缀类：要求在末尾或者有非字母字符边界
        const reg = new RegExp(`(${p}$|${p}[^a-z]|[^a-z]${p})`, 'i');
        if (reg.test(clean)) return c.key;
      } else {
        if (clean.includes(p)) return c.key;
      }
    }
  }
  return null;
}

/**
 * 计算文本与商品名的匹配度（包含 keywords 匹配 + 增强型颜色校验）
 */
function calculateGoodsMatchScore(text, goods) {
  const goodsName = goods.name.toLowerCase();
  const textLower = text.toLowerCase();
  
  const textColorKey = getColorKey(textLower);
  const goodsColorKey = getColorKey(goodsName);

  // 1. 颜色冲突校验：如果双方都有明确颜色且不一致，直接排除
  if (textColorKey && goodsColorKey && textColorKey !== goodsColorKey) {
    return 0;
  }

  // 2. 计算基础相似度（包含型号数字校验）
  let maxScore = calculateSimilarity(text, goods.name);

  // 3. 匹配 keywords（别名/关联词）
  if (goods.keywords) {
    const keywordList = goods.keywords.split(/[,，,]/).map(k => k.trim()).filter(Boolean);
    keywordList.forEach(keyword => {
      const score = calculateSimilarity(text, keyword);
      if (score > maxScore) {
        maxScore = score;
      }
    });
  }

  // 4. 颜色逻辑优化与加权
  if (textColorKey && goodsColorKey && textColorKey === goodsColorKey) {
    // 双方颜色匹配成功 (如 识别“黑” vs 商品“XK”)，增加可信度
    maxScore = Math.min(1.0, maxScore + 0.05);
  } else if (!textColorKey && goodsColorKey) {
    // 识别没写颜色，但商品是带颜色的型号：降权，优先让位给不带颜色的通用型号
    maxScore *= 0.8;
  } else if (textColorKey && !goodsColorKey) {
    // 识别写了颜色，但商品没写颜色：轻微降权
    maxScore *= 0.9;
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
      const score = calculateGoodsMatchScore(intent.name, goods);
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
