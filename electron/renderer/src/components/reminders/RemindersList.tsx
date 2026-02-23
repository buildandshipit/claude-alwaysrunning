import React from 'react';

interface Reminder {
  id: number;
  message: string;
  trigger_at: string | null;
  cron_expression: string | null;
  channel: string;
  status: string;
  created_at: string;
}

interface RemindersListProps {
  reminders: Reminder[];
  onCancel: (id: number) => void;
}

export function RemindersList({ reminders, onCancel }: RemindersListProps) {
  if (reminders.length === 0) {
    return (
      <div className="bg-dark-300 rounded-lg border border-gray-700 p-8 text-center">
        <div className="text-4xl mb-4">⏰</div>
        <p className="text-gray-400">No pending reminders</p>
        <p className="text-sm text-gray-500 mt-2">
          Create a reminder to get notified at a specific time
        </p>
      </div>
    );
  }

  // Sort: one-time by trigger time, recurring at end
  const sorted = [...reminders].sort((a, b) => {
    if (a.trigger_at && b.trigger_at) {
      return new Date(a.trigger_at).getTime() - new Date(b.trigger_at).getTime();
    }
    if (a.trigger_at && !b.trigger_at) return -1;
    if (!a.trigger_at && b.trigger_at) return 1;
    return 0;
  });

  return (
    <div className="space-y-3">
      {sorted.map((reminder) => (
        <ReminderCard
          key={reminder.id}
          reminder={reminder}
          onCancel={() => onCancel(reminder.id)}
        />
      ))}
    </div>
  );
}

interface ReminderCardProps {
  reminder: Reminder;
  onCancel: () => void;
}

function ReminderCard({ reminder, onCancel }: ReminderCardProps) {
  const [showConfirm, setShowConfirm] = React.useState(false);
  const isRecurring = !!reminder.cron_expression;

  const handleCancel = () => {
    if (showConfirm) {
      onCancel();
    } else {
      setShowConfirm(true);
      setTimeout(() => setShowConfirm(false), 3000);
    }
  };

  return (
    <div className="bg-dark-300 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{isRecurring ? '🔄' : '⏰'}</span>
            <span className="text-white font-medium">{reminder.message}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isRecurring ? (
              <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs">
                {reminder.cron_expression}
              </span>
            ) : (
              <span className="text-sm text-gray-400">
                {formatTriggerTime(reminder.trigger_at)}
              </span>
            )}
            <span className="px-2 py-0.5 bg-dark-400 rounded text-xs text-gray-400">
              {reminder.channel}
            </span>
            <span className="text-xs text-gray-500">
              Created {formatDate(reminder.created_at)}
            </span>
          </div>
        </div>
        <button
          onClick={handleCancel}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            showConfirm
              ? 'bg-red-600 text-white'
              : 'bg-dark-400 text-gray-400 hover:bg-red-600 hover:text-white'
          }`}
        >
          {showConfirm ? 'Confirm' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}

function formatTriggerTime(triggerAt: string | null): string {
  if (!triggerAt) return 'No trigger time';

  const date = new Date(triggerAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) {
    return 'Overdue';
  } else if (diffMins < 60) {
    return `In ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
  } else if (diffMins < 1440) {
    const hours = Math.round(diffMins / 60);
    return `In ${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}
