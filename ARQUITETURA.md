# Arquitetura resumida

## Front-end
- `index.html`
- `script_0.js` lógica principal
- `script_1.js` instalação PWA
- `sw.js` cache offline

## Banco
Coleção principal: `matches`

Subcoleções por sala:
- `players`
- `ratings`
- `snapshots`
- `audit`
- `rounds/{roundId}/attendance`

## Conceitos
- uma sala mantém a continuidade do grupo
- uma rodada representa um ciclo de presença/time
- snapshots guardam histórico salvo
- audit registra ações críticas
- backup JSON permite exportação/restauração
