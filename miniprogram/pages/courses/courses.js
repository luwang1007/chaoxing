const app = getApp()
const API = require('../../utils/api')
const log = require('../../utils/log')
const util = require('../../utils/util')

/**
 * 课程列表页面
 */
Page({
  data: {
    courses: [], // 原始课程列表
    filteredCourses: [], // 过滤后的课程列表
    searchKey: '', // 搜索关键词
    loading: false, // 加载状态
    error: '', // 错误信息
    hasMainAccount: false // 是否有主账号
  },

  onLoad() {
    this.initMainAccount()
  },

  onShow() {
    // 每次显示页面时重新初始化主账号并刷新课程列表
    this.initMainAccount()
  },

  /**
   * 初始化主账号
   */
  async initMainAccount() {
    try {
      this.setData({ loading: true, error: '' })
      
      const mainAccountResult = await wx.cloud.callFunction({
        name: 'getMainAccount'
      });

      if (!mainAccountResult.result.success) {
        throw new Error(mainAccountResult.result.message || '获取主账号失败');
      }

      const mainAccount = mainAccountResult.result.data;
      
      // 更新全局主账号信息
      app.globalData.mainAccount = {
        username: mainAccount.username,
        password: mainAccount.password
      };

      // 初始化 API
      this.api = new API(mainAccount.username, mainAccount.password);
      this.api.cookies = mainAccount.cookies;
      this.api.updatetime = new Date().getTime();

      // 立即更新页面状态，设置hasMainAccount为true
      this.setData({
        hasMainAccount: true,
        loading: true
      });

      // 新增：优先尝试从缓存读取课程数据
      const cachedCourses = wx.getStorageSync('courses');
      const cachedTime = wx.getStorageSync('courses_cache_time');
      const now = Date.now();
      if (cachedCourses && cachedTime && (now - cachedTime < 3600 * 1000)) {
        // 1小时内缓存有效
        this.setData({
          courses: cachedCourses,
          filteredCourses: cachedCourses,
          loading: false,
          error: ''
        });
        console.log('使用缓存课程数据');
      } else {
        // 加载课程列表
        await this.loadCourses();
      }
    } catch (error) {
      log.error('初始化主账号失败:', error);
      this.setData({
        error: '获取主账号失败: ' + (error.message || '未知错误'),
        loading: false,
        hasMainAccount: false
      });
    }
  },

  /**
   * 加载课程列表
   */
  async loadCourses() {
    if (!this.data.hasMainAccount) {
      this.setData({
        loading: false,
        error: '请先设置主账号'
      });
      return;
    }

    try {
      console.log('开始获取课程列表');
      const courses = await this.api.getCourse();
      
      console.log('获取到的课程数据:', courses);
      
      if (!courses || courses.length === 0) {
        console.log('未找到课程数据');
        this.setData({
          courses: [],
          filteredCourses: [],
          loading: false,
          error: '暂无课程'
        });
        return;
      }

      const processedCourses = courses.map(course => ({
        ...course,
        courseName: course.courseName || '未知课程',
        className: course.className || '未知班级',
        teacherName: course.teacherName || '未知教师'
      }));

      console.log('处理后的课程数据:', processedCourses);
      
      this.setData({
        courses: processedCourses,
        filteredCourses: processedCourses,
        loading: false,
        error: ''
      });
      // 新增：缓存课程数据和时间
      wx.setStorageSync('courses', processedCourses);
      wx.setStorageSync('courses_cache_time', Date.now());
    } catch (error) {
      log.error('加载课程失败:', error);
      this.setData({
        error: '获取课程失败: ' + (error.message || '未知错误'),
        loading: false
      });
    }
  },

  /**
   * 重试加载课程
   */
  retry() {
    console.log('重试加载课程');
    this.initMainAccount();
  },

  /**
   * 搜索课程
   * @param {Object} e 输入事件对象
   */
  onSearchInput(e) {
    const searchKey = e.detail.value.toLowerCase();
    this.setData({
      searchKey,
      filteredCourses: this._filterCourses(searchKey)
    });
  },

  /**
   * 过滤课程列表
   * @param {string} searchKey 搜索关键词
   * @returns {Array} 过滤后的课程列表
   * @private
   */
  _filterCourses(searchKey) {
    if (!searchKey) return this.data.courses;

    return this.data.courses.filter(course => 
      course.courseName.toLowerCase().includes(searchKey) ||
      course.className.toLowerCase().includes(searchKey) ||
      course.teacherName.toLowerCase().includes(searchKey)
    );
  },

  /**
   * 跳转到签到页面
   * @param {Object} e 点击事件对象
   */
  goToSignIn(e) {
    const course = e.currentTarget.dataset.course;
    if (!this._validateCourseData(course)) {
      return;
    }

    wx.navigateTo({
      url: `/pages/sign/sign?courseId=${course.courseId}&classId=${course.classId}`
    });
  },

  /**
   * 验证课程数据
   * @param {Object} course 课程数据
   * @returns {boolean} 是否有效
   * @private
   */
  _validateCourseData(course) {
    if (!course || !course.courseId || !course.classId) {
      wx.showToast({
        title: '课程信息不完整',
        icon: 'none'
      });
      return false;
    }
    return true;
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.initMainAccount().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  refreshCourses() {
    this.initMainAccount();
  },

  viewCourseHistory(e) {
    const course = e.currentTarget.dataset.course;
    wx.navigateTo({
      url: `/pages/courseHistory/courseHistory?courseId=${course.courseId}&courseName=${encodeURIComponent(course.courseName)}&classId=${course.classId}&className=${encodeURIComponent(course.className)}&teacherName=${encodeURIComponent(course.teacherName)}&img=${encodeURIComponent(course.img || '')}`
    });
  },

  /**
   * 测试签到组云函数接口
   */
  async testSignGroup(course) {
    // 获取主账号
    const mainAccount = app.globalData.mainAccount;
    if (!mainAccount) {
      wx.showToast({ title: '请先设置主账号', icon: 'none' });
      return;
    }
    // 获取cookie
    let cookie = '';
    if (Array.isArray(this.api.cookies)) {
      cookie = this.api.cookies.map(c => `${c.key}=${c.value}`).join('; ');
    } else if (typeof this.api.cookies === 'object') {
      cookie = Object.entries(this.api.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    } else if (typeof this.api.cookies === 'string') {
      cookie = this.api.cookies;
    }
    const uid = this.api.uid || (this.api.cookies && this.api.cookies._uid);
    if (!cookie || !uid) {
      wx.showToast({ title: 'cookie或uid缺失', icon: 'none' });
      return;
    }
    // 取课程id和classId
    const courseId = course.courseId;
    const classId = course.classId;
    const res = await wx.cloud.callFunction({
      name: 'getActivities',
      data: { courseId, classId, uid: String(uid), cookie }
    });
    console.log('签到组返回:', res);
    wx.showModal({
      title: '签到组结果',
      content: JSON.stringify(res.result && res.result.data ? res.result.data : res.result),
      showCancel: false
    });
  }
}) 