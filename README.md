# Manchette Volleyball

Versão: 1.0.0  
Build: 2026-04-08

Aplicação PWA para organização de partidas de vôlei com:
- salas por código
- acesso Jogador, Admin e Desenvolvedor
- login do jogador por nome + senha
- senha padrão inicial `123456` criada pelo Admin
- criação de senha própria no primeiro acesso
- presença, escolha de time e avaliação oculta
- histórico, ranking, estatísticas e relatórios
- painel comercial do Desenvolvedor
- backup e restauração em JSON
- log de auditoria para ações críticas

## Arquivos principais para publicar
- `index.html`
- `script_0.js`
- `script_1.js`
- `manifest.json`
- `sw.js`
- ícones `icon-192.png`, `icon-512.png`, `icon-192-maskable.png`, `icon-512-maskable.png`, `apple-touch-icon.png`

## Documentação do pacote
- `CHANGELOG.md`
- `DEPLOY-GITHUB-FIREBASE.md`
- `MANUAL-ADMIN.md`
- `MANUAL-DESENVOLVEDOR.md`
- `SECURITY.md`
- `firestore.rules`

## Observação importante sobre segurança
A aplicação continua operando como front-end estático com Firestore. O pacote já melhora operação, backup, logs e documentação, mas a blindagem completa de papéis sensíveis ainda depende de configuração no Firebase Console e, idealmente, evolução futura para Firebase Auth + Functions/claims.
