import { useState, useEffect, useCallback } from 'react';

interface Reminder {
  id: number;
  message: string;
  trigger_at: string | null;
  cron_expression: string | null;
  channel: string;
  status: string;
  created_at: string;
}

interface AddedReminder {
  id: number;
  type: 'once' | 'recurring';
  message: string;
  triggerAt?: Date;
  cron?: string;
  description?: string;
  channel: string;
}

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Set up event listeners
    const unsubReminders = window.electronAPI.onReminders((data: Reminder[]) => {
      setReminders(data);
      setLoading(false);
    });

    const unsubAdded = window.electronAPI.onReminderAdded((data: AddedReminder) => {
      // Refresh the list to get the full reminder data
      window.electronAPI.requestReminders();
      setError(null);
    });

    const unsubCancelled = window.electronAPI.onReminderCancelled((data: { id: number }) => {
      setReminders((prev) => prev.filter((r) => r.id !== data.id));
    });

    return () => {
      unsubReminders();
      unsubAdded();
      unsubCancelled();
    };
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    window.electronAPI.requestReminders();
  }, []);

  const addReminder = useCallback((message: string, time: string, channel: string = 'notification') => {
    setError(null);
    window.electronAPI.addReminder(message, time, channel);
  }, []);

  const cancelReminder = useCallback((id: number) => {
    window.electronAPI.cancelReminder(id);
  }, []);

  return {
    reminders,
    loading,
    error,
    refresh,
    addReminder,
    cancelReminder
  };
}
