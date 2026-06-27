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
- Docker Compose

## Rodar localmente

Frontend:

```bash
npm install
npm run dev
```

Acesse:

```text
http://127.0.0.1:5173
```

## Producao com Docker

```bash
cp .env.example .env
docker compose up -d --build
```

O Docker Compose sobe:

- `marra-app`
- `marra-db`
- volume do PostgreSQL
- volume dos uploads

Antes de iniciar em producao, configure o `.env` com `POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

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
