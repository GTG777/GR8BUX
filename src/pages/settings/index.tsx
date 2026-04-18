import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Layout } from '@/components/Layout';
import { useAuthStore } from '@/store/authStore';

// ── Setting keys stored in localStorage ──────────────────────────────────
const STORAGE_KEY = 'gr8bux_settings';

interface AppSettings {
  darkMode: boolean;
  // Trading defaults
  defaultAccountSize: number;
  defaultRiskPct: number;
  defaultDelta: string;
  defaultDTE: number;
  // Display
  currency: string;
  timezone: string;
  dateFormat: string;
  // Notifications
  notifyTradeAlerts: boolean;
  notifyWeeklyDigest: boolean;
  notifyEarnings: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  darkMode: false,
  defaultAccountSize: 25000,
  defaultRiskPct: 2,
  defaultDelta: '0.30',
  defaultDTE: 45,
  currency: 'USD',
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  notifyTradeAlerts: true,
  notifyWeeklyDigest: false,
  notifyEarnings: true,
};

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    // Always read darkMode from its own key (Layout uses 'darkMode' directly)
    const darkMode = localStorage.getItem('darkMode') === 'true';
    return { ...DEFAULT_SETTINGS, ...saved, darkMode };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AppSettings) {
  const { darkMode, ...rest } = settings;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  // Keep darkMode in sync with Layout's key
  localStorage.setItem('darkMode', String(darkMode));
  // Toggle class on document root for instant effect
  if (darkMode) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

// ── Section card wrapper ──────────────────────────────────────────────────
function Section({ title, emoji, children }: { title: string; emoji: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700/60 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 dark:border-zinc-700/40 flex items-center gap-2">
        <span>{emoji}</span>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-zinc-100">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────
function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{label}</p>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex w-11 h-6 rounded-full transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
          checked ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-zinc-700'
        }`}
      >
        <span className={`inline-block w-5 h-5 bg-white rounded-full shadow transform transition-transform mt-0.5 ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}

// ── Select row ────────────────────────────────────────────────────────────
function SelectRow({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm font-medium text-gray-800 dark:text-zinc-100">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-zinc-100 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Number row ────────────────────────────────────────────────────────────
function NumberRow({ label, description, value, min, max, step, prefix, suffix, onChange }: {
  label: string; description?: string; value: number; min: number; max: number; step: number;
  prefix?: string; suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-zinc-100">{label}</p>
        {description && <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-gray-500 dark:text-zinc-500">{prefix}</span>}
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-800 dark:text-zinc-100 rounded-lg px-3 py-1.5 text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
        />
        {suffix && <span className="text-sm text-gray-500 dark:text-zinc-500">{suffix}</span>}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuthStore();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Layout title="Settings">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400 mt-0.5">Manage your preferences and trading defaults</p>
        </div>

        {/* Appearance */}
        <Section title="Appearance" emoji="🎨">
          <ToggleRow
            label="Dark Mode"
            description="Switch between light and dark interface"
            checked={settings.darkMode}
            onChange={(v) => update('darkMode', v)}
          />
        </Section>

        {/* Trading defaults */}
        <Section title="Trading Defaults" emoji="📊">
          <NumberRow
            label="Default Account Size"
            description="Used in position sizing and risk calculations"
            value={settings.defaultAccountSize}
            min={1000} max={10000000} step={1000}
            prefix="$"
            onChange={(v) => update('defaultAccountSize', v)}
          />
          <NumberRow
            label="Risk Per Trade"
            description="Max % of account to risk on a single trade"
            value={settings.defaultRiskPct}
            min={0.5} max={10} step={0.5}
            suffix="%"
            onChange={(v) => update('defaultRiskPct', v)}
          />
          <SelectRow
            label="Preferred Delta"
            value={settings.defaultDelta}
            options={[
              { value: '0.20', label: '0.20 – OTM (speculative)' },
              { value: '0.30', label: '0.30 – Standard' },
              { value: '0.40', label: '0.40 – Near ATM' },
              { value: '0.50', label: '0.50 – ATM' },
              { value: '0.70', label: '0.70 – LEAPS range' },
            ]}
            onChange={(v) => update('defaultDelta', v)}
          />
          <NumberRow
            label="Default DTE"
            description="Days-to-expiry for new option trades"
            value={settings.defaultDTE}
            min={1} max={730} step={1}
            suffix="days"
            onChange={(v) => update('defaultDTE', v)}
          />
        </Section>

        {/* Display */}
        <Section title="Display" emoji="🖥️">
          <SelectRow
            label="Currency"
            value={settings.currency}
            options={[
              { value: 'USD', label: 'USD – US Dollar ($)' },
              { value: 'CAD', label: 'CAD – Canadian Dollar (C$)' },
              { value: 'EUR', label: 'EUR – Euro (€)' },
              { value: 'GBP', label: 'GBP – British Pound (£)' },
            ]}
            onChange={(v) => update('currency', v)}
          />
          <SelectRow
            label="Timezone"
            value={settings.timezone}
            options={[
              { value: 'America/New_York',    label: 'Eastern (ET) – NYSE/NASDAQ' },
              { value: 'America/Chicago',     label: 'Central (CT)' },
              { value: 'America/Denver',      label: 'Mountain (MT)' },
              { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
              { value: 'Europe/London',       label: 'London (GMT/BST)' },
              { value: 'Europe/Paris',        label: 'Central Europe (CET)' },
              { value: 'Asia/Tokyo',          label: 'Tokyo (JST)' },
            ]}
            onChange={(v) => update('timezone', v)}
          />
          <SelectRow
            label="Date Format"
            value={settings.dateFormat}
            options={[
              { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (US)' },
              { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (EU)' },
              { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
            ]}
            onChange={(v) => update('dateFormat', v)}
          />
        </Section>

        {/* Notifications */}
        <Section title="Notifications" emoji="🔔">
          <ToggleRow
            label="Trade Alerts"
            description="Notify when a watched symbol hits your price target"
            checked={settings.notifyTradeAlerts}
            onChange={(v) => update('notifyTradeAlerts', v)}
          />
          <ToggleRow
            label="Earnings Reminders"
            description="Alert 24h before earnings for stocks you are watching"
            checked={settings.notifyEarnings}
            onChange={(v) => update('notifyEarnings', v)}
          />
          <ToggleRow
            label="Weekly Performance Digest"
            description="Email summary of your P&L and journal stats every Monday"
            checked={settings.notifyWeeklyDigest}
            onChange={(v) => update('notifyWeeklyDigest', v)}
          />
        </Section>

        {/* Account links */}
        <Section title="Account" emoji="👤">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-zinc-100">Email</p>
              <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">{user?.email ?? '—'}</p>
            </div>
            <Link href="/profile" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              Manage account →
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-zinc-100">Subscription</p>
              <p className="text-xs text-gray-500 dark:text-zinc-500 mt-0.5">View plan &amp; invoices</p>
            </div>
            <Link href="/billing" className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
              Billing →
            </Link>
          </div>
        </Section>

        {/* Save */}
        <div className="flex items-center justify-between pb-6">
          <p className="text-xs text-gray-400 dark:text-zinc-600">
            Preferences saved locally in your browser.
          </p>
          <button
            onClick={handleSave}
            className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              saved
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
