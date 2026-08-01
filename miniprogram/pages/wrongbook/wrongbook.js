// pages/wrongbook/wrongbook.js - 错题本
const app = getApp();

Page({
    data: {
      loading: true,
      entries: [],
      filteredEntries: [],
      filter: 'all', // all | 未掌握 | 复习中 | 已掌握
    },

  onShow() {
    this.loadWrongbook();
  },

  async loadWrongbook() {
    this.setData({ loading: true });
    try {
      const data = await app.request('/api/wrongbook');
      this.setData({ entries: data.entries || [] }, () => this.applyFilter());
    } catch (e) {
      // 错误已统一处理
    } finally {
      this.setData({ loading: false });
    }
  },

  setFilter(e) {
    this.setData({ filter: e.currentTarget.dataset.filter }, () => this.applyFilter());
  },

  // 按状态过滤
  applyFilter() {
    const { entries, filter } = this.data;
    if (filter === 'all') {
      this.setData({ filteredEntries: entries });
      return;
    }
    this.setData({ filteredEntries: entries.filter(e => e.status === filter) });
  },

  // 标记已掌握（答对3次自动，这里提供手动移除）
  removeEntry(e) {
    const qid = e.currentTarget.dataset.qid;
    wx.showModal({
      title: '移除错题',
      content: '确定从错题本中移除这道题吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await app.request('/api/wrongbook/' + qid, 'DELETE');
          this.loadWrongbook();
        } catch (e) {}
      },
    });
  },

  // 复习这道题（打开答题页，单题模式）
  reviewQuestion(e) {
    const qid = e.currentTarget.dataset.qid;
    const entry = this.data.entries.find(x => x.question_id == qid);
    if (!entry) return;
    const question = {
      id: entry.question_id,
      type: entry.type,
      question: entry.question,
      options: entry.options || [],
      answer_keys: entry.answer_keys || [],
      answer_text: entry.answer_text || [],
      analysis: entry.analysis || '',
      number: 1,
    };
    const session = {
      bankId: entry.bank_id,
      bankName: '错题复习',
      mode: 'practice',
      questions: [question],
      currentIndex: 0,
      answers: {},
      submitted: new Set(),
      revealed: {},
      startTime: Date.now(),
      examName: '',
      timeLimit: 0,
      passScore: 0,
    };
    wx.setStorageSync('quizSession', session);
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },

  onPullDownRefresh() {
    this.loadWrongbook().finally(() => wx.stopPullDownRefresh());
  },
});
