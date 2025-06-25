const cloud = require('wx-server-sdk');
const crypto = require('crypto');

// 初始化云开发环境
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// 加密密钥 - 使用PBKDF2生成32字节密钥
const ENCRYPT_KEY = crypto.pbkdf2Sync('your-secret-key', 'salt', 100000, 32, 'sha256');
const IV_LENGTH = 16;

// 加密函数
function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPT_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

// 解密函数
function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPT_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, text } = event;
  
  switch (action) {
    case 'encrypt':
      return {
        success: true,
        data: encrypt(text)
      };
    case 'decrypt':
      return {
        success: true,
        data: decrypt(text)
      };
    case 'getUID': {
      const axios = require('axios');
      const cookies = event.cookies;
      // 1. 先从 cookies 里提取 UID
      const match = cookies.match(/(?:_uid|UID)=(\d{5,})/i);
      if (match) {
        return { success: true, uid: match[1] };
      }
      // 2. 如果 cookies 没有，再请求页面（可选）
      try {
        const response = await axios.get('https://i.chaoxing.com/base/home', {
          headers: {
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0'
          }
        });
        // 这里可以加页面内容的正则，但一般第一步就能拿到
        return { success: false, message: '未能解析到UID' };
      } catch (err) {
        return { success: false, message: '请求失败: ' + err.message };
      }
    }
    default:
      return {
        success: false,
        message: '未知操作'
      };
  }
}; 