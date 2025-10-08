"use client";

import { useState } from "react";

interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
}

interface StoreSelectorProps {
  stores: Store[];
  currentStoreId?: string;
  onStoreChange: (storeId: string) => void;
  className?: string;
}

export function StoreSelector({ stores, currentStoreId, onStoreChange, className = "" }: StoreSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const currentStore = stores.find(s => s.id === currentStoreId) || stores[0];
  
  if (stores.length <= 1) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex h-2 w-2 rounded-full bg-green-500" />
        <span className="font-medium text-slate-900">
          {currentStore?.name || 'No Store'}
        </span>
        {currentStore?.city && (
          <span className="text-sm text-slate-500">• {currentStore.city}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        <div className="flex h-2 w-2 rounded-full bg-green-500" />
        <span className="font-medium text-slate-900">
          {currentStore?.name || 'Select Store'}
        </span>
        {currentStore?.city && (
          <span className="text-slate-500">• {currentStore.city}</span>
        )}
        <svg 
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {stores.map((store) => (
              <button
                key={store.id}
                type="button"
                onClick={() => {
                  onStoreChange(store.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  store.id === currentStoreId ? 'bg-slate-50' : ''
                }`}
              >
                <div className={`mt-1.5 flex h-2 w-2 rounded-full ${
                  store.id === currentStoreId ? 'bg-green-500' : 'bg-slate-300'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{store.name}</div>
                  <div className="text-xs text-slate-500">
                    {store.city}
                    {store.address && ` • ${store.address}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}