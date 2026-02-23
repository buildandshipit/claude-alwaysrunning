import React, { useRef, useEffect } from 'react';

interface LogViewerProps {
  logs: string;
}

export function LogViewer({ logs }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  if (!logs) {
    return (
      <div className="bg-dark-400 rounded-lg border border-gray-700 p-6 text-center text-gray-500">
        <p>No logs available</p>
        <p className="text-sm mt-1">Start the service to see logs</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="bg-dark-500 rounded-lg border border-gray-700 p-4 h-96 overflow-y-auto font-mono text-sm"
    >
      {logs.split('\n').map((line, index) => (
        <LogLine key={index} line={line} />
      ))}
    </div>
  );
}

interface LogLineProps {
  line: string;
}

function LogLine({ line }: LogLineProps) {
  if (!line.trim()) return null;

  // Parse timestamp and color code based on content
  let color = 'text-gray-300';

  if (line.includes('ERROR') || line.includes('error') || line.includes('Failed')) {
    color = 'text-red-400';
  } else if (line.includes('WARNING') || line.includes('warning')) {
    color = 'text-yellow-400';
  } else if (line.includes('started') || line.includes('ready') || line.includes('connected')) {
    color = 'text-green-400';
  } else if (line.includes('Scheduler') || line.includes('reminder')) {
    color = 'text-purple-400';
  } else if (line.includes('Client')) {
    color = 'text-blue-400';
  }

  // Extract timestamp if present
  const timestampMatch = line.match(/^\[([^\]]+)\]/);

  if (timestampMatch) {
    const timestamp = timestampMatch[1];
    const message = line.slice(timestampMatch[0].length);

    return (
      <div className="flex gap-2 py-0.5">
        <span className="text-gray-500 shrink-0">{timestamp}</span>
        <span className={color}>{message}</span>
      </div>
    );
  }

  return (
    <div className={`py-0.5 ${color}`}>
      {line}
    </div>
  );
}
