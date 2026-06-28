import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const uploadsDir = path.join(rootDir, 'uploads');

const app = express();
const port = Number(process.env.PORT || 5173);
const jwtSecret = process.env.JWT_SECRET || 'dev-only-change-me';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@marra.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const currentTermsVersion = '2026-06-28';
const driverCommissionRate = 16;
const validCnhCategories = ['C', 'D', 'E'];

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL nao configurado. Copie .env.example para .env e ajuste o PostgreSQL.');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  const missing = ['JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'].filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Variaveis obrigatorias ausentes em producao: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

function signSession(payload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: '12h' });
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ message: 'Sessao nao informada.' });

  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: 'Sessao invalida ou expirada.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Acesso administrativo necessario.' });
  next();
}

async function removeUpload(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  const fileName = path.basename(url);
  await fs.unlink(path.join(uploadsDir, fileName)).catch(() => {});
}

function mapDriver(row) {
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf,
    phone: row.phone,
    email: row.email,
    plate: row.plate,
    cnhCategory: row.cnh_category || '',
    cnhFileName: row.cnh_file_name,
    cnhFileUrl: row.cnh_file_url || '',
    commissionRate: Number(row.commission_rate || driverCommissionRate),
    termsAcceptedAt: row.terms_accepted_at ? new Date(row.terms_accepted_at).toISOString() : '',
    termsVersion: row.terms_version || '',
    status: row.status,
  };
}

function mapClient(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    email: row.email,
    extraEmails: row.extra_emails || '',
    phone: row.phone,
    address: row.address,
  };
}

function mapDelivery(row) {
  const deliveredAt = new Date(row.delivered_at);
  return {
    id: row.id,
    protocol: row.protocol,
    driverId: row.driver_id,
    clientId: row.client_id,
    documentType: row.document_type,
    address: row.address,
    plate: row.plate,
    notes: row.notes || '',
    nfPhoto: row.nf_photo_url || '',
    deliveryPhoto: row.delivery_photo_url || '',
    signature: row.signature_url || '',
    latitude: row.latitude === null ? undefined : Number(row.latitude),
    longitude: row.longitude === null ? undefined : Number(row.longitude),
    locationLabel: row.location_label || '',
    date: deliveredAt.toISOString().slice(0, 10),
    time: deliveredAt.toTimeString().slice(0, 5),
    status: row.status,
  };
}

async function saveDataUrl(dataUrl, prefix) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  if (dataUrl.startsWith('/uploads/')) return dataUrl;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  const mime = match[1];
  const extension = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
  }[mime] || 'bin';
  const fileName = `${prefix}-${crypto.randomUUID()}.${extension}`;
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, fileName), Buffer.from(match[2], 'base64'));
  return `/uploads/${fileName}`;
}

async function nextProtocol() {
  const date = new Date();
  const ymd = date.toISOString().slice(0, 10).replaceAll('-', '');
  const result = await pool.query("SELECT COUNT(*)::int AS count FROM deliveries WHERE protocol LIKE $1", [`MT-${ymd}-%`]);
  return `MT-${ymd}-${String(result.rows[0].count + 1).padStart(6, '0')}`;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'appmarratransportes' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'E-mail e senha sao obrigatorios.' });

  if (role === 'admin') {
    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ message: 'Credenciais administrativas invalidas.' });
    }
    return res.json({ token: signSession({ role: 'admin', email }), session: { role: 'admin' } });
  }

  const result = await pool.query('SELECT * FROM drivers WHERE email = $1', [email]);
  const row = result.rows[0];
  if (!row || !(await bcrypt.compare(password, row.password_hash))) {
    return res.status(401).json({ message: 'E-mail ou senha invalidos.' });
  }
  if (row.status === 'Bloqueado' || row.status === 'Reprovado') {
    return res.status(403).json({ message: `Conta ${row.status.toLowerCase()}.` });
  }
  const driver = mapDriver(row);
  res.json({
    token: signSession({ role: 'driver', driverId: driver.id, email: driver.email }),
    session: { role: 'driver', driverId: driver.id },
    driver,
  });
});

app.get('/api/me', authenticate, async (req, res) => {
  if (req.user.role === 'admin') return res.json({ session: { role: 'admin' } });
  const result = await pool.query('SELECT * FROM drivers WHERE id = $1', [req.user.driverId]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Motorista nao encontrado.' });
  res.json({ session: { role: 'driver', driverId: req.user.driverId }, driver: mapDriver(result.rows[0]) });
});

app.get('/api/bootstrap', authenticate, async (req, res) => {
  const [driversResult, clientsResult, deliveriesResult] = await Promise.all([
    req.user.role === 'admin'
      ? pool.query('SELECT * FROM drivers ORDER BY created_at DESC')
      : pool.query('SELECT * FROM drivers WHERE id = $1', [req.user.driverId]),
    pool.query('SELECT * FROM clients ORDER BY company_name ASC'),
    req.user.role === 'admin'
      ? pool.query('SELECT * FROM deliveries ORDER BY delivered_at DESC')
      : pool.query('SELECT * FROM deliveries WHERE driver_id = $1 ORDER BY delivered_at DESC', [req.user.driverId]),
  ]);
  res.json({
    drivers: driversResult.rows.map(mapDriver),
    clients: clientsResult.rows.map(mapClient),
    deliveries: deliveriesResult.rows.map(mapDelivery),
  });
});

app.post('/api/drivers/register', async (req, res) => {
  const { name, cpf, phone, email, password, plate, cnhCategory, cnhFileName, cnhFileData, acceptedTerms } = req.body || {};
  if (!name || !cpf || !phone || !email || !password || !plate) {
    return res.status(400).json({ message: 'Preencha todos os campos obrigatorios.' });
  }
  if (!validCnhCategories.includes(cnhCategory)) {
    return res.status(400).json({ message: 'A categoria da CNH deve ser C, D ou E.' });
  }
  if (!acceptedTerms) {
    return res.status(400).json({ message: 'Aceite os termos de uso para concluir o cadastro.' });
  }
  const hash = await bcrypt.hash(password, 10);
  const id = `driver-${crypto.randomUUID()}`;
  const cnhFileUrl = await saveDataUrl(cnhFileData, 'cnh');
  try {
    const result = await pool.query(
      `INSERT INTO drivers
        (id, name, cpf, phone, email, password_hash, plate, cnh_category, cnh_file_name, cnh_file_url, commission_rate, terms_accepted_at, terms_version, terms_ip, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,$13,'Pendente') RETURNING *`,
      [id, name, cpf, phone, email, hash, plate, cnhCategory, cnhFileName || null, cnhFileUrl, driverCommissionRate, currentTermsVersion, req.ip],
    );
    res.status(201).json({ driver: mapDriver(result.rows[0]) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'CPF ou e-mail ja cadastrado.' });
    throw error;
  }
});

app.post('/api/drivers/terms/accept', authenticate, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Apenas motoristas aceitam os termos operacionais.' });
  const result = await pool.query(
    `UPDATE drivers
     SET terms_accepted_at = NOW(), terms_version = $1, terms_ip = $2, commission_rate = COALESCE(commission_rate, $3)
     WHERE id = $4 RETURNING *`,
    [currentTermsVersion, req.ip, driverCommissionRate, req.user.driverId],
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Motorista nao encontrado.' });
  res.json({ driver: mapDriver(result.rows[0]) });
});

app.patch('/api/drivers/:id/status', authenticate, requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!['Pendente', 'Aprovado', 'Reprovado', 'Bloqueado'].includes(status)) {
    return res.status(400).json({ message: 'Status invalido.' });
  }
  const result = await pool.query('UPDATE drivers SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ message: 'Motorista nao encontrado.' });
  res.json({ driver: mapDriver(result.rows[0]) });
});

app.post('/api/clients', authenticate, requireAdmin, async (req, res) => {
  const { companyName, email, extraEmails, phone, address } = req.body || {};
  const id = `client-${crypto.randomUUID()}`;
  const result = await pool.query(
    `INSERT INTO clients (id, company_name, email, extra_emails, phone, address)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, companyName, email, extraEmails || '', phone, address],
  );
  res.status(201).json({ client: mapClient(result.rows[0]) });
});

app.put('/api/clients/:id', authenticate, requireAdmin, async (req, res) => {
  const { companyName, email, extraEmails, phone, address } = req.body || {};
  const result = await pool.query(
    `UPDATE clients SET company_name = $1, email = $2, extra_emails = $3, phone = $4, address = $5
     WHERE id = $6 RETURNING *`,
    [companyName, email, extraEmails || '', phone, address, req.params.id],
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Cliente nao encontrado.' });
  res.json({ client: mapClient(result.rows[0]) });
});

app.delete('/api/clients/:id', authenticate, requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

app.delete('/api/me', authenticate, async (req, res) => {
  if (req.user.role !== 'driver') {
    return res.status(403).json({ message: 'Contas administrativas devem ser removidas pelo responsavel tecnico.' });
  }

  const deliveries = await pool.query(
    'SELECT nf_photo_url, delivery_photo_url, signature_url FROM deliveries WHERE driver_id = $1',
    [req.user.driverId],
  );
  await pool.query('DELETE FROM deliveries WHERE driver_id = $1', [req.user.driverId]);
  await pool.query('DELETE FROM drivers WHERE id = $1', [req.user.driverId]);

  for (const delivery of deliveries.rows) {
    await removeUpload(delivery.nf_photo_url);
    await removeUpload(delivery.delivery_photo_url);
    await removeUpload(delivery.signature_url);
  }

  res.status(204).end();
});

app.post('/api/deliveries', authenticate, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Apenas motoristas registram entregas.' });
  const { clientId, documentType, address, plate, notes, nfPhoto, deliveryPhoto, signature, latitude, longitude, locationLabel } = req.body || {};
  if (!clientId || !documentType || !address || !plate) {
    return res.status(400).json({ message: 'Dados obrigatorios da entrega incompletos.' });
  }
  if (!nfPhoto || !deliveryPhoto || !signature) {
    return res.status(400).json({ message: 'Foto da nota fiscal, foto da entrega e assinatura sao obrigatorias.' });
  }
  if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
    return res.status(400).json({ message: 'Localizacao GPS obrigatoria.' });
  }

  const id = `delivery-${crypto.randomUUID()}`;
  const protocol = await nextProtocol();
  const [nfPhotoUrl, deliveryPhotoUrl, signatureUrl] = await Promise.all([
    saveDataUrl(nfPhoto, 'nf'),
    saveDataUrl(deliveryPhoto, 'entrega'),
    saveDataUrl(signature, 'assinatura'),
  ]);
  if (!nfPhotoUrl || !deliveryPhotoUrl || !signatureUrl) {
    return res.status(400).json({ message: 'Arquivos da entrega invalidos. Envie imagens e assinatura novamente.' });
  }

  const result = await pool.query(
    `INSERT INTO deliveries
      (id, protocol, driver_id, client_id, document_type, address, plate, notes, nf_photo_url, delivery_photo_url, signature_url, latitude, longitude, location_label, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Concluida')
     RETURNING *`,
    [id, protocol, req.user.driverId, clientId, documentType, address, plate, notes || '', nfPhotoUrl, deliveryPhotoUrl, signatureUrl, latitude || null, longitude || null, locationLabel || ''],
  );
  res.status(201).json({ delivery: mapDelivery(result.rows[0]) });
});

app.use('/api', (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Erro interno do servidor.' });
});

app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Marra Transportes rodando em http://0.0.0.0:${port}`);
});
