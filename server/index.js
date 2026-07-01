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
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const uploadsDir = path.join(rootDir, 'uploads');

const app = express();
const port = Number(process.env.PORT || 5173);
const jwtSecret = process.env.JWT_SECRET || 'dev-only-change-me';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@marra.com';
const adminEmails = (process.env.ADMIN_EMAILS || adminEmail)
  .split(/[;,]/)
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const currentTermsVersion = '2026-06-28';
const driverCommissionRate = 16;
const validCnhCategories = ['C', 'D', 'E'];
const marraNotificationEmails = (process.env.MARRA_NOTIFICATION_EMAILS || process.env.MARRA_EMAIL || '')
  .split(/[;,]/)
  .map((email) => email.trim())
  .filter(Boolean);

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

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

function normalizeIp(ip = '') {
  return String(ip).replace(/^::ffff:/, '').trim();
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return normalizeIp(forwardedFor.split(',')[0]);
  }
  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return normalizeIp(forwardedFor[0].split(',')[0]);
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || '');
}

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

function driverTermsText(driver) {
  return [
    'TERMO DE PARCEIRO INDEPENDENTE - MARRA TRANSPORTES',
    `Versao: ${currentTermsVersion}`,
    '',
    `Motorista: ${driver.name}`,
    `CPF: ${driver.cpf}`,
    `E-mail: ${driver.email}`,
    `Placa do veiculo: ${driver.plate}`,
    `Categoria da CNH: ${driver.cnh_category || 'nao informada'}`,
    `Comissao operacional: ${driverCommissionRate}% do valor do frete`,
    '',
    'Declaro que atuo como parceiro independente da Marra Transportes, sem vinculo empregaticio, usando a plataforma para registrar entregas e comprovantes operacionais.',
    'Comprometo-me a manter conduta etica, registrar informacoes verdadeiras, preservar o veiculo utilizado, respeitar clientes atendidos e anexar somente fotos, assinaturas e dados relacionados ao servico realizado.',
    'Declaro ciencia de que para atuar e necessario possuir CNH categoria C, D ou E valida, e que a remuneracao por comissao corresponde a 16% do valor do frete, conforme politica operacional vigente.',
    'O aceite eletronico deste termo fica arquivado pela Marra Transportes com data, hora, versao do termo e identificacao tecnica do acesso.',
  ].join('\n');
}

function mapTermAcceptance(row) {
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    driverCpf: row.driver_cpf,
    driverEmail: row.driver_email,
    driverPlate: row.driver_plate,
    cnhCategory: row.cnh_category || '',
    commissionRate: Number(row.commission_rate || driverCommissionRate),
    termsVersion: row.terms_version,
    termsText: row.terms_text,
    acceptedAt: new Date(row.accepted_at).toISOString(),
    acceptedIp: row.accepted_ip || '',
    userAgent: row.user_agent || '',
  };
}

async function createTermAcceptance(driver, req) {
  const result = await pool.query(
    `INSERT INTO driver_terms_acceptances
      (id, driver_id, driver_name, driver_cpf, driver_email, driver_plate, cnh_category, commission_rate, terms_version, terms_text, accepted_ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      `terms-${crypto.randomUUID()}`,
      driver.id,
      driver.name,
      driver.cpf,
      driver.email,
      driver.plate,
      driver.cnh_category || null,
      driverCommissionRate,
      currentTermsVersion,
      driverTermsText(driver),
      getClientIp(req),
      req.headers['user-agent'] || '',
    ],
  );
  return mapTermAcceptance(result.rows[0]);
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
    emailStatus: row.email_status || 'Pendente',
    emailSentAt: row.email_sent_at ? new Date(row.email_sent_at).toISOString() : '',
    emailRecipients: row.email_recipients || '',
    emailError: row.email_error || '',
    date: deliveredAt.toISOString().slice(0, 10),
    time: deliveredAt.toTimeString().slice(0, 5),
    status: row.status,
  };
}

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && (process.env.SMTP_FROM || process.env.SMTP_USER));
}

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function splitEmails(value = '') {
  return String(value)
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function uniqueEmails(items) {
  return [...new Set(items.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

function uploadPathFromUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return '';
  return path.join(uploadsDir, path.basename(url));
}

async function firstExistingPath(paths) {
  for (const item of paths) {
    try {
      await fs.access(item);
      return item;
    } catch {
      // Try next candidate.
    }
  }
  return '';
}

function formatDateBr(date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);
}

function formatTimeBr(date) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(date);
}

async function generateDeliveryReceiptPdf({ delivery, driver, client }) {
  const logoPath = await firstExistingPath([
    path.join(distDir, 'marra-logo-tight.png'),
    path.join(rootDir, 'public', 'marra-logo-tight.png'),
  ]);

  return new Promise((resolve, reject) => {
    const deliveredAt = new Date(delivery.delivered_at);
    const pdf = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
    const chunks = [];
    pdf.on('data', (chunk) => chunks.push(chunk));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(chunks)));

    const primary = '#005A9C';
    const muted = '#64748B';
    const pageWidth = pdf.page.width;
    const pageHeight = pdf.page.height;
    const contentWidth = pageWidth - 84;
    const contentHeight = pageHeight - 124;

    const addHeader = (title) => {
      pdf.rect(0, 0, pageWidth, 82).fill(primary);
      pdf.roundedRect(42, 14, 116, 50, 4).fill('#FFFFFF');
      try {
        if (!logoPath) throw new Error('Logo indisponivel.');
        pdf.image(logoPath, 51, 18, { fit: [98, 42], align: 'center', valign: 'center' });
      } catch {
        pdf.fillColor(primary).fontSize(9).font('Helvetica-Bold').text('MARRA TRANSPORTES', 55, 36, { width: 90, align: 'center' });
      }
      pdf.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(17).text(title, 178, 24, { width: pageWidth - 220 });
      pdf.font('Helvetica').fontSize(9).text('Documento gerado automaticamente pelo sistema Marra Transportes', 178, 48, { width: pageWidth - 220 });
      pdf.moveDown();
    };

    const field = (label, value, x, y, width) => {
      pdf.roundedRect(x, y, width, 42, 4).fill('#F8FAFC').stroke('#E2E8F0');
      pdf.fillColor(muted).font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), x + 10, y + 9, { width: width - 20 });
      pdf.fillColor('#0F172A').font('Helvetica-Bold').fontSize(10).text(value || '-', x + 10, y + 22, { width: width - 20 });
    };

    addHeader('COMPROVANTE DE ENTREGA');
    pdf.y = 104;
    pdf.roundedRect(42, pdf.y, contentWidth, 50, 4).fill('#EFF6FF').stroke(primary);
    pdf.fillColor(primary).font('Helvetica-Bold').fontSize(8).text('PROTOCOLO', 54, pdf.y + 11);
    pdf.fillColor('#0F172A').font('Helvetica-Bold').fontSize(18).text(delivery.protocol, 54, pdf.y + 25);
    pdf.y += 70;

    const col = (contentWidth - 12) / 2;
    let y = pdf.y;
    field('Motorista', driver.name, 42, y, col);
    field('Cliente', client.company_name, 54 + col, y, col);
    y += 52;
    field('Documento', delivery.document_type, 42, y, col);
    field('Placa', delivery.plate, 54 + col, y, col);
    y += 52;
    field('Data', formatDateBr(deliveredAt), 42, y, col);
    field('Hora', formatTimeBr(deliveredAt), 54 + col, y, col);
    y += 60;

    pdf.fillColor(primary).font('Helvetica-Bold').fontSize(9).text('ENDERECO', 42, y);
    pdf.fillColor('#0F172A').font('Helvetica').fontSize(10).text(delivery.address, 42, y + 14, { width: contentWidth });
    y = pdf.y + 12;
    pdf.fillColor(primary).font('Helvetica-Bold').fontSize(9).text('LOCALIZACAO', 42, y);
    pdf.fillColor('#0F172A').font('Helvetica').fontSize(10).text(delivery.location_label || '-', 42, y + 14, { width: contentWidth });
    pdf.fillColor(muted).fontSize(8).text(`GPS: ${delivery.latitude || '-'}, ${delivery.longitude || '-'}`, 42, pdf.y + 4, { width: contentWidth });
    y = pdf.y + 14;
    pdf.fillColor(primary).font('Helvetica-Bold').fontSize(9).text('OBSERVACOES', 42, y);
    pdf.fillColor('#0F172A').font('Helvetica').fontSize(10).text(delivery.notes || '-', 42, y + 14, { width: contentWidth });

    const imagePage = (label, url, mode = 'cover') => {
      pdf.addPage({ margin: 42 });
      addHeader(label.toUpperCase());
      const top = 98;
      const imageTop = top + 28;
      const imageHeight = pageHeight - top - 92;
      pdf.roundedRect(42, top, contentWidth, pageHeight - top - 76, 4).stroke('#CBD5E1');
      pdf.fillColor(primary).font('Helvetica-Bold').fontSize(12).text(label, 54, top + 10);
      const filePath = uploadPathFromUrl(url);
      try {
        if (!filePath) throw new Error('Arquivo indisponivel.');
        const imageOptions = mode === 'fit'
          ? { fit: [contentWidth - 24, imageHeight], align: 'center', valign: 'center' }
          : { cover: [contentWidth - 24, imageHeight], align: 'center', valign: 'center' };
        pdf.image(filePath, 54, imageTop, imageOptions);
      } catch {
        pdf.fillColor(muted).fontSize(10).text('Imagem indisponivel no arquivo.', 54, imageTop);
      }
    };
    imagePage('Foto da NF', delivery.nf_photo_url);
    imagePage('Foto da entrega', delivery.delivery_photo_url);
    imagePage('Assinatura', delivery.signature_url, 'fit');

    const pages = pdf.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      pdf.switchToPage(i);
      pdf.fillColor(muted).font('Helvetica').fontSize(8).text(`Pagina ${i + 1} de ${pages.count}`, 42, pdf.page.height - 54, { width: contentWidth, align: 'right', lineBreak: false });
    }

    pdf.end();
  });
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

async function getDeliveryContext(deliveryId) {
  const result = await pool.query(
    `SELECT d.*, dr.name AS driver_name, dr.email AS driver_email, c.company_name, c.email AS client_email, c.extra_emails
     FROM deliveries d
     JOIN drivers dr ON dr.id = d.driver_id
     JOIN clients c ON c.id = d.client_id
     WHERE d.id = $1`,
    [deliveryId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    delivery: row,
    driver: { name: row.driver_name, email: row.driver_email },
    client: { company_name: row.company_name, email: row.client_email, extra_emails: row.extra_emails || '' },
  };
}

async function updateDeliveryEmailStatus(deliveryId, status, recipients = [], error = '') {
  const result = await pool.query(
    `UPDATE deliveries
     SET email_status = $1,
         email_sent_at = CASE WHEN $1 = 'Enviado' THEN NOW() ELSE email_sent_at END,
         email_recipients = $2,
         email_error = $3
     WHERE id = $4
     RETURNING *`,
    [status, recipients.join(', '), error ? String(error).slice(0, 700) : '', deliveryId],
  );
  return result.rows[0] ? mapDelivery(result.rows[0]) : null;
}

async function sendDeliveryReceiptEmail(deliveryId) {
  const context = await getDeliveryContext(deliveryId);
  if (!context) throw new Error('Entrega nao encontrada para envio de e-mail.');

  const recipients = uniqueEmails([
    context.driver.email,
    ...marraNotificationEmails,
    context.client.email,
    ...splitEmails(context.client.extra_emails),
  ]);

  if (recipients.length === 0) {
    return updateDeliveryEmailStatus(deliveryId, 'Sem destinatario', [], 'Nenhum destinatario configurado.');
  }

  if (!smtpConfigured()) {
    return updateDeliveryEmailStatus(deliveryId, 'SMTP nao configurado', recipients, 'Configure SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM e MARRA_NOTIFICATION_EMAILS no .env.');
  }

  try {
    const pdf = await generateDeliveryReceiptPdf(context);
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const transporter = createTransporter();
    const deliveredAt = new Date(context.delivery.delivered_at);
    const emailSummaryRows = [
      ['Protocolo', context.delivery.protocol],
      ['Motorista', context.driver.name],
      ['Cliente', context.client.company_name],
      ['Documento', context.delivery.document_type],
      ['Data', formatDateBr(deliveredAt)],
      ['Hora', formatTimeBr(deliveredAt)],
      ['Endereco', context.delivery.address],
    ];
    await transporter.sendMail({
      from,
      to: recipients,
      subject: `Comprovante de entrega ${context.delivery.protocol} - Marra Transportes`,
      text: [
        `Segue em anexo o comprovante de entrega ${context.delivery.protocol}.`,
        '',
        `Motorista: ${context.driver.name}`,
        `Cliente: ${context.client.company_name}`,
        `Documento: ${context.delivery.document_type}`,
        `Endereco: ${context.delivery.address}`,
        '',
        'Mensagem automatica do sistema Marra Transportes.',
      ].join('\n'),
      html: `
        <div style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 0;">
            <tr>
              <td align="center">
                <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #dbe3ec;border-radius:8px;overflow:hidden;">
                  <tr>
                    <td style="background:#005A9C;padding:22px 28px;color:#ffffff;">
                      <div style="font-size:22px;font-weight:700;letter-spacing:.2px;">Marra Transportes</div>
                      <div style="font-size:13px;margin-top:6px;color:#dbeafe;">Comprovante digital de entrega</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px;">
                      <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">O comprovante da entrega <strong>${context.delivery.protocol}</strong> foi gerado e segue em anexo no formato PDF.</p>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:18px 0;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
                        ${emailSummaryRows
                          .map(
                            ([label, value]) => `
                              <tr>
                                <td style="width:140px;background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px 12px;font-size:12px;font-weight:700;color:#005A9C;text-transform:uppercase;">${label}</td>
                                <td style="border-bottom:1px solid #e2e8f0;padding:10px 12px;font-size:14px;color:#111827;">${value || '-'}</td>
                              </tr>
                            `,
                          )
                          .join('')}
                      </table>
                      <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#475569;">Este e-mail foi enviado automaticamente pelo sistema Marra Transportes. Guarde o PDF anexo como comprovante operacional.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `,
      attachments: [
        {
          filename: `${context.delivery.protocol}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });
    return updateDeliveryEmailStatus(deliveryId, 'Enviado', recipients, '');
  } catch (error) {
    return updateDeliveryEmailStatus(deliveryId, 'Falhou', recipients, error.message || 'Falha ao enviar e-mail.');
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'appmarratransportes' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'E-mail e senha sao obrigatorios.' });

  if (role === 'admin') {
    if (!adminEmails.includes(String(email).toLowerCase()) || password !== adminPassword) {
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
      [id, name, cpf, phone, email, hash, plate, cnhCategory, cnhFileName || null, cnhFileUrl, driverCommissionRate, currentTermsVersion, getClientIp(req)],
    );
    await createTermAcceptance(result.rows[0], req);
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
    [currentTermsVersion, getClientIp(req), driverCommissionRate, req.user.driverId],
  );
  if (!result.rows[0]) return res.status(404).json({ message: 'Motorista nao encontrado.' });
  await createTermAcceptance(result.rows[0], req);
  res.json({ driver: mapDriver(result.rows[0]) });
});

app.get('/api/drivers/:id/terms/latest', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.driverId !== req.params.id) {
    return res.status(403).json({ message: 'Acesso ao termo nao autorizado.' });
  }

  const stored = await pool.query(
    'SELECT * FROM driver_terms_acceptances WHERE driver_id = $1 ORDER BY accepted_at DESC LIMIT 1',
    [req.params.id],
  );
  if (stored.rows[0]) return res.json({ acceptance: mapTermAcceptance(stored.rows[0]) });

  const driverResult = await pool.query('SELECT * FROM drivers WHERE id = $1', [req.params.id]);
  const driver = driverResult.rows[0];
  if (!driver) return res.status(404).json({ message: 'Motorista nao encontrado.' });
  if (!driver.terms_accepted_at) return res.status(404).json({ message: 'Motorista ainda nao possui termo aceito.' });

  res.json({
    acceptance: {
      id: `legacy-${driver.id}`,
      driverId: driver.id,
      driverName: driver.name,
      driverCpf: driver.cpf,
      driverEmail: driver.email,
      driverPlate: driver.plate,
      cnhCategory: driver.cnh_category || '',
      commissionRate: Number(driver.commission_rate || driverCommissionRate),
      termsVersion: driver.terms_version || currentTermsVersion,
      termsText: driverTermsText(driver),
      acceptedAt: new Date(driver.terms_accepted_at).toISOString(),
      acceptedIp: driver.terms_ip || '',
      userAgent: '',
    },
  });
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
  const emailedDelivery = await sendDeliveryReceiptEmail(result.rows[0].id);
  res.status(201).json({ delivery: emailedDelivery || mapDelivery(result.rows[0]) });
});

app.post('/api/deliveries/:id/send-email', authenticate, async (req, res) => {
  const deliveryResult = await pool.query('SELECT * FROM deliveries WHERE id = $1', [req.params.id]);
  const delivery = deliveryResult.rows[0];
  if (!delivery) return res.status(404).json({ message: 'Entrega nao encontrada.' });
  if (req.user.role !== 'admin' && delivery.driver_id !== req.user.driverId) {
    return res.status(403).json({ message: 'Acesso a entrega nao autorizado.' });
  }
  const emailedDelivery = await sendDeliveryReceiptEmail(delivery.id);
  res.json({ delivery: emailedDelivery || mapDelivery(delivery) });
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
