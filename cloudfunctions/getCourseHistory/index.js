// 云函数入口文件
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const ActivityUrl = "https://mobilelearn.chaoxing.com/v2/apis/active/student/activelist"

/**
 * 获取签到方式
 * @param {number} type 活动类型
 * @returns {string} 签到方式
 */
function getSignMethod(type) {
  const methods = {
    0: '普通签到',
    1: '二维码签到',
    2: '位置签到',
    3: '手势签到',
    5: '签到码签到'
  }
  return methods[type] || '未知签到'
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { username, password, courseId, classId } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('开始获取活动列表，用户信息:', { username, openid })

  try {
    // 获取用户凭证
    const db = cloud.database()
    const { data: credentials } = await db.collection('credentials')
      .where({ username: username })
      .get()

    console.log('获取到的用户凭证:', credentials)

    if (credentials.length === 0) {
      console.log('未找到用户凭证')
      return {
        success: false,
        message: '未找到用户凭证'
      }
    }

    // 解密密码
    const { result } = await cloud.callFunction({
      name: 'utils',
      data: {
        action: 'decrypt',
        text: credentials[0].password
      }
    })

    console.log('密码解密结果:', result)

    if (!result.success) {
      throw new Error('密码解密失败')
    }

    if (result.data !== password) {
      console.log('密码验证失败')
      return {
        success: false,
        message: '密码错误'
      }
    }

    // 检查 cookies
    let cookies = credentials[0].cookies
    if (!cookies) {
      console.log('未找到 cookies，尝试登录获取')
      // 调用登录云函数获取新的 cookies
      const loginResult = await cloud.callFunction({
        name: 'loginUser',
        data: {
          username,
          password,
          isMainAccount: credentials[0].isMainAccount
        }
      })

      if (!loginResult.result.success) {
        throw new Error('登录失败: ' + loginResult.result.message)
      }

      cookies = loginResult.result.cookies
      // 更新 cookies
      await db.collection('credentials')
        .where({ username: username })
        .update({
          data: {
            cookies: cookies
          }
        })
    }

    // 格式化 cookies
    const formattedCookies = Array.isArray(cookies) 
      ? cookies.map(cookie => `${cookie.key}=${cookie.value}`).join('; ')
      : cookies

    console.log('格式化后的 cookies:', formattedCookies)

    if (!formattedCookies) {
      throw new Error('无效的 cookies')
    }

    // 调用超星学习通 API 获取活动列表
    const response = await axios.get(
      `${ActivityUrl}?${new URLSearchParams({
        'fid': '0',
        'courseId': courseId,
        'classId': classId,
        'showNotStartedActive': '0'
      })}`,
      {
        headers: {
          'Cookie': formattedCookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
        },
        withCredentials: true
      }
    )

    console.log('API 响应状态码:', response.status)
    console.log('API 响应头:', response.headers)
    console.log('API 响应数据:', JSON.stringify(response.data, null, 2))

    if (!response.data) {
      throw new Error('API 返回数据为空')
    }

    if (!response.data.result) {
      throw new Error('获取活动列表失败: ' + (response.data.msg || '未知错误'))
    }

    // 更新：从正确的嵌套结构中获取 activeList
    const activeList = response.data.data?.activeList
    if (!Array.isArray(activeList)) {
      console.log('API 返回的数据结构:', response.data)
      throw new Error('API 返回的数据格式不正确')
    }

    // 处理活动数据
    const activities = activeList.map(item => {
      // 只用关键词判断签到类型
      const name = item.nameOne || item.name || '';
      let realType = 0; // 默认为普通签到

      if (name.includes('二维码')) {
        realType = 1;
      } else if (name.includes('位置')) {
        realType = 2;
      } else if (name.includes('手势')) {
        realType = 3;
      } else if (name.includes('签到码')) {
        realType = 5;
      } // 其它情况（如"签到"）就是普通签到0

      if (![0,1,2,3,5].includes(realType)) return null;
      return {
        id: item.id || item.activeId,
        name: item.nameOne || item.name,
        type: realType,
        startTime: item.startTime,
        endTime: item.endTime,
        status: item.status,
        isSign: item.isSign,
        activeType: item.activeType,
        img: item.logo || '/static/images/default-activity.png',
        // 添加课程信息
        courseId: courseId,
        classId: classId,
        courseName: event.courseName || '未知课程',
        className: event.className || '未知班级',
        teacherName: event.teacherName || '未知教师'
      };
    }).filter(Boolean)

    // 过滤有效的签到活动
    const validActivities = activities.filter(item => {
      try {
        // 检查是否是签到相关活动且未签到且在有效时间内
        const isSignActivity = [1, 2].includes(item.activeType) || [0, 1, 2, 3, 5].includes(item.type)
        const isNotSigned = !item.isSign
        const isActive = [0, 1].includes(item.status)
        const now = new Date().getTime()
        const start = new Date(item.startTime).getTime()
        const end = new Date(item.endTime).getTime()
        const isValidTime = now >= start && now <= end

        return isSignActivity && isNotSigned && isActive && isValidTime
      } catch (error) {
        console.error('处理活动数据时出错:', error, item)
        return false
      }
    })

    // 格式化活动数据
    const formattedActivities = validActivities.map(item => ({
      ...item,
      signMethod: getSignMethod(item.type),
      timeLeft: Math.floor((new Date(item.endTime).getTime() - new Date().getTime()) / 1000 / 60)
    }))

    // 构建返回数据
    const totalActivities = Array.isArray(activeList) ? activeList.length : 0;
    const signTaskCount = formattedActivities.length;
    const signTasks = formattedActivities.length > 0 ? [{
      course: {
        courseId: courseId,
        classId: classId,
        courseName: event.courseName || '未知课程',
        className: event.className || '未知班级',
        teacherName: event.teacherName || '未知教师',
        img: event.img || '/static/images/default-course.png'
      },
      activities: formattedActivities
    }] : []

    // 返回所有活动历史
    const returnData = {
      success: true,
      data: {
        signTasks,
        stats: {
          totalCourses: 1,
          checkedCourses: 1,
          successCount: formattedActivities.length > 0 ? 1 : 0,
          failedCount: formattedActivities.length > 0 ? 0 : 1,
          totalActivities,
          signTasks: signTaskCount
        },
        activeList // 新增，返回所有活动
      }
    }

    // 添加详细的日志
    console.log('formattedActivities:', formattedActivities)
    console.log('signTasks:', signTasks)
    console.log('activeList:', activeList)
    console.log('returnData:', returnData)

    return returnData
  } catch (error) {
    console.error('获取活动列表失败:', error)
    return {
      success: false,
      message: '获取活动列表失败: ' + error.message
    }
  }
} 