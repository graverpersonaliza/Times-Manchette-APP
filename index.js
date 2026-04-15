const admin = require("firebase-admin");
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const DEVELOPER_PASSWORD = defineString("DEVELOPER_PASSWORD");
const DEFAULT_PLAYER_PASSWORD = "123456";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const MIN_NOTA = 5;
const MAX_NOTA = 10;
const POSICOES = ["Levantador","Ponteiro","Oposto","Central","Líbero","Coringa"];

function nowIso() {
  return new Date().toISOString();
}
function nowMs() {
  return Date.now();
}
function normalizeRoomCode(value) {
  return String(value || "").trim().toUpperCase();
}
function normalizePlayerName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}
function playerNameKey(value) {
  return normalizePlayerName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}
function assertAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Faça login no Firebase Auth antes de continuar.");
  }
  return request.auth.uid;
}
function assertDeveloper(request) {
  if (!request.auth?.token?.developer) {
    throw new HttpsError("permission-denied", "Somente Desenvolvedor.");
  }
}
function assertPasswordShape(pass, fieldLabel = "senha") {
  const p = String(pass || "").trim();
  if (p.length < 4) throw new HttpsError("invalid-argument", `A ${fieldLabel} precisa ter pelo menos 4 caracteres.`);
  if (p.length > 60) throw new HttpsError("invalid-argument", `A ${fieldLabel} pode ter no máximo 60 caracteres.`);
  if (/\s/.test(p)) throw new HttpsError("invalid-argument", `A ${fieldLabel} não pode conter espaços.`);
  return p;
}
function assertBaseNote(baseNote) {
  const n = Number(baseNote);
  if (!(n >= MIN_NOTA && n <= MAX_NOTA)) {
    throw new HttpsError("invalid-argument", "Escolha uma nota pessoal válida.");
  }
  return n;
}
function assertPosition(position) {
  const pos = String(position || "").trim();
  if (!POSICOES.includes(pos)) {
    throw new HttpsError("invalid-argument", "Escolha uma posição válida.");
  }
  return pos;
}
function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}
function hashPassword(password, salt = makeSalt()) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { passwordHash: hash, passwordSalt: salt, passwordAlgo: "scrypt" };
}
function verifyPassword(password, hash, salt) {
  if (!hash || !salt) return false;
  const hashedInput = crypto.scryptSync(String(password), String(salt), 64);
  const hashedStored = Buffer.from(String(hash), "hex");
  if (hashedInput.length !== hashedStored.length) return false;
  return crypto.timingSafeEqual(hashedInput, hashedStored);
}
function playerNeedsSetupFromDoc(data = {}) {
  if (typeof data.passwordNeedsSetup === "boolean") return !!data.passwordNeedsSetup;
  const legacy = String(data.password || "").trim();
  return !legacy || legacy === DEFAULT_PLAYER_PASSWORD;
}
function passwordMatchesDoc(password, data = {}) {
  const raw = String(password || "");
  if (data.passwordHash && data.passwordSalt) return verifyPassword(raw, data.passwordHash, data.passwordSalt);
  const legacy = String(data.password || "").trim() || DEFAULT_PLAYER_PASSWORD;
  return raw === legacy;
}
function genCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
function genSecret(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
function matchRef(code) {
  return db.collection("matches").doc(normalizeRoomCode(code));
}
function playersRef(code) {
  return matchRef(code).collection("players");
}
function membersRef(code) {
  return matchRef(code).collection("members");
}
function roundsRef(code) {
  return matchRef(code).collection("rounds");
}
function auditRef(code) {
  return matchRef(code).collection("audit");
}
function roundId() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `r${y}${m}${da}-${hh}${mm}-${Math.random().toString(36).slice(2, 6)}`;
}
async function appendAudit(code, action, details = {}, actor = {}) {
  await auditRef(code).add({
    action,
    details,
    actorUid: actor.uid || "",
    actorRole: actor.role || "",
    at: nowIso(),
    atMs: nowMs(),
    source: "functions"
  });
}
async function ensureRound(code) {
  const match = await matchRef(code).get();
  const data = match.data() || {};
  if (data.activeRoundId) return data.activeRoundId;
  const rid = roundId();
  const at = nowMs();
  const batch = db.batch();
  batch.set(roundsRef(code).doc(rid), { id: rid, createdAt: nowIso(), createdAtMs: at }, { merge: true });
  batch.set(matchRef(code), { activeRoundId: rid, activeRoundAtMs: at, updatedAt: nowIso() }, { merge: true });
  await batch.commit();
  return rid;
}
async function ensureUniqueRoomCode() {
  for (let i = 0; i < 15; i += 1) {
    const code = genCode(6);
    const snap = await matchRef(code).get();
    if (!snap.exists) return code;
  }
  throw new HttpsError("internal", "Não foi possível gerar um código de sala livre.");
}
async function getMember(code, uid) {
  const snap = await membersRef(code).doc(uid).get();
  return snap.exists ? snap.data() : null;
}
async function assertRoomAdmin(code, request) {
  if (request.auth?.token?.developer) return { uid: request.auth.uid, role: "developer" };
  const uid = assertAuth(request);
  const member = await getMember(code, uid);
  if (!member || member.role !== "admin") {
    throw new HttpsError("permission-denied", "Somente Admin.");
  }
  return { uid, role: "admin" };
}
async function findPlayerByName(code, name) {
  const normalized = normalizePlayerName(name);
  const key = playerNameKey(normalized);
  let qs = await playersRef(code).where("nameLower", "==", key).limit(3).get();

  if (qs.empty) {
    // Fallback para jogadores legados sem nameLower migrado
    const legacyByName = await playersRef(code).where("name", "==", normalized).limit(3).get();
    if (!legacyByName.empty) return legacyByName.docs[0];

    // Fallback tolerante a acentos/maiúsculas em salas antigas
    const legacyAll = await playersRef(code).limit(300).get();
    const matches = legacyAll.docs.filter((doc) => playerNameKey(doc.data()?.name || "") === key);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      throw new HttpsError("failed-precondition", "Há mais de um jogador com este nome nesta sala. Peça ao Admin para diferenciar os cadastros.");
    }

    throw new HttpsError("not-found", "Jogador não encontrado nesta sala. Peça para o Admin adicionar seu nome.");
  }
  if (qs.size > 1) {
    throw new HttpsError("failed-precondition", "Há mais de um jogador com este nome nesta sala. Peça ao Admin para diferenciar os cadastros.");
  }
  return qs.docs[0];
}
async function migratePlayerPasswordIfNeeded(code, playerSnap) {
  const data = playerSnap.data() || {};
  if (data.passwordHash && data.passwordSalt) return false;
  const legacyPassword = String(data.password || "").trim() || DEFAULT_PLAYER_PASSWORD;
  const next = hashPassword(legacyPassword);
  await playersRef(code).doc(playerSnap.id).set({
    ...next,
    passwordNeedsSetup: playerNeedsSetupFromDoc(data),
    passwordUpdatedAt: nowIso(),
    password: FieldValue.delete()
  }, { merge: true });
  return true;
}
async function migrateRoomAdminPasswordIfNeeded(code, roomSnap, plainPassword) {
  const data = roomSnap.data() || {};
  if (data.adminPassHash && data.adminPassSalt) return false;
  const legacy = String(data.adminPass || "").trim() || DEFAULT_ADMIN_PASSWORD;
  if (String(plainPassword || "") !== legacy) {
    throw new HttpsError("permission-denied", "Senha admin inválida para esta sala.");
  }
  const hashed = hashPassword(legacy);
  await matchRef(code).set({
    ...hashed,
    securityVersion: 2,
    adminPassUpdatedAt: nowIso(),
    adminPass: FieldValue.delete()
  }, { merge: true });
  return true;
}

exports.createRoom = onCall(async (request) => {
  const uid = assertAuth(request);
  const code = await ensureUniqueRoomCode();
  const adminPassword = assertPasswordShape(request.data?.adminPassword || DEFAULT_ADMIN_PASSWORD, "senha admin");
  const hashed = hashPassword(adminPassword);
  const rid = roundId();
  const at = nowMs();
  const batch = db.batch();
  batch.set(matchRef(code), {
    code,
    open: true,
    plan: "free",
    commercialStatus: "ativo",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    activeRoundId: rid,
    activeRoundAtMs: at,
    createdByUid: uid,
    securityVersion: 2,
    ...hashed
  }, { merge: true });
  batch.set(roundsRef(code).doc(rid), { id: rid, createdAt: nowIso(), createdAtMs: at }, { merge: true });
  batch.set(membersRef(code).doc(uid), {
    uid,
    role: "admin",
    createdAt: nowIso(),
    updatedAt: nowIso()
  }, { merge: true });
  await batch.commit();
  await appendAudit(code, "room_create", {}, { uid, role: request.auth?.token?.developer ? "developer" : "admin" });
  return { ok: true, code };
});

exports.createFreeTrialRoom = onCall(async (request) => {
  const uid = assertAuth(request);
  const ownerName = normalizePlayerName(request.data?.ownerName || "");
  const ownerWhatsApp = String(request.data?.ownerWhatsApp || "").trim();
  const roomName = normalizePlayerName(request.data?.roomName || `Teste de ${ownerName}`);
  if (!ownerName) throw new HttpsError("invalid-argument", "Informe o nome do responsável pelo teste grátis.");
  const code = await ensureUniqueRoomCode();
  const adminPassword = genSecret(8);
  const hashed = hashPassword(adminPassword);
  const trialEndsAt = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const rid = roundId();
  const at = nowMs();
  const batch = db.batch();
  batch.set(matchRef(code), {
    code,
    roomName,
    roomSubtitle: ownerName,
    ownerName,
    ownerWhatsApp,
    open: true,
    plan: "free",
    commercialStatus: "teste",
    trialEndsAt,
    clientNotes: "Teste grátis criado pelo backend.",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    activeRoundId: rid,
    activeRoundAtMs: at,
    createdByUid: uid,
    securityVersion: 2,
    ...hashed
  }, { merge: true });
  batch.set(roundsRef(code).doc(rid), { id: rid, createdAt: nowIso(), createdAtMs: at }, { merge: true });
  batch.set(membersRef(code).doc(uid), {
    uid,
    role: "admin",
    createdAt: nowIso(),
    updatedAt: nowIso()
  }, { merge: true });
  await batch.commit();
  await appendAudit(code, "room_create_trial", { ownerName, ownerWhatsApp }, { uid, role: "admin" });
  return { ok: true, code, adminPassword, trialEndsAt };
});

exports.developerLogin = onCall(async (request) => {
  const uid = assertAuth(request);
  const pass = String(request.data?.password || "").trim();
  const expected = String(DEVELOPER_PASSWORD.value() || "").trim();
  if (!expected) throw new HttpsError("failed-precondition", "DEVELOPER_PASSWORD não configurada nas Functions.");
  if (pass !== expected) throw new HttpsError("permission-denied", "Senha de Desenvolvedor inválida.");
  const user = await admin.auth().getUser(uid);
  const claims = Object.assign({}, user.customClaims || {}, { developer: true });
  await admin.auth().setCustomUserClaims(uid, claims);
  return { ok: true };
});

exports.developerLogout = onCall(async (request) => {
  const uid = assertAuth(request);
  const user = await admin.auth().getUser(uid);
  const claims = Object.assign({}, user.customClaims || {});
  delete claims.developer;
  await admin.auth().setCustomUserClaims(uid, claims);
  return { ok: true };
});

exports.adminEnterRoom = onCall(async (request) => {
  const uid = assertAuth(request);
  const code = normalizeRoomCode(request.data?.code);
  const password = String(request.data?.password || "").trim();
  if (!code) throw new HttpsError("invalid-argument", "Código da sala inválido.");
  if (!password) throw new HttpsError("invalid-argument", "Digite a senha admin.");
  const roomSnap = await matchRef(code).get();
  if (!roomSnap.exists) throw new HttpsError("not-found", "Sala não encontrada.");
  const room = roomSnap.data() || {};
  let ok = false;
  if (room.adminPassHash && room.adminPassSalt) {
    ok = verifyPassword(password, room.adminPassHash, room.adminPassSalt);
  } else {
    ok = String(room.adminPass || "").trim() === password || password === DEFAULT_ADMIN_PASSWORD;
  }
  if (!ok) throw new HttpsError("permission-denied", "Senha admin inválida para esta sala.");
  await migrateRoomAdminPasswordIfNeeded(code, roomSnap, password).catch(() => false);
  await membersRef(code).doc(uid).set({
    uid,
    role: "admin",
    updatedAt: nowIso(),
    createdAt: nowIso()
  }, { merge: true });
  await appendAudit(code, "admin_enter_room", {}, { uid, role: "admin" });
  return { ok: true };
});

exports.logoutRoom = onCall(async (request) => {
  const uid = assertAuth(request);
  const code = normalizeRoomCode(request.data?.code);
  if (!code) throw new HttpsError("invalid-argument", "Código da sala inválido.");
  await membersRef(code).doc(uid).delete().catch(() => {});
  return { ok: true };
});

exports.playerLogin = onCall(async (request) => {
  const uid = assertAuth(request);
  const code = normalizeRoomCode(request.data?.code);
  const name = normalizePlayerName(request.data?.name);
  const password = String(request.data?.password || "").trim();
  if (!code) throw new HttpsError("invalid-argument", "Código da sala inválido.");
  if (!name) throw new HttpsError("invalid-argument", "Digite o nome do jogador.");
  if (!password) throw new HttpsError("invalid-argument", "Digite a senha.");
  const playerSnap = await findPlayerByName(code, name);
  const data = playerSnap.data() || {};
  if (!passwordMatchesDoc(password, data)) {
    throw new HttpsError("permission-denied", "Senha do jogador inválida.");
  }
  await migratePlayerPasswordIfNeeded(code, playerSnap).catch(() => false);
  const needsSetup = playerNeedsSetupFromDoc(data);
  await membersRef(code).doc(uid).set({
    uid,
    role: "player",
    playerId: playerSnap.id,
    playerName: String(data.name || name),
    updatedAt: nowIso(),
    createdAt: nowIso()
  }, { merge: true });
  await playersRef(code).doc(playerSnap.id).set({
    lastLoginAt: nowIso(),
    lastLoginUid: uid
  }, { merge: true });
  return {
    ok: true,
    playerId: playerSnap.id,
    playerName: String(data.name || name),
    requiresPasswordSetup: needsSetup,
    missingFields: [
      !((Number(data.baseNote) >= MIN_NOTA) && (Number(data.baseNote) <= MAX_NOTA)) ? "nota pessoal" : "",
      !POSICOES.includes(String(data.position || "")) ? "posição" : ""
    ].filter(Boolean)
  };
});

exports.playerSaveProfile = onCall(async (request) => {
  const uid = assertAuth(request);
  const code = normalizeRoomCode(request.data?.code);
  if (!code) throw new HttpsError("invalid-argument", "Código da sala inválido.");
  const member = await getMember(code, uid);
  if (!member || member.role !== "player" || !member.playerId) {
    throw new HttpsError("permission-denied", "Faça login como jogador para continuar.");
  }
  const playerId = String(member.playerId);
  const playerSnap = await playersRef(code).doc(playerId).get();
  if (!playerSnap.exists) throw new HttpsError("not-found", "Jogador não encontrado.");
  const current = playerSnap.data() || {};
  const name = normalizePlayerName(request.data?.name || current.name || "");
  const nameLower = playerNameKey(name);
  const baseNote = assertBaseNote(request.data?.baseNote);
  const position = assertPosition(request.data?.position);
  if (!name || name.length < 2) throw new HttpsError("invalid-argument", "Informe um nome válido.");
  const dup = await playersRef(code).where("nameLower", "==", nameLower).limit(2).get();
  const other = dup.docs.find((doc) => doc.id !== playerId);
  if (other) {
    throw new HttpsError("already-exists", "Já existe um jogador com este nome nesta sala.");
  }
  const needsSetup = playerNeedsSetupFromDoc(current);
  const currentPassword = String(request.data?.currentPassword || "").trim();
  const newPassword = String(request.data?.newPassword || "").trim();
  const updates = {
    name,
    nameLower,
    baseNote,
    position,
    updatedAt: nowIso()
  };
  let passwordNeedsSetup = needsSetup;
  if (newPassword) {
    const next = assertPasswordShape(newPassword, "nova senha");
    if (!needsSetup) {
      if (!currentPassword) throw new HttpsError("invalid-argument", "Digite a senha atual.");
      if (!passwordMatchesDoc(currentPassword, current)) {
        throw new HttpsError("permission-denied", "Senha atual inválida.");
      }
    }
    const hashed = hashPassword(next);
    Object.assign(updates, hashed, {
      passwordNeedsSetup: false,
      passwordUpdatedAt: nowIso(),
      password: FieldValue.delete()
    });
    passwordNeedsSetup = false;
  } else if (needsSetup) {
    throw new HttpsError("failed-precondition", "Crie sua própria senha para continuar.");
  }
  await playersRef(code).doc(playerId).set(updates, { merge: true });
  await appendAudit(code, "player_update_profile", { playerId, passwordChanged: !!newPassword }, { uid, role: "player" });
  return { ok: true, playerId, passwordNeedsSetup };
});

exports.adminCreatePlayer = onCall(async (request) => {
  const code = normalizeRoomCode(request.data?.code);
  if (!code) throw new HttpsError("invalid-argument", "Código da sala inválido.");
  const actor = await assertRoomAdmin(code, request);
  const name = normalizePlayerName(request.data?.name);
  const baseNote = assertBaseNote(request.data?.baseNote);
  const position = assertPosition(request.data?.position);
  if (!name) throw new HttpsError("invalid-argument", "Digite o nome do jogador.");
  const dup = await playersRef(code).where("nameLower", "==", playerNameKey(name)).limit(1).get();
  if (!dup.empty) throw new HttpsError("already-exists", "Já existe um jogador com este nome nesta sala.");
  const ref = playersRef(code).doc();
  const hashed = hashPassword(DEFAULT_PLAYER_PASSWORD);
  const payload = {
    id: ref.id,
    name,
    nameLower: playerNameKey(name),
    baseNote,
    position,
    createdAt: nowIso(),
    createdByAdmin: true,
    passwordNeedsSetup: true,
    passwordUpdatedAt: nowIso(),
    ...hashed
  };
  await ref.set(payload, { merge: true });
  await matchRef(code).set({ updatedAt: nowIso() }, { merge: true });
  await appendAudit(code, "admin_create_player", { playerId: ref.id, name }, actor);
  return { ok: true, id: ref.id, name, baseNote, position, passwordNeedsSetup: true };
});

exports.adminResetPlayerPassword = onCall(async (request) => {
  const code = normalizeRoomCode(request.data?.code);
  const playerId = String(request.data?.playerId || "").trim();
  if (!code || !playerId) throw new HttpsError("invalid-argument", "Dados inválidos para reset de senha.");
  const actor = await assertRoomAdmin(code, request);
  const hashed = hashPassword(DEFAULT_PLAYER_PASSWORD);
  await playersRef(code).doc(playerId).set({
    ...hashed,
    passwordNeedsSetup: true,
    passwordUpdatedAt: nowIso(),
    password: FieldValue.delete()
  }, { merge: true });
  await appendAudit(code, "admin_reset_player_password", { playerId }, actor);
  return { ok: true };
});

exports.rotateRoomAdminPassword = onCall(async (request) => {
  const code = normalizeRoomCode(request.data?.code);
  if (!code) throw new HttpsError("invalid-argument", "Código da sala inválido.");
  const actor = await assertRoomAdmin(code, request);
  const newPassword = assertPasswordShape(request.data?.newPassword, "nova senha admin");
  const hashed = hashPassword(newPassword);
  await matchRef(code).set({
    ...hashed,
    adminPassUpdatedAt: nowIso(),
    securityVersion: 2,
    adminPass: FieldValue.delete(),
    updatedAt: nowIso()
  }, { merge: true });
  await appendAudit(code, "admin_rotate_room_password", {}, actor);
  return { ok: true };
});

exports.migrateRoomSecurity = onCall(async (request) => {
  const code = normalizeRoomCode(request.data?.code);
  if (!code) throw new HttpsError("invalid-argument", "Código da sala inválido.");
  const actor = await assertRoomAdmin(code, request);
  const roomSnap = await matchRef(code).get();
  let migratedPlayers = 0;
  let migratedRoom = 0;
  const room = roomSnap.data() || {};
  if (!room.adminPassHash && room.adminPass) {
    const hashed = hashPassword(String(room.adminPass || "").trim() || DEFAULT_ADMIN_PASSWORD);
    await matchRef(code).set({
      ...hashed,
      securityVersion: 2,
      adminPassUpdatedAt: nowIso(),
      adminPass: FieldValue.delete(),
      updatedAt: nowIso()
    }, { merge: true });
    migratedRoom = 1;
  }
  const players = await playersRef(code).get();
  for (const doc of players.docs) {
    const data = doc.data() || {};
    const updates = {
      updatedAt: nowIso()
    };
    let changed = false;

    const expectedNameLower = playerNameKey(data.name || "");
    if (expectedNameLower && String(data.nameLower || "") !== expectedNameLower) {
      updates.nameLower = expectedNameLower;
      changed = true;
    }

    if (!data.passwordHash || !data.passwordSalt) {
      const legacy = String(data.password || "").trim() || DEFAULT_PLAYER_PASSWORD;
      const hashed = hashPassword(legacy);
      Object.assign(updates, {
        ...hashed,
        passwordNeedsSetup: playerNeedsSetupFromDoc(data),
        passwordUpdatedAt: nowIso(),
        password: FieldValue.delete()
      });
      changed = true;
    }

    if (changed) {
      await playersRef(code).doc(doc.id).set(updates, { merge: true });
      migratedPlayers += 1;
    }
  }
  await appendAudit(code, "migrate_room_security", { migratedPlayers, migratedRoom }, actor);
  return { ok: true, migratedPlayers, migratedRoom };
});


exports.reindexRoomPlayers = onCall(async (request) => {
  const code = normalizeRoomCode(request.data?.code);
  if (!code) throw new HttpsError("invalid-argument", "Código da sala inválido.");
  const actor = await assertRoomAdmin(code, request);
  const players = await playersRef(code).get();
  let reindexed = 0;
  for (const doc of players.docs) {
    const data = doc.data() || {};
    const expectedNameLower = playerNameKey(data.name || "");
    if (!expectedNameLower) continue;
    if (String(data.nameLower || "") === expectedNameLower) continue;
    await playersRef(code).doc(doc.id).set({
      nameLower: expectedNameLower,
      updatedAt: nowIso()
    }, { merge: true });
    reindexed += 1;
  }
  await appendAudit(code, "reindex_room_players", { reindexed }, actor);
  return { ok: true, reindexed };
});
