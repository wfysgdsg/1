/**
 * 新增销售页逻辑
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');
const { matchGoodsFromOcr } = require('../../utils/ocr');
const { takePhotoAndRecognize, startVoice, stopVoice, handleRecognizedResult } = require('../../utils/recognize');

Page({
  data: {
    searchKeyword: '',
    searchResults: [],
    showSearchResults: false,
    contactList: [],
    contactKeyword: '',
    contactResults: [],
    selectedContact: null,
    showContactResults: false,
    selectedGoods: [],
    saleDate: '',
    remark: '',
    totalAmount: 0,
    totalCost: 0,
    totalProfit: 0,
    profitRate: 0,
    hasAllQuantities: false,
    payStatus: 'paid', // 默认已结清
    isRecognizing: false,
    recognizedGoods: [],
    importMode: false,
    importIds: [],
    isVoiceRecording: false,
  },

  onLoad: function (options) {
    const today = this.formatDate(new Date());
    this.setData({ saleDate: today });
    this.loadContacts();

    // 如果是从借货列表跳转过来的导入模式
    if (options.mode === 'import') {
      const importData = wx.getStorageSync('temp_sale_import');
      if (importData) {
        this.handleImportData(importData);
      }
    }
  },

  onShow: function () {
    this.loadContacts();
  },

  /**
   * 处理导入数据（从借货转销售）
   */
  async handleImportData(data) {
    const customer = data.customer;
    const goods = data.goods || [];
    const goodsIds = goods.map(g => g._id).filter(Boolean);
    
    const priceMap = {};
    if (goodsIds.length) {
      try {
        const res = await db.collection('goods').where({ _id: _.in(goodsIds) }).get();
        (res.data || []).forEach(g => {
          priceMap[g._id] = Number(g.salePrice || 0);
        });
      } catch (err) {
        console.error('回填商品售价失败', err);
      }
    }

    const selectedGoods = goods.map(g => ({
      _id: g._id,
      name: g.name,
      unit: g.unit || '',
      costPrice: Number(g.costPrice || 0),
      salePrice: Number(g.salePrice || priceMap[g._id] || 0),
      quantity: String(g.quantity || ''),
      userStock: 0,
      profit: '0.00',
      originalBorrowId: g.originalBorrowId,
    }));

    this.setData({
      selectedContact: customer || null,
      selectedGoods: selectedGoods,
      importMode: true,
      importIds: selectedGoods.map(g => g.originalBorrowId).filter(Boolean),
    });

    this.calcProfit();
    wx.removeStorageSync('temp_sale_import');
    wx.showToast({ title: '已导入借货数据', icon: 'none' });
  },

  formatDate: function (date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * 加载联系人列表
   */
  async loadContacts() {
    try {
      const res = await db.collection('contacts').orderBy('name', 'asc').get();
      const list = res.data || [];
      this.setData({ contactList: list, contactResults: list });
    } catch (err) {
      console.error('加载联系人失败', err);
    }
  },

  /**
   * 商品搜索输入处理（防抖）
   */
  onSearchInput: function (e) {
    const val = String(e.detail.value || '');
    this.setData({ searchKeyword: val, showSearchResults: val.length > 0 });
    
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (val.length) {
      this.searchTimer = setTimeout(() => {
        this.doGoodsSearch(val);
      }, 300);
    } else {
      this.setData({ searchResults: [] });
    }
  },

  /**
   * 执行商品搜索
   */
  async doGoodsSearch(keyword) {
    const userInfo = wx.getStorageSync('userInfo');
    const userId = userInfo ? userInfo._id : '';
    if (!userId) return;

    try {
      const [goodsRes, stockRes] = await Promise.all([
        db.collection('goods').where({
          name: db.RegExp({ regexp: keyword, options: 'i' }),
        }).limit(20).get(),
        db.collection('user_goods').where({ userId }).get(),
      ]);

      const stockMap = {};
      (stockRes.data || []).forEach(s => {
        stockMap[s.goodsId] = s.stock;
      });

      const results = (goodsRes.data || []).map(g => ({
        _id: g._id,
        name: g.name,
        category: g.category || 'hardware', // 带上分类信息
        unit: g.unit || '',
        costPrice: Number(g.costPrice || 0),
        salePrice: Number(g.salePrice || 0),
        userStock: Number(stockMap[g._id] || 0),
      }));

      this.setData({ searchResults: results });
    } catch (err) {
      console.error('搜索商品失败', err);
    }
  },

  onSearchBlur: function () {
    setTimeout(() => {
      this.setData({ showSearchResults: false });
    }, 200);
  },

  clearSearch: function () {
    this.setData({ searchKeyword: '', searchResults: [], showSearchResults: false });
  },

  /**
   * 联系人关键词输入（防抖搜索）
   */
  onContactKeywordInput: function (e) {
    const val = String(e.detail.value || '').trim();
    this.setData({ contactKeyword: val, showContactResults: true });

    if (this.contactTimer) clearTimeout(this.contactTimer);
    this.contactTimer = setTimeout(async () => {
      if (!val) {
        this.setData({ contactResults: this.data.contactList });
        return;
      }
      try {
        const res = await db.collection('contacts').where({
          name: db.RegExp({ regexp: val, options: 'i' }),
        }).limit(20).get();
        this.setData({ contactResults: res.data || [] });
      } catch (err) {
        console.error('搜索联系人失败', err);
      }
    }, 300);
  },

  onContactFocus: function () {
    if (this.data.importMode) return;
    this.setData({
      showContactResults: true,
      contactResults: this.data.contactList,
    });
  },

  selectContact: function (e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedContact: item,
      contactKeyword: '',
      contactResults: [],
      showContactResults: false,
    });
  },

  clearContact: function () {
    if (this.data.importMode) return;
    this.setData({
      selectedContact: null,
      contactKeyword: '',
      contactResults: [],
      showContactResults: false,
    });
  },

  goToAddContact: () => wx.navigateTo({ url: '/pages/contact/add' }),

  /**
   * 选择商品进入列表
   */
  selectGoods: function (e) {
    const id = e.currentTarget.dataset.id;
    const goods = this.data.searchResults.find(g => g._id === id);
    if (!goods) return;

    if (this.data.selectedGoods.some(g => g._id === id)) {
      wx.showToast({ title: '已在列表中', icon: 'none' });
      return;
    }

    const newList = [
      ...this.data.selectedGoods,
      {
        _id: goods._id,
        name: goods.name,
        category: goods.category || 'hardware', // 保存分类以供后续计算
        unit: goods.unit || '',
        costPrice: Number(goods.costPrice || 0).toFixed(2),
        salePrice: Number(goods.salePrice || 0).toFixed(2),
        userStock: goods.userStock,
        quantity: '',
        profit: '0.00',
      }
    ];

    this.setData({
      selectedGoods: newList,
      searchResults: [],
      showSearchResults: false,
      searchKeyword: '',
    });
  },

  onQuantityInput: function (e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.selectedGoods];
    list[idx].quantity = e.detail.value;
    this.setData({ selectedGoods: list });
    this.calcProfit();
  },

  onSalePriceInput: function (e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.selectedGoods];
    // 先保留原始输入，以便用户能连续打字
    list[idx].salePrice = e.detail.value;
    this.setData({ selectedGoods: list });
    this.calcProfit();
  },

  onCostPriceInput: function (e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.selectedGoods];
    list[idx].costPrice = e.detail.value;
    this.setData({ selectedGoods: list });
    this.calcProfit();
  },

  removeGoods: function (e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.selectedGoods];
    list.splice(idx, 1);
    this.setData({ selectedGoods: list });
    this.calcProfit();
  },

  onDateChange: function (e) {
    this.setData({ saleDate: e.detail.value });
  },

  onPayStatusChange: function (e) {
    this.setData({ payStatus: e.detail.value });
  },

  onRemarkInput: function (e) {
    this.setData({ remark: e.detail.value });
  },

  /**
   * 核心计算：计算合计金额和毛利
   * 业务逻辑：硬件除以 1.13，软件除以 1.06
   * 修复：使用整数运算避免浮点数精度问题（以分为单位计算）
   */
  calcProfit: function () {
    const goods = this.data.selectedGoods;
    let totalAmt = 0, totalCostAmt = 0, totalProfAmt = 0;
    let hasAllQty = goods.length > 0;

    const list = goods.map(g => {
      const qty = parseFloat(g.quantity);
      if (!qty || qty <= 0) {
        hasAllQty = false;
        return { ...g, profit: '0.00' };
      }

      // 根据分类判断税率 (默认为硬件 1.13)
      const taxRate = g.category === 'software' ? 1.06 : 1.13;

      // 使用整数运算避免浮点数精度问题：
      // 将金额转为"分"（整数），除法用整数除法避免小数精度丢失
      // 公式: (qty * priceYuan) / taxRate = (qty * priceFen) / (taxRate * 100)
      const priceYuan = Number(g.salePrice || 0);
      const costYuan = Number(g.costPrice || 0);
      const priceFen = Math.round(priceYuan * 100); // 元转分
      const costFen = Math.round(costYuan * 100);   // 元转分
      const divisorFen = Math.round(taxRate * 100); // 税率转分母，如 1.13 -> 113

      const lineSaleFen = Math.round((qty * priceFen) / divisorFen);
      const lineCostFen = Math.round((qty * costFen) / divisorFen);
      const lineProfitFen = lineSaleFen - lineCostFen;

      const lineSale = lineSaleFen / 100;
      const lineCost = lineCostFen / 100;
      const lineProfit = lineProfitFen / 100;

      totalAmt += lineSale;
      totalCostAmt += lineCost;
      totalProfAmt += lineProfit;

      return {
        _id: g._id,
        name: g.name,
        category: g.category,
        unit: g.unit || '',
        costPrice: g.costPrice,
        salePrice: g.salePrice,
        userStock: g.userStock,
        quantity: g.quantity,
        profit: lineProfit.toFixed(2)
      };
    });

    this.setData({
      selectedGoods: list,
      totalAmount: totalAmt.toFixed(2),
      totalCost: totalCostAmt.toFixed(2),
      totalProfit: totalProfAmt.toFixed(2),
      profitRate: totalAmt > 0 ? ((totalProfAmt / totalAmt) * 100).toFixed(2) : '0.00',
      hasAllQuantities: hasAllQty,
    });
  },

  /**
   * 提交销售单
   */
  async submit() {
    const { selectedGoods, selectedContact, saleDate, payStatus, remark, importMode, importIds } = this.data;
    const userInfo = wx.getStorageSync('userInfo');
    const userId = userInfo ? userInfo._id : '';
    const sessionToken = wx.getStorageSync('sessionToken');

    if (!selectedGoods.length || !selectedContact || !saleDate) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }

    if (selectedGoods.filter(g => parseFloat(g.quantity) > 0).length === 0) {
      wx.showToast({ title: '请至少填写一项有效数量', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在入账...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'submitSale',
        data: {
          userId,
          sessionToken,
          selectedContact,
          selectedGoods,
          saleDate,
          payStatus,
          remark,
          importMode,
          importIds,
        },
      });

      const result = res.result;
      if (!result || !result.success) {
        wx.hideLoading();
        wx.showModal({
          title: '提交失败',
          content: (result && result.message) || '提交销售失败',
          showCancel: false,
        });
        return;
      }

      wx.hideLoading();
      wx.showToast({ title: '开票成功', icon: 'success' });
      
      setTimeout(() => {
        // 如果是导入模式，返回两层
        wx.navigateBack({ delta: importMode ? 2 : 1 });
      }, 1200);

    } catch (err) {
      console.error('提交失败', err);
      wx.hideLoading();
      wx.showModal({ title: '提交失败', content: err.message || '请稍后再试', showCancel: false });
    }
  },

  goBack: () => wx.navigateBack(),

  /**
   * OCR 拍照/选图识别商品
   */
  /**
   * 拍照识别
   */
  async takePhoto() {
    const ocrData = await takePhotoAndRecognize(this, 'ocrRecognize');
    if (ocrData) {
      await handleRecognizedResult(this, ocrData, (matched) => this.applyRecognizedGoods(matched));
    }
  },

  /**
   * 语音识别相关
   */
  startVoice() {
    startVoice(this);
  },

  async stopVoice() {
    const recognizedText = await stopVoice(this);
    if (recognizedText) {
      await handleRecognizedResult(this, recognizedText, (matched) => this.applyRecognizedGoods(matched));
    }
  },

  /**
   * 将识别结果应用到列表
   */
  applyRecognizedGoods(recognized) {
    const current = [...this.data.selectedGoods];
    recognized.forEach(reg => {
      if (!current.some(c => c._id === reg._id)) {
        const item = {
          _id: reg._id,
          name: reg.name,
          unit: reg.unit || '',
          costPrice: Number(reg.costPrice || 0).toFixed(2),
          salePrice: Number(reg.salePrice || 0).toFixed(2),
          userStock: reg.userStock || 0,
          quantity: reg.quantity || '',
          profit: '0.00'
        };
        current.push(item);
      }
    });
    this.setData({ selectedGoods: current });
    this.calcProfit();
  }
});
