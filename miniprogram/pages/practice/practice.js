// pages/practice/practice.js - 练习/考试配置
const app = getApp();

Page({
  data: {
    bankId: null,
    bankName: '',
    bankQcount: 0,
    mode: 'practice', // practice | exam
    order: 'sequential', // sequential | random
    count: 'all',
    examName: '',
    examCount: 20,
    examTime: 60,
    examPass: 60,
  },

  onLoad(options) {
    this.setData({
      bankId: options.id,
      bankName: decodeURIComponent(options.name || ''),
      bankQcount: parseInt(options.qcount) || 0,
    });
    wx.setNavigationBarTitle({ title: decodeURIComponent(options.name || '题库') });
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  setOrder(e) {
    this.setData({ order: e.currentTarget.dataset.order });
  },

  setCount(e) {
    this.setData({ count: e.currentTarget.dataset.count });
  },

  onExamName(e) { this.setData({ examName: e.detail.value }); },
  onExamCount(e) { this.setData({ examCount: parseInt(e.detail.value) || 20 }); },
  onExamTime(e) { this.setData({ examTime: parseInt(e.detail.value) || 60 }); },
  onExamPass(e) { this.setData({ examPass: parseInt(e.detail.value) || 60 }); },

  // 开始练习/考试
  async start() {
    const { bankId, mode, order, count } = this.data;
    wx.showLoading({ title: '加载题目中...' });
    try {
      const data = await app.request('/api/banks/' + bankId + '/questions');
      let questions = (data.questions || []).map(q => ({
        ...q,
        options: Array.isArray(q.options) ? q.options : [],
        answer_keys: Array.isArray(q.answer_keys) ? q.answer_keys : [],
        answer_text: Array.isArray(q.answer_text) ? q.answer_text : [],
      }));

      if (questions.length === 0) {
        wx.showToast({ title: '该题库暂无题目', icon: 'none' });
        return;
      }

      // 出题顺序
      if (order === 'random') questions = this.shuffle(questions);

      // 题目数量
      if (mode === 'exam') {
        const n = Math.min(this.data.examCount, questions.length);
        questions = questions.slice(0, n);
      } else if (count !== 'all') {
        const n = Math.min(parseInt(count) || 20, questions.length);
        questions = questions.slice(0, n);
      }

      // 构建会话并跳转答题页
      const session = {
        bankId,
        bankName: this.data.bankName,
        mode,
        questions,
        currentIndex: 0,
        answers: {},
        submitted: new Set(),
        revealed: {},
        startTime: Date.now(),
        examName: mode === 'exam' ? (this.data.examName || '模拟考试') : '',
        timeLimit: mode === 'exam' ? this.data.examTime * 60 : 0,
        passScore: mode === 'exam' ? this.data.examPass : 0,
      };

      // 通过 Storage 传递会话（页面间导航）
      wx.setStorageSync('quizSession', session);
      wx.navigateTo({ url: '/pages/quiz/quiz' });
    } catch (e) {
      // 错误已统一处理
    } finally {
      wx.hideLoading();
    }
  },

  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
});
