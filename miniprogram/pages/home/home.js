// pages/home/home.js - 首页（课程列表 + 统计概览）
const app = getApp();

Page({
  data: {
    loading: true,
    userInfo: null,
    stats: {
      course_count: 0,
      total_questions: 0,
      wrong_count: 0,
      record_count: 0,
    },
    courses: [],
    recentRecords: [],
  },

  onShow() {
    if (!app.globalData.token && !wx.getStorageSync('token')) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadDashboard();
  },

  async loadDashboard() {
    this.setData({ loading: true });
    try {
      const data = await app.request('/api/student/dashboard');
      this.setData({
        stats: {
          course_count: data.course_count,
          total_questions: data.total_questions,
          wrong_count: data.wrong_count,
          record_count: data.record_count,
        },
        courses: data.courses || [],
        recentRecords: data.recent_records || [],
        userInfo: wx.getStorageSync('userInfo') || null,
      });
    } catch (e) {
      // 错误已统一处理
    } finally {
      this.setData({ loading: false });
    }
  },

  goCourse(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/course/course?id=' + id });
  },

  goWrongbook() {
    wx.switchTab({ url: '/pages/wrongbook/wrongbook' });
  },

  goRecords() {
    wx.switchTab({ url: '/pages/records/records' });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？',
      success: (res) => {
        if (res.confirm) app.logout();
      },
    });
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh());
  },
});
