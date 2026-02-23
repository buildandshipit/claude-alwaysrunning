import React from 'react';

interface ServiceStatus {
  running: boolean;
  ready: boolean;
  pid?: number;
  port?: number;
  wsPort?: number;
  clients?: number;
  wsClients?: number;
  restarts?: number;
  queuedCommands?: number;
}

interface StatusPanelProps {
  connected: boolean;
  status: ServiceStatus | null;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  actionLoading: string | null;
}

export function StatusPanel({
  connected,
  status,
  onStart,
  onStop,
  onRestart,
  actionLoading
}: StatusPanelProps) {
  const isRunning = status?.running ?? false;

  return (
    <div className="bg-dark-300 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className={`w-4 h-4 rounded-full ${
              connected
                ? status?.ready
                  ? 'bg-green-500'
                  : 'bg-yellow-500 status-pulse'
                : isRunning
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
          />
          <div>
            <h3 className="text-lg font-medium text-white">
              {connected
                ? status?.ready
                  ? 'Service Running'
                  : 'Starting Up...'
                : isRunning
                ? 'Connecting...'
                : 'Service Stopped'}
            </h3>
            <p className="text-sm text-gray-400">
              {connected
                ? `Connected via WebSocket (port ${status?.wsPort || 3378})`
                : isRunning
                ? 'Service is running but not connected'
                : 'Service is not running'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={onStart}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 transition-colors"
            >
              {actionLoading === 'start' ? 'Starting...' : 'Start'}
            </button>
          ) : (
            <>
              <button
                onClick={onRestart}
                disabled={actionLoading !== null}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-500 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'restart' ? 'Restarting...' : 'Restart'}
              </button>
              <button
                onClick={onStop}
                disabled={actionLoading !== null}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Status details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatusCard
          label="PID"
          value={status?.pid?.toString() || '-'}
          icon="🔢"
        />
        <StatusCard
          label="TCP Port"
          value={status?.port?.toString() || '-'}
          icon="🔌"
        />
        <StatusCard
          label="WebSocket Port"
          value={status?.wsPort?.toString() || '-'}
          icon="🌐"
        />
        <StatusCard
          label="Connected Clients"
          value={
            status
              ? `${(status.clients || 0) + (status.wsClients || 0)}`
              : '-'
          }
          icon="👥"
        />
        <StatusCard
          label="Restarts"
          value={status?.restarts?.toString() || '0'}
          icon="🔄"
        />
        <StatusCard
          label="Queued Commands"
          value={status?.queuedCommands?.toString() || '0'}
          icon="📋"
        />
        <StatusCard
          label="Claude Ready"
          value={status?.ready ? 'Yes' : 'No'}
          icon={status?.ready ? '✅' : '⏳'}
        />
        <StatusCard
          label="Connection"
          value={connected ? 'Connected' : 'Disconnected'}
          icon={connected ? '🔗' : '🔓'}
        />
      </div>
    </div>
  );
}

interface StatusCardProps {
  label: string;
  value: string;
  icon: string;
}

function StatusCard({ label, value, icon }: StatusCardProps) {
  return (
    <div className="bg-dark-400 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-lg font-medium text-white">{value}</div>
    </div>
  );
}
