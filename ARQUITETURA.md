# Arquitetura Auth + Backend

## Cliente
- PWA estático
- Firebase App + Firestore + Auth + Functions
- sessão técnica sustentada por **Auth anônimo**
- UI e listeners continuam no cliente

## Backend
Cloud Functions callable:
- `createRoom`
- `createFreeTrialRoom`
- `developerLogin`
- `developerLogout`
- `adminEnterRoom`
- `logoutRoom`
- `playerLogin`
- `playerSaveProfile`
- `adminCreatePlayer`
- `adminResetPlayerPassword`
- `rotateRoomAdminPassword`
- `migrateRoomSecurity`

## Firestore
Coleções principais:
- `matches/{code}`
- `matches/{code}/members/{uid}`
- `matches/{code}/players/{playerId}`
- `matches/{code}/rounds/{roundId}/attendance/{playerId}`
- `matches/{code}/ratings/{ratingId}`
- `matches/{code}/snapshots/{snapshotId}`
- `matches/{code}/audit/{auditId}`

## Modelo de acesso
- `developer`: custom claim no token
- `admin`: membership doc da sala
- `player`: membership doc da sala com `playerId`

## Senhas
- jogador: `passwordHash/passwordSalt`, com `passwordNeedsSetup`
- admin da sala: `adminPassHash/adminPassSalt`
- desenvolvedor: parâmetro `DEVELOPER_PASSWORD` nas Functions

## Motivo da Auth anônima
Ela cria um `uid` confiável para aplicar Rules e membership sem exigir e-mail/senha para cada jogador. O Firebase documenta o uso de contas anônimas para permitir acesso a dados protegidos por Rules.
