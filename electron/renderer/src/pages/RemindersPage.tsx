import React, { useEffect, useState } from 'react';
import { useReminders } from '../hooks/useReminders';
import { RemindersList } from '../components/reminders/RemindersList';
import { CreateReminderForm } from '../components/reminders/CreateReminderForm';

export function RemindersPage() {
  const { reminders, loading, refresh, addReminder, cancelReminder } = useReminders();
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = (message: string, time: string, channel: string) => {
    addReminder(message, time, channel);
    setShowCreateForm(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-white">Reminders</h1>
          <p className="text-sm text-gray-400">
            Schedule reminders and recurring tasks
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="px-4 py-2 bg-dark-300 text-gray-300 rounded-lg hover:bg-dark-100 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
          >
            New Reminder
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Summary */}
        <div className="mb-6 p-4 bg-dark-300 rounded-lg border border-gray-700">
          <div className="flex items-center gap-4">
            <div className="text-3xl">⏰</div>
            <div>
              <p className="text-lg font-medium text-white">
                {reminders.length} Pending Reminder{reminders.length !== 1 ? 's' : ''}
              </p>
              <p className="text-sm text-gray-400">
                {reminders.filter(r => r.cron_expression).length} recurring,{' '}
                {reminders.filter(r => r.trigger_at).length} one-time
              </p>
            </div>
          </div>
        </div>

        {/* Reminders list */}
        <RemindersList reminders={reminders} onCancel={cancelReminder} />
      </div>

      {/* Create reminder modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-300 rounded-lg border border-gray-700 p-6 w-full max-w-md">
            <h2 className="text-lg font-medium text-white mb-4">New Reminder</h2>
            <CreateReminderForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
