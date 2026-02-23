import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useService } from '../hooks/useService';
import { MessageList } from '../components/chat/MessageList';
import { MessageInput } from '../components/chat/MessageInput';

export function ChatPage() {
  const { messages, currentOutput, isStreaming, sendMessage } = useChat();
  const { connected, status } = useService();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentOutput]);

  const handleSend = (content: string) => {
    if (!connected || !status?.ready) return;
    sendMessage(content);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-white">Chat with Claude</h1>
          <p className="text-sm text-gray-400">
            {connected
              ? status?.ready
                ? 'Claude is ready'
                : 'Claude is starting...'
              : 'Not connected to service'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              connected
                ? status?.ready
                  ? 'bg-green-500'
                  : 'bg-yellow-500 status-pulse'
                : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-400">
            {connected ? (status?.ready ? 'Ready' : 'Starting') : 'Offline'}
          </span>
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6">
        <MessageList messages={messages} />

        {/* Streaming output */}
        {currentOutput && (
          <div className="mt-4 p-4 bg-dark-300 rounded-lg border border-gray-700">
            <div className="text-xs text-gray-500 mb-2">Claude is responding...</div>
            <pre className="terminal-output text-sm text-gray-200 whitespace-pre-wrap">
              {currentOutput}
            </pre>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800 p-4">
        <MessageInput
          onSend={handleSend}
          disabled={!connected || !status?.ready}
          placeholder={
            !connected
              ? 'Connect to service to start chatting...'
              : !status?.ready
              ? 'Waiting for Claude to be ready...'
              : 'Type a message... (Ctrl+Enter to send)'
          }
        />
      </div>
    </div>
  );
}
