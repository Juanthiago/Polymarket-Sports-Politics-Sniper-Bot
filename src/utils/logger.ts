function stamp(): string {
    return new Date().toISOString();
}

const logger = {
    info(...args: unknown[]): void {
        console.log(`[${stamp()}] [INFO]`, ...args);
    },
    warn(...args: unknown[]): void {
        console.warn(`[${stamp()}] [WARN]`, ...args);
    },
    error(...args: unknown[]): void {
        console.error(`[${stamp()}] [ERROR]`, ...args);
    },
};

export default logger;
