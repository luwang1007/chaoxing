// 云函数入口文件
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const { username } = event;

  try {
    // 检查账号是否存在
    const { data } = await db.collection('credentials')
      .where({ username: username })
      .get();

    if (data.length === 0) {
      return {
        success: false,
        message: '账号不存在'
      };
    }

    // 删除账号
    await db.collection('credentials')
      .where({ username: username })
      .remove();

    return {
      success: true,
      message: '删除成功'
    };
  } catch (error) {
    console.error('删除凭证失败:', error);
    return {
      success: false,
      message: '删除失败'
    };
  }
} 