import React, { useEffect, useState } from 'react';
import { useService } from '../hooks/useService';
import { StatusPanel } from '../components/service/StatusPanel';
import { LogViewer } from '../components/service/LogViewer';

export function ServicePage() {
  const {
    connected,
    status,
    startService,
    stopService,
    restartService,
    refreshStatus
  } = useService();

  const [logs, setLogs] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    // Set up log listener
    const unsubLogs = window.electronAPI.onLogs((data: string) => {
      setLogs(data);
    });

    // Fetch logs initially and periodically
    const fetchLogs = () => {
      window.electronAPI.requestLogs(200);
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);

    return () => {
      unsubLogs();
      clearInterval(interval);
    };
  }, []);

  const handleStart = async () => {
    setActionLoading('start');
    await startService();
    setActionLoading(null);
  };

  const handleStop = async () => {
    setActionLoading('stop');
    await stopService();
    setActionLoading(null);
  };

  const handleRestart = async () => {
    setActionLoading('restart');
    await restartService();
    setActionLoading(null);
  };

  const handleRefresh = async () => {
    setActionLoading('refresh');
    await refreshStatus();
    window.electronAPI.requestLogs(200);
    setActionLoading(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-white">Service Control</h1>
          <p className="text-sm text-gray-400">
            Manage the Claude Always Running service
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={actionLoading !== null}
          className="px-4 py-2 text-sm bg-dark-300 text-gray-300 rounded-lg hover:bg-dark-100 disabled:opacity-50 transition-colors"
        >
          {actionLoading === 'refresh' ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Status Panel */}
        <StatusPanel
          connected={connected}
          status={status}
          onStart={handleStart}
          onStop={handleStop}
          onRestart={handleRestart}
          actionLoading={actionLoading}
        />

        {/* Log Viewer */}
        <div className="mt-6">
          <h2 className="text-lg font-medium text-white mb-4">Service Logs</h2>
          <LogViewer logs={logs} />
        </div>
      </div>
    </div>
  );
}
