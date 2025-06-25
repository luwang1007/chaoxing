const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    // 假设通知消息存储在 notifications 集合
    const { data } = await db.collection('notifications').get()
    return { success: true, data }
  } catch (error) {
    return { success: false, message: error.message }
  }
} 