// app.js - 小程序入口
App({
  globalData: {
    baseUrl: 'http://localhost:3000', // TODO: 部署后改为实际服务器地址（需 HTTPS 域名）
    token: '',
    userInfo: null,
  },

  onLaunch() {
    const token = wx.getStorageSync('token');
    if (token) {
      this.globalData.token = token;
    }
  },

  // 设置服务器地址（登录页可配置）
  setBaseUrl(url) {
    this.globalData.baseUrl = url.replace(/\/+$/, '');
    wx.setStorageSync('baseUrl', this.globalData.baseUrl);
  },

  // 统一请求封装
  request(path, method = 'GET', data = {}) {
    const baseUrl = this.globalData.baseUrl || wx.getStorageSync('baseUrl') || 'http://localhost:3000';
    const token = this.globalData.token || wx.getStorageSync('token');

    return new Promise((resolve, reject) => {
      wx.request({
        url: baseUrl + path,
        method,
        data,
        header: {
          'Content-Type': 'application/json',
          'Authorization': token ? 'Bearer ' + token : '',
        },
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else if (res.statusCode === 401) {
            // Token 失效，跳回登录页
            wx.removeStorageSync('token');
            getApp().globalData.token = '';
            wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' });
            setTimeout(() => {
              wx.reLaunch({ url: '/pages/login/login' });
            }, 800);
            reject(res.data);
          } else {
            const msg = (res.data && res.data.error) || '请求失败(' + res.statusCode + ')';
            wx.showToast({ title: msg, icon: 'none' });
            reject(res.data);
          }
        },
        fail(err) {
          wx.showToast({ title: '网络错误，请检查服务器地址', icon: 'none' });
          reject(err);
        },
      });
    });
  },

  // 登录
  login(username, password) {
    return this.request('/api/auth/login', 'POST', { username, password }).then(data => {
      this.globalData.token = data.token;
      this.globalData.userInfo = data.user;
      wx.setStorageSync('token', data.token);
      wx.setStorageSync('userInfo', data.user);
      return data;
    });
  },

  // 登出
  logout() {
    this.globalData.token = '';
    this.globalData.userInfo = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('userInfo');
    wx.reLaunch({ url: '/pages/login/login' });
  },
});
