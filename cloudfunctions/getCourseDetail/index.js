const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { id } = event
  try {
    const { data } = await db.collection('courses').where({ id }).get()
    if (data.length > 0) {
      return { success: true, data: data[0] }
    } else {
      return { success: false, message: '未找到课程' }
    }
  } catch (error) {
    return { success: false, message: error.message }
  }
} 