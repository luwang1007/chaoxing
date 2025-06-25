const app = getApp()
const API = require('../../utils/api')
const log = require('../../utils/log')

// 常量配置
const CONSTANTS = {
  DEFAULT_ACTIVITY_IMAGE: '/static/images/default-activity.png',
  ACTIVITY_STATUS: {
    NOT_STARTED: '未开始',
    IN_PROGRESS: '进行中',
    ENDED: '已结束'
  }
}

Page({
  data: {
    courseId: '',
    classId: '',
    courseName: '',
    className: '',
    teacherName: '',
    img: '',
    history: [],
    loading: false,
    error: ''
  },

  onLoad(options) {
    log.info('courseHistory onLoad', options);
    this.initializePageData(options);
    this.initAPI();
  },

  onShow() {
    log.info('courseHistory onShow');
    if (this.data.courseId) {
      this.loadHistory();
    }
  },

  onPullDownRefresh() {
    this.loadHistory();
  },

  /**
   * 初始化页面数据
   * @param {Object} options 页面参数
   */
  initializePageData(options) {
    const decodedOptions = this.decodeOptions(options);
    this.setData(decodedOptions);
  },

  /**
   * 解码页面参数
   * @param {Object} options 原始参数
   * @returns {Object} 解码后的参数
   */
  decodeOptions(options) {
    return {
      courseId: options.courseId,
      classId: options.classId,
      courseName: decodeURIComponent(options.courseName || ''),
      className: decodeURIComponent(options.className || ''),
      teacherName: decodeURIComponent(options.teacherName || ''),
      img: decodeURIComponent(options.img || '')
    };
  },

  /**
   * 初始化 API
   */
  async initAPI() {
    try {
      log.info('initAPI called');
      const mainAccountResult = await this.getMainAccount();
      const mainAccount = mainAccountResult.result.data;
      
      this.initializeAPIInstance(mainAccount);
      await this.loadHistory();
    } catch (error) {
      this.handleAPIError(error);
    }
  },

  /**
   * 获取主账号信息
   */
  async getMainAccount() {
    const result = await wx.cloud.callFunction({
      name: 'getMainAccount'
    });

    if (!result.result.success) {
      throw new Error(result.result.message || '获取主账号失败');
    }

    return result;
  },

  /**
   * 初始化 API 实例
   * @param {Object} mainAccount 主账号信息
   */
  initializeAPIInstance(mainAccount) {
    this.api = new API(mainAccount.username, mainAccount.password);
    this.api.cookies = mainAccount.cookies;
    this.api.updatetime = new Date().getTime();
    log.info('API初始化完成', this.api);
  },

  /**
   * 处理 API 错误
   * @param {Error} error 错误对象
   */
  handleAPIError(error) {
    log.error('初始化 API 失败:', error);
    this.setData({
      error: '初始化失败: ' + (error.message || '未知错误'),
      loading: false
    });
  },

  /**
   * 加载历史记录
   */
  async loadHistory() {
    if (!this.validateAPI()) return;

    try {
      this.setData({ loading: true, error: '' });
      const activities = await this.fetchAndProcessActivities();
      this.updateHistoryData(activities);
    } catch (error) {
      this.handleHistoryError(error);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 验证 API 是否可用
   * @returns {boolean} API 是否可用
   */
  validateAPI() {
    if (!this.api) {
      this.setData({
        loading: false,
        error: '请先登录'
      });
      return false;
    }
    return true;
  },

  /**
   * 获取并处理活动数据
   * @returns {Array} 处理后的活动列表
   */
  async fetchAndProcessActivities() {
    const courseObj = this.getCourseObject();
    const res = await this.callCourseHistoryFunction(courseObj);
    return this.processActivitiesData(res.result.data);
  },

  /**
   * 获取课程对象
   * @returns {Object} 课程信息对象
   */
  getCourseObject() {
    return {
      courseId: this.data.courseId,
      classId: this.data.classId,
      courseName: this.data.courseName,
      className: this.data.className || '',
      teacherName: this.data.teacherName || '',
      img: this.data.img || ''
    };
  },

  /**
   * 调用课程历史云函数
   * @param {Object} courseObj 课程信息
   * @returns {Object} 云函数返回结果
   */
  async callCourseHistoryFunction(courseObj) {
    return await wx.cloud.callFunction({
      name: 'getCourseHistory',
      data: {
        username: this.api.username,
        password: this.api.password,
        ...courseObj
      }
    });
  },

  /**
   * 处理活动数据
   * @param {Object} data 原始数据
   * @returns {Array} 处理后的活动列表
   */
  processActivitiesData(data) {
    let activities = [];

    // 尝试从不同位置获取活动数据
    if (Array.isArray(data?.signTasks) && data.signTasks.length > 0) {
      activities = data.signTasks[0].activities || [];
    }

    if ((!activities || activities.length === 0) && Array.isArray(data?.data?.activeList)) {
      activities = this.mapActiveList(data.data.activeList);
    }

    if ((!activities || activities.length === 0) && Array.isArray(data?.activeList)) {
      activities = this.mapActiveList(data.activeList);
    }

    return activities;
  },

  /**
   * 映射活动列表数据
   * @param {Array} activeList 原始活动列表
   * @returns {Array} 处理后的活动列表
   */
  mapActiveList(activeList) {
    return activeList.map((item, idx) => ({
      id: this.generateActivityId(item, idx),
      name: item.nameOne || item.name || '',
      startTime: this.formatTime(item.startTime),
      endTime: this.formatTime(item.endTime),
      type: item.type,
      status: this.getActivityStatus({ startTime: item.startTime, endTime: item.endTime }),
      isSign: item.isSign,
      activeType: item.activeType,
      img: item.logo || CONSTANTS.DEFAULT_ACTIVITY_IMAGE
    }));
  },

  /**
   * 生成活动ID
   * @param {Object} item 活动项
   * @param {number} idx 索引
   * @returns {string} 活动ID
   */
  generateActivityId(item, idx) {
    return item.id || item.activeId || ((item.nameOne || item.name || '') + '_' + item.startTime) || idx;
  },

  /**
   * 更新历史数据
   * @param {Array} activities 活动列表
   */
  updateHistoryData(activities) {
    if (!activities.length) {
      this.setData({
        history: [],
        loading: false,
        error: '暂无活动记录'
      });
      return;
    }

    this.setData({
      history: activities,
      loading: false,
      error: ''
    });
  },

  /**
   * 处理历史记录错误
   * @param {Error} error 错误对象
   */
  handleHistoryError(error) {
    log.error('获取历史记录失败:', error);
    this.setData({
      error: '获取历史记录失败: ' + (error.message || '未知错误'),
      loading: false
    });
  },

  /**
   * 获取活动状态
   * @param {Object} activity 活动数据
   * @returns {string} 活动状态
   */
  getActivityStatus(activity) {
    const now = new Date().getTime();
    const startTime = new Date(activity.startTime).getTime();
    const endTime = new Date(activity.endTime).getTime();

    if (now < startTime) {
      return CONSTANTS.ACTIVITY_STATUS.NOT_STARTED;
    } else if (now > endTime) {
      return CONSTANTS.ACTIVITY_STATUS.ENDED;
    } else {
      return CONSTANTS.ACTIVITY_STATUS.IN_PROGRESS;
    }
  },

  /**
   * 格式化时间
   * @param {string|number} time 时间字符串或时间戳
   * @returns {string} 格式化后的时间
   */
  formatTime(time) {
    const date = this.parseTime(time);
    return this.formatDateToString(date);
  },

  /**
   * 解析时间
   * @param {string|number} time 时间字符串或时间戳
   * @returns {Date} Date对象
   */
  parseTime(time) {
    if (typeof time === 'number') {
      return new Date(time);
    }
    return new Date(Number(time) || time);
  },

  /**
   * 格式化日期为字符串
   * @param {Date} date Date对象
   * @returns {string} 格式化后的时间字符串
   */
  formatDateToString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }
}) 