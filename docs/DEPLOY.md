# Deploy em producao

Este projeto e um frontend estatico React/Vite. Em producao ele deve ser compilado com `npm run build` e servido pelo pacote `serve` gerenciado pelo PM2.

## Requisitos do servidor

- Node.js 18 ou superior
- npm
- Git
- PM2 ja instalado
- Porta interna escolhida: `5173`

## Primeira instalacao

No servidor, dentro da pasta onde ficam os sites, por exemplo `/www`:

```bash
cd /www
git clone https://github.com/TIGTM/appmarratransportes.git
cd appmarratransportes
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Verifique:

```bash
pm2 status
pm2 logs appmarratransportes
ss -tulpn | grep 5173
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

## Comandos uteis

```bash
pm2 status
pm2 logs appmarratransportes
pm2 restart appmarratransportes
pm2 stop appmarratransportes
pm2 delete appmarratransportes
```
