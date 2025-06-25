const log = wx.getRealtimeLogManager();

module.exports = {
  debug(...args) {
    if (!log) return;
    log.debug.apply(log, args);
    console.info(...args);
  },
  info(...args) {
    if (!log) return;
    log.info.apply(log, args);
    console.info(...args);
  },
  error(...args) {
    if (!log) return;
    log.error.apply(log, args);
    console.error(...args);
  }
}; 