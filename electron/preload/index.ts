import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Service connection
  connect: () => ipcRenderer.invoke('service:connect'),
  disconnect: () => ipcRenderer.invoke('service:disconnect'),
  isConnected: () => ipcRenderer.invoke('service:isConnected'),
  getServiceStatus: () => ipcRenderer.invoke('service:getStatus'),

  // Service lifecycle
  startService: () => ipcRenderer.invoke('service:start'),
  stopService: () => ipcRenderer.invoke('service:stop'),
  restartService: () => ipcRenderer.invoke('service:restart'),

  // Claude communication
  sendCommand: (command: string) => ipcRenderer.send('claude:sendCommand', command),
  sendInput: (input: string) => ipcRenderer.send('claude:sendInput', input),
  requestStatus: () => ipcRenderer.send('claude:requestStatus'),
  requestHistory: (limit?: number) => ipcRenderer.send('claude:requestHistory', limit),

  // Memory operations
  requestMemoryStats: () => ipcRenderer.send('memory:requestStats'),
  requestFacts: (category?: string) => ipcRenderer.send('memory:requestFacts', category),
  addFact: (fact: string, category: string) => ipcRenderer.send('memory:addFact', fact, category),
  deleteFact: (id: number) => ipcRenderer.send('memory:deleteFact', id),
  requestConversations: (limit?: number) => ipcRenderer.send('memory:requestConversations', limit),
  requestMessages: (conversationId: string, limit?: number) => ipcRenderer.send('memory:requestMessages', conversationId, limit),

  // Reminder operations
  requestReminders: () => ipcRenderer.send('reminders:request'),
  addReminder: (message: string, time: string, channel?: string) => ipcRenderer.send('reminders:add', message, time, channel),
  cancelReminder: (id: number) => ipcRenderer.send('reminders:cancel', id),

  // Logs
  requestLogs: (lines?: number) => ipcRenderer.send('logs:request', lines),

  // Event listeners
  onClaudeOutput: (callback: (data: string) => void) => {
    const handler = (_: any, data: string) => callback(data);
    ipcRenderer.on('claude:output', handler);
    return () => ipcRenderer.removeListener('claude:output', handler);
  },

  onClaudeStatus: (callback: (status: any) => void) => {
    const handler = (_: any, status: any) => callback(status);
    ipcRenderer.on('claude:status', handler);
    return () => ipcRenderer.removeListener('claude:status', handler);
  },

  onClaudeReady: (callback: (ready: boolean) => void) => {
    const handler = (_: any, ready: boolean) => callback(ready);
    ipcRenderer.on('claude:ready', handler);
    return () => ipcRenderer.removeListener('claude:ready', handler);
  },

  onServiceConnected: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('service:connected', handler);
    return () => ipcRenderer.removeListener('service:connected', handler);
  },

  onServiceDisconnected: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('service:disconnected', handler);
    return () => ipcRenderer.removeListener('service:disconnected', handler);
  },

  // Data event listeners
  onMemoryStats: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('memory:stats', handler);
    return () => ipcRenderer.removeListener('memory:stats', handler);
  },

  onMemoryFacts: (callback: (data: any[]) => void) => {
    const handler = (_: any, data: any[]) => callback(data);
    ipcRenderer.on('memory:facts', handler);
    return () => ipcRenderer.removeListener('memory:facts', handler);
  },

  onFactAdded: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('memory:factAdded', handler);
    return () => ipcRenderer.removeListener('memory:factAdded', handler);
  },

  onFactDeleted: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('memory:factDeleted', handler);
    return () => ipcRenderer.removeListener('memory:factDeleted', handler);
  },

  onConversations: (callback: (data: any[]) => void) => {
    const handler = (_: any, data: any[]) => callback(data);
    ipcRenderer.on('memory:conversations', handler);
    return () => ipcRenderer.removeListener('memory:conversations', handler);
  },

  onMessages: (callback: (data: any[]) => void) => {
    const handler = (_: any, data: any[]) => callback(data);
    ipcRenderer.on('memory:messages', handler);
    return () => ipcRenderer.removeListener('memory:messages', handler);
  },

  onReminders: (callback: (data: any[]) => void) => {
    const handler = (_: any, data: any[]) => callback(data);
    ipcRenderer.on('reminders:list', handler);
    return () => ipcRenderer.removeListener('reminders:list', handler);
  },

  onReminderAdded: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('reminders:added', handler);
    return () => ipcRenderer.removeListener('reminders:added', handler);
  },

  onReminderCancelled: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data);
    ipcRenderer.on('reminders:cancelled', handler);
    return () => ipcRenderer.removeListener('reminders:cancelled', handler);
  },

  onLogs: (callback: (data: string) => void) => {
    const handler = (_: any, data: string) => callback(data);
    ipcRenderer.on('logs:content', handler);
    return () => ipcRenderer.removeListener('logs:content', handler);
  },

  onHistory: (callback: (data: string) => void) => {
    const handler = (_: any, data: string) => callback(data);
    ipcRenderer.on('history', handler);
    return () => ipcRenderer.removeListener('history', handler);
  }
});

// Type declarations for the exposed API
declare global {
  interface Window {
    electronAPI: {
      connect: () => Promise<{ success: boolean; error?: string }>;
      disconnect: () => Promise<{ success: boolean }>;
      isConnected: () => Promise<boolean>;
      getServiceStatus: () => Promise<{
        running: boolean;
        ready: boolean;
        pid?: number;
        port?: number;
        wsPort?: number;
      }>;
      startService: () => Promise<{ success: boolean }>;
      stopService: () => Promise<{ success: boolean }>;
      restartService: () => Promise<{ success: boolean }>;
      sendCommand: (command: string) => void;
      sendInput: (input: string) => void;
      requestStatus: () => void;
      requestHistory: (limit?: number) => void;
      requestMemoryStats: () => void;
      requestFacts: (category?: string) => void;
      addFact: (fact: string, category: string) => void;
      deleteFact: (id: number) => void;
      requestConversations: (limit?: number) => void;
      requestMessages: (conversationId: string, limit?: number) => void;
      requestReminders: () => void;
      addReminder: (message: string, time: string, channel?: string) => void;
      cancelReminder: (id: number) => void;
      requestLogs: (lines?: number) => void;
      onClaudeOutput: (callback: (data: string) => void) => () => void;
      onClaudeStatus: (callback: (status: any) => void) => () => void;
      onClaudeReady: (callback: (ready: boolean) => void) => () => void;
      onServiceConnected: (callback: () => void) => () => void;
      onServiceDisconnected: (callback: () => void) => () => void;
      onMemoryStats: (callback: (data: any) => void) => () => void;
      onMemoryFacts: (callback: (data: any[]) => void) => () => void;
      onFactAdded: (callback: (data: any) => void) => () => void;
      onFactDeleted: (callback: (data: any) => void) => () => void;
      onConversations: (callback: (data: any[]) => void) => () => void;
      onMessages: (callback: (data: any[]) => void) => () => void;
      onReminders: (callback: (data: any[]) => void) => () => void;
      onReminderAdded: (callback: (data: any) => void) => () => void;
      onReminderCancelled: (callback: (data: any) => void) => () => void;
      onLogs: (callback: (data: string) => void) => () => void;
      onHistory: (callback: (data: string) => void) => () => void;
    };
  }
}
