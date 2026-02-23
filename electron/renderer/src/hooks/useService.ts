import { useState, useEffect, useCallback } from 'react';

interface ServiceStatus {
  running: boolean;
  ready: boolean;
  pid?: number;
  port?: number;
  wsPort?: number;
  clients?: number;
  wsClients?: number;
}

export function useService() {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<ServiceStatus | null>(null);

  useEffect(() => {
    // Set up event listeners
    const unsubConnected = window.electronAPI.onServiceConnected(() => {
      setConnected(true);
      window.electronAPI.requestStatus();
    });

    const unsubDisconnected = window.electronAPI.onServiceDisconnected(() => {
      setConnected(false);
      setStatus(null);
    });

    const unsubStatus = window.electronAPI.onClaudeStatus((newStatus: ServiceStatus) => {
      setStatus(newStatus);
    });

    const unsubReady = window.electronAPI.onClaudeReady((ready: boolean) => {
      setStatus((prev) => prev ? { ...prev, ready } : { running: true, ready });
    });

    // Check initial connection status
    window.electronAPI.isConnected().then((isConn) => {
      setConnected(isConn);
      if (isConn) {
        window.electronAPI.requestStatus();
      }
    });

    return () => {
      unsubConnected();
      unsubDisconnected();
      unsubStatus();
      unsubReady();
    };
  }, []);

  const connect = useCallback(async () => {
    const result = await window.electronAPI.connect();
    if (result.success) {
      setConnected(true);
    }
    return result;
  }, []);

  const disconnect = useCallback(async () => {
    const result = await window.electronAPI.disconnect();
    if (result.success) {
      setConnected(false);
    }
    return result;
  }, []);

  const startService = useCallback(async () => {
    const result = await window.electronAPI.startService();
    if (result.success) {
      // Service started, connection will be established
    }
    return result;
  }, []);

  const stopService = useCallback(async () => {
    const result = await window.electronAPI.stopService();
    if (result.success) {
      setConnected(false);
      setStatus(null);
    }
    return result;
  }, []);

  const restartService = useCallback(async () => {
    return window.electronAPI.restartService();
  }, []);

  const refreshStatus = useCallback(async () => {
    const localStatus = await window.electronAPI.getServiceStatus();
    setStatus(localStatus);
    if (connected) {
      window.electronAPI.requestStatus();
    }
    return localStatus;
  }, [connected]);

  return {
    connected,
    status,
    connect,
    disconnect,
    startService,
    stopService,
    restartService,
    refreshStatus
  };
}
