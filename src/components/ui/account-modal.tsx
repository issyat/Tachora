"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Modal } from "./modal";

interface AccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function AccountModal({ open, onClose }: AccountModalProps) {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      alert('Please enter your password to confirm deletion.');
      return;
    }

    if (!confirm('⚠️ FINAL WARNING: This will permanently delete your account and ALL data including stores, employees, and schedules.\n\nThis action cannot be undone.\n\nAre you absolutely sure?')) {
      return;
    }

    setIsDeleting(true);
    
    try {
      // First delete from our database
      const response = await fetch('/api/user/delete-current', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Database cleanup successful:', result);
        
        // Then delete from Clerk
        if (user) {
          await user.delete();
          window.location.href = '/';
        }
      } else {
        throw new Error('Failed to delete user data');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Failed to delete account. Please try again or contact support.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Account" widthClass="max-w-4xl">
      <div className="flex h-[500px]">
        {/* Sidebar */}
        <div className="w-64 border-r border-slate-200 bg-slate-50 p-4">
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                activeTab === 'profile' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-600 hover:bg-white/50'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                activeTab === 'security' 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-600 hover:bg-white/50'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Security
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Profile Information</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={user?.fullName || user?.firstName || ''}
                        readOnly
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50"
                      />
                      <button
                        onClick={() => {
                          if (window.Clerk) {
                            window.Clerk.openUserProfile();
                          }
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="email"
                        value={user?.emailAddresses?.[0]?.emailAddress || ''}
                        readOnly
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50"
                      />
                      <button
                        onClick={() => {
                          if (window.Clerk) {
                            window.Clerk.openUserProfile();
                          }
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Security</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                    <div>
                      <div className="font-medium text-slate-900">Password</div>
                      <div className="text-sm text-slate-500">••••••••</div>
                    </div>
                    <button
                      onClick={() => {
                        if (window.Clerk) {
                          window.Clerk.openUserProfile();
                        }
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Update password
                    </button>
                  </div>

                  <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                    <div className="flex items-start gap-3">
                      <svg className="h-5 w-5 text-red-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <div className="flex-1">
                        <div className="font-medium text-red-900">Delete account</div>
                        <div className="text-sm text-red-700 mt-1">
                          Permanently delete your account and all associated data. This action cannot be undone.
                        </div>
                        
                        {!showDeleteConfirm ? (
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                          >
                            Delete account
                          </button>
                        ) : (
                          <div className="mt-4 space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-red-900 mb-1">
                                Enter your password to confirm deletion
                              </label>
                              <input
                                type="password"
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                                placeholder="Enter your password"
                                className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={handleDeleteAccount}
                                disabled={isDeleting || !deletePassword.trim()}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isDeleting ? 'Deleting...' : 'Confirm deletion'}
                              </button>
                              <button
                                onClick={() => {
                                  setShowDeleteConfirm(false);
                                  setDeletePassword('');
                                }}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}