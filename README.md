# Marra Transportes

Prototipo navegavel de alta fidelidade para demonstracao do sistema de comprovacao de entregas da Marra Transportes.

## Tecnologias

- React
- Vite
- TypeScript
- TailwindCSS
- LocalStorage

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse:

```text
http://127.0.0.1:5173
```

## Build de producao

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

A aplicacao fica na porta:

```text
5173
```

Guia completo de servidor: [docs/DEPLOY.md](docs/DEPLOY.md).

## Acessos de demonstracao

Motorista:

```text
joao@demo.com
123456
```

Administrador:

```text
admin@marra.com
admin123
```

## Observacao

Este projeto e apenas um prototipo frontend. Nao possui backend, banco de dados, API, autenticacao real ou envio real de e-mails.
