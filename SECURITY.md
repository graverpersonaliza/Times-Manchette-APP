# Segurança

## Estado atual
O sistema já possui melhorias operacionais importantes, mas ainda há um ponto estrutural: a aplicação é publicada como site estático e parte das permissões ainda depende da lógica do cliente.

## O que já foi reforçado neste pacote
- remoção do comentário de rules abertas do HTML
- backup JSON para recuperação de sala
- log de auditoria para ações críticas
- documentação de deploy e governança
- versionamento explícito de release/cache

## O que deve ser feito no Firebase Console
1. Revisar `firestore.rules`
2. Publicar as rules no Firebase
3. Monitorar leitura/escrita por coleção
4. Fazer backup manual antes de alterações críticas

## Recomendação de evolução real de segurança
Para atingir blindagem completa, a próxima evolução recomendada é:
- Firebase Authentication
- perfis com custom claims ou backend intermediário
- Cloud Functions para ações sensíveis do Desenvolvedor/Admin
- logs centralizados e bloqueio de ações por papel no servidor

## Risco atual se não evoluir a camada de segurança
Sem autenticação forte no backend, um usuário avançado pode tentar reproduzir chamadas do cliente. O pacote atual reduz risco operacional, mas não substitui segurança de servidor.
