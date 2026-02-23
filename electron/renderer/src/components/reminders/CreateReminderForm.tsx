import React, { useState } from 'react';

interface CreateReminderFormProps {
  onSubmit: (message: string, time: string, channel: string) => void;
  onCancel: () => void;
}

export function CreateReminderForm({ onSubmit, onCancel }: CreateReminderFormProps) {
  const [message, setMessage] = useState('');
  const [time, setTime] = useState('');
  const [channel, setChannel] = useState('notification');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && time.trim()) {
      onSubmit(message.trim(), time.trim(), channel);
    }
  };

  const timeExamples = [
    'in 5 minutes',
    'in 1 hour',
    'tomorrow at 9am',
    'next Monday at 2pm',
    'every day at 9am',
    'every Monday at 10am'
  ];

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What do you want to be reminded about?"
          rows={2}
          className="w-full px-4 py-3 bg-dark-400 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none focus:outline-none focus:border-primary-500"
          autoFocus
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">When</label>
        <input
          type="text"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="e.g., in 30 minutes, tomorrow at 9am"
          className="w-full px-4 py-3 bg-dark-400 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {timeExamples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setTime(example)}
              className="px-2 py-1 bg-dark-500 text-gray-400 rounded text-xs hover:bg-dark-300 transition-colors"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-2">Alert Channel</label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="w-full px-4 py-3 bg-dark-400 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
        >
          <option value="notification">Desktop Notification</option>
          <option value="sound">Sound Alert</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </div>

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-dark-400 text-gray-300 rounded-lg hover:bg-dark-100 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!message.trim() || !time.trim()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Create Reminder
        </button>
      </div>
    </form>
  );
}
