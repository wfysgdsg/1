/**
 * 新增借货页逻辑
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
    selectedGoods: [],
    locationSearchKeyword: '',
    locationSearchResults: [],
    showLocationResults: false,
    selectedLocation: null,
    borrowDate: '',
    remark: '',
    isRecognizing: false,
    recognizedGoods: [],
    isVoiceRecording: false,
    textInput: '',  // 文字批量输入
  },

  onLoad: function () {
    this.setData({
      borrowDate: this.formatDate(new Date())
    });
  },

  formatDate: function (date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * 获取当前登录用户信息
   */
  getLoginInfo: function () {
    const userInfo = wx.getStorageSync('userInfo') || {};
    return {
      userInfo,
      userId: wx.getStorageSync('userId') || userInfo._id || ''
    };
  },

  /**
   * 商品搜索逻辑
   */
  onSearchInput: function (e) {
    const val = String(e.detail.value || '').trim();
    this.setData({ searchKeyword: val, showSearchResults: val.length > 0 });
    
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (val) {
      this.searchTimer = setTimeout(() => {
        this.doGoodsSearch(val);
      }, 300);
    } else {
      this.setData({ searchResults: [] });
    }
  },

  async doGoodsSearch(keyword) {
    try {
      const res = await db.collection('goods')
        .where({ name: db.RegExp({ regexp: keyword, options: 'i' }) })
        .limit(20)
        .get();
      this.setData({ searchResults: res.data || [] });
    } catch (err) {
      console.error('搜索商品失败', err);
    }
  },

  clearSearch: function () {
    this.setData({ searchKeyword: '', searchResults: [], showSearchResults: false });
  },

  /**
   * 客户/地点搜索逻辑
   */
  onLocationSearchInput: function (e) {
    const val = String(e.detail.value || '').trim();
    this.setData({ locationSearchKeyword: val, showLocationResults: val.length > 0 });

    if (this.locationTimer) clearTimeout(this.locationTimer);
    if (val) {
      this.locationTimer = setTimeout(() => {
        this.doLocationSearch(val);
      }, 300);
    } else {
      this.setData({ locationSearchResults: [] });
    }
  },

  async doLocationSearch(keyword) {
    try {
      const res = await db.collection('contacts')
        .where({ name: db.RegExp({ regexp: keyword, options: 'i' }) })
        .limit(20)
        .get();
      this.setData({ locationSearchResults: res.data || [] });
    } catch (err) {
      console.error('搜索客户失败', err);
    }
  },

  clearLocationSearch: function () {
    this.setData({
      locationSearchKeyword: '',
      locationSearchResults: [],
      showLocationResults: false,
      selectedLocation: null,
    });
  },

  selectLocation: function (e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      selectedLocation: item || null,
      locationSearchKeyword: '',
      locationSearchResults: [],
      showLocationResults: false,
    });
  },

  /**
   * 选择商品进入借货列表
   */
  selectGoods: function (e) {
    const item = e.currentTarget.dataset.item;
    if (!item) return;

    if (this.data.selectedGoods.some(g => g._id === item._id)) {
      wx.showToast({ title: '已添加过该商品', icon: 'none' });
      return;
    }

    const newList = this.data.selectedGoods.concat({
      _id: item._id,
      name: item.name,
      unit: item.unit || '',
      costPrice: Number(item.costPrice || 0),
      salePrice: Number(item.salePrice || 0),
      quantity: '',
    });

    this.setData({
      selectedGoods: newList,
      searchKeyword: '',
      searchResults: [],
      showSearchResults: false,
    });
  },

  removeGoods: function (e) {
    const idx = Number(e.currentTarget.dataset.index);
    const list = [...this.data.selectedGoods];
    list.splice(idx, 1);
    this.setData({ selectedGoods: list });
  },

  onQuantityInput: function (e) {
    const idx = Number(e.currentTarget.dataset.index);
    const list = [...this.data.selectedGoods];
    list[idx].quantity = e.detail.value;
    this.setData({ selectedGoods: list });
  },

  onCostPriceInput: function (e) {
    const idx = Number(e.currentTarget.dataset.index);
    const list = [...this.data.selectedGoods];
    list[idx].costPrice = Number(e.detail.value || 0);
    this.setData({ selectedGoods: list });
  },

  onDateChange: (e) => this.setData({ borrowDate: e.detail.value }),
  onRemarkInput: (e) => this.setData({ remark: e.detail.value }),

  /**
   * 文字批量输入处理
   */
  onTextInput: function (e) {
    this.setData({ textInput: e.detail.value });
  },

  clearTextInput: function () {
    this.setData({ textInput: '' });
  },

  /**
   * 解析文字输入并匹配商品
   */
  async parseTextInput() {
    const text = this.data.textInput;
    if (!text || !text.trim()) {
      wx.showToast({ title: '请输入商品文字', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '解析中...' });

    try {
      // 调试：打印输入
      console.log('【解析】输入文字:', text);
      
      // 调用 matchGoodsFromOcr 进行匹配
      const matched = await matchGoodsFromOcr(text);

      console.log('【解析】匹配结果:', matched);

      wx.hideLoading();

      if (matched && matched.length > 0) {
        // 添加匹配到的商品到列表
        console.log('【解析】当前商品列表:', this.data.selectedGoods);
        const newList = [...this.data.selectedGoods];
        let added = 0;

        matched.forEach(item => {
          if (!newList.some(g => g._id === item._id)) {
            newList.push({
              _id: item._id,
              name: item.name,
              unit: item.unit || '',
              costPrice: item.costPrice || 0,
              salePrice: item.salePrice || 0,
              quantity: item.quantity || '',
            });
            added++;
          }
        });

        console.log('【解析】添加后商品列表:', newList);

        this.setData({
          selectedGoods: newList,
          textInput: '',  // 清空输入
        });

        wx.showToast({ title: `识别到 ${added} 个商品`, icon: 'success' });
      } else {
        // 调试：显示更多信息
        wx.showToast({ title: '未能识别到商品', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('【解析】失败:', err);
      wx.showToast({ title: '解析失败: ' + err.message, icon: 'none' });
    }
  },

  /**
   * 提交借货申请
   * 业务逻辑：借货会同时增加个人库存(user_goods)并记录借货单(borrow)
   * 优化：使用 Promise.all 并行处理多个商品的借货操作
   */
  async submit() {
    const { selectedGoods, selectedLocation, borrowDate, remark } = this.data;
    const { userInfo, userId } = this.getLoginInfo();
    const userName = userInfo.name || userInfo.username || '';

    if (!selectedGoods.length || !selectedLocation || !borrowDate) {
      wx.showToast({ title: '请选择商品、客户和日期', icon: 'none' });
      return;
    }

    if (!userId) {
      wx.showToast({ title: '登录失效，请重新登录', icon: 'none' });
      return;
    }

    const validGoods = selectedGoods.filter(g => Number(g.quantity) > 0);
    if (!validGoods.length) {
      wx.showToast({ title: '请填写借货数量', icon: 'none' });
      return;
    }

    const locId = selectedLocation._id || selectedLocation.id || '';
    const locName = selectedLocation.name || selectedLocation.locationName || '';

    wx.showLoading({ title: '借货中...' });

    try {
      // 并行处理所有商品的借货操作
      const promises = validGoods.map(async (item) => {
        const qty = Number(item.quantity || 0);
        const borrowDateTime = new Date(borrowDate).getTime();

        // 1. 添加借货记录
        const borrowPromise = db.collection('borrow').add({
          data: {
            goodsId: item._id,
            goodsName: item.name,
            quantity: qty,
            costPrice: Number(item.costPrice || 0),
            salePrice: Number(item.salePrice || 0),
            unit: item.unit || '',
            locationId: locId,
            locationName: locName,
            borrowerId: userId,
            borrowerName: userName,
            borrowDate: borrowDateTime,
            remark: remark || '',
            status: 'pending',
            createTime: db.serverDate(),
            updateTime: db.serverDate(),
          }
        });

        // 2. 增加个人库存 (user_goods)
        const stockRes = await db.collection('user_goods').where({
          userId: userId,
          goodsId: item._id
        }).get();

        let stockPromise;
        if (stockRes.data.length > 0) {
          // 已有记录，累加
          stockPromise = db.collection('user_goods').doc(stockRes.data[0]._id).update({
            data: {
              stock: _.inc(qty),
              updateTime: db.serverDate()
            }
          });
        } else {
          // 无记录，新增
          stockPromise = db.collection('user_goods').add({
            data: {
              userId: userId,
              userName: userName,
              goodsId: item._id,
              goodsName: item.name,
              stock: qty,
              unit: item.unit || '',
              createTime: db.serverDate(),
              updateTime: db.serverDate()
            }
          });
        }

        // 并行执行单商品的借货记录和库存更新
        return Promise.all([borrowPromise, stockPromise]);
      });

      // 等待所有商品处理完成
      await Promise.all(promises);

      wx.hideLoading();
      wx.showToast({ title: '操作成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);

    } catch (err) {
      wx.hideLoading();
      console.error('借货失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  goBack: () => wx.navigateBack(),

  /**
   * OCR 拍照识别
   */
  async takePhoto() {
    const ocrData = await takePhotoAndRecognize(this, 'ocrRecognize');
    if (ocrData) {
      await handleRecognizedResult(this, ocrData, (matched) => this.applyRecognizedGoods(matched));
    }
  },

  /**
   * 语音识别
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

  applyRecognizedGoods(matched) {
    console.log('【OCR识别】当前商品列表:', this.data.selectedGoods);
    console.log('【OCR识别】匹配到的商品:', matched);
    const current = [...this.data.selectedGoods];
    matched.forEach(m => {
      if (!current.some(c => c._id === m._id)) {
        const item = {
          _id: m._id,
          name: m.name,
          unit: m.unit || '',
          costPrice: m.costPrice,
          salePrice: m.salePrice,
          quantity: m.quantity || ''
        };
        current.push(item);
      }
    });
    console.log('【OCR识别】添加后商品列表:', current);
    this.setData({ selectedGoods: current });
  }
});
