/**
 * 业务错误类
 * 区分业务错误和系统错误，避免内部细节泄露给客户端
 */
class BusinessError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'BusinessError';
    this.code = code || 'BUSINESS_ERROR';
  }
}

module.exports = { BusinessError };
