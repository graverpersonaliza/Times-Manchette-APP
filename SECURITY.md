# Security Policy

## Escopo atual
Esta versão remove a dependência de senha de desenvolvedor no front-end e passa a usar:
- Firebase Authentication no cliente
- Cloud Functions para operações sensíveis
- Firestore Rules baseadas em Auth e papel do usuário

## Controles incluídos
- login de jogador validado no backend
- senha admin validada no backend
- claim de desenvolvedor via Admin SDK
- regras do Firestore por função
- migração de senhas legadas em texto puro para hash usando `crypto.scrypt`

## Ações recomendadas
- definir uma senha forte em `functions/.env`
- ativar Anonymous Auth
- revisar Authorized Domains do Firebase Auth
- não subir o arquivo `.env` para o GitHub

## Limitações conhecidas
- o painel atual ainda usa parte da lógica de dados diretamente no cliente para operações não sensíveis
- para endurecimento máximo, o próximo passo é mover mais mutações administrativas para Functions
