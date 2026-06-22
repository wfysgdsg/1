/**
 * 数据导出页逻辑
 * 整理日期：2025-01-26
 * 最后修改：2026-05-26
 *   - wx.openDocument 替代云存储上传
 *   - 增加预览功能
 *   - root 可按用户筛选导出，staff 只能导出自己的数据
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    uiText: {
      dataType: '数据类型',
      choose: '请选择',
      dateRange: '时间范围',
      start: '开始：',
      end: '结束：',
      exportExcel: '导出 CSV',
      preview: '预览（前 10 条）',
      userFilter: '筛选用户',
      allUsers: '全部用户',
    },
    dataTypes: [
      { name: '借货客户明细', type: 'borrow_customer' },
      { name: '销售记录明细', type: 'sale_detail' },
      { name: '调货记录明细', type: 'transfer' },
      { name: '个人库存快照', type: 'stock' },
    ],
    selectedType: null,
    startDate: '',
    endDate: '',
    previewData: [],
    previewHeaders: [],
    exporting: false,
    isRoot: false,
    userList: [],
    pickerUserList: [],
    selectedUserId: '',
    selectedUserIndex: 0,
  },

  onLoad: function () {
    const now = new Date();
    const sixMonthsAgo = new Date(Date.now() - 2592e6);
    const userInfo = wx.getStorageSync('userInfo') || {};
    const isRoot = userInfo.role === 'root';

    this.setData({
      startDate: sixMonthsAgo.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
      isRoot: isRoot,
    });

    if (isRoot) {
      this.loadUsers();
    }

    // 为 root 的 picker 准备带"全部用户"选项的列表
    this.setData({
      pickerUserList: [{ _id: '', name: '全部用户' }],
    });
  },

  /**
   * 加载所有用户列表（仅 root）
   */
  async loadUsers() {
    try {
      const res = await fetchAll(() =>
        db.collection('users').field({ _id: true, username: true, name: true, role: true })
      );
      const users = res || [];
      // 格式化显示名称
      const formatted = users.map(u => ({
        _id: u._id,
        name: u.name || u.username || u._id,
      }));
      // 全部用户选项 + 用户列表
      this.setData({
        userList: users,
        pickerUserList: [{ _id: '', name: '全部用户' }].concat(formatted),
      });
    } catch (err) {
      console.error('加载用户列表失败', err);
    }
  },

  onTypeChange: function (e) {
    const idx = e.detail.value;
    this.setData({ selectedType: this.data.dataTypes[idx], previewData: [], previewHeaders: [] });
  },

  onStartDateChange: function (e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndDateChange: function (e) {
    this.setData({ endDate: e.detail.value });
  },

  onUserChange: function (e) {
    const idx = parseInt(e.detail.value) || 0;
    const user = this.data.pickerUserList[idx];
    this.setData({
      selectedUserIndex: idx,
      selectedUserId: user ? user._id : '',
      previewData: [],
      previewHeaders: [],
    });
  },

  /**
   * 获取目标用户 ID：
   * - staff 始终返回自己的 ID
   * - root 可选全部（null）或指定用户
   */
  getTargetUserId: function () {
    if (!this.data.isRoot) {
      const userInfo = wx.getStorageSync('userInfo') || {};
      return userInfo._id || '';
    }
    return this.data.selectedUserId || null;
  },

  /**
   * 获取当前用户信息和查询时间范围
   */
  getQueryParams: function () {
    const userInfo = wx.getStorageSync('userInfo');
    const start = new Date(this.data.startDate).getTime();
    const end = new Date(this.data.endDate).getTime() + 864e5;
    const targetUserId = this.getTargetUserId();
    return { userInfo, start, end, targetUserId };
  },

  /**
   * 预览数据（前 10 条）
   */
  async previewData() {
    const { selectedType } = this.data;
    if (!selectedType) {
      wx.showToast({ title: '请选择导出类型', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '加载预览...', mask: true });

    try {
      const { userInfo, start, end, targetUserId } = this.getQueryParams();
      let headers = [];
      let rows = [];

      switch (selectedType.type) {
        case 'borrow_customer': {
          const whereCond = { borrowDate: _.gte(start).and(_.lt(end)) };
          if (targetUserId) {
            whereCond.borrowerId = targetUserId;
          }
          const res = await db.collection('borrow').where(whereCond)
            .orderBy('borrowDate', 'desc').limit(10).get();
          headers = ['借货单位', '商品名称', '数量', '单位', '成本价', '售价', '借货日期', '状态'];
          rows = (res.data || []).map(item => [
            item.locationName || '', item.goodsName || '', Number(item.quantity || 0).toFixed(2),
            item.unit || '', Number(item.costPrice || 0).toFixed(2), Number(item.salePrice || 0).toFixed(2),
            this.formatTimestamp(item.borrowDate),
            ({pending:'待处理',returned:'已归还',sold:'已销售',transferring:'调货中',partial:'部分归还'})[item.status] || '未知',
          ]);
          break;
        }
        case 'sale_detail': {
          let q = db.collection('sale').where({ saleTime: _.gte(start).and(_.lt(end)) });
          if (targetUserId) q = q.where({ sellerId: targetUserId });
          const res = await q.orderBy('saleDate', 'desc').limit(10).get();
          headers = ['销售日期', '客户名称', '商品名称', '数量', '成交价', '成本价', '利润', '付款状态'];
          rows = [];
          (res.data || []).forEach(sale => {
            const saleDate = this.formatTimestamp(sale.saleDate) || sale.saleDate || '';
            (sale.goodsDetail || []).forEach(g => {
              rows.push([
                saleDate, sale.contactName || sale.locationName || '', g.goodsName || '',
                Number(g.quantity || 0).toFixed(2), Number(g.salePrice || 0).toFixed(2),
                Number(g.costPrice || 0).toFixed(2), Number(g.profit || 0).toFixed(2),
                sale.payStatus === 'paid' ? '已结清' : '未付款',
              ]);
            });
          });
          break;
        }
        case 'transfer': {
          let q = db.collection('transfer_requests').where({ createTime: _.gte(start).and(_.lt(end)) });
          if (targetUserId) q = q.where(_.or([{ senderId: targetUserId }, { receiverId: targetUserId }]));
          const res = await q.orderBy('createTime', 'desc').limit(10).get();
          headers = ['申请时间', '发送人', '接收人', '原单位', '商品明细', '状态'];
          rows = (res.data || []).map(item => [
            item.createTime ? new Date(item.createTime).toLocaleString() : '',
            item.senderName || '', item.receiverName || '', item.fromCustomerName || '',
            (item.goodsList || []).map(g => g.goodsName + 'x' + g.quantity).join(' | '),
            item.status === 'accepted' ? '已接收' : item.status === 'rejected' ? '已拒绝' : '待处理',
          ]);
          break;
        }
        case 'stock': {
          let q = db.collection('user_goods');
          if (targetUserId) q = q.where({ userId: targetUserId });
          const res = await q.limit(10).get();
          headers = ['持有人', '商品名称', '当前库存', '单位'];
          rows = (res.data || []).map(item => [
            item.userName || '', item.goodsName || '',
            Number(item.stock || 0).toFixed(2), item.unit || '',
          ]);
          break;
        }
      }

      wx.hideLoading();
      this.setData({ previewHeaders: headers, previewData: rows });

      if (!rows.length) {
        wx.showToast({ title: '所选范围无数据', icon: 'none' });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('预览失败', err);
      wx.showToast({ title: '预览失败', icon: 'none' });
    }
  },

  /**
   * 导出数据
   */
  async exportData() {
    if (this.data.exporting) return;
    this.setData({ exporting: true });

    const { selectedType, startDate, endDate } = this.data;
    const { userInfo, start, end, targetUserId } = this.getQueryParams();

    if (!selectedType) {
      this.setData({ exporting: false });
      wx.showToast({ title: '请选择导出类型', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在提取数据...', mask: true });

    try {
      let csvContent = '﻿';
      const fileName = `${selectedType.name}_${startDate}_${endDate}.csv`;

      switch (selectedType.type) {
        case 'borrow_customer':
          csvContent += await this.exportBorrowCustomer(start, end, targetUserId);
          break;
        case 'sale_detail':
          csvContent += await this.exportSaleDetail(start, end, targetUserId);
          break;
        case 'transfer':
          csvContent += await this.exportTransfer(start, end, targetUserId);
          break;
        case 'stock':
          csvContent += await this.exportStock(targetUserId);
          break;
        default:
          throw new Error('未知的导出类型: ' + selectedType.type);
      }

      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      fs.writeFileSync(filePath, csvContent, 'utf8');

      wx.hideLoading();

      wx.openDocument({
        filePath: filePath,
        showMenu: true,
        fileType: 'csv',
        success: () => {
          this.setData({ exporting: false });
        },
        fail: () => {
          wx.shareFileMessage({
            filePath: filePath,
            fileName: fileName,
            success: () => {
              this.setData({ exporting: false });
            },
            fail: () => {
              this.setData({ exporting: false });
              wx.showToast({ title: '导出失败，请重试', icon: 'none' });
            },
          });
        },
      });

    } catch (err) {
      wx.hideLoading();
      this.setData({ exporting: false });
      console.error('导出失败', err);
      wx.showToast({ title: '导出失败: ' + (err.message || err), icon: 'none', duration: 3000 });
    }
  },

  /**
   * 导出借货客户明细
   */
  async exportBorrowCustomer(start, end, targetUserId) {
    const whereCond = {};

    if (start && end) {
      whereCond.borrowDate = _.gte(start).and(_.lt(end));
    }

    if (targetUserId) {
      whereCond.borrowerId = targetUserId;
    }

    const data = await fetchAll(function() {
      return db.collection('borrow').where(whereCond).orderBy('locationName', 'asc').orderBy('borrowDate', 'desc');
    });

    const goodsIds = [...new Set(data.map(item => item.goodsId).filter(Boolean))];
    let categoryMap = {};
    if (goodsIds.length > 0) {
      const goodsRes = await db.collection('goods').where({ _id: _.in(goodsIds) }).get();
      (goodsRes.data || []).forEach(g => {
        categoryMap[g._id] = g.category || 'hardware';
      });
    }

    let csv = '借货单位,商品名称,数量,单位,成本价,售价,总价,毛利,借货日期,当前状态,备注\n';

    var statusMap = {pending:'待处理',returned:'已归还',sold:'已销售',transferring:'调货中',partial:'部分归还'};
    data.forEach(item => {
      const status = statusMap[item.status] || '未知';
      const borrowDate = item.borrowDate ? this.formatTimestamp(item.borrowDate) : '';
      const category = categoryMap[item.goodsId] || 'hardware';
      const taxRate = category === 'software' ? 1.06 : 1.13;
      const qty = Number(item.quantity || 0);
      const salePrice = Number(item.salePrice || 0);
      const costPrice = Number(item.costPrice || 0);
      const totalSale = qty * salePrice;
      const totalCost = (qty * costPrice) / taxRate;
      const profit = totalSale - totalCost;
      csv += `"${item.locationName || ''}","${item.goodsName || ''}","${qty.toFixed(2)}","${item.unit || ''}","${costPrice.toFixed(2)}","${salePrice.toFixed(2)}","${totalSale.toFixed(2)}","${profit.toFixed(2)}","${borrowDate}","${status}","${item.remark || ''}"\n`;
    });

    return csv;
  },

  formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' ? ts : ts.getTime ? ts.getTime() : ts);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /**
   * 导出销售记录明细
   */
  async exportSaleDetail(start, end, targetUserId) {
    const data = await fetchAll(function() {
      var q = db.collection('sale').where({ saleTime: _.gte(start).and(_.lt(end)) });
      if (targetUserId) {
        q = q.where({ sellerId: targetUserId });
      }
      return q.orderBy('contactName', 'asc').orderBy('saleDate', 'desc');
    });

    let csv = '销售日期,客户名称,商品名称,数量,单位,成交价,成本价,单笔利润,付款状态,备注\n';

    data.forEach(sale => {
      const payStatusStr = sale.payStatus === 'paid' ? '已结清' : '未付款';
      const saleDate = this.formatTimestamp(sale.saleDate) || sale.saleDate || '';
      (sale.goodsDetail || []).forEach(g => {
        csv += `"${saleDate}","${sale.contactName || sale.locationName || ''}","${g.goodsName || ''}","${Number(g.quantity || 0).toFixed(2)}","${g.unit || ''}","${Number(g.salePrice || 0).toFixed(2)}","${Number(g.costPrice || 0).toFixed(2)}","${Number(g.profit || 0).toFixed(2)}","${payStatusStr}","${sale.remark || ''}"\n`;
      });
    });

    return csv;
  },

  /**
   * 导出调货记录
   */
  async exportTransfer(start, end, targetUserId) {
    const data = await fetchAll(function() {
      var q = db.collection('transfer_requests').where({ createTime: _.gte(start).and(_.lt(end)) });
      if (targetUserId) {
        q = q.where(_.or([{ senderId: targetUserId }, { receiverId: targetUserId }]));
      }
      return q.orderBy('createTime', 'desc');
    });

    let csv = '申请时间,发送人,接收人,原单位,商品明细,状态\n';

    data.forEach(item => {
      const status = item.status === 'accepted' ? '已接收' :
                     item.status === 'rejected' ? '已拒绝' : '待处理';
      const goodsStr = (item.goodsList || [])
        .map(g => `${g.goodsName}x${g.quantity}`)
        .join(' | ');
      const createTime = item.createTime ? new Date(item.createTime).toLocaleString() : '';
      csv += `${createTime},${item.senderName || ''},${item.receiverName || ''},${item.fromCustomerName || ''},"${goodsStr}",${status}\n`;
    });

    return csv;
  },

  /**
   * 导出个人库存快照
   */
  async exportStock(targetUserId) {
    const data = await fetchAll(function() {
      var q = db.collection('user_goods');
      if (targetUserId) {
        q = q.where({ userId: targetUserId });
      }
      return q;
    });

    let csv = '持有人,商品名称,当前库存,单位,最后变动日期\n';

    data.forEach(item => {
      csv += `"${item.userName || '本人'}","${item.goodsName || ''}","${Number(item.stock || 0).toFixed(2)}","${item.unit || ''}","${item.lastSaleDate || '无记录'}"\n`;
    });

    return csv;
  },
});
