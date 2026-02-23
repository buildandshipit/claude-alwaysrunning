import React from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <div className="text-4xl mb-4">💬</div>
        <p>No messages yet</p>
        <p className="text-sm mt-2">Start a conversation with Claude</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`message-enter flex ${
            message.role === 'user' ? 'justify-end' : 'justify-start'
          }`}
        >
          <div
            className={`max-w-[80%] rounded-lg p-4 ${
              message.role === 'user'
                ? 'bg-primary-600 text-white'
                : 'bg-dark-300 text-gray-200 border border-gray-700'
            }`}
          >
            <div className="text-xs opacity-60 mb-2">
              {message.role === 'user' ? 'You' : 'Claude'} •{' '}
              {formatTime(message.timestamp)}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm">
              {message.content}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
