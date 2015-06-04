var MAX_REQ_SIZE = 128 * 1024;
var MAX_RES_SIZE = 256 * 1024;
var TIMEOUT = 10000;
var MAX_LENGTH = 256;
var count = 0;
var ids = [];
var data = {};
var proxy, binded, timeout, util;

function disable() {
	proxy.removeListener('request', handleRequest);
	binded = false;
}

function passThrough(chunk, encoding, callback) {
	callback(null, chunk);
}

function get() {
	!binded && proxy.on('request', handleRequest);
	binded = true;
	clearTimeout(timeout);
	timeout = setTimeout(disable, TIMEOUT);
	
	return [];
}

function handleRequest(req) {
	var startTime = Date.now() - (req.dnsTime || 0);
	var id = startTime + '-' + ++count;
	var reqData = {
			dnsTime: req.dnsTime,
			method: req.method || 'GET', 
			httpVersion: req.httpVersion || '1.1',
            host: req.host || '127.0.0.1',
            headers: req.headers
		};
	var resData = {};
	
	data[id] = {
			url: req.url,
			startTime: startTime,
			req: reqData,
			res: resData
	};
	
	ids.push(id);
	if (ids.length > MAX_LENGTH) {
		delete data[ids.shift()];
	}
	
	req.on('response', handleResponse);
	req.on('error', function(err) {
		reqData.state = 'error';
		reqData.body = err && err.stack;
		reqData.requestTime = Date.now() - startTime;
		req.removeListener('response', handleResponse);
		req._transform = passThrough;
	});
	
	var reqBody;
	
	if (util.hasRequestBody(req)) {
		reqBody = false;
	}
	req._transform = function(chunk, encoding, callback) {
		
		if (chunk && (reqBody || reqBody === false)) {
			reqBody = reqBody ? Buffer.concat([reqBody, chunk]) : chunk;
		}
		
		if (reqBody && reqBody.length > MAX_REQ_SIZE) {
			reqBody = null;
		}
		
		if (!chunk) {
			reqData.requestTime = Date.now() - startTime;
			reqData.state = 'close';
			reqData.body = reqBody;
		}
		
		callback(null, chunk);
	};
	
	
	function handleResponse(res) {
		resData.responseTime = Date.now() - startTime;
		
		var resBody;
		var contentType = util.getContentType(res.headers);
		if (contentType && contentType != 'IMG' && util.hasBody(res)) {
			resBody = false;
		}

		res._transform = function(chunk, encoding, callback) {
			if (chunk && (resBody || resBody === false)) {
				resBody = resBody ? Buffer.concat([resBody, chunk]) : chunk;
			}
			
			if (resBody && resBody.length > MAX_RES_SIZE) {
				resBody = null;
			}
			
			if (!chunk) {
				resData.totalTime = Date.now() - startTime;
				resData.state = 'close';
				resData.body = resBody;
			}
			
			callback(null, chunk);
		};
		
		res.on('error', function(err) {
			resData.state = 'error';
			resData.body = err && err.stack;
			resData.totalTime = Date.now() - startTime;
			res._transform = passThrough;
		});
	}
	
}

module.exports = function init(_proxy) {
	proxy = _proxy;
	util = proxy.util;
	proxy.on('request', handleRequest);
	module.exports = get;
};