# Preparacao para Apple App Store e Google Play

Antes de publicar como app nativo, mantenha estes pontos atendidos:

## Obrigatorio no produto

- Politica de Privacidade acessivel sem login.
- Termos de Uso acessiveis sem login.
- Exclusao de conta dentro do app para motoristas.
- Permissao de localizacao solicitada apenas durante o registro da entrega.
- Texto claro explicando uso de GPS, camera/fotos e assinatura.
- Login real, sem credenciais de demonstracao.
- Backend em HTTPS.
- Senhas protegidas com hash.
- Dados persistidos no banco.
- Uploads armazenados no servidor.

## Dados declarados nas lojas

Declarar coleta/uso de:

- Nome, CPF, telefone e e-mail do motorista.
- Localizacao precisa durante a entrega.
- Fotos e arquivos enviados pelo motorista.
- Assinatura da entrega.
- Identificadores operacionais, como placa e protocolo.

## Pontos antes do build nativo

- Definir dominio final com HTTPS.
- Publicar URL publica da Politica de Privacidade.
- Definir e-mail oficial de suporte/privacidade.
- Criar icones e splash screens.
- Gerar app com Capacitor ou stack nativa equivalente.
- Configurar permissao de camera e localizacao com descricoes claras.
- Testar exclusao de conta no app instalado.
