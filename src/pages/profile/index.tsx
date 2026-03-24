import React, { useState } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import { useAuthStore } from '@/store/authStore';
import { updatePassword } from '@/lib/auth';

const roleColors: Record<string, { bg: string; text: string; label: string }> = {
  admin: { bg: 'bg-red-100', text: 'text-red-700', label: 'Administrator' },
  manager: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Manager' },
  user: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'User' },
};

export default function ProfilePage() {
  const { user } = useAuthStore();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwStatus, setPwStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const role = user?.role || 'user';
  const roleStyle = roleColors[role];

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwStatus(null);

    if (newPassword.length < 6) {
      setPwStatus({ type: 'error', msg: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwStatus({ type: 'error', msg: 'Passwords do not match.' });
      return;
    }

    setPwLoading(true);
    const result = await updatePassword(newPassword);
    setPwLoading(false);

    if (result.success) {
      setPwStatus({ type: 'success', msg: 'Password updated successfully.' });
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPwStatus({ type: 'error', msg: result.error || 'Failed to update password.' });
    }
  };

  return (
    <Layout title="Profile & Settings">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-gray-900 to-blue-900 h-24" />
          <div className="px-6 pb-6">
            <div className="flex items-end gap-4 -mt-10 mb-4">
              {/* Avatar */}
              <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow">
                {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
              </div>
              <div className="pb-1">
                <h2 className="text-xl font-bold text-gray-900">
                  {user?.displayName || 'Trader'}
                </h2>
                <p className="text-gray-500 text-sm">{user?.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Role</p>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${roleStyle.bg} ${roleStyle.text}`}>
                  {role === 'admin' && (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  {roleStyle.label}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Email Status</p>
                {user?.emailVerified ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-700">
                    Unverified
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Member Since</p>
                <p className="text-sm text-gray-900">
                  {user?.createdAt
                    ? new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                    : '—'}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">User ID</p>
                <p className="text-sm text-gray-400 font-mono truncate">{user?.id?.slice(0, 16)}…</p>
              </div>
            </div>
          </div>
        </div>

        {/* Role Permissions Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Role Permissions</h3>
          <div className="space-y-3">
            {[
              { label: 'View Dashboard & Trades', roles: ['user', 'manager', 'admin'] },
              { label: 'Log & Edit Trades', roles: ['user', 'manager', 'admin'] },
              { label: 'View Analytics', roles: ['user', 'manager', 'admin'] },
              { label: 'Manage Team Members', roles: ['manager', 'admin'] },
              { label: 'Admin Panel & User Management', roles: ['admin'] },
            ].map(({ label, roles }) => {
              const granted = roles.includes(role);
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${granted ? 'bg-green-500' : 'bg-gray-200'}`}>
                    {granted ? (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-sm ${granted ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Change Password Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">Change Password</h3>

          {pwStatus && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${pwStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {pwStatus.msg}
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={pwLoading}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pwLoading ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Danger Zone (admin only) */}
        {role === 'admin' && (
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
            <h3 className="text-base font-semibold text-red-700 mb-1">Admin Zone</h3>
            <p className="text-sm text-gray-500 mb-4">Administrative actions and user management.</p>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Open Admin Panel
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
