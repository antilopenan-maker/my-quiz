// pages/quiz/quiz.js - 答题页（练习/考试）
const app = getApp();

Page({
  data: {
    loading: true,
    session: null,
    q: null,           // 当前题目
    index: 0,
    total: 0,
    mode: 'practice',
    isRev: false,
    isSubmitted: false,
    timerText: '',
    answeredCount: 0,
    correctCount: 0,
    wrongCount: 0,
    finished: false,   // 已交卷/已完成
    result: null,      // 结果对象
    typeLabels: { single: '单选题', multi: '多选题', judge: '判断题', blank: '填空题' },
  },

  onLoad() {
    const session = wx.getStorageSync('quizSession');
    if (!session) {
      wx.showToast({ title: '会话已失效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    this.session = session; // 用普通属性存会话（不 setData 大对象）
    this.setData({
      loading: false,
      session: { mode: session.mode, bankName: session.bankName, examName: session.examName },
      mode: session.mode,
      total: session.questions.length,
      questionsCount: session.questions.map((_, i) => i),
    });
    this.renderQuestion(0);
    if (session.mode === 'exam') this.startTimer();
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer);
  },

  renderQuestion(idx) {
    const session = this.session;
    const q = session.questions[idx];
    const ans = session.answers[idx];
    const isRev = !!session.revealed[idx];
    const isSubmitted = session.submitted.has(idx);
    const evaluated = [...session.submitted, ...Object.keys(session.revealed).map(Number)];
    const tAns = evaluated.length;
    const tCor = evaluated.filter(i => session.answers[i]?.correct).length;

    this.setData({
      index: idx,
      q: { ...q, options: q.options || [] },
      isRev,
      isSubmitted,
      ans: ans || null,
      answeredCount: tAns,
      correctCount: tCor,
      wrongCount: tAns - tCor,
    });
  },

  // 选择答案
  selectOption(e) {
    if (this.data.isSubmitted || this.data.isRev) return;
    const { key } = e.currentTarget.dataset;
    const session = this.session;
    const idx = this.data.index;
    const q = session.questions[idx];

    let keys;
    if (q.type === 'multi') {
      const ex = session.answers[idx]?.keys || [];
      const i = ex.indexOf(key);
      if (i >= 0) ex.splice(i, 1);
      else ex.push(key);
      keys = [...ex];
    } else {
      keys = [key];
    }
    session.answers[idx] = { keys, correct: false };
    this.setData({ ans: session.answers[idx] });
  },

  // 填空输入
  fillBlank(e) {
    if (this.data.isSubmitted || this.data.isRev) return;
    const session = this.session;
    const idx = this.data.index;
    session.answers[idx] = { text: e.detail.value, correct: false };
  },

  // 练习模式：提交答案（判分）
  submitAnswer() {
    const session = this.session;
    const idx = this.data.index;
    const q = session.questions[idx];
    const ans = session.answers[idx];
    if (!ans) {
      wx.showToast({ title: '请先作答', icon: 'none' });
      return;
    }

    const isCorrect = this.checkAnswer(q, ans);
    ans.correct = isCorrect;
    session.submitted.add(idx);
    this.setData({
      isSubmitted: true,
      ans,
    });
    this.renderQuestion(idx);
  },

  // 练习模式：显示答案
  revealAnswer() {
    const session = this.session;
    const idx = this.data.index;
    session.revealed[idx] = true;
    this.renderQuestion(idx);
  },

  checkAnswer(q, ans) {
    if (q.type === 'blank') {
      const expected = (q.answer_text || []).map(s => String(s).trim().toLowerCase());
      const given = (ans.text || '').trim().toLowerCase();
      return expected.includes(given);
    }
    const expected = (q.answer_keys || []).slice().sort().join(',');
    const given = (ans.keys || []).slice().sort().join(',');
    return expected === given;
  },

  // 上一题/下一题
  prev() { this.renderQuestion(Math.max(0, this.data.index - 1)); },
  next() { this.renderQuestion(Math.min(this.data.total - 1, this.data.index + 1)); },
  goTo(e) { this.renderQuestion(parseInt(e.currentTarget.dataset.i)); },

  // 考试计时
  startTimer() {
    const session = this.session;
    this.timer = setInterval(() => {
      const remaining = session.timeLimit - Math.floor((Date.now() - session.startTime) / 1000);
      if (remaining <= 0) {
        clearInterval(this.timer);
        this.setData({ timerText: '00:00' });
        this.submitExam();
        return;
      }
      const m = String(Math.floor(remaining / 60)).padStart(2, '0');
      const s = String(remaining % 60).padStart(2, '0');
      this.setData({ timerText: m + ':' + s });
    }, 1000);
  },

  // 交卷（考试）
  submitExam() {
    if (this.data.finished) return;
    const session = this.session;
    // 未答的按错误计
    let correct = 0, total = session.questions.length;
    session.questions.forEach((q, i) => {
      const ans = session.answers[i];
      if (ans && this.checkAnswer(q, ans)) {
        ans.correct = true;
        correct++;
      } else if (ans) {
        ans.correct = false;
      }
      session.submitted.add(i);
    });
    const score = total > 0 ? Math.round(correct / total * 100) : 0;
    this.finish(score, correct, total);
  },

  // 练习完成（答完全部）
  finishPractice() {
    const session = this.session;
    const evaluated = [...session.submitted, ...Object.keys(session.revealed).map(Number)];
    if (evaluated.length < session.questions.length) {
      wx.showModal({
        title: '尚未完成',
        content: `还有 ${session.questions.length - evaluated.length} 题未作答，确定结束本次练习吗？`,
        success: (res) => {
          if (res.confirm) {
            const correct = [...session.submitted].filter(i => session.answers[i]?.correct).length;
            const score = session.questions.length > 0 ? Math.round(correct / session.questions.length * 100) : 0;
            this.finish(score, correct, session.questions.length);
          }
        },
      });
    } else {
      const correct = [...session.submitted].filter(i => session.answers[i]?.correct).length;
      const score = session.questions.length > 0 ? Math.round(correct / session.questions.length * 100) : 0;
      this.finish(score, correct, session.questions.length);
    }
  },

  // 完成：提交记录 + 展示结果
  async finish(score, correct, total) {
    if (this.timer) clearInterval(this.timer);
    const session = this.session;
    const duration = Math.floor((Date.now() - session.startTime) / 1000);
    const wrongQuestions = [];
    const correctQuestions = [];

    session.questions.forEach((q, i) => {
      if (session.submitted.has(i)) {
        if (session.answers[i]?.correct) correctQuestions.push(q.id);
        else wrongQuestions.push(q.id);
      }
    });

    this.setData({ finished: true, result: { score, correct, total, wrongCount: wrongQuestions.length } });

    try {
      await app.request('/api/records', 'POST', {
        bankId: session.bankId,
        mode: session.mode,
        name: session.mode === 'exam' ? session.examName : session.bankName,
        total,
        correct,
        score,
        duration,
        details: session.questions.map((q, i) => ({
          qid: q.id, q: q.question,
          given: session.answers[i]?.keys || session.answers[i]?.text || '',
          correct: !!session.answers[i]?.correct,
        })),
        wrongQuestions,
        correctQuestions,
      });
    } catch (e) {
      // 记录提交失败不阻塞结果展示
    }
  },

  // 查看解析
  showAnalysis() {
    const q = this.session.questions[this.data.index];
    wx.showModal({
      title: '答案解析',
      content: `正确答案：${(q.answer_keys || []).join('、') || (q.answer_text || []).join('、')}\n\n解析：${q.analysis || '暂无解析'}`,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  // 返回
  backHome() {
    wx.removeStorageSync('quizSession');
    wx.navigateBack();
  },
});
