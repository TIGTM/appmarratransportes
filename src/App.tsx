import { FormEvent, MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  Eye,
  FileText,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Truck,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { Capacitor } from '@capacitor/core';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation as CapacitorGeolocation } from '@capacitor/geolocation';

type DriverStatus = 'Pendente' | 'Aprovado' | 'Reprovado' | 'Bloqueado';
type View =
  | 'login'
  | 'register'
  | 'driverDashboard'
  | 'newDelivery'
  | 'history'
  | 'deliveryDetails'
  | 'receipt'
  | 'account'
  | 'adminLogin'
  | 'adminDashboard'
  | 'adminClients'
  | 'adminDrivers'
  | 'adminDeliveries'
  | 'privacy'
  | 'terms'
  | 'termsAcceptance';

type Driver = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string;
  password: string;
  plate: string;
  cnhCategory?: 'C' | 'D' | 'E' | '';
  cnhFileName?: string;
  cnhFileUrl?: string;
  cnhFileData?: string;
  acceptedTerms?: boolean;
  commissionRate?: number;
  termsAcceptedAt?: string;
  termsVersion?: string;
  status: DriverStatus;
};

type Client = {
  id: string;
  companyName: string;
  email: string;
  extraEmails: string;
  phone: string;
  address: string;
};

type Delivery = {
  id: string;
  protocol: string;
  driverId: string;
  clientId: string;
  documentType: 'CTE' | 'NF' | 'RDVO';
  address: string;
  plate: string;
  notes: string;
  nfPhoto?: string;
  deliveryPhoto?: string;
  signature?: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  receiptToken?: string;
  emailStatus?: string;
  emailSentAt?: string;
  emailRecipients?: string;
  emailError?: string;
  date: string;
  time: string;
  status: 'Concluida';
};

type Toast = { id: string; type: 'success' | 'error'; message: string };

type DriverTermAcceptance = {
  id: string;
  driverId: string;
  driverName: string;
  driverCpf: string;
  driverEmail: string;
  driverPlate: string;
  cnhCategory?: string;
  commissionRate: number;
  termsVersion: string;
  termsText: string;
  acceptedAt: string;
  acceptedIp?: string;
  userAgent?: string;
};

const TOKEN_KEY = 'marra:token';
const TERMS_VERSION = '2026-06-28';
const DRIVER_COMMISSION_RATE = 16;

const today = new Date().toISOString().slice(0, 10);
const PUBLIC_WEB_URL = (import.meta.env.VITE_PUBLIC_WEB_URL || 'https://app.marratransportes.com.br').replace(/\/+$/, '');

const absoluteUrl = (path?: string) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${PUBLIC_WEB_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

const apiUrl = (path: string) => (Capacitor.isNativePlatform() ? absoluteUrl(path) : path);
const assetUrl = (path?: string) => (Capacitor.isNativePlatform() ? absoluteUrl(path) : path || '');

const mapsUrl = (latitude?: number, longitude?: number) =>
  latitude === undefined || longitude === undefined ? '' : `https://www.google.com/maps?q=${latitude},${longitude}`;

const osmEmbedUrl = (latitude?: number, longitude?: number) => {
  if (latitude === undefined || longitude === undefined) return '';
  const delta = 0.004;
  const left = longitude - delta;
  const right = longitude + delta;
  const bottom = latitude - delta;
  const top = latitude + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${latitude}%2C${longitude}`;
};

async function reverseGeocode(latitude: number, longitude: number) {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`,
    );
    if (!response.ok) return '';
    const data = await response.json();
    return [data.locality, data.principalSubdivision, data.countryName].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

const blankDriver: Driver = {
  id: '',
  name: '',
  cpf: '',
  phone: '',
  email: '',
  password: '',
  plate: '',
  cnhCategory: '',
  status: 'Pendente',
};

const blankClient: Client = {
  id: '',
  companyName: '',
  email: '',
  extraEmails: '',
  phone: '',
  address: '',
};

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(apiUrl(path), { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'Erro de comunicacao com o servidor.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function formatDate(date: string) {
  return date.split('-').reverse().join('/');
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function protocolFor(next: number) {
  return `MT-${today.replaceAll('-', '')}-${String(next).padStart(6, '0')}`;
}

function initialViewFromPath(): View {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/privacy') return 'privacy';
  if (path === '/terms') return 'terms';
  return 'login';
}

function App() {
  useEffect(() => {
    document.documentElement.classList.toggle('native-ios', Capacitor.getPlatform() === 'ios');
  }, []);

  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [view, setView] = useState<View>(() => initialViewFromPath());
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>('');
  const [session, setSession] = useState<{ role: 'driver' | 'admin'; driverId?: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const restoreSession = async () => {
      if (!localStorage.getItem(TOKEN_KEY)) return;
      try {
        const me = await apiRequest<{ session: { role: 'driver' | 'admin'; driverId?: string }; driver?: Driver }>('/api/me');
        setSession(me.session);
        await loadData();
        setView(me.session.role === 'admin' ? 'adminDashboard' : me.driver?.termsAcceptedAt ? 'driverDashboard' : 'termsAcceptance');
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setSession(null);
      }
    };
    restoreSession();
  }, []);

  const currentDriver = drivers.find((driver) => driver.id === session?.driverId);
  const selectedDelivery = deliveries.find((delivery) => delivery.id === selectedDeliveryId);

  const toast = (type: Toast['type'], message: string) => {
    const item = { id: newId('toast'), type, message };
    setToasts((items) => [...items, item]);
    window.setTimeout(() => setToasts((items) => items.filter((toastItem) => toastItem.id !== item.id)), 3200);
  };

  const loadData = async () => {
    const data = await apiRequest<{ drivers: Driver[]; clients: Client[]; deliveries: Delivery[] }>('/api/bootstrap');
    setDrivers(data.drivers);
    setClients(data.clients);
    setDeliveries(data.deliveries);
  };

  const saveDrivers = async (items: Driver[]) => {
    const changed = items.find((item) => drivers.find((driver) => driver.id === item.id && driver.status !== item.status));
    if (changed) {
      await apiRequest<{ driver: Driver }>(`/api/drivers/${changed.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: changed.status }),
      });
    }
    setDrivers(items);
  };

  const saveClients = async (items: Client[]) => {
    const created = items.find((item) => !clients.some((client) => client.id === item.id));
    const removed = clients.find((client) => !items.some((item) => item.id === client.id));
    const changed = items.find((item) => {
      const old = clients.find((client) => client.id === item.id);
      return old && JSON.stringify(old) !== JSON.stringify(item);
    });

    if (created) {
      const result = await apiRequest<{ client: Client }>('/api/clients', {
        method: 'POST',
        body: JSON.stringify(created),
      });
      setClients([result.client, ...clients]);
      return;
    }
    if (changed) {
      const result = await apiRequest<{ client: Client }>(`/api/clients/${changed.id}`, {
        method: 'PUT',
        body: JSON.stringify(changed),
      });
      setClients(clients.map((client) => (client.id === result.client.id ? result.client : client)));
      return;
    }
    if (removed) {
      await apiRequest<void>(`/api/clients/${removed.id}`, { method: 'DELETE' });
      setClients(items);
      return;
    }
  };

  const saveDeliveries = (items: Delivery[]) => {
    setDeliveries(items);
  };

  const loginDriver = async (email: string, password: string) => {
    try {
      const result = await apiRequest<{ token: string; session: { role: 'driver'; driverId: string }; driver: Driver }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role: 'driver' }),
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      setSession(result.session);
      await loadData();
      setView(result.driver.termsAcceptedAt ? 'driverDashboard' : 'termsAcceptance');
      toast('success', `Bem-vindo, ${result.driver.name.split(' ')[0]}.`);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'E-mail ou senha invalidos.');
    }
  };

  const loginAdmin = async (email: string, password: string) => {
    try {
      const result = await apiRequest<{ token: string; session: { role: 'admin' } }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, role: 'admin' }),
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      setSession(result.session);
      await loadData();
      setView('adminDashboard');
      toast('success', 'Painel administrativo liberado.');
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Credenciais administrativas invalidas.');
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setView('login');
  };

  const deleteMyAccount = async () => {
    await apiRequest<void>('/api/me', { method: 'DELETE' });
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setDrivers([]);
    setDeliveries([]);
    setView('login');
    toast('success', 'Conta e dados pessoais removidos.');
  };

  const acceptDriverTerms = async () => {
    try {
      const result = await apiRequest<{ driver: Driver }>('/api/drivers/terms/accept', { method: 'POST' });
      setDrivers((items) => items.map((driver) => (driver.id === result.driver.id ? result.driver : driver)));
      toast('success', 'Termos aceitos e arquivados com sucesso.');
      setView('driverDashboard');
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Nao foi possivel registrar o aceite.');
    }
  };

  const openDelivery = (id: string, target: View = 'deliveryDetails') => {
    setSelectedDeliveryId(id);
    setView(target);
  };

  const resendDeliveryEmail = async (id: string) => {
    const result = await apiRequest<{ delivery: Delivery }>(`/api/deliveries/${id}/send-email`, { method: 'POST' });
    setDeliveries((items) => items.map((delivery) => (delivery.id === result.delivery.id ? result.delivery : delivery)));
    const sent = result.delivery.emailStatus === 'Enviado';
    toast(sent ? 'success' : 'error', sent ? 'Comprovante enviado por e-mail.' : result.delivery.emailError || 'Nao foi possivel enviar o e-mail.');
  };

  return (
    <div className="min-h-screen bg-marra-paper text-marra-text">
      <ToastStack toasts={toasts} />
      {view === 'privacy' && <LegalScreen type="privacy" onBack={() => setView('login')} />}
      {view === 'terms' && <LegalScreen type="terms" onBack={() => setView('login')} />}
      {view === 'login' && <LoginScreen onLogin={loginDriver} onRegister={() => setView('register')} onAdmin={() => setView('adminLogin')} onPrivacy={() => setView('privacy')} onTerms={() => setView('terms')} />}
      {view === 'register' && (
        <RegisterScreen
          onBack={() => setView('login')}
          onSave={async (driver) => {
            try {
              await apiRequest<{ driver: Driver }>('/api/drivers/register', {
                method: 'POST',
                body: JSON.stringify(driver),
              });
              toast('success', 'Cadastro enviado para analise.');
              setView('login');
            } catch (error) {
              toast('error', error instanceof Error ? error.message : 'Nao foi possivel cadastrar.');
            }
          }}
        />
      )}
      {view === 'adminLogin' && <AdminLoginScreen onLogin={loginAdmin} onBack={() => setView('login')} />}

      {session?.role === 'driver' && currentDriver && (
        <DriverShell
          driver={currentDriver}
          view={view}
          setView={(nextView) => setView(currentDriver.termsAcceptedAt ? nextView : 'termsAcceptance')}
          logout={logout}
        >
          {view === 'termsAcceptance' && <TermsAcceptanceScreen driver={currentDriver} onAccept={acceptDriverTerms} />}
          {view === 'driverDashboard' && (
            <DriverDashboard
              driver={currentDriver}
              deliveries={deliveries.filter((delivery) => delivery.driverId === currentDriver.id)}
              onNew={() => setView('newDelivery')}
              onHistory={() => setView('history')}
              onAccount={() => setView('account')}
            />
          )}
          {view === 'newDelivery' && (
            <NewDeliveryScreen
              driver={currentDriver}
              clients={clients}
              deliveryCount={deliveries.length}
              onCancel={() => setView('driverDashboard')}
              onSave={async (delivery) => {
                try {
                  const result = await apiRequest<{ delivery: Delivery }>('/api/deliveries', {
                    method: 'POST',
                    body: JSON.stringify(delivery),
                  });
                  saveDeliveries([result.delivery, ...deliveries]);
                  setSelectedDeliveryId(result.delivery.id);
                  toast(
                    result.delivery.emailStatus === 'Enviado' ? 'success' : 'error',
                    result.delivery.emailStatus === 'Enviado'
                      ? `Entrega ${result.delivery.protocol} registrada e enviada por e-mail.`
                      : `Entrega registrada. E-mail: ${result.delivery.emailStatus || 'pendente'}.`,
                  );
                  setView('receipt');
                } catch (error) {
                  toast('error', error instanceof Error ? error.message : 'Nao foi possivel registrar a entrega.');
                }
              }}
              toast={toast}
            />
          )}
          {view === 'history' && (
            <DeliveryList
              deliveries={deliveries.filter((delivery) => delivery.driverId === currentDriver.id)}
              clients={clients}
              drivers={drivers}
              onOpen={(id) => openDelivery(id)}
            />
          )}
          {view === 'deliveryDetails' && selectedDelivery && (
            <DeliveryDetails delivery={selectedDelivery} clients={clients} drivers={drivers} onReceipt={() => setView('receipt')} onSendEmail={resendDeliveryEmail} />
          )}
          {view === 'receipt' && selectedDelivery && <Receipt delivery={selectedDelivery} clients={clients} drivers={drivers} />}
          {view === 'account' && <AccountScreen driver={currentDriver} onDeleteAccount={deleteMyAccount} toast={toast} />}
        </DriverShell>
      )}

      {session?.role === 'admin' && (
        <AdminShell view={view} setView={setView} logout={logout}>
          {view === 'adminDashboard' && <AdminDashboard drivers={drivers} clients={clients} deliveries={deliveries} />}
          {view === 'adminClients' && <ClientsManager clients={clients} saveClients={saveClients} toast={toast} />}
          {view === 'adminDrivers' && <DriversManager drivers={drivers} saveDrivers={saveDrivers} toast={toast} />}
          {view === 'adminDeliveries' && (
            <AdminDeliveries
              deliveries={deliveries}
              clients={clients}
              drivers={drivers}
              onOpen={(id, target) => openDelivery(id, target)}
            />
          )}
          {view === 'deliveryDetails' && selectedDelivery && (
            <DeliveryDetails delivery={selectedDelivery} clients={clients} drivers={drivers} onReceipt={() => setView('receipt')} onSendEmail={resendDeliveryEmail} />
          )}
          {view === 'receipt' && selectedDelivery && <Receipt delivery={selectedDelivery} clients={clients} drivers={drivers} />}
        </AdminShell>
      )}
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="ios-safe-toast fixed right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 shadow-soft ${
            toast.type === 'success' ? 'border-emerald-200 bg-white text-emerald-700' : 'border-red-200 bg-white text-red-700'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${compact ? 'h-12 w-28' : 'h-16 w-36'} flex items-center justify-center rounded-md bg-white px-2 py-1 shadow-sm`}>
      <img
        src="/marra-logo-tight.png"
        alt="Marra Transportes"
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}

function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[1fr_520px]">
      <section className="relative hidden overflow-hidden bg-marra-primary lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,174,239,0.3),transparent_45%),radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.16),transparent_30%)]" />
        <div className="relative flex h-full flex-col">
          <div className="flex h-24 items-center bg-white px-12">
            <BrandMark />
          </div>
          <div className="flex flex-1 flex-col justify-between p-12 text-white">
            <div className="max-w-xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold">
                <ShieldCheck size={17} /> Operacao digital
              </div>
              <h1 className="text-5xl font-black leading-tight tracking-normal">Comprovacao de entregas em tempo real.</h1>
              <p className="mt-5 text-lg leading-8 text-sky-50">
                Registro de motorista, cliente, fotos, assinatura, horario e localizacao em uma jornada simples para comprovacao operacional.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {['GPS', 'Fotos', 'PDF'].map((item) => (
                <div key={item} className="rounded-lg border border-white/15 bg-white/10 p-4">
                  <div className="text-2xl font-black">{item}</div>
                  <div className="mt-1 text-sm text-sky-100">validacao visual</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">{children}</section>
    </main>
  );
}

function LoginScreen({
  onLogin,
  onRegister,
  onAdmin,
  onPrivacy,
  onTerms,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: () => void;
  onAdmin: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(async () => {
      await onLogin(email, password);
      setLoading(false);
    }, 550);
  };

  return (
    <LoginFrame>
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-soft">
        <div className="mb-7 flex justify-center rounded-lg border border-slate-200 bg-white p-4">
          <BrandMark />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Acesso do motorista</h2>
        <p className="mt-2 text-sm text-slate-500">Use seu e-mail e senha cadastrados.</p>
        <div className="mt-6 space-y-4">
          <Field label="E-mail" value={email} onChange={setEmail} type="email" placeholder="motorista@email.com" />
          <Field label="Senha" value={password} onChange={setPassword} type="password" placeholder="******" />
        </div>
        <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-bold text-white transition hover:bg-sky-800">
          <Lock size={18} /> {loading ? 'Entrando...' : 'Entrar'}
        </button>
        <button type="button" onClick={onRegister} className="mt-3 w-full rounded-lg border border-marra-primary px-5 py-3 font-bold text-marra-primary">
          Cadastrar motorista
        </button>
        <button type="button" onClick={onAdmin} className="mt-5 text-sm font-bold text-slate-500 hover:text-marra-primary">
          Acessar painel administrativo
        </button>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-xs font-bold text-slate-500">
          <button type="button" onClick={onPrivacy} className="hover:text-marra-primary">Politica de Privacidade</button>
          <span>|</span>
          <button type="button" onClick={onTerms} className="hover:text-marra-primary">Termos de Uso</button>
        </div>
      </form>
    </LoginFrame>
  );
}

function AdminLoginScreen({ onLogin, onBack }: { onLogin: (email: string, password: string) => Promise<void>; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <LoginFrame>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          await onLogin(email, password);
        }}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-soft"
      >
        <div className="mb-7 rounded-lg bg-marra-primary p-5">
          <BrandMark />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Painel administrativo</h2>
        <p className="mt-2 text-sm text-slate-500">Use as credenciais administrativas configuradas no servidor.</p>
        <div className="mt-6 space-y-4">
          <Field label="E-mail" value={email} onChange={setEmail} type="email" />
          <Field label="Senha" value={password} onChange={setPassword} type="password" />
        </div>
        <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-bold text-white">
          <ShieldCheck size={18} /> Entrar como admin
        </button>
        <button type="button" onClick={onBack} className="mt-4 text-sm font-bold text-slate-500 hover:text-marra-primary">
          Voltar para login do motorista
        </button>
      </form>
    </LoginFrame>
  );
}

function RegisterScreen({ onBack, onSave }: { onBack: () => void; onSave: (driver: Driver) => Promise<void> }) {
  const [driver, setDriver] = useState<Driver>(blankDriver);
  const [cnhFileName, setCnhFileName] = useState('');
  const [cnhFileData, setCnhFileData] = useState('');
  const [accepted, setAccepted] = useState(false);
  const update = (key: keyof Driver, value: string) => setDriver((item) => ({ ...item, [key]: value }));

  const readCnh = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCnhFileName(file.name);
      setCnhFileData(String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  return (
    <LoginFrame>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!accepted) return;
          await onSave({ ...driver, cnhFileName, cnhFileData, acceptedTerms: accepted, commissionRate: DRIVER_COMMISSION_RATE });
        }}
        className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-7 shadow-soft"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Cadastro de motorista</h2>
            <p className="mt-1 text-sm text-slate-500">Status inicial: Pendente</p>
          </div>
          <button type="button" onClick={onBack} className="rounded-lg border border-slate-200 p-3 text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Nome" value={driver.name} onChange={(value) => update('name', value)} required />
          <Field label="CPF" value={driver.cpf} onChange={(value) => update('cpf', value)} required />
          <Field label="Telefone" value={driver.phone} onChange={(value) => update('phone', value)} required />
          <Field label="E-mail" value={driver.email} onChange={(value) => update('email', value)} type="email" required />
          <Field label="Senha" value={driver.password} onChange={(value) => update('password', value)} type="password" required />
          <Field label="Placa do veiculo" value={driver.plate} onChange={(value) => update('plate', value.toUpperCase())} required />
          <SelectField
            label="Categoria da CNH"
            value={driver.cnhCategory || ''}
            onChange={(value) => update('cnhCategory', value)}
            options={[
              { label: 'Selecione', value: '' },
              { label: 'Categoria C', value: 'C' },
              { label: 'Categoria D', value: 'D' },
              { label: 'Categoria E', value: 'E' },
            ]}
          />
        </div>
        <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-marra-secondary bg-sky-50 px-4 py-4 text-sm font-bold text-marra-primary">
          <span>{cnhFileName || 'Anexar CNH'}</span>
          <input
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="hidden"
            onChange={(event) => readCnh(event.target.files?.[0])}
          />
          <Camera size={18} />
        </label>
        <label className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4" required />
          <span>
            Li e aceito os Termos de Uso: atuo como parceiro independente, sem vinculo empregaticio, seguirei conduta etica, cuidado com o veiculo e ciencia de que a comissao operacional e de {DRIVER_COMMISSION_RATE}% do frete.
          </span>
        </label>
        <button disabled={!accepted} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <Save size={18} /> Salvar cadastro
        </button>
      </form>
    </LoginFrame>
  );
}

function TermsAcceptanceScreen({ driver, onAccept }: { driver: Driver; onAccept: () => Promise<void> }) {
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeader title="Termos operacionais" subtitle="Aceite obrigatorio para continuar usando a plataforma." />
      <Panel title="Termo de parceiro independente">
        <div className="space-y-4 text-sm leading-7 text-slate-700">
          <p>
            Eu, {driver.name}, declaro que atuo como parceiro independente da Marra Transportes, sem vinculo empregaticio,
            usando a plataforma para registrar entregas e comprovantes operacionais.
          </p>
          <p>
            Comprometo-me a manter conduta etica, registrar informacoes verdadeiras, preservar o veiculo utilizado,
            respeitar clientes atendidos e anexar somente fotos, assinaturas e dados relacionados ao servico realizado.
          </p>
          <p>
            Declaro ciencia de que para atuar e necessario possuir CNH categoria C, D ou E valida, e que a remuneracao
            por comissao corresponde a {DRIVER_COMMISSION_RATE}% do valor do frete, conforme politica operacional vigente.
          </p>
          <p className="rounded-lg bg-sky-50 p-4 font-bold text-marra-primary">
            Versao do termo: {TERMS_VERSION}. O aceite sera arquivado com data, hora e identificacao tecnica do acesso.
          </p>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4" />
          <span>Li, compreendi e aceito os termos operacionais acima.</span>
        </label>

        <button
          disabled={!accepted || saving}
          onClick={async () => {
            setSaving(true);
            await onAccept();
            setSaving(false);
          }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <ShieldCheck size={18} /> {saving ? 'Registrando aceite...' : 'Aceitar e continuar'}
        </button>
      </Panel>
    </div>
  );
}

function ShellNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold transition ${
        active ? 'bg-white text-marra-primary shadow-sm' : 'text-sky-50 hover:bg-white/10'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function DriverShell({
  driver,
  view,
  setView,
  logout,
  children,
}: {
  driver: Driver;
  view: View;
  setView: (view: View) => void;
  logout: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = (nextView: View) => {
    setView(nextView);
    setOpen(false);
  };
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className={`${open ? 'fixed inset-0 z-40 block ios-safe-panel' : 'hidden'} bg-marra-primary p-4 text-white lg:sticky lg:top-0 lg:block lg:h-screen lg:pt-4`}>
        <div className="flex items-center justify-between rounded-lg bg-white p-4">
          <BrandMark />
          <button className="text-slate-700 lg:hidden" onClick={() => setOpen(false)}>
            <X />
          </button>
        </div>
        <div className="mt-8 rounded-lg bg-white/10 p-4">
          <div className="text-sm text-sky-100">Motorista</div>
          <div className="mt-1 font-black">{driver.name}</div>
          <StatusPill status={driver.status} />
        </div>
        <nav className="mt-6 space-y-2">
          <ShellNavButton active={view === 'driverDashboard'} icon={<LayoutDashboard size={18} />} label="Dashboard" onClick={() => navigate('driverDashboard')} />
          <ShellNavButton active={view === 'newDelivery'} icon={<Plus size={18} />} label="Nova Entrega" onClick={() => navigate('newDelivery')} />
          <ShellNavButton active={view === 'history'} icon={<History size={18} />} label="Historico" onClick={() => navigate('history')} />
          <ShellNavButton active={view === 'account'} icon={<User size={18} />} label="Minha Conta" onClick={() => navigate('account')} />
        </nav>
        <button onClick={logout} className="absolute bottom-5 left-4 right-4 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold text-sky-50 hover:bg-white/10">
          <LogOut size={18} /> Sair
        </button>
      </aside>
      <main>
        <TopBar title="Portal do Motorista" onMenu={() => setOpen(true)} />
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

function AdminShell({
  view,
  setView,
  logout,
  children,
}: {
  view: View;
  setView: (view: View) => void;
  logout: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = (nextView: View) => {
    setView(nextView);
    setOpen(false);
  };
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[290px_1fr]">
      <aside className={`${open ? 'fixed inset-0 z-40 block ios-safe-panel' : 'hidden'} bg-slate-950 p-4 text-white lg:sticky lg:top-0 lg:block lg:h-screen lg:pt-4`}>
        <div className="rounded-lg bg-white p-4">
          <div className="flex items-center justify-between">
            <BrandMark />
            <button className="text-slate-700 lg:hidden" onClick={() => setOpen(false)}>
              <X />
            </button>
          </div>
        </div>
        <nav className="mt-6 space-y-2">
          <ShellNavButton active={view === 'adminDashboard'} icon={<BarChart3 size={18} />} label="Dashboard" onClick={() => navigate('adminDashboard')} />
          <ShellNavButton active={view === 'adminClients'} icon={<Users size={18} />} label="Clientes" onClick={() => navigate('adminClients')} />
          <ShellNavButton active={view === 'adminDrivers'} icon={<Truck size={18} />} label="Motoristas" onClick={() => navigate('adminDrivers')} />
          <ShellNavButton active={view === 'adminDeliveries'} icon={<ClipboardList size={18} />} label="Entregas" onClick={() => navigate('adminDeliveries')} />
        </nav>
        <button onClick={logout} className="absolute bottom-5 left-4 right-4 flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-bold text-sky-50 hover:bg-white/10">
          <LogOut size={18} /> Sair
        </button>
      </aside>
      <main>
        <TopBar title="Painel Administrativo" onMenu={() => setOpen(true)} />
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

function TopBar({ title, onMenu }: { title: string; onMenu: () => void }) {
  return (
    <header className="ios-safe-top ios-safe-top-offset sticky z-30 border-b border-slate-200 bg-white/95 px-4 pb-4 pt-4 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="rounded-lg border border-slate-200 p-2 lg:hidden" onClick={onMenu}>
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-black text-slate-900">{title}</h1>
        </div>
        <div className="hidden items-center gap-2 rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-marra-primary sm:flex">
          <CheckCircle2 size={17} /> Sistema online
        </div>
      </div>
    </header>
  );
}

function DriverDashboard({
  driver,
  deliveries,
  onNew,
  onHistory,
  onAccount,
}: {
  driver: Driver;
  deliveries: Delivery[];
  onNew: () => void;
  onHistory: () => void;
  onAccount: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-marra-primary p-6 text-white shadow-soft">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <p className="font-bold text-sky-100">Bom trabalho, {driver.name.split(' ')[0]}</p>
            <h2 className="mt-2 text-3xl font-black">Registre uma entrega com fotos, GPS e assinatura.</h2>
          </div>
          <button onClick={onNew} className="flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 font-black text-marra-primary">
            <Plus size={19} /> Nova Entrega
          </button>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<User />} label="Motorista" value={driver.name} />
        <Metric icon={<ShieldCheck />} label="Status da conta" value={driver.status} />
        <Metric icon={<ClipboardList />} label="Entregas realizadas" value={String(deliveries.length)} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ActionCard icon={<Plus />} title="Nova Entrega" text="Registrar comprovante completo." onClick={onNew} />
        <ActionCard icon={<History />} title="Historico" text="Consultar protocolos gerados." onClick={onHistory} />
        <ActionCard icon={<User />} title="Minha Conta" text="Ver dados cadastrais." onClick={onAccount} />
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-sky-50 text-marra-primary">{icon}</div>
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function ActionCard({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-lg border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-marra-primary text-white">{icon}</div>
      <h3 className="text-lg font-black text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </button>
  );
}

function NewDeliveryScreen({
  driver,
  clients,
  deliveryCount,
  onCancel,
  onSave,
  toast,
}: {
  driver: Driver;
  clients: Client[];
  deliveryCount: number;
  onCancel: () => void;
  onSave: (delivery: Delivery) => Promise<void>;
  toast: (type: Toast['type'], message: string) => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const selectedClient = clients.find((client) => client.id === clientId);
  const [documentType, setDocumentType] = useState<Delivery['documentType']>('NF');
  const [address, setAddress] = useState(selectedClient?.address ?? '');
  const [plate, setPlate] = useState(driver.plate);
  const [notes, setNotes] = useState('');
  const [nfPhoto, setNfPhoto] = useState('');
  const [deliveryPhoto, setDeliveryPhoto] = useState('');
  const [signature, setSignature] = useState('');
  const [coords, setCoords] = useState<{ latitude?: number; longitude?: number }>({});
  const [locationLabel, setLocationLabel] = useState('');
  const [loadingGps, setLoadingGps] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedClient) setAddress(selectedClient.address);
  }, [clientId]);

  const captureGps = async () => {
    setLoadingGps(true);
    if (Capacitor.isNativePlatform()) {
      try {
        const permission = await CapacitorGeolocation.requestPermissions();
        if (permission.location === 'denied') {
          toast('error', 'Permissao de localizacao negada.');
          return;
        }
        const position = await CapacitorGeolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 6500,
        });
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setCoords({ latitude, longitude });
        const label = await reverseGeocode(latitude, longitude);
        setLocationLabel(label || 'Endereco aproximado nao identificado');
        toast('success', label ? 'Localizacao capturada com endereco aproximado.' : 'Localizacao capturada.');
      } catch {
        toast('error', 'Nao foi possivel capturar o GPS. Verifique a permissao de localizacao.');
      } finally {
        setLoadingGps(false);
      }
      return;
    }
    if (!navigator.geolocation) {
      toast('error', 'GPS indisponivel neste dispositivo.');
      setLoadingGps(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setCoords({ latitude, longitude });
        const label = await reverseGeocode(latitude, longitude);
        setLocationLabel(label || 'Endereco aproximado nao identificado');
        toast('success', label ? 'Localizacao capturada com endereco aproximado.' : 'Localizacao capturada.');
        setLoadingGps(false);
      },
      () => {
        toast('error', 'Nao foi possivel capturar o GPS. Verifique a permissao de localizacao.');
        setLoadingGps(false);
      },
      { enableHighAccuracy: true, timeout: 6500 },
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!clientId) {
      toast('error', 'Selecione um cliente.');
      return;
    }
    if (!nfPhoto) {
      toast('error', 'Inclua a foto da nota fiscal antes de finalizar.');
      return;
    }
    if (!deliveryPhoto) {
      toast('error', 'Inclua a foto da entrega antes de finalizar.');
      return;
    }
    if (!signature) {
      toast('error', 'Inclua a assinatura antes de finalizar.');
      return;
    }
    if (coords.latitude === undefined || coords.longitude === undefined) {
      toast('error', 'Capture a localizacao GPS antes de finalizar.');
      return;
    }
    const now = new Date();
    setSaving(true);
    try {
      await onSave({
        id: newId('delivery'),
        protocol: protocolFor(deliveryCount + 1),
        driverId: driver.id,
        clientId,
        documentType,
        address,
        plate,
        notes,
        nfPhoto,
        deliveryPhoto,
        signature,
        latitude: coords.latitude,
        longitude: coords.longitude,
        locationLabel,
        date: now.toISOString().slice(0, 10),
        time: now.toTimeString().slice(0, 5),
        status: 'Concluida',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <SectionHeader title="Nova Entrega" subtitle="Preencha os dados para gerar o comprovante digital." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Cliente" value={clientId} onChange={setClientId} options={clients.map((client) => ({ label: client.companyName, value: client.id }))} />
            <SelectField label="Documento" value={documentType} onChange={(value) => setDocumentType(value as Delivery['documentType'])} options={['CTE', 'NF', 'RDVO'].map((item) => ({ label: item, value: item }))} />
            <Field label="Endereco" value={address} onChange={setAddress} required />
            <Field label="Placa" value={plate} onChange={(value) => setPlate(value.toUpperCase())} required />
          </div>
          <TextArea label="Observacoes" value={notes} onChange={setNotes} />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <ImageUpload label="Foto da NF" value={nfPhoto} onChange={setNfPhoto} />
            <ImageUpload label="Foto da entrega" value={deliveryPhoto} onChange={setDeliveryPhoto} />
          </div>
          <SignaturePad onChange={setSignature} />
        </div>
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-black text-slate-900">Itens obrigatorios</h3>
            <div className="mt-3 space-y-2">
              <RequirementItem done={Boolean(nfPhoto)} label="Foto da nota fiscal" />
              <RequirementItem done={Boolean(deliveryPhoto)} label="Foto da entrega" />
              <RequirementItem done={Boolean(signature)} label="Assinatura" />
              <RequirementItem done={coords.latitude !== undefined && coords.longitude !== undefined} label="Localizacao GPS" />
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-black text-slate-900">GPS</h3>
            <p className="mt-2 text-sm text-slate-500">Captura real via navegador, mediante permissao do dispositivo.</p>
            <button type="button" onClick={captureGps} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-4 py-3 font-bold text-white">
              <MapPin size={18} /> {loadingGps ? 'Capturando...' : 'Capturar Localizacao'}
            </button>
            <LocationPreview latitude={coords.latitude} longitude={coords.longitude} label={locationLabel} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-black text-slate-900">Data e hora</h3>
            <p className="mt-2 text-sm text-slate-500">Preenchidas automaticamente ao finalizar.</p>
            <div className="mt-4 rounded-lg bg-sky-50 p-4 text-sm font-bold text-marra-primary">
              Proximo protocolo: {protocolFor(deliveryCount + 1)}
            </div>
          </div>
          <div className="grid gap-3">
            <button disabled={saving} className="flex items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-60">
              <CheckCircle2 size={18} /> {saving ? 'Registrando entrega...' : 'Finalizar entrega'}
            </button>
            <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 bg-white px-5 py-3 font-bold text-slate-600">
              Cancelar
            </button>
          </div>
        </aside>
      </div>
    </form>
  );
}

function DeliveryList({
  deliveries,
  clients,
  drivers,
  onOpen,
}: {
  deliveries: Delivery[];
  clients: Client[];
  drivers: Driver[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionHeader title="Historico de Entregas" subtitle="Protocolos registrados pelo motorista." />
      <ResponsiveTable
        headers={['Protocolo', 'Cliente', 'Data', 'Hora', 'Status', '']}
        rows={deliveries.map((delivery) => [
          delivery.protocol,
          clients.find((client) => client.id === delivery.clientId)?.companyName ?? '-',
          formatDate(delivery.date),
          delivery.time,
          delivery.status,
          <button key={delivery.id} onClick={() => onOpen(delivery.id)} className="inline-flex items-center gap-2 rounded-lg bg-marra-primary px-3 py-2 text-sm font-bold text-white">
            <Eye size={16} /> Abrir
          </button>,
        ])}
        empty="Nenhuma entrega encontrada."
      />
    </div>
  );
}

function DeliveryDetails({
  delivery,
  clients,
  drivers,
  onReceipt,
  onSendEmail,
}: {
  delivery: Delivery;
  clients: Client[];
  drivers: Driver[];
  onReceipt: () => void;
  onSendEmail: (id: string) => Promise<void>;
}) {
  const client = clients.find((item) => item.id === delivery.clientId);
  const driver = drivers.find((item) => item.id === delivery.driverId);
  const [sending, setSending] = useState(false);
  const receiptUrl = delivery.receiptToken ? `${PUBLIC_WEB_URL}/comprovante/${delivery.receiptToken}` : '';
  return (
    <div className="space-y-6">
      <SectionHeader title="Detalhes da Entrega" subtitle={delivery.protocol} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <InfoGrid
            items={[
              ['Motorista', driver?.name ?? '-'],
              ['Cliente', client?.companyName ?? '-'],
              ['Documento', delivery.documentType],
              ['Endereco', delivery.address],
              ['Data', formatDate(delivery.date)],
              ['Hora', delivery.time],
              ['Localizacao aproximada', delivery.locationLabel || '-'],
              ['Latitude', delivery.latitude?.toFixed(6) ?? '-'],
              ['Longitude', delivery.longitude?.toFixed(6) ?? '-'],
              ['Envio por e-mail', delivery.emailStatus || 'Pendente'],
              ['Destinatarios', delivery.emailRecipients || '-'],
              ['Enviado em', delivery.emailSentAt ? formatDateTime(delivery.emailSentAt) : '-'],
              ['Observacoes', delivery.notes || '-'],
            ]}
          />
          {delivery.emailError && (
            <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm font-bold text-amber-800">
              E-mail: {delivery.emailError}
            </div>
          )}
          <LocationPreview latitude={delivery.latitude} longitude={delivery.longitude} label={delivery.locationLabel} />
        </div>
        <div className="space-y-4">
          <button onClick={onReceipt} className="flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-black text-white">
            <FileText size={18} /> Visualizar Comprovante
          </button>
          {receiptUrl && (
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-50 px-5 py-3 font-black text-marra-primary">
              <Eye size={18} /> Abrir link publico
            </a>
          )}
          <button
            disabled={sending}
            onClick={async () => {
              setSending(true);
              try {
                await onSendEmail(delivery.id);
              } finally {
                setSending(false);
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-marra-primary px-5 py-3 font-black text-marra-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Mail size={18} /> {sending ? 'Enviando...' : 'Reenviar comprovante por e-mail'}
          </button>
          <ImagePreview title="Foto da NF" src={delivery.nfPhoto} />
          <ImagePreview title="Foto da entrega" src={delivery.deliveryPhoto} />
          <ImagePreview title="Assinatura" src={delivery.signature} />
        </div>
      </div>
    </div>
  );
}

function Receipt({ delivery, clients, drivers }: { delivery: Delivery; clients: Client[]; drivers: Driver[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const client = clients.find((item) => item.id === delivery.clientId);
  const driver = drivers.find((item) => item.id === delivery.driverId);
  const [generating, setGenerating] = useState(false);

  const generatePdf = async () => {
    setGenerating(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      let y = 14;

      const loadImage = async (src?: string) => {
        if (!src) return '';
        if (src.startsWith('data:')) return src;
        const response = await fetch(assetUrl(src));
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Falha ao carregar imagem do PDF.'));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
      };

      const addWrapped = (label: string, value: string, x: number, top: number, width: number) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8);
        pdf.setTextColor(0, 90, 156);
        pdf.text(label.toUpperCase(), x, top);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(11);
        pdf.setTextColor(35, 35, 35);
        const lines = pdf.splitTextToSize(value || '-', width);
        pdf.text(lines, x, top + 6);
        return top + 10 + lines.length * 5;
      };

      const addImageBox = (title: string, src: string, x: number, top: number, width: number, height: number) => {
        pdf.setDrawColor(220, 226, 232);
        pdf.roundedRect(x, top, width, height, 2, 2);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(0, 90, 156);
        pdf.text(title, x + 4, top + 7);
        if (src) {
          const format = src.includes('image/png') ? 'PNG' : 'JPEG';
          pdf.addImage(src, format, x + 4, top + 11, width - 8, height - 16, undefined, 'FAST');
        }
      };

      pdf.setFillColor(0, 90, 156);
      pdf.rect(0, 0, pageWidth, 36, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text('COMPROVANTE DE ENTREGA', margin, 18);
      pdf.setFontSize(9);
      pdf.text('Marra Transportes', margin, 27);

      y = 48;
      pdf.setDrawColor(0, 90, 156);
      pdf.setFillColor(244, 248, 252);
      pdf.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(0, 90, 156);
      pdf.text('PROTOCOLO', margin + 4, y + 6);
      pdf.setFontSize(15);
      pdf.setTextColor(10, 20, 35);
      pdf.text(delivery.protocol, margin + 4, y + 14);
      y += 28;

      const left = margin;
      const right = margin + contentWidth / 2 + 4;
      const colWidth = contentWidth / 2 - 4;
      let leftY = y;
      let rightY = y;
      leftY = addWrapped('Motorista', driver?.name ?? '-', left, leftY, colWidth);
      rightY = addWrapped('Cliente', client?.companyName ?? '-', right, rightY, colWidth);
      leftY = addWrapped('Documento', delivery.documentType, left, leftY, colWidth);
      rightY = addWrapped('Placa', delivery.plate, right, rightY, colWidth);
      leftY = addWrapped('Data', formatDate(delivery.date), left, leftY, colWidth);
      rightY = addWrapped('Hora', delivery.time, right, rightY, colWidth);
      y = Math.max(leftY, rightY) + 2;
      y = addWrapped('Endereco', delivery.address, margin, y, contentWidth);
      y = addWrapped('Localizacao aproximada', delivery.locationLabel || '-', margin, y, contentWidth);
      y = addWrapped('GPS', `${delivery.latitude?.toFixed(6) ?? '-'}, ${delivery.longitude?.toFixed(6) ?? '-'}`, margin, y, contentWidth);
      y = addWrapped('Observacoes', delivery.notes || '-', margin, y, contentWidth);

      const nf = await loadImage(delivery.nfPhoto);
      const entrega = await loadImage(delivery.deliveryPhoto);
      const assinatura = await loadImage(delivery.signature);

      pdf.addPage();
      y = 14;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(0, 90, 156);
      pdf.text('EVIDENCIAS DA ENTREGA', margin, y);
      y += 8;
      addImageBox('Foto da NF', nf, margin, y, contentWidth, 72);
      y += 80;
      addImageBox('Foto da entrega', entrega, margin, y, contentWidth, 72);
      y += 80;
      addImageBox('Assinatura', assinatura, margin, y, contentWidth, 42);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(120, 130, 145);
      pdf.text('Documento gerado automaticamente pelo sistema Marra Transportes.', margin, pageHeight - 10);
      pdf.save(`${delivery.protocol}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <SectionHeader title="Comprovante" subtitle="Layout para download e apresentacao ao cliente." />
        <button onClick={generatePdf} className="flex items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-black text-white">
          <Download size={18} /> {generating ? 'Gerando...' : 'Gerar PDF'}
        </button>
      </div>
      <div ref={ref} className="receipt-paper mx-auto max-w-4xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
        <header className="bg-marra-primary p-7 text-white">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <BrandMark />
            <div className="text-left sm:text-right">
              <p className="text-sm font-bold uppercase text-sky-100">Comprovante digital</p>
              <h2 className="mt-1 text-2xl font-black">COMPROVANTE DE ENTREGA</h2>
            </div>
          </div>
        </header>
        <main className="p-6 sm:p-8">
          <div className="mb-6 rounded-lg border border-marra-primary bg-sky-50 p-4">
            <div className="text-sm font-bold text-marra-primary">Protocolo</div>
            <div className="break-all text-2xl font-black text-slate-900 sm:text-3xl">{delivery.protocol}</div>
          </div>
          <InfoGrid
            items={[
              ['Motorista', driver?.name ?? '-'],
              ['Cliente', client?.companyName ?? '-'],
              ['Documento', delivery.documentType],
              ['Endereco', delivery.address],
              ['Data', formatDate(delivery.date)],
              ['Hora', delivery.time],
              ['Placa', delivery.plate],
              ['Localizacao aproximada', delivery.locationLabel || '-'],
              ['GPS', `${delivery.latitude?.toFixed(6) ?? '-'}, ${delivery.longitude?.toFixed(6) ?? '-'}`],
              ['Observacoes', delivery.notes || '-'],
            ]}
          />
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <ImagePreview title="Foto da NF" src={delivery.nfPhoto} />
            <ImagePreview title="Foto da entrega" src={delivery.deliveryPhoto} />
          </div>
          <div className="mt-5">
            <ImagePreview title="Assinatura" src={delivery.signature} />
          </div>
          <footer className="mt-8 border-t border-slate-200 pt-5 text-center text-xs font-semibold text-slate-500">
            Marra Transportes - documento gerado automaticamente pelo sistema.
          </footer>
        </main>
      </div>
    </div>
  );
}

function AdminDashboard({ drivers, clients, deliveries }: { drivers: Driver[]; clients: Client[]; deliveries: Delivery[] }) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Dashboard" subtitle="Indicadores operacionais do banco de dados." />
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Truck />} label="Motoristas cadastrados" value={String(drivers.length)} />
        <Metric icon={<Users />} label="Clientes cadastrados" value={String(clients.length)} />
        <Metric icon={<ClipboardList />} label="Entregas realizadas" value={String(deliveries.length)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Status dos motoristas">
          {(['Aprovado', 'Pendente', 'Reprovado', 'Bloqueado'] as DriverStatus[]).map((status) => (
            <div key={status} className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 p-4">
              <StatusPill status={status} />
              <span className="text-xl font-black text-slate-900">{drivers.filter((driver) => driver.status === status).length}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Ultimas entregas">
          {deliveries.slice(0, 4).map((delivery) => (
            <div key={delivery.id} className="mb-3 rounded-lg border border-slate-100 p-4">
              <div className="font-black text-slate-900">{delivery.protocol}</div>
              <div className="mt-1 text-sm text-slate-500">{formatDate(delivery.date)} as {delivery.time}</div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function ClientsManager({ clients, saveClients, toast }: { clients: Client[]; saveClients: (clients: Client[]) => Promise<void>; toast: (type: Toast['type'], message: string) => void }) {
  const [form, setForm] = useState<Client>(blankClient);
  const editing = Boolean(form.id);
  const update = (key: keyof Client, value: string) => setForm((item) => ({ ...item, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editing) {
        await saveClients(clients.map((client) => (client.id === form.id ? form : client)));
        toast('success', 'Cliente atualizado.');
      } else {
        await saveClients([{ ...form, id: newId('client') }, ...clients]);
        toast('success', 'Cliente cadastrado.');
      }
      setForm(blankClient);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Nao foi possivel salvar o cliente.');
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[390px_1fr]">
      <Panel title={editing ? 'Editar cliente' : 'Novo cliente'}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nome da empresa" value={form.companyName} onChange={(value) => update('companyName', value)} required />
          <Field label="E-mail principal" value={form.email} onChange={(value) => update('email', value)} type="email" required />
          <Field label="E-mails adicionais" value={form.extraEmails} onChange={(value) => update('extraEmails', value)} />
          <Field label="Telefone" value={form.phone} onChange={(value) => update('phone', value)} required />
          <TextArea label="Endereco" value={form.address} onChange={(value) => update('address', value)} required />
          <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-black text-white">
            <Save size={18} /> Salvar cliente
          </button>
        </form>
      </Panel>
      <Panel title="Clientes cadastrados">
        <div className="space-y-3">
          {clients.map((client) => (
            <div key={client.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center">
              <div>
                <div className="font-black text-slate-900">{client.companyName}</div>
                <div className="text-sm text-slate-500">{client.email}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setForm(client)} className="rounded-lg border border-slate-200 p-3 text-marra-primary">
                  <Edit3 size={17} />
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Deseja excluir o cliente ${client.companyName}?`)) return;
                    try {
                      await saveClients(clients.filter((item) => item.id !== client.id));
                      toast('success', 'Cliente removido.');
                    } catch (error) {
                      toast('error', error instanceof Error ? error.message : 'Nao foi possivel remover o cliente.');
                    }
                  }}
                  className="rounded-lg border border-red-200 p-3 text-red-600"
                >
                  <X size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function DriversManager({
  drivers,
  saveDrivers,
  toast,
}: {
  drivers: Driver[];
  saveDrivers: (drivers: Driver[]) => Promise<void>;
  toast: (type: Toast['type'], message: string) => void;
}) {
  const [openDriverId, setOpenDriverId] = useState<string | null>(null);
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null);

  const setStatus = async (driver: Driver, status: DriverStatus) => {
    setUpdatingDriverId(driver.id);
    try {
      await saveDrivers(drivers.map((item) => (item.id === driver.id ? { ...item, status } : item)));
      toast('success', `${driver.name} agora esta ${status.toLowerCase()}.`);
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Nao foi possivel atualizar o motorista.');
    } finally {
      setUpdatingDriverId(null);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Gestao de Motoristas" subtitle="Aprovacao e bloqueio com persistencia real no banco de dados." />
      <div className="grid gap-4">
        {drivers.map((driver) => {
          const isOpen = openDriverId === driver.id;
          const updating = updatingDriverId === driver.id;
          return (
            <div key={driver.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-black text-slate-900">{driver.name}</h3>
                    <StatusPill status={driver.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{driver.email} - {driver.phone} - Placa {driver.plate}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    CNH: {driver.cnhFileName ?? 'nao enviada'} {driver.cnhCategory ? `- Categoria ${driver.cnhCategory}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenDriverId(isOpen ? null : driver.id)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
                  >
                    {isOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                  </button>
                  <StatusButton label="Aprovar" disabled={updating} onClick={() => setStatus(driver, 'Aprovado')} />
                  <StatusButton label="Reprovar" disabled={updating} onClick={() => setStatus(driver, 'Reprovado')} />
                  <StatusButton label="Bloquear" disabled={updating} onClick={() => setStatus(driver, 'Bloqueado')} danger />
                </div>
              </div>
              {isOpen && (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <InfoGrid
                    items={[
                      ['Nome', driver.name],
                      ['CPF', driver.cpf],
                      ['Telefone', driver.phone],
                      ['E-mail', driver.email],
                      ['Placa do veiculo', driver.plate],
                      ['Categoria CNH', driver.cnhCategory ? `Categoria ${driver.cnhCategory}` : 'nao informada'],
                      ['CNH', driver.cnhFileName ?? 'nao enviada'],
                      ['Comissao', `${driver.commissionRate ?? DRIVER_COMMISSION_RATE}% do frete`],
                      [
                        'Aceite dos termos',
                        driver.termsAcceptedAt
                          ? `${formatDate(driver.termsAcceptedAt.slice(0, 10))} - versao ${driver.termsVersion || TERMS_VERSION}`
                          : 'pendente',
                      ],
                      ['Status', driver.status],
                    ]}
                  />
                  {driver.cnhFileUrl ? (
                    <a
                      href={driver.cnhFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-marra-primary px-4 py-3 text-sm font-black text-white"
                    >
                      <FileText size={17} /> Abrir documento CNH
                    </a>
                  ) : (
                    <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm font-bold text-amber-700">
                      Documento nao disponivel para visualizacao. Este cadastro possui apenas o nome do arquivo.
                    </div>
                  )}
                  <TermsArchiveButton driver={driver} toast={toast} className="mt-3" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminDeliveries({
  deliveries,
  clients,
  drivers,
  onOpen,
}: {
  deliveries: Delivery[];
  clients: Client[];
  drivers: Driver[];
  onOpen: (id: string, target: View) => void;
}) {
  const [client, setClient] = useState('');
  const [driver, setDriver] = useState('');
  const [date, setDate] = useState('');
  const filtered = deliveries.filter((delivery) => {
    return (!client || delivery.clientId === client) && (!driver || delivery.driverId === driver) && (!date || delivery.date === date);
  });
  return (
    <div className="space-y-5">
      <SectionHeader title="Gestao de Entregas" subtitle="Filtros por cliente, motorista e data." />
      <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
        <SelectField label="Cliente" value={client} onChange={setClient} options={[{ label: 'Todos', value: '' }, ...clients.map((item) => ({ label: item.companyName, value: item.id }))]} />
        <SelectField label="Motorista" value={driver} onChange={setDriver} options={[{ label: 'Todos', value: '' }, ...drivers.map((item) => ({ label: item.name, value: item.id }))]} />
        <Field label="Data" value={date} onChange={setDate} type="date" />
      </div>
      <ResponsiveTable
        headers={['Protocolo', 'Cliente', 'Motorista', 'Data', 'Status', '']}
        rows={filtered.map((delivery) => [
          delivery.protocol,
          clients.find((item) => item.id === delivery.clientId)?.companyName ?? '-',
          drivers.find((item) => item.id === delivery.driverId)?.name ?? '-',
          formatDate(delivery.date),
          delivery.status,
          <div key={delivery.id} className="flex gap-2">
            <button onClick={() => onOpen(delivery.id, 'deliveryDetails')} className="rounded-lg bg-marra-primary px-3 py-2 text-sm font-bold text-white">Detalhes</button>
            <button onClick={() => onOpen(delivery.id, 'receipt')} className="rounded-lg border border-marra-primary px-3 py-2 text-sm font-bold text-marra-primary">Comprovante</button>
          </div>,
        ])}
        empty="Nenhuma entrega com estes filtros."
      />
    </div>
  );
}

function AccountScreen({ driver, onDeleteAccount, toast }: { driver: Driver; onDeleteAccount: () => Promise<void>; toast: (type: Toast['type'], message: string) => void }) {
  return (
    <div className="space-y-5">
      <SectionHeader title="Minha Conta" subtitle="Dados do motorista cadastrados no sistema." />
      <Panel title="Dados cadastrais">
        <InfoGrid
          items={[
            ['Nome', driver.name],
            ['CPF', driver.cpf],
            ['Telefone', driver.phone],
            ['E-mail', driver.email],
            ['Placa do veiculo', driver.plate],
            ['Categoria CNH', driver.cnhCategory ? `Categoria ${driver.cnhCategory}` : '-'],
            ['CNH', driver.cnhFileName ?? '-'],
            ['Comissao', `${driver.commissionRate ?? DRIVER_COMMISSION_RATE}% do frete`],
            [
              'Aceite dos termos',
              driver.termsAcceptedAt
                ? `${formatDate(driver.termsAcceptedAt.slice(0, 10))} - versao ${driver.termsVersion || TERMS_VERSION}`
                : 'pendente',
            ],
            ['Status', driver.status],
          ]}
        />
        <TermsArchiveButton driver={driver} toast={toast} className="mt-4" />
      </Panel>
      <Panel title="Privacidade e dados">
        <p className="text-sm leading-6 text-slate-600">
          Voce pode solicitar a exclusao da sua conta pelo proprio app. A acao remove seu cadastro, entregas vinculadas e arquivos enviados.
        </p>
        <button
          onClick={async () => {
            if (!window.confirm('Deseja excluir sua conta e dados vinculados? Esta acao nao pode ser desfeita.')) return;
            try {
              await onDeleteAccount();
            } catch (error) {
              toast('error', error instanceof Error ? error.message : 'Nao foi possivel excluir a conta.');
            }
          }}
          className="mt-4 rounded-lg bg-red-50 px-5 py-3 font-black text-red-700"
        >
          Excluir minha conta
        </button>
      </Panel>
    </div>
  );
}

function TermsArchiveButton({
  driver,
  toast,
  className = '',
}: {
  driver: Driver;
  toast: (type: Toast['type'], message: string) => void;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const { acceptance } = await apiRequest<{ acceptance: DriverTermAcceptance }>(`/api/drivers/${driver.id}/terms/latest`);
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`${acceptance.id}|${acceptance.driverId}|${acceptance.acceptedAt}|${acceptance.termsText}`),
      );
      const verificationCode = Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 24)
        .toUpperCase();

      const logo = await fetch(assetUrl('/marra-logo-tight.png'))
        .then((response) => response.blob())
        .then(
          (blob) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () => reject(new Error('Falha ao carregar logo.'));
              reader.onload = () => resolve(String(reader.result));
              reader.readAsDataURL(blob);
            }),
        )
        .catch(() => '');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 16;
      const contentWidth = pageWidth - margin * 2;
      let y = 16;

      const addFooter = () => {
        pdf.setDrawColor(225, 231, 239);
        pdf.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.text('Documento gerado automaticamente pelo sistema Marra Transportes.', margin, pageHeight - 9);
        pdf.text(`Codigo de verificacao: ${verificationCode}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
      };

      const ensureSpace = (height: number) => {
        if (y + height <= pageHeight - 22) return;
        addFooter();
        pdf.addPage();
        y = 18;
      };

      const addInfoBox = (label: string, value: string, x: number, top: number, width: number) => {
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(x, top, width, 19, 2, 2, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.5);
        pdf.setTextColor(71, 85, 105);
        pdf.text(label.toUpperCase(), x + 4, top + 6);
        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        pdf.text(pdf.splitTextToSize(value || '-', width - 8), x + 4, top + 14);
      };

      pdf.setFillColor(0, 90, 156);
      pdf.rect(0, 0, pageWidth, 42, 'F');
      if (logo) {
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(margin, 9, 44, 23, 2, 2, 'F');
        pdf.addImage(logo, 'PNG', margin + 4, 11, 36, 18, undefined, 'FAST');
      }
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.setTextColor(255, 255, 255);
      pdf.text('COMPROVANTE DE ACEITE ELETRONICO', margin + 52, 18);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text('Termo de parceiro independente - Marra Transportes', margin + 52, 26);
      pdf.text(`Versao ${acceptance.termsVersion}`, margin + 52, 33);

      y = 54;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 90, 156);
      pdf.text('IDENTIFICACAO DO ACEITE', margin, y);
      y += 6;

      const half = contentWidth / 2 - 3;
      addInfoBox('Motorista', acceptance.driverName, margin, y, half);
      addInfoBox('CPF', acceptance.driverCpf, margin + half + 6, y, half);
      y += 23;
      addInfoBox('E-mail', acceptance.driverEmail, margin, y, half);
      addInfoBox('Placa', acceptance.driverPlate, margin + half + 6, y, half);
      y += 23;
      addInfoBox('Categoria CNH', acceptance.cnhCategory ? `Categoria ${acceptance.cnhCategory}` : 'nao informada', margin, y, half);
      addInfoBox('Comissao', `${acceptance.commissionRate}% do frete`, margin + half + 6, y, half);
      y += 23;
      addInfoBox('Data e hora do aceite', formatDateTime(acceptance.acceptedAt), margin, y, half);
      addInfoBox('IP registrado', acceptance.acceptedIp || 'nao informado', margin + half + 6, y, half);
      y += 23;

      pdf.setFillColor(239, 246, 255);
      pdf.setDrawColor(0, 90, 156);
      pdf.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(0, 90, 156);
      pdf.text('CODIGO DE VERIFICACAO DO ACEITE', margin + 4, y + 6);
      pdf.setFontSize(12);
      pdf.setTextColor(15, 23, 42);
      pdf.text(verificationCode, margin + 4, y + 14);
      y += 28;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 90, 156);
      pdf.text('DECLARACAO DE ACEITE', margin, y);
      y += 7;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(51, 65, 85);
      const declaration = `O motorista acima identificado realizou aceite eletronico do termo operacional na data e hora registradas neste comprovante. O aceite foi arquivado no sistema da Marra Transportes com a versao do termo, dados cadastrais, identificacao tecnica do acesso e texto integral aceito.`;
      const declarationLines = pdf.splitTextToSize(declaration, contentWidth);
      pdf.text(declarationLines, margin, y);
      y += declarationLines.length * 5 + 10;

      ensureSpace(40);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(0, 90, 156);
      pdf.text('TEXTO INTEGRAL ACEITO', margin, y);
      y += 7;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(30, 41, 59);
      const termLines = pdf.splitTextToSize(acceptance.termsText, contentWidth);
      termLines.forEach((line: string) => {
        ensureSpace(5);
        pdf.text(line, margin, y);
        y += 5;
      });

      y += 8;
      ensureSpace(35);
      pdf.setDrawColor(148, 163, 184);
      pdf.line(margin, y + 12, margin + 74, y + 12);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(15, 23, 42);
      pdf.text(acceptance.driverName, margin, y + 18);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(71, 85, 105);
      pdf.text('Aceite eletronico registrado pelo proprio motorista', margin, y + 23);

      addFooter();
      pdf.save(`termo-aceite-${acceptance.driverName.toLowerCase().replaceAll(' ', '-')}-${acceptance.termsVersion}.pdf`);
      toast('success', 'Termo de aceite em PDF baixado.');
    } catch (error) {
      toast('error', error instanceof Error ? error.message : 'Nao foi possivel baixar o termo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading || !driver.termsAcceptedAt}
      className={`${className} inline-flex items-center gap-2 rounded-lg bg-marra-primary px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300`}
    >
      <Download size={17} /> {loading ? 'Gerando PDF...' : 'Baixar termo aceito em PDF'}
    </button>
  );
}

function LegalScreen({ type, onBack }: { type: 'privacy' | 'terms'; onBack: () => void }) {
  const isPrivacy = type === 'privacy';
  return (
    <main className="min-h-screen bg-marra-paper p-4 sm:p-8">
      <section className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-soft sm:p-8">
        <div className="mb-6 rounded-lg bg-marra-primary p-5">
          <BrandMark />
        </div>
        <h1 className="text-2xl font-black text-slate-900">{isPrivacy ? 'Politica de Privacidade' : 'Termos de Uso'}</h1>
        <p className="mt-2 text-sm text-slate-500">Marra Transportes - aplicativo de comprovacao de entregas.</p>

        {isPrivacy ? (
          <div className="mt-6 space-y-4 text-sm leading-7 text-slate-700">
            <p>Coletamos dados de cadastro do motorista, dados de clientes atendidos, fotos da entrega e da nota fiscal, assinatura, placa, observacoes, data, hora e localizacao GPS para comprovar a execucao do servico.</p>
            <p>Camera, fotos e localizacao sao usados somente durante o registro da entrega. A localizacao e capturada mediante permissao do dispositivo.</p>
            <p>Os dados sao armazenados no servidor da empresa e acessados por motoristas autorizados e administradores. Nao vendemos dados pessoais.</p>
            <p>O motorista pode solicitar a exclusao da conta em Minha Conta. A exclusao remove cadastro, entregas vinculadas e arquivos enviados, salvo quando houver obrigacao legal de retencao aplicavel.</p>
            <p>Contato do controlador: configure um e-mail corporativo oficial antes de publicar nas lojas.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-4 text-sm leading-7 text-slate-700">
            <p>O aplicativo deve ser usado por motoristas e administradores autorizados pela Marra Transportes para registrar entregas reais.</p>
            <p>O motorista atua como parceiro independente, sem vinculo empregaticio com a Marra Transportes, usando a plataforma para registrar a execucao dos servicos.</p>
            <p>Para operar, o motorista deve possuir CNH valida categoria C, D ou E. A comissao operacional informada e de {DRIVER_COMMISSION_RATE}% do valor do frete.</p>
            <p>O usuario deve manter conduta etica, zelar pelo veiculo utilizado, tratar clientes com respeito e seguir orientacoes operacionais aplicaveis.</p>
            <p>O usuario e responsavel por enviar informacoes verdadeiras, imagens relacionadas ao servico executado e assinatura obtida no ato da entrega.</p>
            <p>E proibido usar o aplicativo para registrar entregas inexistentes, dados de terceiros sem autorizacao ou conteudo inadequado.</p>
            <p>A empresa pode bloquear contas em caso de uso indevido, risco operacional ou encerramento do vinculo com o motorista.</p>
          </div>
        )}

        <button onClick={onBack} className="mt-8 rounded-lg bg-marra-primary px-5 py-3 font-black text-white">
          Voltar
        </button>
      </section>
    </main>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-2xl font-black text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-black text-slate-900">{title}</h3>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-marra-secondary focus:ring-4 focus:ring-sky-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-marra-secondary focus:ring-4 focus:ring-sky-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        rows={4}
        className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-marra-secondary focus:ring-4 focus:ring-sky-100"
      />
    </label>
  );
}

function ImageUpload({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const compressDataUrl = (original: string) =>
    new Promise<string>((resolve, reject) => {
      const image = new Image();
      image.onerror = () => resolve(original);
      image.onload = () => {
        const maxSide = 1400;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = original;
    });

  const compressImage = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
      reader.onload = async () => {
        try {
          resolve(await compressDataUrl(String(reader.result)));
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsDataURL(file);
    });

  const readImage = async (file?: File) => {
    if (!file) return;
    setProcessing(true);
    setError('');
    try {
      onChange(await compressImage(file));
    } catch {
      setError('Nao foi possivel carregar esta imagem. Tente outra foto.');
      onChange('');
    } finally {
      setProcessing(false);
    }
  };

  const captureNativePhoto = async () => {
    if (!Capacitor.isNativePlatform()) return;
    setProcessing(true);
    setError('');
    try {
      const permission = await CapacitorCamera.requestPermissions({ permissions: ['camera', 'photos'] });
      if (permission.camera === 'denied') {
        setError('Permissao de camera negada.');
        return;
      }
      const photo = await CapacitorCamera.getPhoto({
        quality: 82,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        allowEditing: false,
        promptLabelHeader: label,
        promptLabelPhoto: 'Tirar foto',
        promptLabelPicture: 'Galeria',
      });
      if (!photo.dataUrl) throw new Error('Foto sem dados.');
      onChange(await compressDataUrl(photo.dataUrl));
    } catch {
      setError('Nao foi possivel capturar esta foto. Tente novamente.');
      onChange('');
    } finally {
      setProcessing(false);
    }
  };

  const isNative = Capacitor.isNativePlatform();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-800">{label}</div>
          <div className={`mt-1 text-xs font-bold ${value ? 'text-emerald-700' : 'text-amber-700'}`}>
            {processing ? 'Processando imagem...' : value ? 'Imagem carregada' : 'Pendente'}
          </div>
        </div>
        {isNative ? (
          <button type="button" onClick={captureNativePhoto} className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-marra-primary px-3 py-2 text-sm font-black text-marra-primary">
            <Camera size={17} />
            {value ? 'Trocar' : 'Adicionar'}
          </button>
        ) : (
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-marra-primary px-3 py-2 text-sm font-black text-marra-primary">
            <Camera size={17} />
            {value ? 'Trocar' : 'Adicionar'}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => readImage(event.target.files?.[0])} />
          </label>
        )}
      </div>
      {error && <p className="mt-2 text-sm font-bold text-red-600">{error}</p>}
      {value ? (
        <img src={value} alt={label} className="h-40 w-full rounded-lg object-cover sm:h-32" />
      ) : (
        <label
          onClick={(event) => {
            if (isNative) {
              event.preventDefault();
              captureNativePhoto();
            }
          }}
          className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-marra-secondary bg-sky-50 p-4 text-center text-sm font-bold text-marra-primary"
        >
          <Camera size={22} />
          <span className="mt-2">Toque para enviar</span>
          {!isNative && <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => readImage(event.target.files?.[0])} />}
        </label>
      )}
    </div>
  );
}

function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#005A9C';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    onChange(canvasRef.current!.toDataURL('image/png'));
  };

  const stop = () => {
    drawing.current = false;
    if (canvasRef.current) onChange(canvasRef.current.toDataURL('image/png'));
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    onChange('');
  };

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700">Assinatura</span>
        <button type="button" onClick={clear} className="text-sm font-bold text-marra-primary">
          Limpar
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={900}
        height={240}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerLeave={stop}
        className="h-44 w-full touch-none rounded-lg border border-slate-200 bg-white"
      />
    </div>
  );
}

function StatusPill({ status }: { status: DriverStatus }) {
  const styles: Record<DriverStatus, string> = {
    Aprovado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Pendente: 'bg-amber-50 text-amber-700 border-amber-200',
    Reprovado: 'bg-red-50 text-red-700 border-red-200',
    Bloqueado: 'bg-slate-100 text-slate-700 border-slate-300',
  };
  return <span className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-black ${styles[status]}`}>{status}</span>;
}

function StatusButton({ label, onClick, danger = false, disabled = false }: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60 ${danger ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-marra-primary'}`}
    >
      {label}
    </button>
  );
}

function RequirementItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${done ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
      {done ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
      {label}
    </div>
  );
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-slate-50 p-4">
          <div className="text-xs font-black uppercase text-slate-500">{label}</div>
          <div className="mt-1 break-words text-sm font-bold text-slate-900">{value}</div>
        </div>
      ))}
    </div>
  );
}

function ImagePreview({ title, src }: { title: string; src?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-sm font-black text-slate-700">{title}</div>
      {src ? (
        <img src={assetUrl(src)} alt={title} className="h-44 w-full rounded-lg object-cover" />
      ) : (
        <div className="grid h-44 place-items-center rounded-lg bg-slate-50 text-sm font-bold text-slate-400">Sem imagem</div>
      )}
    </div>
  );
}

function LocationPreview({ latitude, longitude, label }: { latitude?: number; longitude?: number; label?: string }) {
  const hasLocation = latitude !== undefined && longitude !== undefined;
  const map = osmEmbedUrl(latitude, longitude);
  const link = mapsUrl(latitude, longitude);

  if (!hasLocation) {
    return <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-500">Localizacao ainda nao capturada.</div>;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-700">
        <div className="text-slate-900">{label || 'Endereco aproximado nao identificado'}</div>
        <div className="mt-2 text-xs text-slate-500">
          Lat: {latitude.toFixed(6)} | Long: {longitude.toFixed(6)}
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm font-black text-marra-primary">
          Abrir no mapa
        </a>
      </div>
      {map && (
        <iframe
          title="Mapa aproximado da entrega"
          src={map}
          className="h-44 w-full rounded-lg border border-slate-200"
          loading="lazy"
        />
      )}
    </div>
  );
}

function ResponsiveTable({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (rows.length === 0) {
    return <div className="rounded-lg border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">{empty}</div>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-black">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t border-slate-100">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-4 py-4 font-semibold text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
