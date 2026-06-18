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
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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
  | 'adminDeliveries';

type Driver = {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string;
  password: string;
  plate: string;
  cnhFileName?: string;
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
  date: string;
  time: string;
  status: 'Concluida';
};

type Toast = { id: string; type: 'success' | 'error'; message: string };

const KEYS = {
  drivers: 'marra:drivers',
  clients: 'marra:clients',
  deliveries: 'marra:deliveries',
  session: 'marra:session',
};

const today = '2026-06-18';
const samplePhoto =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="620"><rect width="900" height="620" fill="#F4F6F8"/><rect x="72" y="72" width="756" height="476" rx="18" fill="#fff" stroke="#005A9C" stroke-width="8"/><text x="450" y="286" text-anchor="middle" font-family="Arial" font-size="46" fill="#005A9C" font-weight="700">MARRA TRANSPORTES</text><text x="450" y="350" text-anchor="middle" font-family="Arial" font-size="28" fill="#333">Registro fotografico da entrega</text></svg>`,
  );
const sampleSignature =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="190"><rect width="620" height="190" fill="white"/><path d="M50 126 C135 32, 155 170, 236 87 S355 98, 410 69 S507 42, 570 112" fill="none" stroke="#005A9C" stroke-width="7" stroke-linecap="round"/><line x1="45" y1="154" x2="575" y2="154" stroke="#cbd5e1" stroke-width="2"/></svg>`,
  );

const blankDriver: Driver = {
  id: '',
  name: '',
  cpf: '',
  phone: '',
  email: '',
  password: '',
  plate: '',
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

function readStore<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}

function writeStore<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function seedData() {
  if (localStorage.getItem(KEYS.clients)) return;

  const drivers: Driver[] = [
    {
      id: 'driver-joao',
      name: 'Joao Henrique Silva',
      cpf: '123.456.789-10',
      phone: '(31) 98888-1010',
      email: 'joao@demo.com',
      password: '123456',
      plate: 'MTB-4A21',
      cnhFileName: 'cnh-joao.pdf',
      status: 'Aprovado',
    },
    {
      id: 'driver-carlos',
      name: 'Carlos Eduardo Rocha',
      cpf: '987.654.321-00',
      phone: '(31) 97777-2020',
      email: 'carlos@demo.com',
      password: '123456',
      plate: 'RTA-8C45',
      cnhFileName: 'cnh-carlos.pdf',
      status: 'Pendente',
    },
  ];

  const clients: Client[] = [
    {
      id: 'client-expominas',
      companyName: 'Expominas Eventos',
      email: 'logistica@expominas.com.br',
      extraEmails: 'financeiro@expominas.com.br; operacional@expominas.com.br',
      phone: '(31) 3333-1200',
      address: 'Av. Amazonas, 6200 - Gameleira, Belo Horizonte - MG',
    },
    {
      id: 'client-minascentro',
      companyName: 'Minascentro',
      email: 'recebimento@minascentro.com.br',
      extraEmails: 'eventos@minascentro.com.br',
      phone: '(31) 3217-7900',
      address: 'Av. Augusto de Lima, 785 - Centro, Belo Horizonte - MG',
    },
    {
      id: 'client-alphaville',
      companyName: 'Alphaville Centro Empresarial',
      email: 'facilities@alphaville.com.br',
      extraEmails: '',
      phone: '(31) 3516-4400',
      address: 'Alameda da Serra, 400 - Nova Lima - MG',
    },
  ];

  const deliveries: Delivery[] = [
    {
      id: 'delivery-1',
      protocol: 'MT-20260618-000001',
      driverId: 'driver-joao',
      clientId: 'client-expominas',
      documentType: 'NF',
      address: clients[0].address,
      plate: 'MTB-4A21',
      notes: 'Carga entregue na doca 2. Responsavel local confirmou o recebimento.',
      nfPhoto: samplePhoto,
      deliveryPhoto: samplePhoto,
      signature: sampleSignature,
      latitude: -19.92523,
      longitude: -43.99138,
      date: '2026-06-18',
      time: '09:42',
      status: 'Concluida',
    },
    {
      id: 'delivery-2',
      protocol: 'MT-20260617-000002',
      driverId: 'driver-joao',
      clientId: 'client-minascentro',
      documentType: 'CTE',
      address: clients[1].address,
      plate: 'MTB-4A21',
      notes: 'Entrega realizada com acesso pela portaria principal.',
      nfPhoto: samplePhoto,
      deliveryPhoto: samplePhoto,
      signature: sampleSignature,
      latitude: -19.92381,
      longitude: -43.94518,
      date: '2026-06-17',
      time: '15:18',
      status: 'Concluida',
    },
  ];

  writeStore(KEYS.drivers, drivers);
  writeStore(KEYS.clients, clients);
  writeStore(KEYS.deliveries, deliveries);
}

function formatDate(date: string) {
  return date.split('-').reverse().join('/');
}

function protocolFor(next: number) {
  return `MT-${today.replaceAll('-', '')}-${String(next).padStart(6, '0')}`;
}

function App() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [view, setView] = useState<View>('login');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string>('');
  const [session, setSession] = useState<{ role: 'driver' | 'admin'; driverId?: string } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    seedData();
    setDrivers(readStore<Driver[]>(KEYS.drivers, []));
    setClients(readStore<Client[]>(KEYS.clients, []));
    setDeliveries(readStore<Delivery[]>(KEYS.deliveries, []));
    const saved = readStore<{ role: 'driver' | 'admin'; driverId?: string } | null>(KEYS.session, null);
    if (saved?.role === 'admin') {
      setSession(saved);
      setView('adminDashboard');
    } else if (saved?.driverId) {
      setSession(saved);
      setView('driverDashboard');
    }
  }, []);

  const currentDriver = drivers.find((driver) => driver.id === session?.driverId);
  const selectedDelivery = deliveries.find((delivery) => delivery.id === selectedDeliveryId);

  const toast = (type: Toast['type'], message: string) => {
    const item = { id: newId('toast'), type, message };
    setToasts((items) => [...items, item]);
    window.setTimeout(() => setToasts((items) => items.filter((toastItem) => toastItem.id !== item.id)), 3200);
  };

  const saveDrivers = (items: Driver[]) => {
    setDrivers(items);
    writeStore(KEYS.drivers, items);
  };

  const saveClients = (items: Client[]) => {
    setClients(items);
    writeStore(KEYS.clients, items);
  };

  const saveDeliveries = (items: Delivery[]) => {
    setDeliveries(items);
    writeStore(KEYS.deliveries, items);
  };

  const loginDriver = (email: string, password: string) => {
    const driver = drivers.find((item) => item.email === email && item.password === password);
    if (!driver) {
      toast('error', 'E-mail ou senha invalidos.');
      return;
    }
    const nextSession = { role: 'driver' as const, driverId: driver.id };
    setSession(nextSession);
    writeStore(KEYS.session, nextSession);
    setView('driverDashboard');
    toast('success', `Bem-vindo, ${driver.name.split(' ')[0]}.`);
  };

  const loginAdmin = (email: string, password: string) => {
    if (email !== 'admin@marra.com' || password !== 'admin123') {
      toast('error', 'Credenciais administrativas invalidas.');
      return;
    }
    const nextSession = { role: 'admin' as const };
    setSession(nextSession);
    writeStore(KEYS.session, nextSession);
    setView('adminDashboard');
    toast('success', 'Painel administrativo liberado.');
  };

  const logout = () => {
    localStorage.removeItem(KEYS.session);
    setSession(null);
    setView('login');
  };

  const openDelivery = (id: string, target: View = 'deliveryDetails') => {
    setSelectedDeliveryId(id);
    setView(target);
  };

  return (
    <div className="min-h-screen bg-marra-paper text-marra-text">
      <ToastStack toasts={toasts} />
      {view === 'login' && <LoginScreen onLogin={loginDriver} onRegister={() => setView('register')} onAdmin={() => setView('adminLogin')} />}
      {view === 'register' && (
        <RegisterScreen
          onBack={() => setView('login')}
          onSave={(driver) => {
            const created = { ...driver, id: newId('driver'), status: 'Pendente' as DriverStatus };
            saveDrivers([...drivers, created]);
            toast('success', 'Cadastro enviado para analise.');
            setView('login');
          }}
        />
      )}
      {view === 'adminLogin' && <AdminLoginScreen onLogin={loginAdmin} onBack={() => setView('login')} />}

      {session?.role === 'driver' && currentDriver && (
        <DriverShell driver={currentDriver} view={view} setView={setView} logout={logout}>
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
              onSave={(delivery) => {
                saveDeliveries([delivery, ...deliveries]);
                setSelectedDeliveryId(delivery.id);
                toast('success', `Entrega ${delivery.protocol} registrada.`);
                setView('receipt');
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
            <DeliveryDetails delivery={selectedDelivery} clients={clients} drivers={drivers} onReceipt={() => setView('receipt')} />
          )}
          {view === 'receipt' && selectedDelivery && <Receipt delivery={selectedDelivery} clients={clients} drivers={drivers} />}
          {view === 'account' && <AccountScreen driver={currentDriver} />}
        </DriverShell>
      )}

      {session?.role === 'admin' && (
        <AdminShell view={view} setView={setView} logout={logout}>
          {view === 'adminDashboard' && <AdminDashboard drivers={drivers} clients={clients} deliveries={deliveries} />}
          {view === 'adminClients' && <ClientsManager clients={clients} saveClients={saveClients} toast={toast} />}
          {view === 'adminDrivers' && <DriversManager drivers={drivers} saveDrivers={saveDrivers} />}
          {view === 'adminDeliveries' && (
            <AdminDeliveries
              deliveries={deliveries}
              clients={clients}
              drivers={drivers}
              onOpen={(id, target) => openDelivery(id, target)}
            />
          )}
          {view === 'deliveryDetails' && selectedDelivery && (
            <DeliveryDetails delivery={selectedDelivery} clients={clients} drivers={drivers} onReceipt={() => setView('receipt')} />
          )}
          {view === 'receipt' && selectedDelivery && <Receipt delivery={selectedDelivery} clients={clients} drivers={drivers} />}
        </AdminShell>
      )}
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed right-4 top-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
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
    <div className="flex items-center gap-3">
      <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-marra-primary shadow-sm">
        <Truck size={26} strokeWidth={2.4} />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-xl font-black uppercase tracking-normal text-white">Marra</div>
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-sky-100">Transportes</div>
        </div>
      )}
    </div>
  );
}

function LoginFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[1fr_520px]">
      <section className="relative hidden overflow-hidden bg-marra-primary lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,174,239,0.3),transparent_45%),radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.16),transparent_30%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <BrandMark />
          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold">
              <ShieldCheck size={17} /> Prototipo operacional
            </div>
            <h1 className="text-5xl font-black leading-tight tracking-normal">Comprovacao de entregas em tempo real.</h1>
            <p className="mt-5 text-lg leading-8 text-sky-50">
              Registro de motorista, cliente, fotos, assinatura, horario e localizacao em uma jornada simples para demonstracao comercial.
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
      </section>
      <section className="flex min-h-screen items-center justify-center p-5 sm:p-10">{children}</section>
    </main>
  );
}

function LoginScreen({
  onLogin,
  onRegister,
  onAdmin,
}: {
  onLogin: (email: string, password: string) => void;
  onRegister: () => void;
  onAdmin: () => void;
}) {
  const [email, setEmail] = useState('joao@demo.com');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(() => {
      onLogin(email, password);
      setLoading(false);
    }, 550);
  };

  return (
    <LoginFrame>
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-soft">
        <div className="mb-7 rounded-lg bg-marra-primary p-5">
          <BrandMark />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Acesso do motorista</h2>
        <p className="mt-2 text-sm text-slate-500">Demo: joao@demo.com / 123456</p>
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
      </form>
    </LoginFrame>
  );
}

function AdminLoginScreen({ onLogin, onBack }: { onLogin: (email: string, password: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState('admin@marra.com');
  const [password, setPassword] = useState('admin123');
  return (
    <LoginFrame>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(email, password);
        }}
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-soft"
      >
        <div className="mb-7 rounded-lg bg-marra-primary p-5">
          <BrandMark />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Painel administrativo</h2>
        <p className="mt-2 text-sm text-slate-500">Demo: admin@marra.com / admin123</p>
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

function RegisterScreen({ onBack, onSave }: { onBack: () => void; onSave: (driver: Driver) => void }) {
  const [driver, setDriver] = useState<Driver>(blankDriver);
  const [cnhFileName, setCnhFileName] = useState('');
  const update = (key: keyof Driver, value: string) => setDriver((item) => ({ ...item, [key]: value }));

  return (
    <LoginFrame>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ ...driver, cnhFileName });
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
        </div>
        <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-marra-secondary bg-sky-50 px-4 py-4 text-sm font-bold text-marra-primary">
          <span>{cnhFileName || 'Upload fake de CNH'}</span>
          <input
            type="file"
            className="hidden"
            onChange={(event) => setCnhFileName(event.target.files?.[0]?.name ?? '')}
          />
          <Camera size={18} />
        </label>
        <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-bold text-white">
          <Save size={18} /> Salvar cadastro
        </button>
      </form>
    </LoginFrame>
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
      <aside className={`${open ? 'fixed inset-0 z-40 block' : 'hidden'} bg-marra-primary p-4 text-white lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="flex items-center justify-between">
          <BrandMark />
          <button className="lg:hidden" onClick={() => setOpen(false)}>
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
      <aside className={`${open ? 'fixed inset-0 z-40 block' : 'hidden'} bg-slate-950 p-4 text-white lg:sticky lg:top-0 lg:block lg:h-screen`}>
        <div className="rounded-lg bg-marra-primary p-4">
          <div className="flex items-center justify-between">
            <BrandMark />
            <button className="lg:hidden" onClick={() => setOpen(false)}>
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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <button className="rounded-lg border border-slate-200 p-2 lg:hidden" onClick={onMenu}>
            <Menu size={20} />
          </button>
          <h1 className="text-lg font-black text-slate-900">{title}</h1>
        </div>
        <div className="hidden items-center gap-2 rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-marra-primary sm:flex">
          <CheckCircle2 size={17} /> Demo LocalStorage
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
  onSave: (delivery: Delivery) => void;
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
  const [loadingGps, setLoadingGps] = useState(false);

  useEffect(() => {
    if (selectedClient) setAddress(selectedClient.address);
  }, [clientId]);

  const captureGps = () => {
    setLoadingGps(true);
    if (!navigator.geolocation) {
      setCoords({ latitude: -19.92523, longitude: -43.99138 });
      toast('success', 'Localizacao simulada capturada.');
      setLoadingGps(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        toast('success', 'Localizacao capturada.');
        setLoadingGps(false);
      },
      () => {
        setCoords({ latitude: -19.92523, longitude: -43.99138 });
        toast('error', 'GPS indisponivel. Usando localizacao simulada.');
        setLoadingGps(false);
      },
      { enableHighAccuracy: true, timeout: 6500 },
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!clientId) {
      toast('error', 'Selecione um cliente.');
      return;
    }
    const now = new Date();
    onSave({
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
      date: now.toISOString().slice(0, 10),
      time: now.toTimeString().slice(0, 5),
      status: 'Concluida',
    });
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
            <h3 className="font-black text-slate-900">GPS</h3>
            <p className="mt-2 text-sm text-slate-500">Captura via navegador com fallback visual para a demonstracao.</p>
            <button type="button" onClick={captureGps} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-4 py-3 font-bold text-white">
              <MapPin size={18} /> {loadingGps ? 'Capturando...' : 'Capturar Localizacao'}
            </button>
            <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              Lat: {coords.latitude?.toFixed(6) ?? '--'}
              <br />
              Long: {coords.longitude?.toFixed(6) ?? '--'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-black text-slate-900">Data e hora</h3>
            <p className="mt-2 text-sm text-slate-500">Preenchidas automaticamente ao finalizar.</p>
            <div className="mt-4 rounded-lg bg-sky-50 p-4 text-sm font-bold text-marra-primary">
              Proximo protocolo: {protocolFor(deliveryCount + 1)}
            </div>
          </div>
          <div className="grid gap-3">
            <button className="flex items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-black text-white">
              <CheckCircle2 size={18} /> Finalizar entrega
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
}: {
  delivery: Delivery;
  clients: Client[];
  drivers: Driver[];
  onReceipt: () => void;
}) {
  const client = clients.find((item) => item.id === delivery.clientId);
  const driver = drivers.find((item) => item.id === delivery.driverId);
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
              ['Latitude', delivery.latitude?.toFixed(6) ?? '-'],
              ['Longitude', delivery.longitude?.toFixed(6) ?? '-'],
              ['Observacoes', delivery.notes || '-'],
            ]}
          />
        </div>
        <div className="space-y-4">
          <button onClick={onReceipt} className="flex w-full items-center justify-center gap-2 rounded-lg bg-marra-primary px-5 py-3 font-black text-white">
            <FileText size={18} /> Visualizar Comprovante
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
    if (!ref.current) return;
    setGenerating(true);
    const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, width, Math.min(height, pdf.internal.pageSize.getHeight()));
    pdf.save(`${delivery.protocol}.pdf`);
    setGenerating(false);
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
            <div className="text-3xl font-black text-slate-900">{delivery.protocol}</div>
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
            Marra Transportes - documento gerado automaticamente para demonstracao do prototipo.
          </footer>
        </main>
      </div>
    </div>
  );
}

function AdminDashboard({ drivers, clients, deliveries }: { drivers: Driver[]; clients: Client[]; deliveries: Delivery[] }) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Dashboard" subtitle="Indicadores operacionais simulados via LocalStorage." />
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

function ClientsManager({ clients, saveClients, toast }: { clients: Client[]; saveClients: (clients: Client[]) => void; toast: (type: Toast['type'], message: string) => void }) {
  const [form, setForm] = useState<Client>(blankClient);
  const editing = Boolean(form.id);
  const update = (key: keyof Client, value: string) => setForm((item) => ({ ...item, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editing) {
      saveClients(clients.map((client) => (client.id === form.id ? form : client)));
      toast('success', 'Cliente atualizado.');
    } else {
      saveClients([{ ...form, id: newId('client') }, ...clients]);
      toast('success', 'Cliente cadastrado.');
    }
    setForm(blankClient);
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
                <button onClick={() => saveClients(clients.filter((item) => item.id !== client.id))} className="rounded-lg border border-red-200 p-3 text-red-600">
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

function DriversManager({ drivers, saveDrivers }: { drivers: Driver[]; saveDrivers: (drivers: Driver[]) => void }) {
  const setStatus = (id: string, status: DriverStatus) => saveDrivers(drivers.map((driver) => (driver.id === id ? { ...driver, status } : driver)));
  return (
    <div className="space-y-5">
      <SectionHeader title="Gestao de Motoristas" subtitle="Aprovacao e bloqueio simulados para a demonstracao." />
      <div className="grid gap-4">
        {drivers.map((driver) => (
          <div key={driver.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-black text-slate-900">{driver.name}</h3>
                  <StatusPill status={driver.status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">{driver.email} - {driver.phone} - Placa {driver.plate}</p>
                <p className="mt-1 text-sm text-slate-500">CNH: {driver.cnhFileName ?? 'nao enviada'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusButton label="Aprovar" onClick={() => setStatus(driver.id, 'Aprovado')} />
                <StatusButton label="Reprovar" onClick={() => setStatus(driver.id, 'Reprovado')} />
                <StatusButton label="Bloquear" onClick={() => setStatus(driver.id, 'Bloqueado')} danger />
              </div>
            </div>
          </div>
        ))}
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

function AccountScreen({ driver }: { driver: Driver }) {
  return (
    <div className="space-y-5">
      <SectionHeader title="Minha Conta" subtitle="Dados do motorista cadastrados no LocalStorage." />
      <Panel title="Dados cadastrais">
        <InfoGrid
          items={[
            ['Nome', driver.name],
            ['CPF', driver.cpf],
            ['Telefone', driver.phone],
            ['E-mail', driver.email],
            ['Placa do veiculo', driver.plate],
            ['CNH', driver.cnhFileName ?? '-'],
            ['Status', driver.status],
          ]}
        />
      </Panel>
    </div>
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
  const readImage = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  };
  return (
    <div>
      <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-marra-secondary bg-sky-50 p-4 text-center text-sm font-bold text-marra-primary">
        <Camera size={24} />
        <span className="mt-2">{value ? 'Imagem carregada' : label}</span>
        <input type="file" accept="image/*" className="hidden" onChange={(event) => readImage(event.target.files?.[0])} />
      </label>
      {value && <img src={value} alt={label} className="mt-3 h-32 w-full rounded-lg object-cover" />}
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

function StatusButton({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-4 py-2 text-sm font-black ${danger ? 'bg-red-50 text-red-700' : 'bg-sky-50 text-marra-primary'}`}
    >
      {label}
    </button>
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
        <img src={src} alt={title} className="h-44 w-full rounded-lg object-cover" />
      ) : (
        <div className="grid h-44 place-items-center rounded-lg bg-slate-50 text-sm font-bold text-slate-400">Sem imagem</div>
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
