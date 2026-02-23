import React from 'react';

interface Fact {
  id: number;
  fact: string;
  category: string;
  created_at: string;
}

interface FactsListProps {
  facts: Fact[];
  onDelete: (id: number) => void;
}

export function FactsList({ facts, onDelete }: FactsListProps) {
  if (facts.length === 0) {
    return (
      <div className="bg-dark-300 rounded-lg border border-gray-700 p-8 text-center">
        <div className="text-4xl mb-4">🧠</div>
        <p className="text-gray-400">No facts stored yet</p>
        <p className="text-sm text-gray-500 mt-2">
          Add facts about yourself that Claude should remember
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {facts.map((fact) => (
        <FactCard
          key={fact.id}
          fact={fact}
          onDelete={() => onDelete(fact.id)}
        />
      ))}
    </div>
  );
}

interface FactCardProps {
  fact: Fact;
  onDelete: () => void;
}

function FactCard({ fact, onDelete }: FactCardProps) {
  const [showConfirm, setShowConfirm] = React.useState(false);

  const handleDelete = () => {
    if (showConfirm) {
      onDelete();
    } else {
      setShowConfirm(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowConfirm(false), 3000);
    }
  };

  return (
    <div className="bg-dark-300 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-white">{fact.fact}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="px-2 py-0.5 bg-dark-400 rounded text-xs text-gray-400">
              {fact.category}
            </span>
            <span className="text-xs text-gray-500">
              {formatDate(fact.created_at)}
            </span>
          </div>
        </div>
        <button
          onClick={handleDelete}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            showConfirm
              ? 'bg-red-600 text-white'
              : 'bg-dark-400 text-gray-400 hover:bg-red-600 hover:text-white'
          }`}
        >
          {showConfirm ? 'Confirm' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}
