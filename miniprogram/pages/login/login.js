// pages/login/login.js - 学员登录
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    baseUrl: '',
    loading: false,
  },

  onLoad() {
    this.setData({
      baseUrl: wx.getStorageSync('baseUrl') || app.globalData.baseUrl || 'http://localhost:3000',
    });
  },

  onUsername(e) {
    this.setData({ username: e.detail.value });
  },

  onPassword(e) {
    this.setData({ password: e.detail.value });
  },

  onBaseUrl(e) {
    this.setData({ baseUrl: e.detail.value });
  },

  saveBaseUrl() {
    const url = this.data.baseUrl.trim();
    if (!url) return;
    app.setBaseUrl(url);
    wx.showToast({ title: '服务器地址已保存', icon: 'success' });
  },

  async doLogin() {
    const { username, password, loading } = this.data;
    if (loading) return;
    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const data = await app.login(username, password);
      if (data.user && data.user.role !== 'student') {
        wx.showToast({ title: '仅学员账号可登录小程序', icon: 'none' });
        app.logout();
        return;
      }
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/home/home' }), 500);
    } catch (e) {
      // 错误已由 request 统一处理
    } finally {
      this.setData({ loading: false });
    }
  },
});
