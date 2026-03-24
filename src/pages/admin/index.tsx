'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { UserRole } from '@/types';
import { getSupabaseClient } from '@/lib/supabase';
import { Layout } from '@/components/Layout';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: string;
  lastSignIn: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAdmin } = useAuthStore();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check admin access
  useEffect(() => {
    if (!authLoading && !isAdmin()) {
      router.push('/dashboard');
    }
  }, [authLoading, isAdmin, router]);

  // Load users
  useEffect(() => {
    if (!isAdmin()) return;

    const loadUsers = async () => {
      try {
        setIsLoading(true);
        const supabase = getSupabaseClient();
        if (!supabase) {
          setError('Database not configured');
          return;
        }
        const { data, error: queryError } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: false });

        if (queryError) {
          setError('Failed to load users');
          return;
        }

        setUsers(
          data.map((u: any) => ({
            id: u.id,
            email: u.email,
            displayName: u.display_name || 'N/A',
            role: u.role,
            emailVerified: u.email_verified,
            createdAt: u.created_at,
            lastSignIn: u.last_sign_in,
          }))
        );
      } catch (err) {
        setError('Error loading users');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, []);

  const handleRoleChange = async () => {
    if (!selectedUser) return;

    try {
      setError('');
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError('Database not configured');
        return;
      }
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', selectedUser.id)
        .select()
        .single();

      if (updateError) {
        setError('Failed to update role');
        return;
      }

      setSuccess(`${selectedUser.email} role updated to ${newRole}`);
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, role: newRole } : u))
      );
      setSelectedUser(null);

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Error updating role');
    }
  };

  if (authLoading || !isAdmin()) {
    return null;
  }

  if (isLoading) {
    return (
      <Layout title="Admin Panel">
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading users...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Admin Panel">

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          {/* Users Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Email</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Display Name</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Role</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Email Verified</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Last Sign In</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{u.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{u.displayName}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          u.role === 'admin'
                            ? 'bg-red-100 text-red-800'
                            : u.role === 'manager'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={u.emailVerified ? 'text-green-600' : 'text-gray-500'}>
                        {u.emailVerified ? '✓ Verified' : '○ Not Verified'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {u.lastSignIn ? new Date(u.lastSignIn).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => {
                          setSelectedUser(u);
                          setNewRole(u.role);
                        }}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Change Role
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No users found</p>
            </div>
          )}
        </div>

        {/* Role Change Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Change User Role</h2>
              <p className="text-gray-600 mb-4">{selectedUser.email}</p>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">New Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="user">User</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleRoleChange}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Update Role
                </button>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
    </Layout>
  );
}
