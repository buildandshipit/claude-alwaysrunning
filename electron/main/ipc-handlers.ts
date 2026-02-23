import { ipcMain } from 'electron';
import { ServiceBridge } from './service-bridge';

export function setupIpcHandlers(bridge: ServiceBridge): void {
  // Connection
  ipcMain.handle('service:connect', async () => {
    try {
      await bridge.connect();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('service:disconnect', () => {
    bridge.disconnect();
    return { success: true };
  });

  ipcMain.handle('service:isConnected', () => {
    return bridge.isConnected();
  });

  ipcMain.handle('service:getStatus', () => {
    return bridge.getServiceStatus();
  });

  // Service lifecycle
  ipcMain.handle('service:start', async () => {
    const success = await bridge.startService();
    return { success };
  });

  ipcMain.handle('service:stop', async () => {
    const success = await bridge.stopService();
    return { success };
  });

  ipcMain.handle('service:restart', async () => {
    const success = await bridge.restartService();
    return { success };
  });

  // Claude communication
  ipcMain.on('claude:sendCommand', (_, command: string) => {
    bridge.sendCommand(command);
  });

  ipcMain.on('claude:sendInput', (_, input: string) => {
    bridge.sendInput(input);
  });

  ipcMain.on('claude:requestStatus', () => {
    bridge.requestStatus();
  });

  ipcMain.on('claude:requestHistory', (_, limit?: number) => {
    bridge.requestHistory(limit);
  });

  // Memory operations
  ipcMain.on('memory:requestStats', () => {
    bridge.requestMemoryStats();
  });

  ipcMain.on('memory:requestFacts', (_, category?: string) => {
    bridge.requestFacts(category);
  });

  ipcMain.on('memory:addFact', (_, fact: string, category: string) => {
    bridge.addFact(fact, category);
  });

  ipcMain.on('memory:deleteFact', (_, id: number) => {
    bridge.deleteFact(id);
  });

  ipcMain.on('memory:requestConversations', (_, limit?: number) => {
    bridge.requestConversations(limit);
  });

  ipcMain.on('memory:requestMessages', (_, conversationId: string, limit?: number) => {
    bridge.requestMessages(conversationId, limit);
  });

  // Reminder operations
  ipcMain.on('reminders:request', () => {
    bridge.requestReminders();
  });

  ipcMain.on('reminders:add', (_, message: string, time: string, channel?: string) => {
    bridge.addReminder(message, time, channel);
  });

  ipcMain.on('reminders:cancel', (_, id: number) => {
    bridge.cancelReminder(id);
  });

  // Logs
  ipcMain.on('logs:request', (_, lines?: number) => {
    bridge.requestLogs(lines);
  });
}
