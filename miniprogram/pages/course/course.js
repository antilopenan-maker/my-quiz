// pages/course/course.js - 课程详情（分组-题库树）
const app = getApp();

Page({
  data: {
    courseId: null,
    courseName: '',
    loading: true,
    groups: [],
  },

  onLoad(options) {
    this.setData({ courseId: options.id });
    this.loadBanks(options.id);
  },

  async loadBanks(courseId) {
    this.setData({ loading: true });
    try {
      const data = await app.request('/api/student/course/' + courseId + '/banks');
      // 补充课程名（从 dashboard 缓存取）
      const dashboard = await app.request('/api/student/dashboard').catch(() => null);
      const course = (dashboard && dashboard.courses || []).find(c => c.id == courseId);
      this.setData({
        groups: data.groups || [],
        courseName: course ? course.name : '',
      });
      wx.setNavigationBarTitle({ title: course ? course.name : '课程详情' });
    } catch (e) {
      // 错误已统一处理
    } finally {
      this.setData({ loading: false });
    }
  },

  goPractice(e) {
    const { id, name, qcount } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/practice/practice?id=${id}&name=${encodeURIComponent(name)}&qcount=${qcount}`,
    });
  },
});
