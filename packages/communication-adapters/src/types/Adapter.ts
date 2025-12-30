export interface CommunicationAdapter {
  connect(url: string, config?: any): Promise<void>;
  disconnect(): void;
  send(message: Message): void;
  onMessage(callback: (message: Message) => void): void;
  onStatusChange(callback: (status: ConnectionStatus) => void): void;
  getLatency(): number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface Message {
  type: string;
  payload: any;
  timestamp?: number;
  userId?: string;
}
