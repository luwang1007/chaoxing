const log = require('./log')
const util = require('./util')

/**
 * 处理响应
 * @param {Object} res 响应对象
 * @returns {Object} 处理后的响应
 */
const handleResponse = (res) => {
  return res
}

/**
 * 发送请求
 * @param {string} url 请求地址
 * @param {Object} data 请求数据
 * @param {Object} cookies cookies
 * @returns {Promise<Object>} 响应数据
 */
const request = async (url, data = {}, cookies = {}) => {
  try {
    const res = await wx.request({
      url,
      data,
      header: {
        'Cookie': formatCookies(cookies),
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.20(0x18001442) NetType/WIFI Language/zh_CN',
        'Referer': 'https://mobilelearn.chaoxing.com/',
        'Origin': 'https://mobilelearn.chaoxing.com'
      },
      method: 'GET'
    })
    return handleResponse(res)
  } catch (error) {
    log.error('请求失败:', error)
    throw error
  }
}

/**
 * 格式化 cookies
 * @param {Object} cookies cookies 对象
 * @returns {string} 格式化后的 cookies 字符串
 */
const formatCookies = (cookies) => {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ')
}

/**
 * 发送 GET 请求
 * @param {string} url 请求地址
 * @param {Object} data 请求参数
 * @param {Object} cookies cookies
 * @param {number} timeout 超时时间
 * @param {boolean} showLoading 是否显示加载提示
 * @param {Object} extraHeaders 额外的请求头
 * @returns {Promise<Object>} 响应数据
 */
const get = (url, data = {}, cookies = {}, timeout = 15000, showLoading = true, extraHeaders = {}) => {
  return request('GET', url, data, cookies, timeout, showLoading, extraHeaders)
}

/**
 * 发送 GET 请求并返回文本
 * @param {string} url 请求地址
 * @param {Object} data 请求参数
 * @param {Object} cookies cookies
 * @param {number} timeout 超时时间
 * @param {boolean} showLoading 是否显示加载提示
 * @param {Object} extraHeaders 额外的请求头
 * @returns {Promise<string>} 响应文本
 */
const getText = (url, data = {}, cookies = {}, timeout = 15000, showLoading = true, extraHeaders = {}) => {
  return request('GET', url, data, cookies, timeout, showLoading, extraHeaders)
}

/**
 * 发送 POST 请求
 * @param {string} url 请求地址
 * @param {Object} data 请求数据
 * @param {Object} cookies cookies
 * @param {number} timeout 超时时间
 * @param {boolean} showLoading 是否显示加载提示
 * @param {Object} extraHeaders 额外的请求头
 * @returns {Promise<Object>} 响应数据
 */
const post = (url, data = {}, cookies = {}, timeout = 15000, showLoading = true, extraHeaders = {}) => {
  return request('POST', url, data, cookies, timeout, showLoading, extraHeaders)
}

/**
 * 解析返回的cookies
 * @param {string[]} cookieList wx.request返回的cookies列表
 */
const parseCookie = (cookieList = []) => {
  let cookies = {}
  for (let i = 0; i < cookieList.length; i++) {
    const parts = cookieList[i].split(';')
    const nameValue = parts[0].split('=')
    const name = nameValue[0].trim()
    const value = decodeURIComponent(nameValue[1])
    cookies[name] = value
  }
  return cookies
}

/**
 * 把cookies列表编码成header中的格式
 * @param {string[]} cookieObject 编码cookies
 */
const stringifyCookie = (cookieObject = {}) => {
  return Object.entries(cookieObject).map(
    ([name, value]) => `${name}=${encodeURIComponent(value)}`).join(';')
}

module.exports = {
  request,
  get,
  getText,
  post
} 