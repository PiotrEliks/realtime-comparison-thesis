export interface ChatMetrics {
  // Latencja
  messageLatencies: number[];       // Czas wysłania→otrzymania każdej wiadomości
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  
  // Połączenie
  connectionUptime: number;         // % czasu online
  connectionStartTime: number;
  totalDisconnects: number;
  reconnectAttempts: number;
  
  // Przepustowość
  messagesSent: number;
  messagesReceived: number;
  totalBytesReceived: number;
  totalBytesSent: number;
  
  // Wydajność
  messagesPerSecond: number;
  peakMessagesPerSecond: number;
  
  // Błędy
  failedMessages: number;
  errors: Array<{ timestamp: number; type: string; message: string }>;
}

export class MetricsCollector {
  private metrics: ChatMetrics;
  private messageTimestamps: Map<string, number> = new Map();
  private messagesInLastSecond: number[] = [];
  private lastSecondTimestamp: number = Date.now();

  constructor() {
    this.metrics = {
      messageLatencies: [],
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      connectionUptime: 100,
      connectionStartTime: Date.now(),
      totalDisconnects: 0,
      reconnectAttempts: 0,
      messagesSent: 0,
      messagesReceived: 0,
      totalBytesReceived: 0,
      totalBytesSent: 0,
      messagesPerSecond: 0,
      peakMessagesPerSecond: 0,
      failedMessages: 0,
      errors: []
    };
  }

  // Śledzenie wysłania wiadomości
  trackMessageSent(messageId: string, content: string) {
    this.messageTimestamps.set(messageId, Date.now());
    this.metrics.messagesSent++;
    this.metrics.totalBytesSent += new Blob([content]).size;
    this.updateMessagesPerSecond();
  }

  // Śledzenie otrzymania wiadomości
  trackMessageReceived(messageId: string, content: string) {
    const sendTime = this.messageTimestamps.get(messageId);
    if (sendTime) {
      const latency = Date.now() - sendTime;
      this.metrics.messageLatencies.push(latency);
      this.metrics.minLatency = Math.min(this.metrics.minLatency, latency);
      this.metrics.maxLatency = Math.max(this.metrics.maxLatency, latency);
      this.metrics.averageLatency = 
        this.metrics.messageLatencies.reduce((a, b) => a + b, 0) / this.metrics.messageLatencies.length;
      this.messageTimestamps.delete(messageId);
    }
    
    this.metrics.messagesReceived++;
    this.metrics.totalBytesReceived += new Blob([content]).size;
    this.updateMessagesPerSecond();
  }

  // Śledzenie połączenia
  trackDisconnect() {
    this.metrics.totalDisconnects++;
    this.updateUptime();
  }

  trackReconnect() {
    this.metrics.reconnectAttempts++;
  }

  // Śledzenie błędów
  trackError(type: string, message: string) {
    this.metrics.errors.push({
      timestamp: Date.now(),
      type,
      message
    });
    
    if (type === 'message_failed') {
      this.metrics.failedMessages++;
    }
  }

  // Obliczanie wiadomości na sekundę
  private updateMessagesPerSecond() {
    const now = Date.now();
    const secondAgo = now - 1000;
    
    // Usuń stare timestampy
    this.messagesInLastSecond = this.messagesInLastSecond.filter(ts => ts > secondAgo);
    this.messagesInLastSecond.push(now);
    
    this.metrics.messagesPerSecond = this.messagesInLastSecond.length;
    this.metrics.peakMessagesPerSecond = Math.max(
      this.metrics.peakMessagesPerSecond,
      this.metrics.messagesPerSecond
    );
  }

  // Obliczanie uptime
  private updateUptime() {
    const totalTime = Date.now() - this.metrics.connectionStartTime;
    const disconnectTime = this.metrics.totalDisconnects * 1000; // Zakładamy 1s na disconnect
    this.metrics.connectionUptime = ((totalTime - disconnectTime) / totalTime) * 100;
  }

  // Eksport metryk
  getMetrics(): ChatMetrics {
    this.updateUptime();
    return { ...this.metrics };
  }

  // Eksport do CSV
  exportToCSV(): string {
    const m = this.getMetrics();
    const csv = [
      'Metric,Value',
      `Average Latency (ms),${m.averageLatency.toFixed(2)}`,
      `Min Latency (ms),${m.minLatency === Infinity ? 0 : m.minLatency}`,
      `Max Latency (ms),${m.maxLatency}`,
      `Connection Uptime (%),${m.connectionUptime.toFixed(2)}`,
      `Total Disconnects,${m.totalDisconnects}`,
      `Reconnect Attempts,${m.reconnectAttempts}`,
      `Messages Sent,${m.messagesSent}`,
      `Messages Received,${m.messagesReceived}`,
      `Total Bytes Sent,${m.totalBytesSent}`,
      `Total Bytes Received,${m.totalBytesReceived}`,
      `Messages Per Second,${m.messagesPerSecond}`,
      `Peak Messages Per Second,${m.peakMessagesPerSecond}`,
      `Failed Messages,${m.failedMessages}`,
      `Total Errors,${m.errors.length}`
    ].join('\n');
    
    return csv;
  }

  // Reset metryk
  reset() {
    this.metrics = {
      messageLatencies: [],
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      connectionUptime: 100,
      connectionStartTime: Date.now(),
      totalDisconnects: 0,
      reconnectAttempts: 0,
      messagesSent: 0,
      messagesReceived: 0,
      totalBytesReceived: 0,
      totalBytesSent: 0,
      messagesPerSecond: 0,
      peakMessagesPerSecond: 0,
      failedMessages: 0,
      errors: []
    };
    this.messageTimestamps.clear();
    this.messagesInLastSecond = [];
  }
}