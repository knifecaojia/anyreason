// Auto-patch console methods to include timestamps in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  function formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').replace('Z', '');
  }

  function patchConsole(
    method: keyof typeof originalConsole,
    original: (...args: unknown[]) => void
  ) {
    return function (...args: unknown[]) {
      const timestamp = formatTimestamp();
      original(`[${timestamp}]`, ...args);
    };
  }

  console.log = patchConsole('log', originalConsole.log);
  console.info = patchConsole('info', originalConsole.info);
  console.warn = patchConsole('warn', originalConsole.warn);
  console.error = patchConsole('error', originalConsole.error);
  console.debug = patchConsole('debug', originalConsole.debug);
}
