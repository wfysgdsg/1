/**
 * 借货明细详情页逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    customerId: '',
    customerName: '',
    tab: 'time', // time (按日期分组) 或 goods (按商品分组)
    timeGroups: [],
    goodsGroups: [],
    rawRecords: [],
    selectedIds: [],
    isBatchMode: false,
    loading: false,
    showStaffPicker: false,
    staffList: [],
    selectedStaffIndex: 0,
    transferItems: [],
  },

  onLoad: function (options) {
    // 处理页面参数
    if (options.id || options.customer) {
      const name = options.customer ? decodeURIComponent(options.customer) : '客户借货';
      const id = options.id || '';
      
      this.setData({
        customerName: name,
        customerId: id
      });
      
      wx.setNavigationBarTitle({ title: `${name} - 借货详情` });
      this.loadDetail();
      this.loadStaffList();
    }
  },

  /**
   * 加载当前客户的借货明细
   */
  async loadDetail() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const userId = wx.getStorageSync('userId') || userInfo._id;
    if (!userId) return;

    this.setData({ loading: true });

    try {
      // 1. 构建查询条件（用数组收集，最后 _.and 合并，避免 command 对象挂属性失效）
      var conditions = [{ status: 'pending' }];

      if (this.data.customerId && this.data.customerId !== 'unknown') {
        conditions.push(_.or([
          { contactId: this.data.customerId },
          { locationId: this.data.customerId }
        ]));
      } else {
        conditions.push({ contactName: this.data.customerName });
      }

      // 权限过滤：非 root 只能看自己的借货
      if (userInfo.role !== 'root') {
        conditions.push({ borrowerId: userId });
      }

      var where = _.and(conditions);

      // 2. 获取数据并处理分组
      const records = await fetchAll(function() {
        return db.collection('borrow').where(where).orderBy('createTime', 'desc');
      }, { pageSize: 100 });
      
      // 格式化记录日期
      const formattedRecords = records.map(r => Object.assign({}, r, {
        borrowDate: this.formatDate(r.borrowDate || r.createTime)
      }));

      // 按时间分组
      const timeGroups = this.groupByTime(formattedRecords);
      // 按商品分组
      const goodsGroups = this.groupByGoods(formattedRecords);

      this.setData({
        rawRecords: formattedRecords,
        timeGroups,
        goodsGroups,
        loading: false
      });

    } catch (err) {
      console.error('加载借货详情失败', err);
      this.setData({ loading: false });
    }
  },

  groupByTime(records) {
    const map = {};
    records.forEach(r => {
      const date = r.borrowDate;
      if (!map[date]) {
        map[date] = { date, items: [], totalQty: 0 };
      }
      map[date].items.push(r);
      map[date].totalQty += (Number(r.quantity) || 0);
    });
    return Object.values(map).sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  groupByGoods(records) {
    const map = {};
    records.forEach(r => {
      const gId = r.goodsId;
      if (!map[gId]) {
        map[gId] = {
          goodsId: gId,
          goodsName: r.goodsName,
          unit: r.unit || '',
          totalQty: 0,
          items: []
        };
      }
      map[gId].items.push(r);
      map[gId].totalQty += (Number(r.quantity) || 0);
    });
    return Object.values(map).sort((a, b) => b.totalQty - a.totalQty);
  },

  formatDate(time) {
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /**
   * 加载员工列表（用于调货转移）
   */
  async loadStaffList() {
    try {
      const res = await db.collection('users').where({
        role: _.neq('root')
      }).get();
      this.setData({ staffList: res.data || [] });
    } catch (err) {
      console.error('加载员工列表失败', err);
    }
  },

  /**
   * 切换批量模式
   */
  toggleBatchMode: function () {
    this.setData({
      isBatchMode: !this.data.isBatchMode,
      selectedIds: []
    });
  },

  /**
   * 全选/取消全选
   */
  selectAll: function () {
    if (this.data.selectedIds.length === this.data.rawRecords.length) {
      this.setData({ selectedIds: [] });
    } else {
      this.setData({ selectedIds: this.data.rawRecords.map(r => r._id) });
    }
  },

  /**
   * 批量选中切换 (WXML调用名为 onItemSelect)
   */
  onItemSelect: function (e) {
    const id = e.currentTarget.dataset.id;
    const list = [...this.data.selectedIds];
    const idx = list.indexOf(id);
    if (idx > -1) list.splice(idx, 1);
    else list.push(id);
    
    this.setData({
      selectedIds: list
    });
  },

  /**
   * 批量转销售 (WXML调用名为 batchSale)
   * 将选中的借货单数据存入本地缓存并跳转到销售页面
   */
  batchSale: function () {
    const selected = this.data.rawRecords.filter(r => this.data.selectedIds.includes(r._id));
    if (!selected.length) return;

    const importData = {
      customer: {
        _id: this.data.customerId,
        name: this.data.customerName
      },
      goods: selected.map(s => ({
        _id: s.goodsId,
        name: s.goodsName,
        quantity: s.quantity,
        costPrice: s.costPrice,
        salePrice: s.salePrice,
        unit: s.unit,
        originalBorrowId: s._id
      }))
    };

    wx.setStorageSync('temp_sale_import', importData);
    wx.navigateTo({ url: '/pages/sale/add?mode=import' });
  },

  /**
   * 归还货品
   */
  async returnGoods(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.rawRecords.find(r => r._id === id);
    if (!item) return;

    const confirmRes = await wx.showModal({
      title: '确认归还',
      content: `确定已归还 ${item.goodsName} x ${item.quantity} 吗？这会同时扣减您的个人库存。`
    });

    if (!confirmRes.confirm) return;

    wx.showLoading({ title: '处理中...' });

    try {
      const userInfo = wx.getStorageSync('userInfo');
      const userId = wx.getStorageSync('userId') || userInfo._id;
      const sessionToken = wx.getStorageSync('sessionToken');

      const res = await wx.cloud.callFunction({
        name: 'borrowManage',
        data: {
          action: 'returnGoods',
          userId,
          sessionToken,
          goodsId: item.goodsId,
          quantity: item.quantity,
          borrowId: id
        }
      });

      wx.hideLoading();

      if (res.result && res.result.success) {
        wx.showToast({ title: '处理成功' });
        this.loadDetail();
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
      }

    } catch (err) {
      wx.hideLoading();
      console.error('归还失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  switchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  /**
   * 打开员工选择器（移货）—— 构建 transferItems 供数量调节
   */
  batchTransfer: function () {
    var that = this;
    if (!this.data.selectedIds.length) {
      wx.showToast({ title: '请先选择要移货的记录', icon: 'none' });
      return;
    }
    if (!this.data.staffList.length) {
      wx.showToast({ title: '没有可接收的员工', icon: 'none' });
      return;
    }

    var items = this.data.rawRecords
      .filter(function (r) { return that.data.selectedIds.indexOf(r._id) > -1; })
      .map(function (r) {
        return {
          _id: r._id,
          goodsId: r.goodsId,
          goodsName: r.goodsName,
          unit: r.unit || '',
          costPrice: r.costPrice || 0,
          salePrice: r.salePrice || 0,
          locationId: r.locationId,
          locationName: r.locationName,
          contactId: r.contactId,
          contactName: r.contactName,
          maxQty: Number(r.quantity) || 0,
          transferQty: Number(r.quantity) || 0
        };
      });

    this.setData({ transferItems: items, showStaffPicker: true });
  },

  /**
   * 减少移货数量
   */
  onTransferQtyMinus: function (e) {
    var idx = e.currentTarget.dataset.index;
    var items = this.data.transferItems;
    if (items[idx].transferQty > 1) {
      items[idx].transferQty -= 1;
      this.setData({ transferItems: items });
    }
  },

  /**
   * 增加移货数量
   */
  onTransferQtyPlus: function (e) {
    var idx = e.currentTarget.dataset.index;
    var items = this.data.transferItems;
    if (items[idx].transferQty < items[idx].maxQty) {
      items[idx].transferQty += 1;
      this.setData({ transferItems: items });
    }
  },

  /**
   * 关闭员工选择器
   */
  closeStaffPicker: function () {
    this.setData({ showStaffPicker: false });
  },

  /**
   * 员工选择器变动
   */
  onStaffChange: function (e) {
    this.setData({ selectedStaffIndex: e.detail.value[0] });
  },

  /**
   * 确认发送调货请求（支持部分数量移货）
   */
  confirmTransfer: async function () {
    var that = this;
    var items = this.data.transferItems;
    if (!items.length) return;

    var staff = this.data.staffList[this.data.selectedStaffIndex];
    if (!staff) {
      wx.showToast({ title: '请选择接收员工', icon: 'none' });
      return;
    }

    var userInfo = wx.getStorageSync('userInfo') || {};

    // 按客户分组，同一客户合并为一个调货请求
    var customerMap = {};
    items.forEach(function (item) {
      var key = item.locationId || item.contactId || 'unknown';
      if (!customerMap[key]) {
        customerMap[key] = {
          fromCustomerId: item.locationId || item.contactId || '',
          fromCustomerName: item.locationName || item.contactName || '未填写客户',
          goodsList: []
        };
      }
      customerMap[key].goodsList.push({
        originalBorrowId: item._id,
        goodsId: item.goodsId,
        goodsName: item.goodsName,
        originalQuantity: item.maxQty,
        transferQty: item.transferQty,
        unit: item.unit,
        costPrice: item.costPrice,
        salePrice: item.salePrice
      });
    });

    wx.showLoading({ title: '发送中...' });

    try {
      var groups = Object.values(customerMap);
      var res = await wx.cloud.callFunction({
        name: 'transferManage',
        data: {
          action: 'createTransfer',
          userId: userInfo._id,
          sessionToken: userInfo.sessionToken || wx.getStorageSync('sessionToken'),
          receiverId: staff._id,
          receiverName: staff.name || staff.username || '',
          groups: groups,
        }
      });

      wx.hideLoading();
      if (res.result && res.result.success) {
        wx.showToast({ title: '移货请求已发送' });
        this.setData({ showStaffPicker: false, isBatchMode: false, selectedIds: [], transferItems: [] });
        this.loadDetail();
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '发送失败', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('发送移货失败', err);
      wx.showToast({ title: '发送失败', icon: 'none' });
    }
  },

  /**
   * 批量归还选中记录
   */
  batchReturn: function () {
    var that = this;
    var selected = this.data.rawRecords.filter(function (r) {
      return that.data.selectedIds.indexOf(r._id) > -1;
    });
    if (!selected.length) return;

    wx.showModal({
      title: '批量归还',
      content: '确定归还选中的 ' + selected.length + ' 条记录吗？这会同时扣减您的个人库存。',
      success: async function (res) {
        if (!res.confirm) return;

        wx.showLoading({ title: '处理中...' });

        var userId = wx.getStorageSync('userId');
        var sessionToken = wx.getStorageSync('sessionToken');
        var ok = 0;
        var fail = 0;

        for (var i = 0; i < selected.length; i++) {
          try {
            var callRes = await wx.cloud.callFunction({
              name: 'borrowManage',
              data: {
                action: 'returnGoods',
                userId: userId,
                sessionToken: sessionToken,
                goodsId: selected[i].goodsId,
                quantity: selected[i].quantity,
                borrowId: selected[i]._id
              }
            });
            if (callRes.result && callRes.result.success) {
              ok++;
            } else {
              fail++;
            }
          } catch (e) {
            fail++;
          }
        }

        wx.hideLoading();
        wx.showToast({
          title: '成功 ' + ok + ' 条' + (fail > 0 ? '，失败 ' + fail + ' 条' : ''),
          icon: fail > 0 ? 'none' : 'success'
        });

        that.setData({ isBatchMode: false, selectedIds: [] });
        that.loadDetail();
      }
    });
  },
});
