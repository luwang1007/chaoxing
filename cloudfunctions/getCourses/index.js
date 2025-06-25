const cloud = require('wx-server-sdk')
const axios = require('axios')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 格式化 cookies
function formatCookies(cookies) {
  if (!cookies) return ''
  if (typeof cookies === 'string') return cookies
  if (Array.isArray(cookies)) {
    return cookies.map(cookie => {
      if (typeof cookie === 'string') return cookie
      if (cookie.key && cookie.value) return `${cookie.key}=${cookie.value}`
      return ''
    }).filter(Boolean).join('; ')
  }
  return ''
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { username, password } = event
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  console.log('开始获取课程，用户信息:', { username, openid })

  const usernameStr = String(username).trim();
  const nameStr = String(event.name || '').trim();

  try {
    // 查找主账号凭证，查找条件为 { username, isMainAccount: true }
    const { data: credentials } = await db.collection('credentials')
      .where({ username: usernameStr, isMainAccount: true })
      .get();

    console.log('获取到的用户凭证:', credentials);

    if (credentials.length === 0) {
      console.log('未找到主账号凭证');
      return {
        success: false,
        message: '未找到主账号凭证'
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

    const formattedCookies = formatCookies(cookies)
    console.log('格式化后的 cookies:', formattedCookies)

    if (!formattedCookies) {
      throw new Error('无效的 cookies')
    }

    console.log('开始调用超星学习通 API')
    // 调用超星学习通 API 获取课程列表
    const response = await axios.get('https://mooc1-api.chaoxing.com/mycourse/backclazzdata', {
      params: {
        'view': 'json',
        'rss': '1'
      },
      headers: {
        'Cookie': formattedCookies,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      },
      withCredentials: true
    })

    console.log('API 响应状态码:', response.status)
    console.log('API 响应头:', response.headers)
    console.log('API 响应数据:', JSON.stringify(response.data, null, 2))

    if (!response.data) {
      throw new Error('API 返回数据为空')
    }

    if (!response.data.result) {
      throw new Error('获取课程失败: ' + (response.data.msg || '未知错误'))
    }

    if (!Array.isArray(response.data.channelList)) {
      console.log('API 返回的数据结构:', response.data)
      throw new Error('API 返回的数据格式不正确')
    }

    // 处理课程数据
    const courses = response.data.channelList
      .filter(item => item && item.cataName === '课程')
      .map(item => {
        try {
          if (!item || !item.content) {
            console.log('发现无效的课程数据:', item)
            return null
          }

          const content = item.content
          const course = content.course?.data?.[0]

          return {
            courseName: course?.name || content.name || '',
            className: course ? content.name : (content.clazz?.[0]?.clazzName || ''),
            teacherName: course?.teacherfactor || content.teacherfactor || '',
            courseId: course?.id || content.id || '',
            classId: course ? item.key : (content.clazz?.[0]?.clazzId || ''),
            folder: (response.data.channelList.find(i => i.catalogId === item.cfid) || {}).content?.folderName || null,
            isTeach: !content.course,
            img: course?.imageurl || content.imageurl || '/static/images/default-course.png'
          }
        } catch (error) {
          console.error('处理课程数据时出错:', error, item)
          return null
        }
      })
      .filter(Boolean) // 过滤掉无效的课程数据

    console.log('处理后的课程数据:', courses)

    return {
      success: true,
      data: courses
    }
  } catch (error) {
    console.error('获取课程失败:', error)
    return {
      success: false,
      message: '获取课程失败: ' + error.message
    }
  }
} 