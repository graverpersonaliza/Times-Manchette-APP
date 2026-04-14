# Publicação - GitHub Pages + Firebase

## 1. Subir arquivos no GitHub
No repositório do site, envie:
- `index.html`
- `script_0.js`
- `script_1.js`
- `manifest.json`
- `sw.js`
- todos os ícones PNG

## 2. Commit
Use uma mensagem clara, por exemplo:
`release 1.0.0 backup auditoria docs`

## 3. Atualização de cache
Como o `sw.js` já recebeu um novo `CACHE_NAME`, a atualização do PWA passa a assumir a nova versão depois de recarregar a página e reabrir o app.

## 4. Firebase Firestore
No Firebase Console:
- abra Firestore Database
- vá em Rules
- substitua pelo conteúdo do arquivo `firestore.rules`
- publique as rules

## 5. Teste mínimo obrigatório
Depois do deploy, testar:
- entrar como Jogador
- entrar como Admin
- criar sala
- adicionar jogador
- primeiro login do jogador com `123456`
- criação de senha nova
- backup JSON
- restauração de backup
- baixar log
- salvar histórico
- nova rodada
- recarregar página e verificar cache atualizado

## 6. Se a versão antiga continuar
No navegador:
- recarregar forçado
- fechar e abrir novamente o PWA
- se necessário, limpar cache/site data do domínio
