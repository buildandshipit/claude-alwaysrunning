import React, { useState } from 'react';

interface AddFactFormProps {
  onSubmit: (fact: string, category: string) => void;
  onCancel: () => void;
  categories: string[];
}

export function AddFactForm({ onSubmit, onCancel, categories }: AddFactFormProps) {
  const [fact, setFact] = useState('');
  const [category, setCategory] = useState('general');
  const [customCategory, setCustomCategory] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCategory = category === 'custom' ? customCategory : category;
    if (fact.trim() && finalCategory.trim()) {
      onSubmit(fact.trim(), finalCategory.trim());
    }
  };

  const allCategories = ['general', 'preference', 'work', 'personal', ...categories.filter(
    c => !['general', 'preference', 'work', 'personal'].includes(c)
  )];

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Fact</label>
        <textarea
          value={fact}
          onChange={(e) => setFact(e.target.value)}
          placeholder="e.g., I prefer TypeScript over JavaScript"
          rows={3}
          className="w-full px-4 py-3 bg-dark-400 border border-gray-600 rounded-lg text-white placeholder-gray-500 resize-none focus:outline-none focus:border-primary-500"
          autoFocus
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm text-gray-400 mb-2">Category</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-4 py-3 bg-dark-400 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
        >
          {allCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
          <option value="custom">Custom...</option>
        </select>
      </div>

      {category === 'custom' && (
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Custom Category</label>
          <input
            type="text"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="Enter category name"
            className="w-full px-4 py-3 bg-dark-400 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
        </div>
      )}

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
          disabled={!fact.trim() || (category === 'custom' && !customCategory.trim())}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add Fact
        </button>
      </div>
    </form>
  );
}
