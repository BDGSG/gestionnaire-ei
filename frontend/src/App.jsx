import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, FileCheck, FolderOpen,
  ArrowLeftRight, Calendar, Building2, Menu, X, Shield
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Invoices from './pages/Invoices';
import Quotes from './pages/Quotes';
import Documents from './pages/Documents';
import Transactions from './pages/Transactions';
import Fiscal from './pages/Fiscal';
import Regulatory from './pages/Regulatory';
import Settings from './pages/Settings';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/factures', icon: FileText, label: 'Factures' },
  { to: '/devis', icon: FileCheck, label: 'Devis' },
  { to: '/clients', icon: Users, label: 'Clients' },
  { to: '/documents', icon: FolderOpen, label: 'Documents' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/fiscal', icon: Calendar, label: 'Fiscal & TVA' },
  { to: '/veille', icon: Shield, label: 'Veille reglementaire' },
  { to: '/parametres', icon: Building2, label: 'Entreprise' },
];

export default function App() {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">EI</div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm">DIAMBRA BROU</h1>
            <p className="text-xs text-gray-500">Gestionnaire EI</p>
          </div>
        </div>
        <nav className="px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-700 font-medium">SIRET: 823 642 558 00048</p>
          <p className="text-xs text-blue-600">APE: 4932Z</p>
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 lg:px-6">
          <button className="lg:hidden p-1" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <h2 className="text-lg font-semibold text-gray-800">EI DIAMBRA BROU - Gestion</h2>
        </header>
        <div className="p-4 lg:p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/factures" element={<Invoices />} />
            <Route path="/devis" element={<Quotes />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/fiscal" element={<Fiscal />} />
            <Route path="/veille" element={<Regulatory />} />
            <Route path="/parametres" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
