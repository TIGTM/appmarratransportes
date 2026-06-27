# Marra Transportes

Sistema de comprovacao de entregas da Marra Transportes.

## Tecnologias

- React
- Vite
- TypeScript
- TailwindCSS
- Node/Express
- PostgreSQL
- JWT
- Uploads em disco

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse:

```text
http://127.0.0.1:5173
```

## Build de producao real

```bash
npm ci
npm run build
npm start
```

Em producao com PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Antes de iniciar em producao, configure o `.env` com `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

A aplicacao real sobe API + frontend na porta:

```text
5173
```

Guia completo de servidor: [docs/DEPLOY.md](docs/DEPLOY.md).

## Acessos

Motorista:

O motorista deve se cadastrar na tela inicial e aguardar aprovacao no painel administrativo.

Administrador:

Defina `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` do servidor.

## Observacao

Este projeto agora possui backend Node/Express, PostgreSQL, autenticacao JWT, senhas com bcrypt e uploads de comprovantes em disco.
