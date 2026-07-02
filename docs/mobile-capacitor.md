# Mobile com Capacitor

Este projeto esta preparado para virar app Android/iOS usando Capacitor.

## O que ja esta configurado

- App ID: `br.com.marratransportes.app`
- Nome do app: `Marra Transportes`
- Web build: `dist`
- Android criado em `android/`
- Plugins nativos:
  - `@capacitor/camera`
  - `@capacitor/geolocation`
  - `@capacitor/app`
  - `@capacitor/browser`
  - `@capacitor/filesystem`
- Permissoes Android declaradas:
  - Internet
  - Camera
  - Localizacao aproximada/exata
  - Leitura de imagens

## Fluxo Android

```bash
npm install
npm run cap:android
npm run cap:open:android
```

No Android Studio:

1. Aguarde o Gradle sincronizar.
2. Teste em emulador ou aparelho fisico.
3. Para loja, gere o `AAB` em `Build > Generate Signed Bundle / APK`.

## Fluxo iOS

O iOS fica para a etapa final porque exige macOS/Xcode.

Em um Mac:

```bash
npm install
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios
```

No Xcode:

1. Configurar Team da conta Apple Developer.
2. Ajustar Bundle Identifier se necessario: `br.com.marratransportes.app`.
3. Revisar permissoes de camera e localizacao no `Info.plist`.
4. Rodar em simulador/iPhone.
5. Gerar Archive para TestFlight/App Store Connect.

## Observacoes para lojas

- O app coleta fotos, assinatura e localizacao GPS para comprovar entregas.
- A politica de privacidade e os termos precisam permanecer acessiveis no app.
- Antes de publicar, testar:
  - cadastro/login de motorista;
  - permissao de camera;
  - permissao de localizacao;
  - registro de entrega;
  - envio de comprovante por e-mail;
  - exclusao de conta do motorista.
