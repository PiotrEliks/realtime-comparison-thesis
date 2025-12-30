import { CommunicationAdapter, Message, ConnectionStatus } from '../types/Adapter';

export class WebSocketAdapter implements CommunicationAdapter {
  private ws: WebSocket | null = null;
  private messageCallback: ((message: Message) => void) | null = null;
  private statusCallback: ((status: ConnectionStatus) => void) | null = null;
  private latency: number = 0;
  private pingInterval: NodeJS.Timeout | null = null;

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        this.statusCallback?.('connected');
        this.startPing();
        resolve();
      };

      this.ws.onerror = () => {
        this.statusCallback?.('error');
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onclose = () => {
        this.statusCallback?.('disconnected');
        this.stopPing();
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        if (message.type === 'PONG') {
          this.latency = Date.now() - message.timestamp;
        } else {
          this.messageCallback?.(message);
        }
      };
    });
  }

  disconnect(): void {
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }

  send(message: Message): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  onMessage(callback: (message: Message) => void): void {
    this.messageCallback = callback;
  }

  onStatusChange(callback: (status: ConnectionStatus) => void): void {
    this.statusCallback = callback;
  }

  getLatency(): number {
    return this.latency;
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send({ type: 'PING', payload: {}, timestamp: Date.now() });
    }, 2000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
