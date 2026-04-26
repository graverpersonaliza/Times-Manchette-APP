# Deploy do pacote Auth + Backend

## 1. Site estático
Envie para o GitHub Pages ou Firebase Hosting:
- index.html
- script_0.js
- script_1.js
- sw.js
- manifest.json
- ícones png

## 2. Ative o Firebase Authentication
No Console do Firebase:
- Authentication > Sign-in method
- ative **Anonymous**

Se for testar em `localhost`, em projetos criados depois de 28/04/2025 o `localhost` não vem mais autorizado por padrão. Adicione manualmente em **Authentication > Settings > Authorized domains**. Também adicione seu domínio do GitHub Pages ou domínio próprio.

## 3. Deploy das Functions
Na pasta do projeto:
```bash
cd functions
npm install
```

Crie `functions/.env` baseado em `.env.example`:
```env
DEVELOPER_PASSWORD=sua-senha-forte-de-desenvolvedor
```

Depois:
```bash
cd ..
firebase deploy --only functions,firestore:rules
```

## 4. O que muda no app
- o navegador entra com **Auth anônimo**
- jogador faz login por **nome + senha** via backend
- Admin entra por senha da sala via backend
- Desenvolvedor ganha **custom claim** `developer=true`
- regras do Firestore passam a depender de Auth e papel do usuário

## 5. Fluxo recomendado
1. subir os arquivos do site
2. ativar Anonymous Auth
3. fazer deploy das Functions
4. publicar `firestore.rules`
5. testar: criar sala, entrar admin, adicionar jogador, primeiro login do jogador, troca de senha, reset de senha, logout

## 6. Observação importante
As custom claims chegam ao cliente pelo ID token. Quando a claim muda, o token precisa ser renovado; no app isso já foi tratado com `getIdToken(true)`.
