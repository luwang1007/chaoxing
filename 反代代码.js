export default {
    async fetch(request) {
      const url = new URL(request.url);
      const targetHost = 'https://mobilelearn.chaoxing.com';
  
      // 路径映射
      let apiPath = url.pathname;
      if (apiPath === '/preSign') {
        apiPath = '/newsign/preSign';
      } else if (apiPath === '/submitEnc') {
        apiPath = '/newsign/submitEnc';
      }
      // '/pptSign/stuSignajax' 保持原样
      const targetUrl = targetHost + apiPath + url.search;
  
      // 保留所有原始请求头
      const newHeaders = new Headers(request.headers);
      
      // 只修改必要的请求头
      newHeaders.set('Accept-Encoding', 'identity');
      newHeaders.set('Origin', 'https://mobilelearn.chaoxing.com');
      newHeaders.set('Referer', 'https://mobilelearn.chaoxing.com/newsign/sign');
      newHeaders.set('X-Requested-With', 'XMLHttpRequest');
      
      // 确保 Content-Type 正确
      if (request.method === 'POST' && !newHeaders.has('Content-Type')) {
        newHeaders.set('Content-Type', 'application/x-www-form-urlencoded');
      }
  
      const init = {
        method: request.method,
        headers: newHeaders,
        // GET 不带 body，POST 则直接透传调用端的 body
        body: request.method === 'GET' ? null : request.body,
        redirect: 'follow'
      };
  
      try {
        const upstreamResponse = await fetch(targetUrl, init);
        
        // 创建一个新的响应，保留所有响应头
        const responseHeaders = new Headers(upstreamResponse.headers);
        
        // 确保响应不会被压缩
        responseHeaders.set('Content-Encoding', 'identity');
        
        // 返回响应
        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          statusText: upstreamResponse.statusText,
          headers: responseHeaders
        });
      } catch (err) {
        console.error('反代请求失败:', err);
        return new Response(JSON.stringify({
          error: true,
          message: err.message,
          stack: err.stack
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
  }
  