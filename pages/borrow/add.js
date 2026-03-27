/**
 * 新增借货页逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');
const { matchGoodsFromOcr } = require('../../utils/ocr');

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
   * 提交借货申请
   * 业务逻辑：借货会同时增加个人库存(user_goods)并记录借货单(borrow)
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
      // 遍历提交每一项借货（原逻辑是循环提交）
      for (const item of validGoods) {
        const qty = Number(item.quantity || 0);
        
        // 1. 添加借货记录
        await db.collection('borrow').add({
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
            borrowDate: new Date(borrowDate).getTime(),
            remark: remark || '',
            status: 'pending', // 待归还/处理
            createTime: db.serverDate(),
            updateTime: db.serverDate(),
          }
        });

        // 2. 增加个人库存 (user_goods)
        const stockRes = await db.collection('user_goods').where({
          userId: userId,
          goodsId: item._id
        }).get();

        if (stockRes.data.length > 0) {
          // 已有记录，累加
          await db.collection('user_goods').doc(stockRes.data[0]._id).update({
            data: {
              stock: _.inc(qty),
              updateTime: db.serverDate()
            }
          });
        } else {
          // 无记录，新增
          await db.collection('user_goods').add({
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
      }

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
   * OCR 拍照识别（借货场景）
   */
  takePhoto: function () {
    wx.showActionSheet({
      itemList: ['拍照识别', '从相册选择'],
      success: (res) => {
        const source = res.tapIndex === 0 ? ['camera'] : ['album'];
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: source,
          success: (res) => {
            this.uploadAndRecognize(res.tempFiles[0].tempFilePath);
          },
        });
      },
    });
  },

  async uploadAndRecognize(filePath) {
    wx.showLoading({ title: '识别中...' });
    this.setData({ isRecognizing: true });

    try {
      const cloudPath = `recognize/borrow-${Date.now()}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath });
      
      const ocrRes = await wx.cloud.callFunction({
        name: 'ocrRecognize',
        data: { fileId: uploadRes.fileID }
      });

      if (ocrRes.result && ocrRes.result.success) {
        const matched = await matchGoodsFromOcr(ocrRes.result.data);
        if (matched.length > 0) {
          this.applyRecognizedGoods(matched);
        } else {
          wx.showToast({ title: '未能匹配到商品', icon: 'none' });
        }
      }
    } catch (err) {
      console.error('OCR失败', err);
    } finally {
      wx.hideLoading();
      this.setData({ isRecognizing: false });
    }
  },

  /**
   * 语音识别相关 (借货页)
   */
  startVoice: function () {
    const recorderManager = wx.getRecorderManager();
    this.setData({ isVoiceRecording: true });
    recorderManager.start({ duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3' });
  },

  stopVoice: function () {
    const recorderManager = wx.getRecorderManager();
    this.setData({ isVoiceRecording: false });
    recorderManager.onStop(async (res) => {
      const { tempFilePath } = res;
      wx.showLoading({ title: '正在识别...' });
      try {
        const cloudPath = `voice/borrow-${Date.now()}.mp3`;
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
        const voiceRes = await wx.cloud.callFunction({ name: 'voiceRecognize', data: { fileId: uploadRes.fileID } });

        if (voiceRes.result && voiceRes.result.success) {
          const recognizedText = voiceRes.result.data;
          wx.showLoading({ title: '正在匹配商品...' });
          const matched = await matchGoodsFromOcr(recognizedText);
          if (matched.length > 0) {
            this.applyRecognizedGoods(matched);
            wx.showToast({ title: `识别到 ${matched.length} 种商品`, icon: 'success' });
          } else {
            wx.showToast({ title: '听到了：' + recognizedText + '，但没找到对应商品', icon: 'none', duration: 3000 });
          }
        }
      } catch (err) {
        console.error('语音识别异常', err);
      } finally {
        wx.hideLoading();
      }
    });
    recorderManager.stop();
  },

  applyRecognizedGoods(matched) {
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
    this.setData({ selectedGoods: current });
  }
});
