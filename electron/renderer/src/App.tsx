import React, { useState, useEffect } from 'react';
import { ChatPage } from './pages/ChatPage';
import { ServicePage } from './pages/ServicePage';
import { MemoryPage } from './pages/MemoryPage';
import { RemindersPage } from './pages/RemindersPage';
import { useService } from './hooks/useService';

type Page = 'chat' | 'service' | 'memory' | 'reminders';

const navItems: { id: Page; label: string; icon: string }[] = [
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'service', label: 'Service', icon: '⚙️' },
  { id: 'memory', label: 'Memory', icon: '🧠' },
  { id: 'reminders', label: 'Reminders', icon: '⏰' }
];

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const { connected, status, connect } = useService();

  useEffect(() => {
    // Try to connect on mount
    connect();
  }, []);

  return (
    <div className="flex h-screen bg-dark-200">
      {/* Sidebar */}
      <nav className="w-16 bg-dark-400 flex flex-col items-center py-4 border-r border-gray-800">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentPage(item.id)}
            className={`w-12 h-12 rounded-lg mb-2 flex items-center justify-center text-xl transition-colors ${
              currentPage === item.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:bg-dark-100 hover:text-white'
            }`}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}

        {/* Status indicator at bottom */}
        <div className="mt-auto">
          <div
            className={`w-3 h-3 rounded-full ${
              connected
                ? status?.ready
                  ? 'bg-green-500'
                  : 'bg-yellow-500 status-pulse'
                : 'bg-red-500'
            }`}
            title={
              connected
                ? status?.ready
                  ? 'Claude Ready'
                  : 'Claude Starting...'
                : 'Disconnected'
            }
          />
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {currentPage === 'chat' && <ChatPage />}
        {currentPage === 'service' && <ServicePage />}
        {currentPage === 'memory' && <MemoryPage />}
        {currentPage === 'reminders' && <RemindersPage />}
      </main>
    </div>
  );
}
