// pages/records/records.js - 答题记录
const app = getApp();

Page({
  data: {
    loading: true,
    records: [],
  },

  onShow() {
    this.loadRecords();
  },

  async loadRecords() {
    this.setData({ loading: true });
    try {
      const data = await app.request('/api/records?limit=100');
      this.setData({ records: data.records || [] });
    } catch (e) {
      // 错误已统一处理
    } finally {
      this.setData({ loading: false });
    }
  },

  onPullDownRefresh() {
    this.loadRecords().finally(() => wx.stopPullDownRefresh());
  },
});
