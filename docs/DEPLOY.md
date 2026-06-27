# Deploy em producao

Este projeto agora e uma aplicacao real full-stack:

- Frontend React/Vite compilado em `dist`.
- Backend Node/Express na mesma porta.
- PostgreSQL para persistencia.
- JWT para sessao.
- Senhas com bcrypt.
- Uploads gravados em `uploads/`.

## Requisitos do servidor para Docker

- Git
- Docker
- Docker Compose
- Nginx ou Apache como proxy reverso
- Porta interna escolhida: `5173`

## Deploy recomendado com Docker

Este e o mesmo padrao usado no `rondasmart`: um container para o app e outro para o PostgreSQL, com volumes persistentes.

No servidor:

```bash
cd /www
git clone https://github.com/TIGTM/appmarratransportes.git
cd appmarratransportes
cp .env.example .env
nano .env
docker compose up -d --build
```

Configure o `.env`:

```env
NODE_ENV=production
PORT=5173
POSTGRES_DB=marra_transportes
POSTGRES_USER=marra_user
POSTGRES_PASSWORD=SENHA_FORTE_AQUI
DATABASE_URL=postgres://marra_user:SENHA_FORTE_AQUI@marra-db:5432/marra_transportes
JWT_SECRET=coloque-um-segredo-grande-e-unico
ADMIN_EMAIL=admin@seudominio.com.br
ADMIN_PASSWORD=uma-senha-forte
```

Verifique:

```bash
docker compose ps
docker compose logs -f marra-app
curl http://127.0.0.1:5173/api/health
```

Atualizar versao:

```bash
cd /www/appmarratransportes
git pull
docker compose up -d --build
```

Backup Docker:

```bash
docker compose exec marra-db pg_dump -U marra_user marra_transportes > backup-marra-$(date +%F).sql
docker run --rm -v appmarratransportes_marra-transportes-uploads:/uploads -v "$PWD":/backup alpine tar -czf /backup/uploads-marra-$(date +%F).tar.gz /uploads
```

## Deploy alternativo sem Docker

Use esta opcao apenas se preferir instalar PostgreSQL direto no servidor.

## Criar banco PostgreSQL

Exemplo como `root` ou usuario com permissao:

```bash
sudo -u postgres psql
```

Dentro do `psql`:

```sql
CREATE DATABASE marra_transportes;
CREATE USER marra_user WITH ENCRYPTED PASSWORD 'SENHA_FORTE_AQUI';
GRANT ALL PRIVILEGES ON DATABASE marra_transportes TO marra_user;
\q
```

Em alguns servidores PostgreSQL 15+, tambem rode:

```bash
sudo -u postgres psql -d marra_transportes -c "GRANT ALL ON SCHEMA public TO marra_user;"
```

## Primeira instalacao do app

No servidor, dentro da pasta onde ficam os sites, por exemplo `/www`:

```bash
cd /www
git clone https://github.com/TIGTM/appmarratransportes.git
cd appmarratransportes
npm ci
cp .env.example .env
nano .env
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Configure o `.env` antes do `pm2 start`:

```env
NODE_ENV=production
PORT=5173
DATABASE_URL=postgres://marra_user:SENHA_FORTE_AQUI@127.0.0.1:5432/marra_transportes
JWT_SECRET=coloque-um-segredo-grande-e-unico
ADMIN_EMAIL=admin@seudominio.com.br
ADMIN_PASSWORD=uma-senha-forte
```

Verifique:

```bash
pm2 status
pm2 logs appmarratransportes
ss -tulpn | grep 5173
curl http://127.0.0.1:5173/api/health
```

Se aparecer `*:5173` ou `0.0.0.0:5173`, a aplicacao esta no ar pelo Node.

## Atualizacao de versao

```bash
cd /www/appmarratransportes
git pull
npm ci
npm run build
pm2 reload appmarratransportes --update-env
pm2 save
```

## Firewall

Se o servidor usa `iptables`:

```bash
iptables -I INPUT -p tcp --dport 5173 -j ACCEPT
```

Se usa painel da hospedagem/cloud, libere entrada TCP para:

```text
5173
```

Se o dominio for usar Nginx como proxy reverso, nao e obrigatorio expor a porta `5173` publicamente. Nesse caso libere apenas `80` e `443`, e deixe a aplicacao acessivel internamente em `127.0.0.1:5173`.

## Nginx recomendado

Crie um arquivo como `/etc/nginx/conf.d/appmarratransportes.conf`:

```nginx
server {
    listen 80;
    server_name appmarratransportes.seudominio.com.br;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Teste e recarregue:

```bash
nginx -t
systemctl reload nginx
```

## Certificado SSL

Com Certbot:

```bash
certbot --nginx -d appmarratransportes.seudominio.com.br
```

Para publicacao em Apple App Store e Google Play, use sempre HTTPS no dominio consumido pelo app.

## Apps mobile

Checklist de loja: [docs/APP_STORES.md](APP_STORES.md).

## Comandos uteis

```bash
pm2 status
pm2 logs appmarratransportes
pm2 restart appmarratransportes
pm2 stop appmarratransportes
pm2 delete appmarratransportes
```

## Backup

Banco:

```bash
pg_dump marra_transportes > backup-marra-$(date +%F).sql
```

Uploads:

```bash
tar -czf uploads-marra-$(date +%F).tar.gz uploads/
```
