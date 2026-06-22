/**
 * 新增借货页逻辑
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll, escapeRegExp } = require('../../utils/db');


Page({
  data: {
    _anim: true,
    searchKeyword: '',
    searchResults: [],
    showSearchResults: false,
    selectedGoods: [],
    checkedIds: {},
    checkedCount: 0,
    locationSearchKeyword: '',
    locationSearchResults: [],
    showLocationResults: false,
    selectedLocation: null,
    borrowDate: '',
    remark: '',
    submitting: false,
  },

  onLoad: function () {
    this.setData({
      borrowDate: this.formatDate(new Date())
    });
  },

  onShow: function () {},

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
      userId: wx.getStorageSync('userId') || userInfo._id || '',
      sessionToken: wx.getStorageSync('sessionToken') || '',
    };
  },

  /**
   * 商品搜索逻辑
   */
  onSearchInput: function (e) {
    const val = String(e.detail.value || '').trim();
    this.setData({ searchKeyword: val, showSearchResults: val.length > 0, checkedIds: {}, checkedCount: 0 });

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
        .where({ name: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' }) })
        .limit(20)
        .get();
      this.setData({ searchResults: res.data || [] });
    } catch (err) {
      console.error('搜索商品失败', err);
    }
  },

  clearSearch: function () {
    this.setData({ searchKeyword: '', searchResults: [], showSearchResults: false, checkedIds: {}, checkedCount: 0 });
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
        .where({ name: db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' }) })
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
      checkedIds: {},
      checkedCount: 0,
    });
  },

  toggleCheck: function (e) {
    var id = e.currentTarget.dataset.id;
    var checkedIds = {};
    // 浅拷贝当前勾选状态
    var keys = Object.keys(this.data.checkedIds);
    for (var i = 0; i < keys.length; i++) {
      checkedIds[keys[i]] = true;
    }
    if (checkedIds[id]) {
      delete checkedIds[id];
    } else {
      checkedIds[id] = true;
    }
    this.setData({
      checkedIds: checkedIds,
      checkedCount: Object.keys(checkedIds).length,
    });
  },

  batchAddGoods: function () {
    var checkedIds = this.data.checkedIds;
    var searchResults = this.data.searchResults;
    var selectedGoods = this.data.selectedGoods.slice();
    var addedCount = 0;

    for (var i = 0; i < searchResults.length; i++) {
      var item = searchResults[i];
      if (checkedIds[item._id] && !selectedGoods.some(function (g) { return g._id === item._id; })) {
        selectedGoods.push({
          _id: item._id,
          name: item.name,
          unit: item.unit || '',
          costPrice: Number(item.costPrice || 0),
          salePrice: Number(item.salePrice || 0),
          quantity: '',
        });
        addedCount++;
      }
    }

    this.setData({
      selectedGoods: selectedGoods,
      checkedIds: {},
      checkedCount: 0,
      searchKeyword: '',
      searchResults: [],
      showSearchResults: false,
    });

    if (addedCount > 0) {
      wx.showToast({ title: '已添加 ' + addedCount + ' 件商品', icon: 'success' });
    } else {
      wx.showToast({ title: '请先勾选商品', icon: 'none' });
    }
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

  onSalePriceInput: function (e) {
    const idx = Number(e.currentTarget.dataset.index);
    const list = [...this.data.selectedGoods];
    list[idx].salePrice = Number(e.detail.value || 0);
    this.setData({ selectedGoods: list });
  },

  onCostPriceInput: function (e) {
    const idx = Number(e.currentTarget.dataset.index);
    const list = [...this.data.selectedGoods];
    list[idx].costPrice = Number(e.detail.value || 0);
    this.setData({ selectedGoods: list });
  },

  onDateChange: function (e) { this.setData({ borrowDate: e.detail.value }); },
  onRemarkInput: function (e) { this.setData({ remark: e.detail.value }); },

  /**
   * 提交借货申请
   * 业务逻辑：借货会同时增加个人库存(user_goods)并记录借货单(borrow)
   * 优化：使用 Promise.all 并行处理多个商品的借货操作
   */
  async submit() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const { selectedGoods, selectedLocation, borrowDate, remark } = this.data;
    const { userInfo, userId, sessionToken } = this.getLoginInfo();
    const userName = userInfo.nickname || userInfo.name || userInfo.username || '';

    if (!selectedGoods.length || !selectedLocation || !borrowDate) {
      wx.showToast({ title: '请选择商品、客户和日期', icon: 'none' });
      this.setData({ submitting: false });
      return;
    }

    if (!userId) {
      wx.showToast({ title: '登录失效，请重新登录', icon: 'none' });
      this.setData({ submitting: false });
      return;
    }

    const validGoods = selectedGoods.filter(g => Number(g.quantity) > 0);
    if (!validGoods.length) {
      wx.showToast({ title: '请填写借货数量', icon: 'none' });
      this.setData({ submitting: false });
      return;
    }

    const locId = selectedLocation._id || selectedLocation.id || '';
    const locName = selectedLocation.name || selectedLocation.locationName || '';

    wx.showLoading({ title: '借货中...' });

    try {
      // 调用云函数（事务保证原子性）
      const res = await wx.cloud.callFunction({
        name: 'borrowManage',
        data: {
          userId,
          sessionToken,
          selectedGoods: validGoods,
          selectedLocation,
          borrowDate,
          remark,
        },
      });

      const result = res.result;
      if (!result || !result.success) {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({
          title: (result && result.message) || '操作失败',
          icon: 'none',
        });
        return;
      }

      wx.hideLoading();
      wx.showToast({ title: result.message || '借货成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);

    } catch (err) {
      wx.hideLoading();
      this.setData({ submitting: false });
      console.error('借货失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  goToAddGoods: function () {
    wx.navigateTo({ url: '/pages/goods/add' });
  },

  goToAddContact: function () {
    wx.navigateTo({ url: '/pages/contact/add' });
  },

  goBack: () => wx.navigateBack(),
});
