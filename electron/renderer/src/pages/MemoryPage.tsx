import React, { useEffect, useState } from 'react';
import { useMemory } from '../hooks/useMemory';
import { FactsList } from '../components/memory/FactsList';
import { AddFactForm } from '../components/memory/AddFactForm';

export function MemoryPage() {
  const {
    stats,
    facts,
    categories,
    selectedCategory,
    refreshStats,
    refreshFacts,
    addFact,
    deleteFact
  } = useMemory();

  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    refreshStats();
    refreshFacts();
  }, []);

  const handleCategoryChange = (category: string | null) => {
    refreshFacts(category || undefined);
  };

  const handleAddFact = (fact: string, category: string) => {
    addFact(fact, category);
    setShowAddForm(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-white">Memory</h1>
          <p className="text-sm text-gray-400">
            Facts and preferences stored about you
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
        >
          Add Fact
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Facts"
              value={stats.facts}
              icon="🧠"
            />
            <StatCard
              label="Conversations"
              value={stats.conversations}
              icon="💬"
            />
            <StatCard
              label="Messages"
              value={stats.messages}
              icon="📝"
            />
            <StatCard
              label="Pending Reminders"
              value={stats.reminders.pending}
              icon="⏰"
            />
          </div>
        )}

        {/* Category filter */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleCategoryChange(null)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedCategory === null
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-300 text-gray-400 hover:bg-dark-100'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedCategory === cat
                    ? 'bg-primary-600 text-white'
                    : 'bg-dark-300 text-gray-400 hover:bg-dark-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Facts list */}
        <FactsList facts={facts} onDelete={deleteFact} />
      </div>

      {/* Add fact modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-dark-300 rounded-lg border border-gray-700 p-6 w-full max-w-md">
            <h2 className="text-lg font-medium text-white mb-4">Add New Fact</h2>
            <AddFactForm
              onSubmit={handleAddFact}
              onCancel={() => setShowAddForm(false)}
              categories={categories}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
}

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="bg-dark-300 rounded-lg border border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span>{icon}</span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
