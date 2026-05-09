'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/store/authStore';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Logo } from '@/components/Logo';

interface NavItem  { href: string; label: string; icon: React.FC; adminOnly?: boolean }
interface NavGroup { id: string; label: string; emoji: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    emoji: '🏠',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
      { href: '/watchlist', label: 'Watchlist',  icon: WatchlistIcon },
    ],
  },
  {
    id: 'trading',
    label: 'Trading',
    emoji: '📒',
    items: [
      { href: '/trades',    label: 'Trades',      icon: TradesIcon    },
      { href: '/analytics', label: 'Analytics',   icon: AnalyticsIcon },
      { href: '/trading',   label: '$1M Goal',    icon: GoalIcon, adminOnly: true },
      { href: '/coach',     label: 'Trade Coach', icon: CoachIcon     },
    ],
  },
  {
    id: 'stocks',
    label: 'Stocks',
    emoji: '📈',
    items: [
      { href: '/stocks/today', label: 'Daily Brief',    icon: MorningBriefIcon },
      { href: '/stocks',       label: 'Stock Analysis', icon: StockScannerIcon },
      { href: '/chart',        label: 'Chart',          icon: ChartIcon        },
      { href: '/market',       label: 'Stock Screener', icon: MarketIcon       },
    ],
  },
  {
    id: 'options',
    label: 'Options',
    emoji: '🎯',
    items: [
      { href: '/calculator',  label: 'Options Lab',      icon: OptionsIcon      },
      { href: '/scanner',     label: 'Options Screener', icon: ScannerIcon      },
      { href: '/strategies',  label: 'Strategies',       icon: StrategiesIcon   },
      { href: '/leaps',       label: 'LEAPS',            icon: LeapsIcon        },
    ],
  },
  {
    id: 'research',
    label: 'Research',
    emoji: '🔬',
    items: [
      { href: '/earnings',  label: 'Earnings Calendar', icon: EarningsIcon  },
      { href: '/news',      label: 'News',              icon: NewsIcon      },
      { href: '/crypto',    label: 'Crypto',            icon: CryptoIcon    },
      { href: '/community', label: 'Community',         icon: CommunityIcon },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    emoji: '❓',
    items: [
      { href: '/settings', label: 'Settings',  icon: SettingsIcon },
      { href: '/billing',  label: 'Billing',   icon: BillingIcon  },
      { href: '/pricing',  label: 'Pricing',   icon: PricingIcon  },
      { href: '/feedback', label: 'Feedback',  icon: FeedbackIcon },
      { href: '/help',     label: 'Help',      icon: HelpIcon,   adminOnly: true },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    emoji: '🛡️',
    items: [
      { href: '/admin',          label: 'User Management',  icon: AdminIcon,          adminOnly: true },
      { href: '/admin/feedback', label: 'Feedback Results', icon: FeedbackResultsIcon, adminOnly: true },
    ],
  },
];

function CoachIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  );
}

function FeedbackIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
    </svg>
  );
}

function FeedbackResultsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PricingIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function ScannerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function StrategiesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6M9 16h4" />
    </svg>
  );
}

function CalculatorIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M9 7h6" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h.01M12 12h.01M15 12h.01M9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01M15 18h.01" />
    </svg>
  );
}

function LeapsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l2 2 4-4" />
    </svg>
  );
}

function EarningsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11v5m-2-2h4" />
    </svg>
  );
}

function LeapsCoachIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
    </svg>
  );
}

function MorningBriefIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707" />
      <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </svg>
  );
}

function StockScannerIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18M3 9h18M9 15l3-3 3 3 3-4" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 21h14a1 1 0 001-1v-5H4v5a1 1 0 001 1z" />
    </svg>
  );
}

function OptionsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      <circle cx="19" cy="5" r="3" strokeWidth={2} />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function MarketIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21V11m0 0V8m0 3h3m-3 0H4M14 21v-3m0 0V5m0 13h3m-3 0h-3M21 21v-6m0 0V9m0 6h-3m3 0h-2" />
    </svg>
  );
}

function TradesIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function GoalIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.5 12l1.5 1.5 3.5-3.5" />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  );
}

function CommunityIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
    </svg>
  );
}

function TechnicalIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  );
}

function CryptoIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WatchlistIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

const roleColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  manager: 'bg-purple-100 text-purple-700',
  user: 'bg-blue-100 text-blue-700',
};

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  const router = useRouter();
  const { user, handleSignOut, isAdmin } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  // Track which groups are collapsed; default all open
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (id: string) =>
    setClosedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  // Initialise dark mode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const enable = saved !== null ? saved === 'true' : prefersDark;
    setDarkMode(enable);
    document.documentElement.classList.toggle('dark', enable);
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('darkMode', String(next));
  };

  const onSignOut = async () => {
    setSigningOut(true);
    await handleSignOut();
    router.push('/auth/signin');
  };

  return (
    <ProtectedRoute>
      <div className="flex h-screen bg-background">
        {/* Mobile overlay backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`flex flex-col ${darkMode ? 'bg-brand-navy' : 'bg-white border-r border-slate-200'} transition-all duration-300 shrink-0
            fixed inset-y-0 left-0 z-30 md:relative md:z-auto
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
            ${collapsed ? 'w-16' : 'w-60'}
          `}
        >
          {/* Logo / Brand */}
          <div className={`flex items-center h-16 px-4 ${darkMode ? 'border-b border-white/10' : 'border-b border-slate-200'} ${collapsed ? 'justify-center' : 'justify-between'}`}>
            {!collapsed ? (
              <a href="https://gr8bux.com" aria-label="GR8BUX home"><Logo size={30} className="text-white" /></a>
            ) : (
              <a href="https://gr8bux.com" aria-label="GR8BUX home"><Logo size={28} iconOnly className="text-white" /></a>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={`p-1.5 rounded-lg ${darkMode ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'} transition-colors ml-auto`}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          </div>

          {/* Nav Groups */}
          <nav className="flex-1 py-3 px-2 overflow-y-auto">
            {NAV_GROUPS.map((group) => {
              const isClosed = !!closedGroups[group.id];
              const anyActive = group.items.some((i) => router.pathname.startsWith(i.href));
              return (
                <div key={group.id} className="mb-1">
                  {/* Group header — hidden when sidebar is icon-only */}
                  {!collapsed && (
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors ${
                        darkMode ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{group.emoji}</span>
                        {group.label}
                      </span>
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${
                          isClosed ? '-rotate-90' : ''
                        }`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}

                  {/* Items — always show when collapsed (icon-only mode) */}
                  {(!isClosed || collapsed) && (
                    <div className={`space-y-0.5 ${!collapsed ? 'mt-0.5 mb-1' : 'mb-2'}`}>
                      {group.items.filter((item) => !('adminOnly' in item) || isAdmin()).map(({ href, label, icon: Icon }) => {
                        const active = router.pathname === href || (router.pathname.startsWith(href + '/') && !group.items.some(i => i.href !== href && router.pathname.startsWith(i.href)));
                        return (
                          <Link
                            key={href}
                            href={href}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                              active
                                ? 'bg-gradient-brand text-white'
                                : darkMode ? 'text-slate-200 hover:bg-white/10 hover:text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                            title={collapsed ? label : undefined}
                          >
                            <Icon />
                            {!collapsed && <span className="truncate text-sm">{label}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  )}

                  {/* Divider between groups (expanded sidebar only) */}
                  {!collapsed && <div className={`border-t ${darkMode ? 'border-white/10' : 'border-slate-200'} mx-1 mt-1`} />}
                </div>
              );
            })}
          </nav>

          {/* Profile / User section at bottom */}
          <div className={`border-t ${darkMode ? 'border-white/10' : 'border-slate-200'} p-2`}>
            <Link
              href="/profile"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${darkMode ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'} transition-colors ${
                router.pathname === '/profile' ? darkMode ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-900' : ''
              }`}
              title={collapsed ? 'Profile' : undefined}
            >
              <div className="w-5 h-5 shrink-0">
                <ProfileIcon />
              </div>
              {!collapsed && (
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-800'} truncate`}>
                    {user?.displayName || user?.email?.split('@')[0] || 'User'}
                  </p>
                  <span
                    className={`inline-block text-xs px-1.5 py-0.5 rounded font-semibold mt-0.5 ${
                      roleColors[user?.role || 'user']
                    }`}
                  >
                    {(user?.role || 'user').toUpperCase()}
                  </span>
                </div>
              )}
            </Link>

            <button
              onClick={onSignOut}
              disabled={signingOut}
              className={`mt-1 w-full flex items-center gap-3 px-3 py-2.5 rounded-lg ${darkMode ? 'text-slate-300 hover:bg-red-500/30 hover:text-white' : 'text-slate-600 hover:bg-red-50 hover:text-red-600'} transition-colors`}
              title={collapsed ? 'Sign Out' : undefined}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {!collapsed && <span className="text-sm">{signingOut ? 'Signing out…' : 'Sign Out'}</span>}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="h-16 glass border-b border-border/60 flex items-center px-6 shrink-0 gap-4">
            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="flex-1 text-xl font-semibold font-display text-foreground">{title || 'GR8BUX'}</h1>
            {/* Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-13H20m-16 0H2.34M17.66 17.66l-.71-.71M7.05 7.05l-.71-.71M17.66 7.05l-.71.71M7.05 17.66l.71-.71M12 5a7 7 0 100 14A7 7 0 0012 5z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto p-6 bg-background text-foreground flex flex-col">
            <div className="flex-1">
              {children}
            </div>

            {/* Footer */}
            <footer className="mt-10 pt-4 border-t border-border/50">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-4">
                  <a href="https://gr8bux.com" className="hover:text-foreground transition-colors">Home</a>
                  <a href="https://gr8bux.com/features" className="hover:text-foreground transition-colors">Features</a>
                  <a href="https://gr8bux.com/pricing" className="hover:text-foreground transition-colors">Pricing</a>
                  <a href="https://gr8bux.com/about" className="hover:text-foreground transition-colors">About</a>
                  <a href="https://gr8bux.com/contact" className="hover:text-foreground transition-colors">Contact</a>
                </div>
                <p>© {new Date().getFullYear()} GR8BUX. Not financial advice.</p>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
