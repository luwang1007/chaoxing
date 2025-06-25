const http = require('./http')
const util = require('./util')
const log = require('./log')

class API {
  constructor(username, password = '') {
    this.username = username
    this.password = password
    this.cookies = util.getStorage('cookies-' + username, {})
    this.updatetime = util.getStorage('cookies-updatetime-' + username, 0)
    this.uid = this.extractUidFromCookies(this.cookies)
  }

  // 从 Cookie 中提取 uid
  extractUidFromCookies(cookies) {
    if (!cookies) return ''
    
    // 如果 cookies 是字符串，直接匹配
    if (typeof cookies === 'string') {
      const match = cookies.match(/_uid=(\d+)/)
      return match ? match[1] : ''
    }
    
    // 如果 cookies 是数组，遍历查找
    if (Array.isArray(cookies)) {
      const uidCookie = cookies.find(cookie => cookie.key === '_uid')
      return uidCookie ? uidCookie.value : ''
    }
    
    // 如果 cookies 是对象，直接获取
    if (typeof cookies === 'object') {
      return cookies._uid || ''
    }
    
    return ''
  }

  /**
   * 检查登录状态
   */
  async checkLogin() {
    if (!this.username || !this.password) {
      throw new Error('请先登录')
    }
    if (!Object.keys(this.cookies).length) {
      log.debug('未登录')
      await this.login()
    }
    if (this.updatetime + 7 * 24 * 60 * 60 * 1000 <= new Date().getTime()) {
      log.debug('自动登录 登录过期')
      await this.login()
    }
  }

  /**
   * 登录
   */
  async login() {
    if (!this.username || !this.password) {
      throw new Error('用户名或密码不能为空')
    }

    try {
      // 1. 调用登录 API
      const loginResult = await http.get('https://passport2-api.chaoxing.com/v11/loginregister', {
        'cx_xxt_passport': 'json',
        'roleSelect': 'true',
        'uname': this.username,
        'code': this.password,
        'loginType': '1'
      })

      Object.assign(this.cookies, loginResult.cookies)
      log.debug('登录响应', loginResult)

      // 2. 检查登录结果
      if (!loginResult.data || loginResult.data.status === false) {
        throw new Error(loginResult.data?.mes || '登录失败')
      }

      // 3. 处理 SSO 登录
      if (loginResult.data.url) {
        log.debug('需要 SSO 登录，URL:', loginResult.data.url)
        const ssoResult = await http.get(loginResult.data.url, {
          'uname': this.username,
          'code': this.password
        }, this.cookies)

        Object.assign(this.cookies, ssoResult.cookies)
        log.debug('SSO登录响应', ssoResult)
      }

      // 4. 验证 cookies 是否有效
      const verifyResult = await http.get('https://mooc1-api.chaoxing.com/mycourse/backclazzdata', {
        'view': 'json',
        'rss': '1'
      }, this.cookies)

      Object.assign(this.cookies, verifyResult.cookies)
      log.debug('验证cookies响应', verifyResult)

      if (!verifyResult.data || !verifyResult.data.result) {
        throw new Error('cookies 验证失败')
      }

      // 5. 保存 cookies 和更新时间
      util.setStorage('cookies-' + this.username, this.cookies)
      this.updatetime = new Date().getTime()
      util.setStorage('cookies-updatetime-' + this.username, this.updatetime)

      // 6. 提取 uid
      this.uid = this.extractUidFromCookies(this.cookies)
      if (!this.uid) {
        throw new Error('登录成功但未找到 _uid')
      }
      log.debug('从 Cookie 中获取到 uid:', this.uid)

      return loginResult
    } catch (error) {
      log.error('登录失败:', error)
      // 清除登录状态
      this.cookies = {}
      this.updatetime = 0
      this.uid = ''
      util.setStorage('cookies-' + this.username, {})
      util.setStorage('cookies-updatetime-' + this.username, 0)
      throw new Error('登录失败: ' + (error.message || '未知错误'))
    }
  }

  /**
   * 获取课程列表
   */
  async getCourse() {
    await this.checkLogin()

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getCourses',
        data: {
          username: this.username,
          password: this.password
        }
      })

      if (!result.success) {
        throw new Error(result.message || '获取课程失败')
      }

      // 检查返回的数据结构
      if (!result.data || !Array.isArray(result.data)) {
        log.error('云函数返回的数据结构不正确:', result)
        throw new Error('返回的数据格式不正确')
      }

      // 直接使用云函数返回的课程数据
      const courses = result.data.map(course => ({
        ...course,
        courseName: course.courseName || '未知课程',
        className: course.className || '未知班级',
        teacherName: course.teacherName || '未知教师',
        img: course.img || '/static/images/default-course.png'
      }))

      log.debug('获取课程', result.data, courses)
      return courses
    } catch (error) {
      log.error('获取课程失败:', error)
      throw error
    }
  }

  /**
   * 检查签到任务
   * @param {Array} courses 课程列表
   * @returns {Promise<Object>} 签到任务结果
   */
  async checkSignTasks(courses) {
    try {
      console.log('开始检查签到任务，课程列表:', courses)
      // 并发检测所有课程
      const results = await Promise.all(courses.map(course =>
        wx.cloud.callFunction({
          name: 'getActivities',
          data: {
            username: this.username,
            password: this.password,
            courseId: course.courseId,
            classId: course.classId,
            courseName: course.courseName,
            className: course.className,
            teacherName: course.teacherName,
            img: course.img
          }
        })
      ));

      // 合并所有课程的签到任务
      const allSignTasks = results
        .filter(r => r.result && r.result.success)
        .flatMap(r => (r.result.data.signTasks || []));

      // 合并统计信息（可选）
      // 这里只返回总签到任务数和课程数
      const stats = {
        totalCourses: courses.length,
        checkedCourses: courses.length,
        totalActivities: results.reduce((sum, r) => sum + (r.result?.data?.stats?.totalActivities || 0), 0),
        signTasks: allSignTasks.length
      };

      return {
        success: true,
        data: allSignTasks,
        stats: stats
      }
    } catch (error) {
      console.error('检查签到任务失败:', error)
      throw new Error('检查签到任务失败: ' + error.message)
    }
  }

  /**
   * 检查活动是否在有效时间内
   * @param {string} startTime 开始时间
   * @param {string} endTime 结束时间
   * @returns {boolean} 是否有效
   */
  isActivityValid(startTime, endTime) {
    try {
      const now = new Date().getTime()
      const start = new Date(startTime).getTime()
      const end = new Date(endTime).getTime()
      return now >= start && now <= end
    } catch (error) {
      console.error('检查活动时间有效性时出错:', error)
      return false
    }
  }

  /**
   * 获取签到方式
   * @param {number} type 活动类型
   * @returns {string} 签到方式
   */
  getSignMethod(type) {
    const methods = {
      0: '普通签到',
      1: '二维码签到',
      2: '位置签到',
      3: '手势签到',
      5: '签到码签到'
    }
    return methods[type] || '未知签到'
  }

  // 检查 Cookie 是否完整
  checkCookiesComplete() {
    const requiredCookies = ['_uid', 'fid', 'vc3']
    const missingCookies = requiredCookies.filter(cookie => {
      if (typeof this.cookies === 'string') {
        return !this.cookies.includes(`${cookie}=`)
      } else if (Array.isArray(this.cookies)) {
        return !this.cookies.some(c => c.key === cookie)
      } else if (typeof this.cookies === 'object') {
        return !this.cookies[cookie]
      }
      return true
    })

    if (missingCookies.length > 0) {
      throw new Error(`Cookie 不完整，缺少: ${missingCookies.join(', ')}，请重新登录`)
    }
  }

  async getUid() {
    try {
      // 从 Cookie 中提取 _uid
      const cookies = this.cookies;
      if (!cookies) {
        throw new Error('未找到有效的 Cookie');
      }

      // 查找 _uid 的 Cookie
      const uidMatch = cookies.match(/_uid=(\d+)/);
      if (!uidMatch) {
        throw new Error('未找到 _uid');
      }

      const uid = uidMatch[1];
      console.log('从 Cookie 中获取到 uid:', uid);
      return uid;
    } catch (error) {
      console.error('获取 uid 失败:', error);
      throw error;
    }
  }

  /**
   * 发送HTTP请求
   * @param {string} url 请求URL
   * @param {Object} params 请求参数
   * @returns {Promise<Object>} 响应数据
   */
  async request(url, params = {}) {
    await this.checkLogin();
    return http.get(url, params, this.cookies);
  }

  /**
   * 获取课程活动列表
   * @param {string} courseId 课程ID
   * @returns {Promise<Array>} 活动列表
   */
  async getActivities(courseId) {
    try {
      const url = `https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist`;
      const params = {
        courseId: courseId,
        classId: 0,
        pageSize: 20,
        pageNum: 1
      };
      
      const response = await this.request(url, params);
      
      if (!response.data || !response.data.dataList) {
        return [];
      }

      return response.data.dataList.map(item => ({
        id: item.id,
        name: item.nameOne,
        startTime: item.startTime,
        endTime: item.endTime,
        type: item.type,
        status: item.status
      }));
    } catch (error) {
      console.error('获取活动列表失败:', error);
      throw error;
    }
  }
}

module.exports = API 