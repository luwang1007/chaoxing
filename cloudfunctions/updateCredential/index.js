const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { username, password, address, name, is555 } = event
  try {
    // 构建要更新的数据
    const updateData = {}
    if (password !== undefined) updateData.password = password
    if (address !== undefined) updateData.address = address
    if (name !== undefined) updateData.name = name
    if (is555 !== undefined) updateData.is555 = is555

    console.log('updateCredential where:', { username });
    console.log('updateCredential updateData:', updateData);

    if (Object.keys(updateData).length === 0) {
      return { success: false, message: '无可更新字段' }
    }

    const res = await db.collection('credentials')
      .where({ username })
      .update({ data: updateData })

    console.log('updateCredential update result:', res);

    if (res.stats.updated > 0) {
      return { success: true, updated: res.stats.updated }
    } else {
      return { success: false, message: '未找到账号或未修改', updated: res.stats.updated }
    }
  } catch (error) {
    console.error('updateCredential error:', error);
    return { success: false, message: error.message }
  }
} 