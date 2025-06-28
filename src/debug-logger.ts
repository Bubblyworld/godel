/**
 * Debug logging system for the theorem prover.
 * Controlled by environment variables:
 * - DEBUG_PROVER=true to enable debug logging
 * - DEBUG_PROVER_LEVEL=TRACE|DEBUG|INFO (default: DEBUG)
 * - DEBUG_PROVER_FILTER=subsumption,resolution,... (comma-separated components)
 */

export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
}

export enum LogComponent {
  CLAUSE_MGMT = 'CLAUSE_MGMT',
  CLAUSE_SELECT = 'CLAUSE_SELECT',
  SUBSUMPTION = 'SUBSUMPTION',
  RESOLUTION = 'RESOLUTION',
  FACTORING = 'FACTORING',
  SCHEMAS = 'SCHEMAS',
  CNF = 'CNF',
  PROVER = 'PROVER',
  PRIORITY = 'PRIORITY',
}

class DebugLogger {
  private enabled: boolean;
  private level: LogLevel;
  private componentFilter: Set<string> | null;

  constructor() {
    this.enabled = process.env.DEBUG_PROVER === 'true';

    // Parse log level
    const levelStr = process.env.DEBUG_PROVER_LEVEL || 'DEBUG';
    this.level = LogLevel[levelStr as keyof typeof LogLevel] ?? LogLevel.DEBUG;

    // Parse component filter
    const filterStr = process.env.DEBUG_PROVER_FILTER;
    if (filterStr) {
      this.componentFilter = new Set(filterStr.split(',').map((s) => s.trim()));
    } else {
      this.componentFilter = null; // null means log all components
    }
  }

  private shouldLog(level: LogLevel, component: LogComponent): boolean {
    if (!this.enabled) return false;
    if (level < this.level) return false;
    if (this.componentFilter && !this.componentFilter.has(component))
      return false;
    return true;
  }

  private formatMessage(
    level: LogLevel,
    component: LogComponent,
    message: string
  ): string {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    return `[${timestamp}] [${levelStr}] [${component}] ${message}`;
  }

  trace(component: LogComponent, message: string): void {
    if (this.shouldLog(LogLevel.TRACE, component)) {
      console.log(this.formatMessage(LogLevel.TRACE, component, message));
    }
  }

  debug(component: LogComponent, message: string): void {
    if (this.shouldLog(LogLevel.DEBUG, component)) {
      console.log(this.formatMessage(LogLevel.DEBUG, component, message));
    }
  }

  info(component: LogComponent, message: string): void {
    if (this.shouldLog(LogLevel.INFO, component)) {
      console.log(this.formatMessage(LogLevel.INFO, component, message));
    }
  }

  // Utility method to log clause details
  logClause(
    component: LogComponent,
    level: LogLevel,
    prefix: string,
    clause: any,
    renderFn?: () => string
  ): void {
    if (!this.shouldLog(level, component)) return;

    let message = prefix;
    if (clause.id !== undefined) {
      message += ` #${clause.id}`;
    }
    if (clause.priority !== undefined) {
      message += ` (priority: ${clause.priority.toFixed(2)})`;
    }
    if (renderFn) {
      message += `: ${renderFn()}`;
    }

    this.log(level, component, message);
  }

  private log(level: LogLevel, component: LogComponent, message: string): void {
    switch (level) {
      case LogLevel.TRACE:
        this.trace(component, message);
        break;
      case LogLevel.DEBUG:
        this.debug(component, message);
        break;
      case LogLevel.INFO:
        this.info(component, message);
        break;
    }
  }
}

// Singleton instance
export const debugLogger = new DebugLogger();

// Convenience exports
export const { trace, debug, info } = {
  trace: debugLogger.trace.bind(debugLogger),
  debug: debugLogger.debug.bind(debugLogger),
  info: debugLogger.info.bind(debugLogger),
};

export const logClause = debugLogger.logClause.bind(debugLogger);
