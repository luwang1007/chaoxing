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

    // 使用事务处理主账号状态更新
    const transaction = await db.startTransaction();
    try {
      // 更新其他账号的 isMainAccount 状态
      await transaction.collection('credentials')
        .where({ _id: db.command.neq(data[0]._id) })
        .update({
          data: {
            isMainAccount: false,
            updateTime: db.serverDate()
          }
        });

      // 更新目标账号的 isMainAccount 状态
      await transaction.collection('credentials')
        .where({
          _id: data[0]._id
        })
        .update({
          data: {
            isMainAccount: true,
            updateTime: db.serverDate()
          }
        });

      // 提交事务
      await transaction.commit();

      return {
        success: true,
        message: '设置主账号成功'
      };
    } catch (error) {
      // 回滚事务
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('设置主账号失败:', error);
    return {
      success: false,
      message: '设置主账号失败'
    };
  }
} 