# Changelog

## 1.0.0 - 2026-04-08
- consolidado login do jogador por nome + senha
- mantida senha padrão inicial `123456`
- criação de senha própria no primeiro acesso
- bloqueio de presença, time e avaliação enquanto faltarem senha própria, nota ou posição
- backup JSON da sala
- restauração de backup JSON na sala atual
- download de log de auditoria
- auditoria de ações críticas: criação de sala, criação de jogador, reset de senha, nova rodada, personalização, agendamento, histórico e ações do Desenvolvedor
- central rápida com guia de uso
- versão/build documentados
- limpeza do comentário inseguro de Firestore Rules no HTML
- atualização do cache do PWA
- documentação de deploy, segurança e operação
