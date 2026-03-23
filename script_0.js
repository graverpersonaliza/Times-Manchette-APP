
    // ===============================
    // Firebase config (seu projeto)
    // ===============================
    const firebaseConfig = {
  "apiKey": "AIzaSyDykk6em3koHEi7uqBxCB9yycXJC3WOZ2U",
  "authDomain": "times-manchette.firebaseapp.com",
  "projectId": "times-manchette",
  "storageBucket": "times-manchette.firebasestorage.app",
  "messagingSenderId": "774710663618",
  "appId": "1:774710663618:web:7585bf93588603c7371e5b",
  "measurementId": "G-H9WLSPM3QY"
};

    // ===============================
    // Config do app
    // ===============================
    const LS_SESSION = "vb_session_v4";
    const LS_LAST_CODE = "vb_last_code_v3";
    const LS_GROUPS = "vb_groups_v1";
    const LS_NOTIFY_PREF = "vb_notify_pref_v1";
    const LS_DEVICE_ID = "vb_device_id_v1";

    const POSICOES = ["Levantador","Ponteiro","Oposto","Central","Líbero","Coringa"];

    // Admin (não exibimos a senha em lugar nenhum)
    const ADMIN_PASS = "admin123"; // troque se quiser
    const DEVELOPER_PASS = "Noecreate2026"; // troque antes de publicar

    // Escalas
    const MIN_NOTA = 5, MAX_NOTA = 10;
    const RATE_BASELINE = 6.5;

    // ✅ Só avisar desequilíbrio depois de X escolhas
    const MIN_ESCOLHAS_PARA_ALERTA = 5;

    // Limite de jogadores por time (6x6)
    const TEAM_MAX = 6;
    const SUPPORT_WHATSAPP = "5554999778707";
    const DEVELOPER_PROTECTED_ROOM = "GNYT7H"; // usado apenas como referência de sala principal, sem proteção especial

    const PLAN_ORDER = { free: 0, basico: 1, pro: 2 };
    const PLAN_LABELS = { free: "Free", basico: "Básico", pro: "PRO" };
    const COMMERCIAL_LABELS = {
      demo: "Demonstração",
      teste: "Teste",
      ativo: "Ativo",
      inativo: "Inativo",
      inadimplente: "Inadimplente",
      bloqueado: "Bloqueado"
    };

    // ===============================
    // Estado
    // ===============================
    let session = normalizeSession(load(LS_SESSION, { code:"", playerId:"", prevPlayerId:"", admin:false, developer:false, role:"player", adminPassDraft:"" }));

    let state = {
      code: "",
      open: true,
      activeRoundId: "",
      activeRoundAtMs: 0,

      players: {},       // id -> player (cadastro fixo)
      attendance: {},    // playerId -> {present, team, checkedInAtMs}
      ratings: {},       // id -> rating
      snapshots: {},     // id -> snapshot

      syncError: "",
      info: "",

      matchDate: "",
      matchTime: "",
      matchLocation: "",
      closeBeforeMin: 15,

      roomName: "",
      roomSubtitle: "",
      team1Name: "Time 1",
      team2Name: "Time 2",
      themeColor: "#2563eb",
      plan: "free",
      ownerName: "",
      ownerWhatsApp: "",
      commercialStatus: "ativo",
      trialEndsAt: "",
      paidUntil: "",
      clientNotes: "",
      adminPassStored: "",
      developerRooms: [],
      developerRoomsError: "",
      developerFilter: "",
      roomGroups: {},
      activeInternalGroupId: "",
      activeInternalGroupName: ""
    };

    let db = null;
    let unsub = { meta:null, players:null, attendance:null, ratings:null, snapshots:null };
    let liveNotify = { roomCode:"", playersReady:false, attendanceReady:false, players:{}, attendance:{}, lastKey:"", lastAt:0 };

    // ===============================
    // Helpers
    // ===============================
    function $(id){ return document.getElementById(id); }
    function nowIso(){ return new Date().toISOString(); }
    function nowMs(){ return Date.now(); }
    function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
    function avg(arr){ return arr.length ? arr.reduce((x,y)=>x+y,0)/arr.length : 0; }
    function median(arr){
      if(!arr.length) return 0;
      const s=[...arr].sort((a,b)=>a-b);
      const m=Math.floor(s.length/2);
      return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
    }
    function genCode(len=6){
      const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let out="";
      for(let i=0;i<len;i++) out += alphabet[Math.floor(Math.random()*alphabet.length)];
      return out;
    }

// Código do Jogador (para entrar em outro celular/PC)
function genPlayerCode(len=10){
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out="";
  for(let i=0;i<len;i++) out += alphabet[Math.floor(Math.random()*alphabet.length)];
  return out;
}

async function ensureAccessCodeForPlayer(code, playerId){
  const c = String(code||"").toUpperCase();
  const ref = playersCol(c).doc(playerId);
  const snap = await ref.get();
  if(!snap.exists) throw new Error("Jogador não encontrado.");
  const d = snap.data() || {};
  if(d.accessCode) return d.accessCode;

  // tenta alguns códigos (baixa chance de colisão)
  for(let k=0;k<5;k++){
    const ac = genPlayerCode(10);
    const q = await playersCol(c).where("accessCode","==",ac).limit(1).get();
    if(q.empty){
      await ref.set({ accessCode: ac, updatedAt: nowIso() }, { merge:true });
      return ac;
    }
  }
  throw new Error("Não consegui gerar um código agora. Tente novamente.");
}

async function claimPlayerByAccessCode(){
  try{
    const code = state.code;
    if(!code) return alert("Entre na sala primeiro (código da partida).");
    const acRaw = ($("accessCodeInput")?.value || "").trim().toUpperCase().replace(/\s+/g,"");
    if(!acRaw) return alert("Digite seu Código do Jogador.");
    const qs = await playersCol(code).where("accessCode","==",acRaw).limit(1).get();
    if(qs.empty) return alert("Código não encontrado nesta sala. Verifique e tente novamente.");
    const doc = qs.docs[0];
    const d = doc.data() || {};
    session.playerId = doc.id;
    persistSession();
    if($("accessCodeInput")) $("accessCodeInput").value = "";
    setInfo(`Inscrição recuperada: ${d.name || "Jogador"}.`);
  }catch(e){
    setSyncError(e && e.message ? e.message : e);
  }
}

async function copyText(text){
  try{
    await navigator.clipboard.writeText(text);
    setInfo("Copiado.");
  }catch{
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try{ document.execCommand("copy"); setInfo("Copiado."); }
    catch{ alert("Não consegui copiar automaticamente."); }
    document.body.removeChild(ta);
  }
}

    function safeId(){
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(2,8);
    }
    function escapeHtml(s){
      return String(s).replace(/[&<>'"]/g, c => ({
        "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
      }[c]));
    }


function safeBoldInfo(s){
  // Permite apenas <b> e </b> no texto de info; todo o resto permanece escapado
  const e = escapeHtml(s||"");
  return e.replace(/&lt;b&gt;/g, "<b>").replace(/&lt;\/b&gt;/g, "</b>");
}
    function save(key, value){ try{ localStorage.setItem(key, JSON.stringify(value)); }catch{} }
    function load(key, fallback){
      try{
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      }catch{ return fallback; }
    }
    function getDeviceId(){
      let id = load(LS_DEVICE_ID, "");
      if(!id){
        id = safeId();
        save(LS_DEVICE_ID, id);
      }
      return String(id || "");
    }
    function findRegisteredPlayerForThisDevice(playersObj = state.players || {}){
      const deviceId = getDeviceId();
      if(!deviceId) return null;
      return Object.values(playersObj || {}).find(p => p && String(p.deviceId || "") === deviceId) || null;
    }
    function persistSession(){
      save(LS_SESSION, session);
      if(state.code) save(LS_LAST_CODE, state.code);
    }

    function normalizeSession(raw){
      const base = Object.assign({ code:"", playerId:"", prevPlayerId:"", admin:false, developer:false, role:"player", adminPassDraft:"" }, raw || {});
      if(base.role === "developer" || base.developer){
        base.role = "developer";
        base.developer = true;
        base.admin = true;
      }else if(base.role === "admin" || base.admin){
        base.role = "admin";
        base.developer = false;
        base.admin = true;
      }else{
        base.role = "player";
        base.developer = false;
        base.admin = false;
      }
      base.adminPassDraft = String(base.adminPassDraft || "");
      return base;
    }

    function accessMode(){
      if(session.developer) return "developer";
      if(session.admin) return "admin";
      return "player";
    }

    function accessModeLabel(mode = accessMode()){
      if(mode === "developer") return "Desenvolvedor";
      if(mode === "admin") return "Admin";
      return "Jogador";
    }

    function notificationsEnabled(){
      return !!load(LS_NOTIFY_PREF, false);
    }

    function notificationStatusLabel(){
      if(!("Notification" in window)) return "Seu navegador não suporta notificações do sistema.";
      const permission = Notification.permission;
      if(permission === "granted" && notificationsEnabled()) return "Notificações ativas para avisos da sala.";
      if(permission === "denied") return "Notificações bloqueadas neste aparelho.";
      return notificationsEnabled() ? "Permissão pendente no navegador." : "Ative para receber avisos no app instalado.";
    }

    function canReceiveLiveNotifications(){
      return !!state.code && (session.admin || session.developer) && notificationsEnabled() && ("Notification" in window) && Notification.permission === "granted";
    }

    function resetLiveNotify(code = ""){
      liveNotify = { roomCode: normalizeRoomCode(code), playersReady:false, attendanceReady:false, players:{}, attendance:{}, lastKey:"", lastAt:0 };
    }

    async function enableSystemNotifications(){
      try{
        if(!("Notification" in window)) return alert("Seu navegador não suporta notificações do sistema.");
        let permission = Notification.permission;
        if(permission !== "granted") permission = await Notification.requestPermission();
        const allowed = permission === "granted";
        save(LS_NOTIFY_PREF, allowed);
        if(allowed){
          await pushSystemNotification("Manchette Volleyball", "Notificações ativadas para inscrições, presença e escolha de time.", { force:true, tag:"notif-onboarding" });
          setInfo("Notificações ativadas.");
        }else{
          setInfo("Notificações não foram liberadas neste aparelho.");
        }
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao ativar notificações."));
      }
    }

    function disableSystemNotifications(){
      save(LS_NOTIFY_PREF, false);
      setInfo("Notificações desativadas neste aparelho.");
      render();
    }

    async function pushSystemNotification(title, body, opts = {}){
      try{
        if(!("Notification" in window)) return false;
        if(Notification.permission !== "granted") return false;
        if(!notificationsEnabled() && !opts.force) return false;
        const key = `${title}|${body}`;
        const now = Date.now();
        if(!opts.force && liveNotify.lastKey === key && (now - liveNotify.lastAt) < 1800) return false;
        liveNotify.lastKey = key;
        liveNotify.lastAt = now;
        const url = opts.url || buildRoomUrl(state.code || liveNotify.roomCode || "") || (location.origin + location.pathname);
        const payload = {
          body,
          icon: "./icon-192.png",
          badge: "./icon-192.png",
          tag: opts.tag || `room-${normalizeRoomCode(state.code || liveNotify.roomCode || "geral")}-${now}`,
          renotify: false,
          data: { url }
        };
        if("serviceWorker" in navigator){
          const reg = await navigator.serviceWorker.ready.catch(()=>null);
          if(reg && reg.showNotification){
            await reg.showNotification(title, payload);
            return true;
          }
        }
        new Notification(title, payload);
        return true;
      }catch(e){
        console.warn("Falha ao mostrar notificação", e);
        return false;
      }
    }

    function queueRoomNotification(title, body, opts = {}){
      if(!canReceiveLiveNotifications()) return;
      pushSystemNotification(title, body, opts);
    }

    function playerNameById(playerId){
      const p = (state.players && state.players[playerId]) || (liveNotify.players && liveNotify.players[playerId]) || {};
      return String(p.name || "Jogador");
    }

    function maybeNotifyPlayersSnapshot(nextPlayers){
      if(!state.code) {
        liveNotify.players = nextPlayers || {};
        liveNotify.playersReady = true;
        return;
      }
      if(!liveNotify.playersReady || normalizeRoomCode(liveNotify.roomCode) !== normalizeRoomCode(state.code)){
        liveNotify.roomCode = normalizeRoomCode(state.code);
        liveNotify.playersReady = true;
        liveNotify.players = nextPlayers || {};
        return;
      }
      const prev = liveNotify.players || {};
      const curr = nextPlayers || {};
      Object.keys(curr).forEach((id)=>{
        if(prev[id]) return;
        const p = curr[id] || {};
        const name = String(p.name || "Jogador");
        queueRoomNotification("Nova inscrição", `${name} entrou na lista da sala ${normalizeRoomCode(state.code)}.`);
      });
      liveNotify.players = curr;
    }

    function maybeNotifyAttendanceSnapshot(nextAttendance){
      if(!state.code) {
        liveNotify.attendance = nextAttendance || {};
        liveNotify.attendanceReady = true;
        return;
      }
      if(!liveNotify.attendanceReady || normalizeRoomCode(liveNotify.roomCode) !== normalizeRoomCode(state.code)){
        liveNotify.roomCode = normalizeRoomCode(state.code);
        liveNotify.attendanceReady = true;
        liveNotify.attendance = nextAttendance || {};
        return;
      }
      const prev = liveNotify.attendance || {};
      const curr = nextAttendance || {};
      const ids = new Set([...Object.keys(prev), ...Object.keys(curr)]);
      ids.forEach((id)=>{
        const oldRow = prev[id] || null;
        const newRow = curr[id] || null;
        if(!newRow) return;
        const name = playerNameById(id);
        const wasKnownPlayer = !!((liveNotify.players || {})[id]);
        if(oldRow && !oldRow.present && !!newRow.present){
          queueRoomNotification("Presença confirmada", `${name} marcou presença na sala ${normalizeRoomCode(state.code)}.`);
        }
        if(oldRow && oldRow.present && !newRow.present){
          queueRoomNotification("Presença removida", `${name} marcou ausência na sala ${normalizeRoomCode(state.code)}.`);
        }
        if(oldRow && oldRow.team !== newRow.team && (newRow.team === 1 || newRow.team === 2)){
          const teamLabel = newRow.team === 1 ? (state.team1Name || "Time 1") : (state.team2Name || "Time 2");
          queueRoomNotification("Time escolhido", `${name} escolheu ${teamLabel}.`);
        }
        if(!oldRow && !!newRow.present && wasKnownPlayer){
          queueRoomNotification("Presença confirmada", `${name} marcou presença na sala ${normalizeRoomCode(state.code)}.`);
        }
      });
      liveNotify.attendance = curr;
    }

    function canCreateRooms(){
      return session.admin || session.developer;
    }

    function setAccessMode(mode){
      const normalized = ["player","admin","developer"].includes(String(mode)) ? String(mode) : "player";
      session.role = normalized;
      session.developer = normalized === "developer";
      session.admin = normalized === "admin" || normalized === "developer";
      if(normalized !== "player") session.playerId = "";
      if(normalized === "player") session.adminPassDraft = "";
      persistSession();
      if(session.developer) loadDeveloperRooms(true);
      render();
    }

    function accessBadgeHtml(){
      const mode = accessMode();
      if(mode === "developer") return `<span class="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800">Acesso Desenvolvedor</span>`;
      if(mode === "admin") return `<span class="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-800">Acesso Admin</span>`;
      return `<span class="text-xs px-2 py-1 rounded-full bg-sky-100 text-sky-800">Acesso Jogador</span>`;
    }

    function normalizeRoomCode(value){
      return String(value || "").trim().toUpperCase();
    }

    function isProtectedRoom(code){
      return false;
    }

    function guardProtectedRoomMutation(code, actionText = "alterar esta sala") {
      return false;
    }

    function loadGroups(){
      const raw = load(LS_GROUPS, []);
      return Array.isArray(raw) ? raw : [];
    }

    function saveGroups(groups){
      save(LS_GROUPS, Array.isArray(groups) ? groups : []);
    }

    function getSavedGroups(){
      return loadGroups().sort((a,b)=>(Number(b.updatedAtMs||0)-Number(a.updatedAtMs||0)));
    }

    function roomGroupsArray(){
      const obj = state.roomGroups || {};
      return Object.values(obj).sort((a,b)=>(Number(b.updatedAtMs||0)-Number(a.updatedAtMs||0)));
    }

    function activeInternalGroupLabel(){
      return String(state.activeInternalGroupName || '').trim();
    }
    function normalizePlan(value){
      const v = String(value || "free").trim().toLowerCase();
      return ["free","basico","pro"].includes(v) ? v : "free";
    }

    function currentPlan(){
      return normalizePlan(state.plan || "free");
    }

    function planLabel(plan = currentPlan()){
      return PLAN_LABELS[normalizePlan(plan)] || "Free";
    }

    function isPlanAtLeast(plan){
      return PLAN_ORDER[currentPlan()] >= PLAN_ORDER[normalizePlan(plan)];
    }

    function maxGroupsForPlan(plan = currentPlan()){
      const p = normalizePlan(plan);
      if(p === "pro") return 999;
      if(p === "basico") return 3;
      return 1;
    }

    function getSavedGroupsForCurrentPlan(){
      const groups = getSavedGroups();
      const limit = maxGroupsForPlan();
      return limit >= 999 ? groups : groups.slice(0, limit);
    }

    function upgradeWhatsLink(feature){
      const msg = encodeURIComponent(`Olá! Quero liberar ${feature || "os recursos premium"} no Manchette Volleyball.`);
      return `https://wa.me/${SUPPORT_WHATSAPP}?text=${msg}`;
    }

    function featureAllowed(feature){
      if(session.developer) return true;
      const plan = currentPlan();
      if(feature === "multiGroups") return maxGroupsForPlan(plan) > 1;
      if(feature === "history") return plan === "basico" || plan === "pro";
      if(feature === "ranking") return plan === "basico" || plan === "pro";
      if(feature === "stats") return plan === "basico" || plan === "pro";
      if(feature === "reports") return plan === "pro";
      if(feature === "customization") return plan === "pro";
      return true;
    }

    function upgradeMessage(feature){
      const map = {
        multiGroups: "Grupos",
        history: "Histórico de partidas",
        ranking: "Ranking",
        stats: "Estatísticas",
        reports: "Relatórios",
        customization: "Personalização"
      };
      return `${map[feature] || "Este recurso"} está disponível em planos superiores.`;
    }

    function premiumLockCard(title, text, feature){
      return `
        <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div class="text-sm font-bold text-amber-900">🔒 ${escapeHtml(title)}</div>
              <div class="mt-1 text-sm text-amber-800">${escapeHtml(text)}</div>
            </div>
            <a href="${upgradeWhatsLink(feature)}" target="_blank" rel="noopener noreferrer" class="px-3 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 font-semibold text-sm text-center">
              Fazer upgrade
            </a>
          </div>
        </div>
      `;
    }


    function upsertSavedGroup(profile){
      const code = normalizeRoomCode(profile && profile.code);
      if(!code) return;
      const groups = loadGroups().filter(g => normalizeRoomCode(g.code) !== code);
      groups.push({
        code,
        roomName: String((profile && profile.roomName) || "").trim(),
        roomSubtitle: String((profile && profile.roomSubtitle) || "").trim(),
        team1Name: String((profile && profile.team1Name) || "Time 1").trim() || "Time 1",
        team2Name: String((profile && profile.team2Name) || "Time 2").trim() || "Time 2",
        themeColor: String((profile && profile.themeColor) || "#2563eb").trim() || "#2563eb",
        updatedAtMs: Number((profile && profile.updatedAtMs) || nowMs())
      });
      saveGroups(groups);
    }

    function removeSavedGroup(code){
      const c = normalizeRoomCode(code);
      saveGroups(loadGroups().filter(g => normalizeRoomCode(g.code) !== c));
      render();
    }

    function rememberCurrentGroup(silent=false){
      const code = normalizeRoomCode(state.code);
      if(!code) return false;
      upsertSavedGroup({
        code,
        roomName: state.roomName || "",
        roomSubtitle: state.roomSubtitle || "",
        team1Name: state.team1Name || "Time 1",
        team2Name: state.team2Name || "Time 2",
        themeColor: state.themeColor || "#2563eb",
        updatedAtMs: nowMs()
      });
      if(!silent) setInfo("Sala salva para acesso rápido.");
      else render();
      return true;
    }

    async function saveCurrentInternalGroup(){
      const code = normalizeRoomCode(state.code);
      if(!code) return false;
      if(!session.admin && !session.developer){
        setInfo('Somente Admin ou Desenvolvedor podem salvar grupos internos.');
        return false;
      }
      const existing = roomGroupsArray();
      const limit = maxGroupsForPlan();
      const suggested = activeInternalGroupLabel() || state.roomSubtitle || '';
      const name = String(prompt('Nome do grupo', suggested) || '').trim();
      if(!name) return false;
      const id = genCode(8);
      if(existing.length >= limit){
        setInfo(`Seu plano ${planLabel()} permite até ${limit} grupo(s) dentro desta sala. Faça upgrade para liberar mais.`);
        return false;
      }
      const roomGroups = Object.assign({}, state.roomGroups || {});
      roomGroups[id] = {
        id,
        name,
        roomName: String(state.roomName || '').trim(),
        roomSubtitle: String(state.roomSubtitle || '').trim(),
        team1Name: String(state.team1Name || 'Time 1').trim() || 'Time 1',
        team2Name: String(state.team2Name || 'Time 2').trim() || 'Time 2',
        themeColor: String(state.themeColor || '#2563eb').trim() || '#2563eb',
        updatedAtMs: nowMs(),
        updatedAt: nowIso()
      };
      try{
        await metaUpdate(code, {
          roomGroups,
          activeInternalGroupId: id,
          activeInternalGroupName: name
        });
        setInfo(`Grupo "${name}" criado nesta sala.`);
        return true;
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || 'Erro ao salvar grupo interno.'));
        return false;
      }
    }

    async function updateCurrentInternalGroup(){
      const code = normalizeRoomCode(state.code);
      const groupId = String(state.activeInternalGroupId || '').trim();
      if(!code || !groupId) return false;
      if(!session.admin && !session.developer){
        setInfo('Somente Admin ou Desenvolvedor podem atualizar grupos.');
        return false;
      }
      const roomGroups = Object.assign({}, state.roomGroups || {});
      if(!roomGroups[groupId]){
        setInfo('Abra um grupo salvo antes de atualizar.');
        return false;
      }
      const currentName = String(roomGroups[groupId].name || state.activeInternalGroupName || '').trim() || 'Grupo';
      roomGroups[groupId] = Object.assign({}, roomGroups[groupId], {
        name: currentName,
        roomName: String(state.roomName || '').trim(),
        roomSubtitle: String(state.roomSubtitle || '').trim(),
        team1Name: String(state.team1Name || 'Time 1').trim() || 'Time 1',
        team2Name: String(state.team2Name || 'Time 2').trim() || 'Time 2',
        themeColor: String(state.themeColor || '#2563eb').trim() || '#2563eb',
        updatedAtMs: nowMs(),
        updatedAt: nowIso()
      });
      try{
        await metaUpdate(code, {
          roomGroups,
          activeInternalGroupId: groupId,
          activeInternalGroupName: currentName
        });
        setInfo(`Grupo "${currentName}" atualizado.`);
        return true;
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || 'Erro ao atualizar grupo.'));
        return false;
      }
    }

    async function openInternalGroup(groupId){
      const code = normalizeRoomCode(state.code);
      const id = String(groupId || '').trim();
      const group = state.roomGroups && state.roomGroups[id];
      if(!code || !group) return false;
      try{
        await metaUpdate(code, {
          roomName: String(group.roomName || state.roomName || '').trim() || 'Manchette Volleyball',
          roomSubtitle: String(group.roomSubtitle || '').trim(),
          team1Name: String(group.team1Name || 'Time 1').trim() || 'Time 1',
          team2Name: String(group.team2Name || 'Time 2').trim() || 'Time 2',
          themeColor: String(group.themeColor || '#2563eb').trim() || '#2563eb',
          activeInternalGroupId: id,
          activeInternalGroupName: String(group.name || '').trim()
        });
        setInfo(`Grupo interno "${group.name || id}" carregado.`);
        return true;
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || 'Erro ao abrir grupo interno.'));
        return false;
      }
    }

    async function deleteInternalGroup(groupId){
      const code = normalizeRoomCode(state.code);
      const id = String(groupId || '').trim();
      const group = state.roomGroups && state.roomGroups[id];
      if(!code || !group) return false;
      if(!session.admin && !session.developer){
        setInfo('Somente Admin ou Desenvolvedor podem excluir grupos internos.');
        return false;
      }
      if(!confirm(`Excluir o grupo interno "${group.name || id}" desta sala?`)) return false;
      const roomGroups = Object.assign({}, state.roomGroups || {});
      delete roomGroups[id];
      const patch = { roomGroups };
      if(String(state.activeInternalGroupId || '') === id){
        patch.activeInternalGroupId = '';
        patch.activeInternalGroupName = '';
      }
      try{
        await metaUpdate(code, patch);
        setInfo(`Grupo interno "${group.name || id}" removido.`);
        return true;
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || 'Erro ao excluir grupo interno.'));
        return false;
      }
    }

    function buildRoomUrl(code){
      try{
        const url = new URL(location.href);
        url.search = "";
        if(code) url.searchParams.set("sala", normalizeRoomCode(code));
        return url.toString();
      }catch{
        return "";
      }
    }

    function syncRoomUrl(code){
      try{
        const url = new URL(location.href);
        if(code) url.searchParams.set("sala", normalizeRoomCode(code));
        else url.searchParams.delete("sala");
        history.replaceState({}, "", url.toString());
      }catch{}
    }

    function roomCodeFromUrl(){
      try{
        const url = new URL(location.href);
        return normalizeRoomCode(url.searchParams.get("sala") || url.searchParams.get("code"));
      }catch{
        return "";
      }
    }

    function setInfo(msg){ state.info = msg ? String(msg) : ""; render(); }
    function setSyncError(msg){ state.syncError = msg ? String(msg) : ""; render(); }
    function fmtBR(msOrIso){
      try{
        const d = typeof msOrIso === "number" ? new Date(msOrIso) : new Date(msOrIso || Date.now());
        return d.toLocaleString("pt-BR");
      }catch{ return ""; }
    }

    function toDateInput(value){
      if(!value) return "";
      try{
        if(/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
        const d = new Date(value);
        if(Number.isNaN(d.getTime())) return "";
        return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
      }catch{ return ""; }
    }

    function datePlusDays(days = 0){
      const d = new Date();
      d.setHours(0,0,0,0);
      d.setDate(d.getDate() + Number(days || 0));
      return new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    }

    function fmtDatePt(value){
      const v = toDateInput(value);
      if(!v) return "—";
      try{
        const [y,m,d] = v.split("-").map(Number);
        return new Date(y, (m||1)-1, d||1).toLocaleDateString("pt-BR");
      }catch{ return v; }
    }

    function normalizeCommercialStatus(value){
      const v = String(value || "ativo").trim().toLowerCase();
      return ["demo","teste","ativo","inativo","inadimplente","bloqueado"].includes(v) ? v : "ativo";
    }

    function commercialStatusLabel(value){
      return COMMERCIAL_LABELS[normalizeCommercialStatus(value)] || "Ativo";
    }

    function commercialStatusClass(value){
      const v = normalizeCommercialStatus(value);
      if(v === "ativo") return "bg-green-100 text-green-700";
      if(v === "teste") return "bg-sky-100 text-sky-700";
      if(v === "demo") return "bg-violet-100 text-violet-700";
      if(v === "inadimplente") return "bg-red-100 text-red-700";
      if(v === "bloqueado") return "bg-red-100 text-red-700";
      return "bg-gray-200 text-gray-700";
    }

    function roomRestrictionMessage(meta = state, mode = accessMode()){
      if(mode === "developer") return "";
      const status = normalizeCommercialStatus(meta.commercialStatus || "ativo");
      if(status === "inadimplente") return "Esta sala está bloqueada por inadimplência. Fale com o Desenvolvedor para regularizar o acesso.";
      if(status === "bloqueado") return "Esta sala está temporariamente bloqueada pelo Desenvolvedor.";
      if(status === "inativo") return "Esta sala está inativa no momento.";
      if(status === "teste"){
        const trial = toDateInput(meta.trialEndsAt || "");
        if(trial){
          const endMs = new Date(`${trial}T23:59:59`).getTime();
          if(Date.now() > endMs) return `O período de teste desta sala expirou em ${fmtDatePt(trial)}.`;
        }
      }
      if(status === "ativo" && meta.paidUntil){
        const paidUntil = toDateInput(meta.paidUntil || "");
        if(paidUntil){
          const endMs = new Date(`${paidUntil}T23:59:59`).getTime();
          if(Date.now() > endMs) return `A mensalidade desta sala venceu em ${fmtDatePt(paidUntil)}. Fale com o Desenvolvedor para renovar o acesso.`;
        }
      }
      return "";
    }

    function roomMetaSummary(meta = state){
      const parts = [];
      if(meta.ownerName) parts.push(`Cliente: ${meta.ownerName}`);
      if(meta.ownerWhatsApp) parts.push(`WhatsApp: ${meta.ownerWhatsApp}`);
      if(meta.trialEndsAt && normalizeCommercialStatus(meta.commercialStatus) === "teste") parts.push(`Teste até ${fmtDatePt(meta.trialEndsAt)}`);
      if(meta.paidUntil && normalizeCommercialStatus(meta.commercialStatus) === "ativo") parts.push(`Vence em ${fmtDatePt(meta.paidUntil)}`);
      return parts.join(" · ");
    }

    function roomIsOrphan(meta = {}){
      const noOwner = !String(meta.ownerName || '').trim() && !String(meta.ownerWhatsApp || '').trim();
      const noSubtitle = !String(meta.roomSubtitle || '').trim();
      const noLocation = !String(meta.matchLocation || '').trim();
      const defaultName = !String(meta.roomName || '').trim() || String(meta.roomName || '').trim() === `Sala ${String(meta.code || '').toUpperCase()}`;
      const noCommercialDates = !String(meta.trialEndsAt || '').trim() && !String(meta.paidUntil || '').trim();
      const noRecentRound = !Number(meta.activeRoundAtMs || 0);
      return noOwner && noSubtitle && noLocation && defaultName && noCommercialDates && noRecentRound;
    }

    function parseDateInput(value){
      const v = toDateInput(value);
      if(!v) return null;
      try{
        const [y,m,d] = v.split("-").map(Number);
        return new Date(y, (m||1)-1, d||1, 0, 0, 0, 0);
      }catch{ return null; }
    }

    function daysUntilDate(value){
      const target = parseDateInput(value);
      if(!target) return null;
      const today = parseDateInput(datePlusDays(0));
      if(!today) return null;
      const diff = target.getTime() - today.getTime();
      return Math.floor(diff / 86400000);
    }

    function dateAddDays(baseValue, days = 0){
      const base = parseDateInput(baseValue) || parseDateInput(datePlusDays(0));
      if(!base) return datePlusDays(days);
      base.setDate(base.getDate() + Number(days || 0));
      return new Date(base.getTime() - base.getTimezoneOffset()*60000).toISOString().slice(0,10);
    }

    function dateAddMonths(baseValue, months = 1){
      const base = parseDateInput(baseValue) || parseDateInput(datePlusDays(0));
      if(!base) return datePlusDays(30 * Number(months || 1));
      base.setMonth(base.getMonth() + Number(months || 1));
      return new Date(base.getTime() - base.getTimezoneOffset()*60000).toISOString().slice(0,10);
    }

    function commercialAlertInfo(meta = state){
      const status = normalizeCommercialStatus(meta.commercialStatus || "ativo");
      if(status === "teste"){
        const days = daysUntilDate(meta.trialEndsAt || "");
        if(days == null) return null;
        if(days < 0) return { level:"danger", kind:"trial-expired", text:`Teste expirado em ${fmtDatePt(meta.trialEndsAt)}.` };
        if(days === 0) return { level:"warning", kind:"trial-today", text:`O teste desta sala encerra hoje (${fmtDatePt(meta.trialEndsAt)}).` };
        if(days <= 2) return { level:"warning", kind:"trial-soon", text:`O teste desta sala vence em ${days} dia(s) (${fmtDatePt(meta.trialEndsAt)}).` };
        return null;
      }
      if(status === "ativo" && meta.paidUntil){
        const days = daysUntilDate(meta.paidUntil);
        if(days == null) return null;
        if(days < 0) return { level:"danger", kind:"paid-expired", text:`A mensalidade venceu em ${fmtDatePt(meta.paidUntil)}.` };
        if(days === 0) return { level:"warning", kind:"paid-today", text:`A mensalidade desta sala vence hoje (${fmtDatePt(meta.paidUntil)}).` };
        if(days <= 5) return { level:"warning", kind:"paid-soon", text:`A mensalidade desta sala vence em ${days} dia(s) (${fmtDatePt(meta.paidUntil)}).` };
        return null;
      }
      if(status === "inadimplente") return { level:"danger", kind:"inadimplente", text:"Sala marcada como inadimplente. O acesso fica bloqueado até regularização." };
      if(status === "bloqueado") return { level:"danger", kind:"bloqueado", text:"Sala bloqueada pelo Desenvolvedor." };
      if(status === "inativo") return { level:"warning", kind:"inativo", text:"Sala inativa no momento." };
      return null;
    }

    function commercialAlertBoxHtml(meta = state){
      const alert = commercialAlertInfo(meta);
      if(!alert) return "";
      const styles = alert.level === "danger"
        ? "bg-red-50 border-red-200 text-red-800"
        : "bg-amber-50 border-amber-200 text-amber-900";
      const devActions = session.developer ? `
        <div class="mt-3 flex flex-wrap gap-2">
          ${alert.kind && alert.kind.startsWith("trial") ? `<button id="btnCurrentExtendTrial" class="px-3 py-2 rounded-lg border border-sky-300 bg-white hover:bg-sky-50 text-sm font-semibold text-sky-800">Prorrogar teste +7d</button><button id="btnCurrentConvertBasic" class="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold">Converter p/ Básico</button>` : ``}
          ${alert.kind && (alert.kind.startsWith("paid") || alert.kind === "inadimplente") ? `<button id="btnCurrentRenewMonth" class="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold">Renovar +1 mês</button>` : ``}
        </div>
      ` : "";
      return `<div class="mt-4 p-3 rounded-xl border ${styles}"><div class="font-semibold">Aviso comercial</div><div class="text-sm mt-1">${escapeHtml(alert.text)}</div>${devActions}</div>`;
    }

    async function maybeAutoApplyCommercialLifecycle(code, meta = {}){
      const c = normalizeRoomCode(code);
      if(!c || !db) return;
      try{
        const status = normalizeCommercialStatus(meta.commercialStatus || "ativo");
        const patch = {};
        if(status === "teste"){
          const days = daysUntilDate(meta.trialEndsAt || "");
          if(days != null && days < 0){
            patch.commercialStatus = "inativo";
            patch.open = false;
          }
        }
        if(status === "ativo" && meta.paidUntil){
          const days = daysUntilDate(meta.paidUntil);
          if(days != null && days < 0){
            patch.commercialStatus = "inadimplente";
            patch.open = false;
          }
        }
        if(!Object.keys(patch).length) return;
        await metaUpdate(c, patch);
      }catch{}
    }


function buildScheduleMs(dateStr, timeStr){
  if(!dateStr || !timeStr) return 0;
  try{
    const [y,m,d] = String(dateStr).split("-").map(Number);
    const [hh,mm] = String(timeStr).split(":").map(Number);
    const dt = new Date(y||0, (m||1)-1, d||1, hh||0, mm||0, 0, 0);
    const ms = dt.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }catch{ return 0; }
}

function fmtCountdown(diffMs){
  const diff = Number(diffMs||0);
  if(!Number.isFinite(diff) || diff <= 0) return "agora";
  const totalMin = Math.ceil(diff / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts = [];
  if(d) parts.push(`${d}d`);
  if(h) parts.push(`${h}h`);
  if(m || !parts.length) parts.push(`${m}min`);
  return parts.join(" ");
}

function getMatchScheduleMeta(){
  const matchMs = buildScheduleMs(state.matchDate, state.matchTime);
  if(!matchMs) return { hasSchedule:false, hasClose:false, closeBeforeMin: Math.max(0, Number(state.closeBeforeMin||15)) };
  const closeBeforeMin = Math.max(0, Number(state.closeBeforeMin||15));
  const closeMs = matchMs - (closeBeforeMin * 60000);
  return {
    hasSchedule: true,
    hasClose: true,
    matchMs,
    closeMs,
    closeBeforeMin,
    matchLabel: fmtBR(matchMs),
    closeLabel: fmtBR(closeMs),
    countdownLabel: fmtCountdown(matchMs - nowMs())
  };
}

async function maybeAutoCloseSchedule(){
  try{
    const code = String(state.code||"").toUpperCase();
    if(!code || !state.open) return;
    const meta = getMatchScheduleMeta();
    if(!meta.hasSchedule) return;
    if(nowMs() >= meta.closeMs){
      await metaUpdate(code, { open:false });
    }
  }catch{}
}

async function saveMatchSchedule(){
  if(!session.admin) return alert("Somente admin.");
  const code = String(state.code||"").toUpperCase();
  if(!code) return alert("Entre em uma sala primeiro (código da partida).");
  const matchDate = (document.getElementById("matchDate")?.value || "").trim();
  const matchTime = (document.getElementById("matchTime")?.value || "").trim();
  const matchLocation = (document.getElementById("matchLocation")?.value || "").trim();
  const closeBeforeMin = Math.max(0, Number(document.getElementById("closeBeforeMin")?.value || 15));
  if(!matchDate || !matchTime) return alert("Informe a data e a hora da partida.");
  await metaUpdate(code, { matchDate, matchTime, matchLocation, closeBeforeMin });
  state.matchDate = matchDate;
  state.matchTime = matchTime;
  state.matchLocation = matchLocation;
  state.closeBeforeMin = closeBeforeMin;
  setInfo("Horário da partida salvo.");
  maybeAutoCloseSchedule();
  render();
}

async function clearMatchSchedule(){
  if(!session.admin) return alert("Somente admin.");
  const code = String(state.code||"").toUpperCase();
  if(!code) return alert("Entre em uma sala primeiro (código da partida).");
  await metaUpdate(code, { matchDate: "", matchTime: "", matchLocation: "", closeBeforeMin: 15 });
  state.matchDate = "";
  state.matchTime = "";
  state.matchLocation = "";
  state.closeBeforeMin = 15;
  setInfo("Horário da partida limpo.");
  render();
}

    function me(){
      if(!session.playerId) return null;
      return state.players && state.players[session.playerId] ? state.players[session.playerId] : null;
    }

async function ensureMeLoaded(){
  const m = me();
  if(m) return m;
  const code = state.code;
  const pid = session.playerId;
  if(!code || !pid || !db) return null;
  try{
    const snap = await playersCol(code).doc(pid).get();
    if(snap.exists){
      state.players[pid] = snap.data();
      render();
      return state.players[pid];
    }
  }catch(e){
    // ignore
  }
  return null;
}

function autoRestorePlayerSessionFromDevice(forceInfo = false){
  if(accessMode() !== "player") return null;
  if(session.playerId || session.prevPlayerId) return null;
  const found = findRegisteredPlayerForThisDevice(state.players || {});
  if(found && found.id){
    session.playerId = found.id;
    persistSession();
    if(forceInfo) state.info = `Acesso recuperado para <b>${escapeHtml(found.name || "Jogador")}</b>.`;
    return found;
  }
  return null;
}

    function isPresent(playerId){
      const a = state.attendance && state.attendance[playerId];
      return !!(a && a.present === true);
    }

    function teamOf(playerId){
      const a = state.attendance && state.attendance[playerId];
      return a && (a.team === 1 || a.team === 2) ? a.team : null;
    }

    function attendanceMirrorFromPlayer(player, roundId = state.activeRoundId){
      const p = player || {};
      const rid = String(roundId || "");
      if(!rid) return null;
      if(String(p.presenceRoundId || "") !== rid) return null;
      return {
        present: !!p.present,
        team: (p.team === 1 || p.team === 2) ? p.team : null,
        checkedInAtMs: Number(p.checkedInAtMs || 0) || null,
        updatedAt: p.attendanceUpdatedAt || p.updatedAt || nowIso()
      };
    }

    function rebuildAttendanceFromPlayers(base = {}){
      const rid = String(state.activeRoundId || "");
      if(!rid) return base || {};
      const merged = Object.assign({}, base || {});
      for(const p of Object.values(state.players || {})){
        if(!p || !p.id) continue;
        if(merged[p.id] && typeof merged[p.id].present === "boolean") continue;
        const mirror = attendanceMirrorFromPlayer(p, rid);
        if(mirror) merged[p.id] = mirror;
      }
      return merged;
    }

    function hasSelfRatedCurrentRound(player){
      const p = player || me();
      if(!p) return false;
      return String(p.selfRatedRoundId || "") === String(state.activeRoundId || "");
    }

    async function markSelfRatedNow(player, scoreOverride){
      const p = player || me();
      if(!p) throw new Error("Jogador não encontrado.");
      if(!state.code || !state.activeRoundId) throw new Error("Rodada não carregou.");
      const nextScore = clamp(Number(scoreOverride != null ? scoreOverride : p.baseNote || RATE_BASELINE), MIN_NOTA, MAX_NOTA);
      await setPlayer(state.code, {
        id: p.id,
        baseNote: nextScore,
        selfRatedRoundId: String(state.activeRoundId || ""),
        selfRatedAtMs: nowMs(),
        updatedAt: nowIso()
      });
      if(state.players && state.players[p.id]){
        state.players[p.id] = Object.assign({}, state.players[p.id], {
          baseNote: nextScore,
          selfRatedRoundId: String(state.activeRoundId || ""),
          selfRatedAtMs: nowMs(),
          updatedAt: nowIso()
        });
      }
      return nextScore;
    }

    // ===============================
    // Indicadores, ranking e relatórios
    // ===============================
    function snapshotsArray(){
      return Object.values(state.snapshots || {}).sort((a,b)=>(Number(b.createdAtMs||0)-Number(a.createdAtMs||0)));
    }

    function playerSnapshotAppearances(playerId){
      return snapshotsArray().reduce((acc, snap)=>{
        const t1 = Array.isArray(snap.team1) ? snap.team1 : [];
        const t2 = Array.isArray(snap.team2) ? snap.team2 : [];
        const found = t1.some(p=>p.id===playerId) || t2.some(p=>p.id===playerId);
        return acc + (found ? 1 : 0);
      }, 0);
    }

    function topPosition(players){
      const count = {};
      (players || []).forEach(p=>{
        const pos = String((p && p.position) || "Coringa");
        count[pos] = (count[pos] || 0) + 1;
      });
      return Object.entries(count).sort((a,b)=>b[1]-a[1])[0]?.[0] || "—";
    }

    function buildRankingData(players, byTarget){
      return (players || []).map(p => ({
        id: p.id,
        name: p.name,
        position: p.position || "Coringa",
        note: Number(computedNote(p, byTarget) || 0),
        present: isPresent(p.id),
        appearances: playerSnapshotAppearances(p.id)
      })).sort((a,b)=>(b.note - a.note) || (b.appearances - a.appearances) || String(a.name).localeCompare(String(b.name), "pt-BR"));
    }

    function computeDashboardStats(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget){
      const ranking = buildRankingData(players, byTarget);
      const notes = ranking.map(r=>r.note);
      const totalRatings = Object.keys(state.ratings || {}).length;
      const historyCount = snapshotsArray().length;
      const avgGeneral = notes.length ? avg(notes).toFixed(2) : "0.00";
      const best = ranking[0] || null;
      const diff = Math.abs(Number(teamAvg(team1Players, byTarget) || 0) - Number(teamAvg(team2Players, byTarget) || 0));
      return {
        totalPlayers: players.length,
        presentPlayers: presentPlayers.length,
        waitingPlayers: waitingPlayers.length,
        assignedPlayers: team1Players.length + team2Players.length,
        ratingsCount: totalRatings,
        historyCount,
        avgGeneral,
        best,
        topPos: topPosition(players),
        balanceDiff: diff.toFixed(2)
      };
    }

    function buildManagementReport(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget){
      const stats = computeDashboardStats(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget);
      const ranking = buildRankingData(players, byTarget).slice(0, 8);
      const history = snapshotsArray().slice(0, 5);

      const lines = [
        `RELATÓRIO · ${state.roomName || "Manchette Volleyball"}`,
        state.code ? `Sala: ${String(state.code).toUpperCase()}` : "",
        state.roomSubtitle ? `Grupo: ${state.roomSubtitle}` : "",
        `Gerado em: ${fmtBR(Date.now())}`,
        "",
        "RESUMO",
        `Jogadores cadastrados: ${stats.totalPlayers}`,
        `Presentes agora: ${stats.presentPlayers}`,
        `Aguardando escolha: ${stats.waitingPlayers}`,
        `Distribuídos nos times: ${stats.assignedPlayers}`,
        `Avaliações ocultas registradas: ${stats.ratingsCount}`,
        `Históricos salvos: ${stats.historyCount}`,
        `Média geral atual: ${stats.avgGeneral}`,
        `Posição mais comum: ${stats.topPos}`,
        `Diferença atual entre os times: ${stats.balanceDiff}`,
        "",
        "RANKING ATUAL"
      ];

      ranking.forEach((r, idx)=>{
        lines.push(`${idx+1}. ${r.name} · ${r.position} · nota ${r.note.toFixed(1)} · históricos ${r.appearances}`);
      });

      if(history.length){
        lines.push("", "ÚLTIMAS PARTIDAS SALVAS");
        history.forEach((snap, idx)=>{
          const total = (Array.isArray(snap.team1) ? snap.team1.length : 0) + (Array.isArray(snap.team2) ? snap.team2.length : 0);
          lines.push(`${idx+1}. ${fmtBR(snap.createdAtMs || snap.createdAt)} · ${total} jogadores · médias ${Number(snap.avg1||0).toFixed(2)} x ${Number(snap.avg2||0).toFixed(2)}`);
        });
      }

      return lines.filter(Boolean).join("\n");
    }

    async function copyManagementReport(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget){
      await copyToClipboard(buildManagementReport(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget));
      setInfo("Relatório copiado.");
    }

    function whatsManagementReport(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget){
      openWhatsAppWithText(buildManagementReport(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget));
    }

    async function downloadManagementReport(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget){
      const text = buildManagementReport(players, presentPlayers, waitingPlayers, team1Players, team2Players, byTarget);
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `relatorio-${normalizeRoomCode(state.code || "manchette")}-${new Date().toISOString().slice(0,10)}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url), 1500);
      setInfo("Relatório baixado.");
    }

    async function savePersonalization(){
      if(!session.admin) return alert("Somente admin.");
      const code = normalizeRoomCode(state.code);
      if(!code) return alert("Entre em uma sala primeiro.");
      try{
        const roomName = String(document.getElementById("roomNameInput")?.value || "").trim() || "Manchette Volleyball";
        const roomSubtitle = String(document.getElementById("roomSubtitleInput")?.value || "").trim();
        const team1Name = String(document.getElementById("team1NameInput")?.value || "").trim() || "Time 1";
        const team2Name = String(document.getElementById("team2NameInput")?.value || "").trim() || "Time 2";
        const themeColor = String(document.getElementById("themeColorInput")?.value || "").trim() || "#2563eb";

        await metaUpdate(code, { roomName, roomSubtitle, team1Name, team2Name, themeColor });
        state.roomName = roomName;
        state.roomSubtitle = roomSubtitle;
        state.team1Name = team1Name;
        state.team2Name = team2Name;
        state.themeColor = themeColor;
        rememberCurrentGroup(true);
        setInfo("Personalização salva.");
      }catch(e){
        setSyncError(e && e.message ? e.message : e);
      }
    }

    async function saveRoomPlan(){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      const code = normalizeRoomCode(state.code);
      if(!code) return alert("Entre em uma sala primeiro.");
      try{
        const selected = normalizePlan(String(document.getElementById("roomPlanSelect")?.value || state.plan || "free"));
        await metaUpdate(code, { plan: selected });
        state.plan = selected;
        rememberCurrentGroup(true);
        render();
        setInfo(`Plano da sala salvo como ${planLabel(selected)}.`);
      }catch(e){
        const msg = e && e.message ? e.message : String(e || "Erro ao salvar plano.");
        setSyncError(msg);
        if(/Missing or insufficient permissions/i.test(msg)){
          alert("O Firestore bloqueou a gravação do plano. Ajuste as Rules do Firebase para permitir update na coleção matches para admins autenticados ou para o seu modo atual de uso.");
        }
      }
    }

    // ===============================
    // Nota calculada (interno)
    // ===============================
    function byTargetScores(ratings){
      const map = {};
      for(const k in (ratings||{})){
        const r = ratings[k];
        const tid = r.targetId;
        if(!map[tid]) map[tid]=[];
        map[tid].push(Number(r.score)||RATE_BASELINE);
      }
      return map;
    }

    function computedNote(p, byTarget){
      const base = clamp(Number(p.baseNote)||RATE_BASELINE, MIN_NOTA, MAX_NOTA);
      const rec = byTarget[p.id] || [];
      const med = rec.length ? median(rec) : RATE_BASELINE;

      // Ajuste leve: notas dos outros corrigem a autoavaliação aos poucos
      const adj = (med - RATE_BASELINE) * 0.25;
      return clamp(base + adj, MIN_NOTA, MAX_NOTA);
    }

    function teamAvg(players, byTarget){
      return avg(players.map(p => computedNote(p, byTarget)));
    }

    function balanceMessage(t1, t2, byTarget){
      const picked = (t1.length + t2.length);
      if(t1.length===0 && t2.length===0) return { ok:true, text:"" };
      if(picked < MIN_ESCOLHAS_PARA_ALERTA) return { ok:true, text:"" };

      const a1 = teamAvg(t1, byTarget);
      const a2 = teamAvg(t2, byTarget);
      const diff = Math.abs(a1-a2);

      if(diff>=1.60) return { ok:false, text:`⚠️ Desequilíbrio alto (diferença ~${diff.toFixed(2)})` };
      if(diff>=1.00) return { ok:true,  text:`Atenção: pode desequilibrar (~${diff.toFixed(2)})` };
      return { ok:true, text:`✓ Times equilibrados (~${diff.toFixed(2)})` };
    }

    // ===============================
    // Firestore paths
    // ===============================
    function matchDoc(code){ return db.collection("matches").doc(String(code||"").toUpperCase()); }
    function playersCol(code){ return matchDoc(code).collection("players"); }
    function ratingsCol(code){ return matchDoc(code).collection("ratings"); }
    function snapshotsCol(code){ return matchDoc(code).collection("snapshots"); }
    function roundsCol(code){ return matchDoc(code).collection("rounds"); }
    function roundDoc(code, roundId){ return roundsCol(code).doc(String(roundId)); }
    function attendanceCol(code, roundId){ return roundDoc(code, roundId).collection("attendance"); }

    async function ensureRoom(code, patch = {}){
      const c = String(code||"").toUpperCase();
      await matchDoc(c).set(Object.assign({
        code:c,
        open:true,
        plan:"free",
        commercialStatus:"ativo",
        createdAt: nowIso(),
        updatedAt: nowIso()
      }, patch || {}), { merge:true });
      await ensureActiveRound(c);
    }

    function newRoundId(){
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth()+1).padStart(2,"0");
      const da = String(d.getDate()).padStart(2,"0");
      const hh = String(d.getHours()).padStart(2,"0");
      const mm = String(d.getMinutes()).padStart(2,"0");
      return `r${y}${m}${da}-${hh}${mm}-${Math.random().toString(36).slice(2,6)}`;
    }

    async function ensureActiveRound(code){
      const c = String(code||"").toUpperCase();
      const snap = await matchDoc(c).get();
      const d = snap.exists ? snap.data() : null;
      if(d && d.activeRoundId) return;

      const rid = newRoundId();
      const at = nowMs();
      await roundDoc(c, rid).set({ id: rid, createdAt: nowIso(), createdAtMs: at }, { merge:true });
      await matchDoc(c).set({ activeRoundId: rid, activeRoundAtMs: at }, { merge:true });
    }

    function detachRoom(){
      try{ unsub.meta && unsub.meta(); }catch{}
      try{ unsub.players && unsub.players(); }catch{}
      try{ unsub.attendance && unsub.attendance(); }catch{}
      try{ unsub.ratings && unsub.ratings(); }catch{}
      try{ unsub.snapshots && unsub.snapshots(); }catch{}
      unsub = { meta:null, players:null, attendance:null, ratings:null, snapshots:null };
      resetLiveNotify("");
    }

    function attachAttendanceListener(code, roundId){
      const c = String(code||"").toUpperCase();
      const rid = String(roundId||"");
      if(!rid) return;

      try{ unsub.attendance && unsub.attendance(); }catch{}
      unsub.attendance = attendanceCol(c, rid).onSnapshot((qs)=>{
        const obj = {};
        qs.forEach(doc=> obj[doc.id] = doc.data());
        maybeNotifyAttendanceSnapshot(obj);
        state.attendance = rebuildAttendanceFromPlayers(obj);
        render();
      }, (err)=> setSyncError(err && err.message ? err.message : err));
    }

    function attachRoom(code){
      const c = String(code||"").toUpperCase();
      detachRoom();
      resetLiveNotify(c);
      setSyncError("");

      unsub.meta = matchDoc(c).onSnapshot((snap)=>{
        const d = snap.exists ? snap.data() : null;
        if(d && typeof d.open === "boolean") state.open = d.open;

        state.matchDate = d && d.matchDate ? String(d.matchDate) : "";
        state.matchTime = d && d.matchTime ? String(d.matchTime) : "";
        state.matchLocation = d && d.matchLocation ? String(d.matchLocation) : "";
        state.closeBeforeMin = d && d.closeBeforeMin != null ? Math.max(0, Number(d.closeBeforeMin)) : 15;
        state.roomName = d && d.roomName ? String(d.roomName) : "";
        state.roomSubtitle = d && d.roomSubtitle ? String(d.roomSubtitle) : "";
        state.team1Name = d && d.team1Name ? String(d.team1Name) : "Time 1";
        state.team2Name = d && d.team2Name ? String(d.team2Name) : "Time 2";
        state.themeColor = d && d.themeColor ? String(d.themeColor) : "#2563eb";
        state.plan = d && d.plan ? normalizePlan(d.plan) : "free";
        state.ownerName = d && d.ownerName ? String(d.ownerName) : "";
        state.ownerWhatsApp = d && d.ownerWhatsApp ? String(d.ownerWhatsApp) : "";
        state.commercialStatus = d && d.commercialStatus ? normalizeCommercialStatus(d.commercialStatus) : "ativo";
        state.trialEndsAt = d && d.trialEndsAt ? toDateInput(d.trialEndsAt) : "";
        state.paidUntil = d && d.paidUntil ? toDateInput(d.paidUntil) : "";
        state.clientNotes = d && d.clientNotes ? String(d.clientNotes) : "";
        state.adminPassStored = d && d.adminPass ? String(d.adminPass) : "";
        state.roomGroups = d && d.roomGroups && typeof d.roomGroups === 'object' ? d.roomGroups : {};
        state.activeInternalGroupId = d && d.activeInternalGroupId ? String(d.activeInternalGroupId) : "";
        state.activeInternalGroupName = d && d.activeInternalGroupName ? String(d.activeInternalGroupName) : "";

        const nextRid = d && d.activeRoundId ? String(d.activeRoundId) : "";
        const nextAt = d && d.activeRoundAtMs ? Number(d.activeRoundAtMs) : 0;

        if(nextRid && nextRid !== state.activeRoundId){
          state.activeRoundId = nextRid;
          state.activeRoundAtMs = nextAt || 0;
          attachAttendanceListener(c, nextRid);
        } else {
          state.activeRoundAtMs = nextAt || state.activeRoundAtMs;
        }

        maybeAutoCloseSchedule();
        maybeAutoApplyCommercialLifecycle(c, d || {});
        rememberCurrentGroup(true);
        render();
      }, (err)=> setSyncError(err && err.message ? err.message : err));

      unsub.players = playersCol(c).onSnapshot((qs)=>{
        const obj = {};
        qs.forEach(doc=> obj[doc.id] = doc.data());
        maybeNotifyPlayersSnapshot(obj);
        state.players = obj;
        autoRestorePlayerSessionFromDevice(false);
        state.attendance = rebuildAttendanceFromPlayers(state.attendance);
        render();
      }, (err)=> setSyncError(err && err.message ? err.message : err));

      unsub.ratings = ratingsCol(c).onSnapshot((qs)=>{
        const obj = {};
        qs.forEach(doc=> obj[doc.id] = doc.data());
        state.ratings = obj;
        render();
      }, (err)=> setSyncError(err && err.message ? err.message : err));

      unsub.snapshots = snapshotsCol(c).orderBy("createdAtMs","desc").limit(10).onSnapshot((qs)=>{
        const obj = {};
        qs.forEach(doc=> obj[doc.id] = doc.data());
        state.snapshots = obj;
        render();
      }, (err)=> setSyncError(err && err.message ? err.message : err));
    }

    async function loadDeveloperRooms(force = false){
      if(!db || !session.developer) return;
      try{
        state.developerRoomsError = "";
        const qs = await db.collection("matches").orderBy("updatedAt","desc").limit(200).get();
        state.developerRooms = qs.docs.map(doc => {
          const d = doc.data() || {};
          maybeAutoApplyCommercialLifecycle(String(d.code || doc.id || ""), d || {});
          return {
            code: String(d.code || doc.id || "").toUpperCase(),
            roomName: String(d.roomName || ""),
            roomSubtitle: String(d.roomSubtitle || ""),
            plan: normalizePlan(d.plan || "free"),
            open: typeof d.open === "boolean" ? d.open : true,
            updatedAt: String(d.updatedAt || ""),
            createdAt: String(d.createdAt || ""),
            activeRoundAtMs: Number(d.activeRoundAtMs || 0),
            matchLocation: String(d.matchLocation || ""),
            adminPass: String(d.adminPass || ""),
            ownerName: String(d.ownerName || ""),
            ownerWhatsApp: String(d.ownerWhatsApp || ""),
            commercialStatus: normalizeCommercialStatus(d.commercialStatus || "ativo"),
            trialEndsAt: toDateInput(d.trialEndsAt || ""),
            paidUntil: toDateInput(d.paidUntil || ""),
            clientNotes: String(d.clientNotes || ""),
            archived: !!d.archived,
            archivedAt: String(d.archivedAt || "")
          };
        }).filter(room => !room.archived);
        if(force) render();
      }catch(e){
        state.developerRoomsError = e && e.message ? e.message : String(e || "Erro ao carregar salas");
        if(force) render();
      }
    }

    async function developerQuickSavePlan(code, plan){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, "alteração de plano")) return;
      try{
        const selected = normalizePlan(plan);
        await metaUpdate(code, { plan: selected });
        if(normalizeRoomCode(state.code) === normalizeRoomCode(code)) state.plan = selected;
        await loadDeveloperRooms(false);
        setInfo(`Plano da sala ${String(code).toUpperCase()} salvo como ${planLabel(selected)}.`);
        render();
      }catch(e){
        const msg = e && e.message ? e.message : String(e || "Erro ao salvar plano.");
        setSyncError(msg);
      }
    }


    async function developerSetCommercialStatus(code, status){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, "mudança de status")) return;
      const safeCode = normalizeRoomCode(code);
      const nextStatus = normalizeCommercialStatus(status || "ativo");
      const room = (state.developerRooms || []).find(r => normalizeRoomCode(r.code) === safeCode) || {};
      const trialInput = document.querySelector(`[data-dev-trial="${safeCode}"]`);
      const paidInput = document.querySelector(`[data-dev-paiduntil="${safeCode}"]`);
      const patch = { commercialStatus: nextStatus };
      if(nextStatus === "ativo"){
        patch.open = true;
        patch.trialEndsAt = "";
        patch.paidUntil = toDateInput(paidInput?.value || room.paidUntil || dateAddMonths("", 1));
      }else if(nextStatus === "teste"){
        patch.open = true;
        patch.trialEndsAt = toDateInput(trialInput?.value || room.trialEndsAt || datePlusDays(7));
      }else if(nextStatus === "demo"){
        patch.open = true;
      }else if(["inativo","inadimplente","bloqueado"].includes(nextStatus)){
        patch.open = false;
      }
      try{
        await metaUpdate(safeCode, patch);
        await loadDeveloperRooms(false);
        if(normalizeRoomCode(state.code) === safeCode){
          state.commercialStatus = patch.commercialStatus;
          if(Object.prototype.hasOwnProperty.call(patch, 'trialEndsAt')) state.trialEndsAt = patch.trialEndsAt || "";
          if(Object.prototype.hasOwnProperty.call(patch, 'paidUntil')) state.paidUntil = patch.paidUntil || "";
          if(Object.prototype.hasOwnProperty.call(patch, 'open')) state.open = !!patch.open;
        }
        await loadDeveloperRooms(false);
        setInfo(`Status comercial da sala ${safeCode} ajustado para ${commercialStatusLabel(nextStatus)}.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao aplicar status comercial."));
      }
    }

    async function developerExtendTrial(code, days = 7){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, "prorrogação de teste")) return;
      const safeCode = normalizeRoomCode(code);
      const room = (state.developerRooms || []).find(r => normalizeRoomCode(r.code) === safeCode) || {};
      const trialInput = document.querySelector(`[data-dev-trial="${safeCode}"]`);
      const base = toDateInput(trialInput?.value || room.trialEndsAt || datePlusDays(0));
      const nextTrial = dateAddDays(base, Number(days || 7));
      try{
        await metaUpdate(safeCode, { commercialStatus:"teste", trialEndsAt: nextTrial, open:true });
        if(normalizeRoomCode(state.code) === safeCode){
          state.commercialStatus = "teste";
          state.trialEndsAt = nextTrial;
          state.open = true;
        }
        await loadDeveloperRooms(false);
        setInfo(`Teste da sala ${safeCode} prorrogado até ${fmtDatePt(nextTrial)}.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao prorrogar teste."));
      }
    }

    async function developerRenewMonthly(code, months = 1){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, "renovação de mensalidade")) return;
      const safeCode = normalizeRoomCode(code);
      const room = (state.developerRooms || []).find(r => normalizeRoomCode(r.code) === safeCode) || {};
      const paidInput = document.querySelector(`[data-dev-paiduntil="${safeCode}"]`);
      const current = toDateInput(paidInput?.value || room.paidUntil || "");
      const base = (()=>{
        const days = daysUntilDate(current || "");
        if(days != null && days >= 0) return current;
        return datePlusDays(0);
      })();
      const nextPaid = dateAddMonths(base, Number(months || 1));
      try{
        await metaUpdate(safeCode, { commercialStatus:"ativo", paidUntil: nextPaid, open:true });
        if(normalizeRoomCode(state.code) === safeCode){
          state.commercialStatus = "ativo";
          state.paidUntil = nextPaid;
          state.open = true;
        }
        await loadDeveloperRooms(false);
        setInfo(`Sala ${safeCode} renovada até ${fmtDatePt(nextPaid)}.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao renovar mensalidade."));
      }
    }

    async function developerConvertTrialToPaid(code, plan = "basico"){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, "conversão de plano")) return;
      const safeCode = normalizeRoomCode(code);
      const selectedPlan = normalizePlan(plan || "basico");
      const nextPaid = dateAddMonths(datePlusDays(0), 1);
      try{
        await metaUpdate(safeCode, {
          plan: selectedPlan,
          commercialStatus: "ativo",
          trialEndsAt: "",
          paidUntil: nextPaid,
          open: true
        });
        if(normalizeRoomCode(state.code) === safeCode){
          state.plan = selectedPlan;
          state.commercialStatus = "ativo";
          state.trialEndsAt = "";
          state.paidUntil = nextPaid;
          state.open = true;
        }
        await loadDeveloperRooms(false);
        setInfo(`Sala ${safeCode} convertida para ${planLabel(selectedPlan)} mensal, com vencimento em ${fmtDatePt(nextPaid)}.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao converter teste para pago."));
      }
    }

    async function developerSetLifetimePlan(code, plan = "basico"){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, "ativação vitalícia")) return;
      const safeCode = normalizeRoomCode(code);
      const selectedPlan = normalizePlan(plan || "basico");
      try{
        await metaUpdate(safeCode, {
          plan: selectedPlan,
          commercialStatus: "ativo",
          trialEndsAt: "",
          paidUntil: "",
          open: true
        });
        if(normalizeRoomCode(state.code) === safeCode){
          state.plan = selectedPlan;
          state.commercialStatus = "ativo";
          state.trialEndsAt = "";
          state.paidUntil = "";
          state.open = true;
        }
        await loadDeveloperRooms(false);
        setInfo(`Sala ${safeCode} ativada como ${planLabel(selectedPlan)} vitalício.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao ativar plano vitalício."));
      }
    }

    function openDeveloperRoom(code){
      joinRoomByCode(code);
    }

    async function developerResetRoom(code){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, "reset da sala")) return;
      if(!confirm(`Resetar totalmente a sala ${String(code).toUpperCase()}?`)) return;
      try{
        await resetRoom(code);
        await loadDeveloperRooms(false);
        setInfo(`Sala ${String(code).toUpperCase()} resetada.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao resetar sala."));
      }
    }

    async function developerToggleOpenRoom(code, open){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, `${open ? "abertura" : "fechamento"} da sala`)) return;
      try{
        await metaUpdate(code, { open: !!open });
        if(normalizeRoomCode(state.code) === normalizeRoomCode(code)) state.open = !!open;
        await loadDeveloperRooms(false);
        setInfo(`Sala ${String(code).toUpperCase()} ${open ? "aberta" : "fechada"}.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao alterar a sala."));
      }
    }

    async function developerCloseAllOpenRooms(){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(!confirm("Fechar todas as salas com inscrição aberta?")) return;
      try{
        let total = 0;
        while(true){
          const qs = await db.collection("matches").where("open", "==", true).limit(200).get();
          if(qs.empty) break;
          const batch = db.batch();
          qs.docs.forEach(doc => {
            batch.set(doc.ref, { open: false, updatedAt: nowIso() }, { merge: true });
          });
          total += qs.size;
          await batch.commit();
          if(qs.size < 200) break;
        }
        if(normalizeRoomCode(state.code)) state.open = false;
        await loadDeveloperRooms(false);
        setInfo(total ? `${total} sala(s) aberta(s) foram fechadas.` : "Nenhuma sala aberta encontrada.");
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao fechar as salas abertas."));
      }
    }

    async function deleteRoomPermanently(code){
      const c = normalizeRoomCode(code);
      if(!c) throw new Error("Código da sala inválido.");
      const roundsSnap = await roundsCol(c).limit(200).get();
      for(const rd of roundsSnap.docs){
        const rid = rd.id;
        await deleteCollection(attendanceCol(c, rid)).catch(()=>{});
        await roundsCol(c).doc(rid).delete().catch(()=>{});
      }
      await deleteCollection(playersCol(c)).catch(()=>{});
      await deleteCollection(ratingsCol(c)).catch(()=>{});
      await deleteCollection(snapshotsCol(c)).catch(()=>{});
      await matchDoc(c).delete().catch(()=>{});
      removeSavedGroup(c);
      if(normalizeRoomCode(state.code) === c){
        detachRoom();
        state.code = "";
        state.roomName = "";
        state.roomSubtitle = "";
        state.open = true;
        state.plan = "free";
        state.players = {};
        state.attendance = {};
        state.ratings = {};
        state.snapshots = {};
        state.activeRoundId = "";
        state.activeRoundAtMs = 0;
        state.matchDate = "";
        state.matchTime = "";
        state.matchLocation = "";
        session.code = "";
        session.playerId = "";
        persistSession();
        syncRoomUrl("");
      }
    }

    async function developerDeleteRoom(code){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      const c = normalizeRoomCode(code);
      if(guardProtectedRoomMutation(c, "remoção da sala")) return;
      if(!confirm(`Remover permanentemente a sala ${c}? Esta ação tenta apagar jogadores, avaliações, rodadas e histórico.`)) return;
      try{
        try{
          await deleteRoomPermanently(c);
        }catch(err){
          await metaUpdate(c, { archived: true, archivedAt: nowIso(), open: false, commercialStatus: "bloqueado" });
        }
        removeSavedGroup(c);
        if(normalizeRoomCode(state.code) === c) leaveRoom();
        await loadDeveloperRooms(false);
        setInfo(`Sala ${c} removida.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao remover a sala."));
      }
    }

    async function developerDeleteAllExceptProtected(){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(!confirm("Remover salas inativas, bloqueadas, inadimplentes, órfãs ou arquivadas do painel?")) return;
      try{
        const qs = await db.collection("matches").limit(200).get();
        let total = 0;
        for(const doc of qs.docs){
          const data = doc.data() || {};
          const code = normalizeRoomCode(data.code || doc.id || "");
          if(!code) continue;
          const status = normalizeCommercialStatus(data.commercialStatus || "ativo");
          const orphan = !String(data.ownerName || "").trim() && !String(data.ownerWhatsApp || "").trim() && !String(data.paidUntil || "").trim() && !String(data.trialEndsAt || "").trim();
          const shouldRemove = !!data.archived || orphan || ["inativo","bloqueado","inadimplente"].includes(status);
          if(!shouldRemove) continue;
          try{
            await deleteRoomPermanently(code);
          }catch(err){
            await metaUpdate(code, { archived: true, archivedAt: nowIso(), open: false, commercialStatus: "bloqueado" });
          }
          removeSavedGroup(code);
          total += 1;
        }
        if(total && normalizeRoomCode(state.code)){
          const current = (await matchDoc(normalizeRoomCode(state.code)).get().catch(()=>null));
          if(!current || !current.exists) leaveRoom();
        }
        await loadDeveloperRooms(false);
        setInfo(total ? `${total} sala(s) inativas/órfãs foram removidas.` : "Nenhuma sala inativa, bloqueada ou órfã foi encontrada.");
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao remover salas."));
      }
    }


    function developerSetFilter(value){
      state.developerFilter = String(value || "").trim().toLowerCase();
      render();
    }

    function filteredDeveloperRooms(){
      const rooms = Array.isArray(state.developerRooms) ? state.developerRooms : [];
      const q = String(state.developerFilter || "").trim().toLowerCase();
      if(!q) return rooms;
      return rooms.filter(room => {
        const hay = [room.code, room.roomName, room.roomSubtitle, room.matchLocation, planLabel(room.plan), commercialStatusLabel(room.commercialStatus), room.ownerName, room.ownerWhatsApp].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    async function developerSaveRoomAll(code){
      if(!session.developer) return alert("Somente Desenvolvedor.");
      if(guardProtectedRoomMutation(code, "edição dos dados da sala")) return;
      const safeCode = String(code || "").toUpperCase();
      const roomName = String(document.querySelector(`[data-dev-name="${safeCode}"]`)?.value || "").trim();
      const roomSubtitle = String(document.querySelector(`[data-dev-subtitle="${safeCode}"]`)?.value || "").trim();
      const matchLocation = String(document.querySelector(`[data-dev-location="${safeCode}"]`)?.value || "").trim();
      const adminPass = String(document.querySelector(`[data-dev-adminpass="${safeCode}"]`)?.value || "").trim();
      const ownerName = String(document.querySelector(`[data-dev-owner="${safeCode}"]`)?.value || "").trim();
      const ownerWhatsApp = String(document.querySelector(`[data-dev-whats="${safeCode}"]`)?.value || "").trim();
      const commercialStatus = normalizeCommercialStatus(document.querySelector(`[data-dev-status="${safeCode}"]`)?.value || "ativo");
      const trialEndsAt = toDateInput(document.querySelector(`[data-dev-trial="${safeCode}"]`)?.value || "");
      const paidUntil = toDateInput(document.querySelector(`[data-dev-paiduntil="${safeCode}"]`)?.value || "");
      const plan = normalizePlan(document.querySelector(`[data-dev-plan-select="${safeCode}"]`)?.value || "free");
      const clientNotes = String(document.querySelector(`[data-dev-notes="${safeCode}"]`)?.value || "").trim();
      const patch = {
        roomName: roomName || `Sala ${safeCode}`,
        roomSubtitle,
        matchLocation,
        ownerName,
        ownerWhatsApp,
        commercialStatus,
        trialEndsAt,
        paidUntil,
        plan,
        clientNotes,
        open: ["inativo","inadimplente","bloqueado"].includes(commercialStatus) ? false : true,
        updatedAt: nowIso()
      };
      if(adminPass) patch.adminPass = adminPass;
      try{
        await metaUpdate(safeCode, patch);
        await loadDeveloperRooms(false);
        if(normalizeRoomCode(state.code) === safeCode){
          state.roomName = patch.roomName;
          state.roomSubtitle = roomSubtitle;
          state.matchLocation = matchLocation;
          state.ownerName = ownerName;
          state.ownerWhatsApp = ownerWhatsApp;
          state.commercialStatus = commercialStatus;
          state.trialEndsAt = trialEndsAt;
          state.paidUntil = paidUntil;
          state.plan = plan;
          state.clientNotes = clientNotes;
          state.open = !!patch.open;
          if(adminPass) state.adminPassStored = adminPass;
        }
        setInfo(`Sala ${safeCode} salva com sucesso.`);
        render();
      }catch(e){
        setSyncError(e && e.message ? e.message : String(e || "Erro ao salvar dados da sala."));
      }
    }

    async function developerCopyAdminAccess(code){
      const safeCode = String(code || "").toUpperCase();
      const room = (state.developerRooms || []).find(r => String(r.code || "").toUpperCase() === safeCode) || {};
      const adminPass = String(room.adminPass || ADMIN_PASS || "").trim();
      const lines = [
        `Acesso Admin · Manchette Volleyball`,
        `Sala: ${safeCode}`,
        `Link: ${buildRoomUrl(safeCode)}`,
        `Senha admin: ${adminPass}`
      ];
      if(room.roomName) lines.splice(1, 0, `Grupo: ${room.roomName}`);
      await copyToClipboard(lines.join("\n"));
      setInfo(`Dados de acesso admin da sala ${safeCode} copiados.`);
    }


function renderDeveloperRoomsPanel(){
  if(!session.developer) return "";
  const allRooms = Array.isArray(state.developerRooms) ? state.developerRooms : [];
  const rooms = filteredDeveloperRooms();
  const openCount = allRooms.filter(room => room.open).length;
  const freeCount = allRooms.filter(room => normalizePlan(room.plan) === "free").length;
  const basicoCount = allRooms.filter(room => normalizePlan(room.plan) === "basico").length;
  const proCount = allRooms.filter(room => normalizePlan(room.plan) === "pro").length;
  const testeCount = allRooms.filter(room => normalizeCommercialStatus(room.commercialStatus) === "teste").length;
  const ativoCount = allRooms.filter(room => normalizeCommercialStatus(room.commercialStatus) === "ativo").length;
  const inadCount = allRooms.filter(room => normalizeCommercialStatus(room.commercialStatus) === "inadimplente").length;
  const q = escapeHtml(state.developerFilter || "");
  return `
    <div class="mt-5 rounded-2xl border bg-amber-50 p-4">
      <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h3 class="font-bold text-gray-800">Painel do Desenvolvedor</h3>
          <p class="text-xs text-gray-600">Gestão central de salas, planos, clientes e cobrança. Tudo importante fica salvo por aqui.</p>
          <div class="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span class="px-2 py-1 rounded-full bg-white border text-gray-700">Salas ${allRooms.length}</span>
            <span class="px-2 py-1 rounded-full bg-green-100 text-green-700">Abertas ${openCount}</span>
            <span class="px-2 py-1 rounded-full bg-sky-100 text-sky-700">Teste ${testeCount}</span>
            <span class="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Ativas ${ativoCount}</span>
            <span class="px-2 py-1 rounded-full bg-red-100 text-red-700">Inadimplentes ${inadCount}</span>
            <span class="px-2 py-1 rounded-full bg-slate-100 text-slate-700">Free ${freeCount}</span>
            <span class="px-2 py-1 rounded-full bg-blue-100 text-blue-700">Básico ${basicoCount}</span>
            <span class="px-2 py-1 rounded-full bg-violet-100 text-violet-700">PRO ${proCount}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button id="btnCreateTrialRoom" onclick="createFreeTrialRoom()" type="button" class="px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 text-sm font-semibold">Criar teste grátis</button>
          <button id="btnDevCloseAllOpen" onclick="developerCloseAllOpenRooms()" type="button" class="px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-sm font-semibold">Fechar todas abertas</button>
<button id="btnDevDeleteExceptProtected" onclick="developerDeleteAllExceptProtected()" type="button" class="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-semibold">Remover inativas / órfãs</button>
          <button id="btnDevRefresh" onclick="loadDeveloperRooms(true)" type="button" class="px-3 py-2 rounded-lg border hover:bg-white text-sm font-semibold">Atualizar</button>
        </div>
      </div>
      <div class="mt-3 flex flex-col gap-3 lg:flex-row">
        <div class="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-amber-900 lg:flex-1">
Edite qualquer sala livremente por aqui. Use a limpeza de salas inativas ou órfãs com cuidado.
        </div>
        <div class="rounded-xl border border-amber-200 bg-white px-3 py-2 lg:w-[360px]">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Busca rápida</div>
          <input id="devRoomFilter" value="${q}" placeholder="Buscar por código, cliente, WhatsApp, status ou plano" class="mt-2 w-full px-3 py-2 rounded-lg border text-sm" />
        </div>
      </div>
      ${state.developerRoomsError ? `<div class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">${escapeHtml(state.developerRoomsError)}</div>` : ``}
      <div class="mt-3 space-y-3 max-h-[620px] overflow-y-auto pr-1">
        ${rooms.length ? rooms.map(room => {
          const protectedRoom = false;
          const lockField = '';
          const lockButton = '';
          const lockMuted = '';
          const statusClass = commercialStatusClass(room.commercialStatus);
          const summary = roomMetaSummary(room);
          const roomAlert = commercialAlertInfo(room);
          const isOrphan = roomIsOrphan(room);
          return `
            <div class="rounded-xl border bg-white p-3">
              <div class="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div class="font-semibold text-gray-800">${escapeHtml(room.roomName || ('Sala ' + room.code))}</div>
                  <div class="text-xs text-gray-500">Código ${escapeHtml(room.code)}${room.roomSubtitle ? ' · ' + escapeHtml(room.roomSubtitle) : ''}${room.matchLocation ? ' · ' + escapeHtml(room.matchLocation) : ''}</div>
                  ${summary ? `<div class="mt-1 text-xs text-gray-500">${escapeHtml(summary)}</div>` : ``}
                </div>
                <div class="flex flex-wrap gap-1.5 text-[11px]">
                  <span class="px-2 py-1 rounded-full ${room.open ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${room.open ? 'Aberta' : 'Fechada'}</span>
                  <span class="px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">${escapeHtml(planLabel(room.plan))}</span>
                  <span class="px-2 py-1 rounded-full ${statusClass}">${escapeHtml(commercialStatusLabel(room.commercialStatus))}</span>
                  ${isOrphan ? `<span class="px-2 py-1 rounded-full bg-slate-100 text-slate-700">Órfã</span>` : ``}
                </div>
              </div>
              ${roomAlert ? `<div class="mt-2 rounded-lg border ${roomAlert.level === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'} px-3 py-2 text-xs font-medium">${escapeHtml(roomAlert.text)}</div>` : ``}
              <div class="mt-2 grid gap-2 md:grid-cols-3">
                <input data-dev-name="${escapeHtml(room.code)}" value="${escapeHtml(room.roomName || '')}" placeholder="Nome da sala" class="px-2.5 py-2 rounded-lg border text-xs" ${lockField} />
                <input data-dev-owner="${escapeHtml(room.code)}" value="${escapeHtml(room.ownerName || '')}" placeholder="Cliente / responsável" class="px-2.5 py-2 rounded-lg border text-xs" ${lockField} />
                <input data-dev-whats="${escapeHtml(room.code)}" value="${escapeHtml(room.ownerWhatsApp || '')}" placeholder="WhatsApp do cliente" class="px-2.5 py-2 rounded-lg border text-xs" ${lockField} />
              </div>
              <div class="mt-2 grid gap-2 md:grid-cols-3">
                <input data-dev-subtitle="${escapeHtml(room.code)}" value="${escapeHtml(room.roomSubtitle || '')}" placeholder="Subtítulo / grupo" class="px-2.5 py-2 rounded-lg border text-xs" ${lockField} />
                <input data-dev-location="${escapeHtml(room.code)}" value="${escapeHtml(room.matchLocation || '')}" placeholder="Local" class="px-2.5 py-2 rounded-lg border text-xs" ${lockField} />
                <input data-dev-adminpass="${escapeHtml(room.code)}" placeholder="Nova senha admin" class="px-2.5 py-2 rounded-lg border text-xs" ${lockField} />
              </div>
              <div class="mt-2 grid gap-2 md:grid-cols-4">
                <label class="block">
                  <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Plano da sala</span>
                  <select data-dev-plan-select="${escapeHtml(room.code)}" class="w-full px-2.5 py-2 rounded-lg border text-xs" ${lockField}>
                    <option value="free" ${room.plan === 'free' ? 'selected' : ''}>Free</option>
                    <option value="basico" ${room.plan === 'basico' ? 'selected' : ''}>Básico</option>
                    <option value="pro" ${room.plan === 'pro' ? 'selected' : ''}>PRO</option>
                  </select>
                </label>
                <label class="block">
                  <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Status comercial</span>
                  <select data-dev-status="${escapeHtml(room.code)}" class="w-full px-2.5 py-2 rounded-lg border text-xs" ${lockField}>
                    <option value="teste" ${normalizeCommercialStatus(room.commercialStatus)==='teste' ? 'selected' : ''}>Teste</option>
                    <option value="ativo" ${normalizeCommercialStatus(room.commercialStatus)==='ativo' ? 'selected' : ''}>Ativo</option>
                    <option value="inativo" ${normalizeCommercialStatus(room.commercialStatus)==='inativo' ? 'selected' : ''}>Inativo</option>
                    <option value="inadimplente" ${normalizeCommercialStatus(room.commercialStatus)==='inadimplente' ? 'selected' : ''}>Inadimplente</option>
                    <option value="bloqueado" ${normalizeCommercialStatus(room.commercialStatus)==='bloqueado' ? 'selected' : ''}>Bloqueado</option>
                    <option value="demo" ${normalizeCommercialStatus(room.commercialStatus)==='demo' ? 'selected' : ''}>Demonstração</option>
                  </select>
                </label>
                <label class="block">
                  <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Fim do teste grátis</span>
                  <input data-dev-trial="${escapeHtml(room.code)}" type="date" value="${escapeHtml(toDateInput(room.trialEndsAt || ''))}" class="w-full px-2.5 py-2 rounded-lg border text-xs" ${lockField} />
                  <span class="mt-1 block text-[10px] text-gray-500">Use quando a sala estiver em teste.</span>
                </label>
                <label class="block">
                  <span class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Vencimento mensal</span>
                  <input data-dev-paiduntil="${escapeHtml(room.code)}" type="date" value="${escapeHtml(toDateInput(room.paidUntil || ''))}" class="w-full px-2.5 py-2 rounded-lg border text-xs" ${lockField} />
                  <span class="mt-1 block text-[10px] text-gray-500">Deixe vazio para plano vitalício.</span>
                </label>
              </div>
              <textarea data-dev-notes="${escapeHtml(room.code)}" placeholder="Observações do cliente, cobrança e suporte" class="mt-2 w-full px-2.5 py-2 rounded-lg border text-xs min-h-[64px]" ${lockField}>${escapeHtml(room.clientNotes || '')}</textarea>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <button data-dev-saveall="${escapeHtml(room.code)}" onclick="developerSaveRoomAll('${escapeHtml(room.code)}')" type="button" class="px-2 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-[11px] font-semibold ${lockMuted}" ${lockButton}>Salvar dados</button>
                <button data-dev-open="${escapeHtml(room.code)}" onclick="openDeveloperRoom('${escapeHtml(room.code)}')" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-gray-50 text-[11px] font-semibold">Abrir sala</button>
                <button data-dev-copylink="${escapeHtml(room.code)}" onclick="copyToClipboard(buildRoomUrl('${escapeHtml(room.code)}'))" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-gray-50 text-[11px] font-semibold">Copiar link</button>
                <button data-dev-copyaccess="${escapeHtml(room.code)}" onclick="developerCopyAdminAccess('${escapeHtml(room.code)}')" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-gray-50 text-[11px] font-semibold">Copiar acesso admin</button>
                <button data-dev-toggle="${escapeHtml(room.code)}" data-dev-openstate="${room.open ? '0' : '1'}" onclick="developerToggleOpenRoom('${escapeHtml(room.code)}', ${room.open ? 'false' : 'true'})" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-gray-50 text-[11px] font-semibold ${lockMuted}" ${lockButton}>${room.open ? 'Fechar sala' : 'Reabrir sala'}</button>
                <button data-dev-activate="${escapeHtml(room.code)}" onclick="developerSetCommercialStatus('${escapeHtml(room.code)}', 'ativo')" type="button" class="px-2 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-semibold ${lockMuted}" ${lockButton}>Ativar sala</button>
                <button data-dev-block="${escapeHtml(room.code)}" onclick="developerSetCommercialStatus('${escapeHtml(room.code)}', 'bloqueado')" type="button" class="px-2 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 text-[11px] font-semibold ${lockMuted}" ${lockButton}>Bloquear sala</button>
                <button data-dev-extendtrial="${escapeHtml(room.code)}" onclick="developerExtendTrial('${escapeHtml(room.code)}', 7)" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-sky-50 text-[11px] font-semibold ${lockMuted}" ${lockButton}>Prorrogar +7 dias</button>
                <button data-dev-renewmonth="${escapeHtml(room.code)}" onclick="developerRenewMonthly('${escapeHtml(room.code)}', 1)" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-emerald-50 text-[11px] font-semibold ${lockMuted}" ${lockButton}>Renovar +1 mês</button>
                <button data-dev-convert-basic="${escapeHtml(room.code)}" onclick="developerConvertTrialToPaid('${escapeHtml(room.code)}', 'basico')" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-blue-50 text-[11px] font-semibold ${lockMuted}" ${lockButton}>Básico mensal</button>
                <button data-dev-convert-pro="${escapeHtml(room.code)}" onclick="developerConvertTrialToPaid('${escapeHtml(room.code)}', 'pro')" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-violet-50 text-[11px] font-semibold ${lockMuted}" ${lockButton}>PRO mensal</button>
                <button data-dev-life-basic="${escapeHtml(room.code)}" onclick="developerSetLifetimePlan('${escapeHtml(room.code)}', 'basico')" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-blue-50 text-[11px] font-semibold ${lockMuted}" ${lockButton}>Básico vitalício</button>
                <button data-dev-life-pro="${escapeHtml(room.code)}" onclick="developerSetLifetimePlan('${escapeHtml(room.code)}', 'pro')" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-violet-50 text-[11px] font-semibold ${lockMuted}" ${lockButton}>PRO vitalício</button>
                <button data-dev-reset="${escapeHtml(room.code)}" onclick="developerResetRoom('${escapeHtml(room.code)}')" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-red-50 text-[11px] font-semibold ${lockMuted}" ${lockButton}>Resetar sala</button>
                <button data-dev-copyclient="${escapeHtml(room.code)}" onclick="developerCopyClientSummary('${escapeHtml(room.code)}')" type="button" class="px-2 py-1.5 rounded-lg border hover:bg-gray-50 text-[11px] font-semibold">Copiar resumo</button>
                <button data-dev-remove="${escapeHtml(room.code)}" onclick="developerDeleteRoom('${escapeHtml(room.code)}')" type="button" class="px-2 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-[11px] font-semibold">Remover sala</button>
              </div>
            </div>
          `;
        }).join('') : `<div class="rounded-xl border bg-white p-3 text-sm text-gray-500">Nenhuma sala encontrada.</div>`}
      </div>
    </div>
  `;
}

    async function setPlayer(code, player){
      const c = String(code||"").toUpperCase();
      await playersCol(c).doc(player.id).set(player, { merge:true });
      await matchDoc(c).set({ updatedAt: nowIso() }, { merge:true });
    }

    async function setAttendance(code, roundId, playerId, patch){
      const c = String(code||"").toUpperCase();
      const rid = String(roundId||"");
      if(!rid) throw new Error("Rodada ativa não encontrada.");
      const normalized = Object.assign({}, patch || {});
      if(typeof normalized.present === "boolean") normalized.present = !!normalized.present;
      if(!(normalized.team === 1 || normalized.team === 2)) normalized.team = null;
      if(normalized.present && !normalized.checkedInAtMs) normalized.checkedInAtMs = nowMs();
      if(!normalized.present){
        normalized.team = null;
        normalized.checkedInAtMs = null;
      }
      normalized.updatedAt = normalized.updatedAt || nowIso();
      await attendanceCol(c, rid).doc(playerId).set(normalized, { merge:true });
      await playersCol(c).doc(playerId).set({
        presenceRoundId: rid,
        present: !!normalized.present,
        team: normalized.team,
        checkedInAtMs: normalized.checkedInAtMs || null,
        attendanceUpdatedAt: normalized.updatedAt,
        updatedAt: nowIso()
      }, { merge:true });
      await matchDoc(c).set({ updatedAt: nowIso() }, { merge:true });
    }

    async function setRating(code, rating){
      const c = String(code||"").toUpperCase();
      await ratingsCol(c).doc(rating.id).set(rating, { merge:true });
      await matchDoc(c).set({ updatedAt: nowIso() }, { merge:true });
    }

    async function metaUpdate(code, patch){
      const c = String(code||"").toUpperCase();
      await matchDoc(c).set(Object.assign({}, patch, { updatedAt: nowIso() }), { merge:true });
    }

    async function deleteCollection(colRef){
      const snap = await colRef.limit(500).get();
      if(snap.empty) return;
      const batch = db.batch();
      snap.docs.forEach(d=> batch.delete(d.ref));
      await batch.commit();
      if(snap.size === 500) return deleteCollection(colRef);
    }

    async function resetRoom(code){
      const c = String(code||"").toUpperCase();

      // apaga rounds + attendance (best effort)
      const roundsSnap = await roundsCol(c).limit(50).get();
      for(const rd of roundsSnap.docs){
        const rid = rd.id;
        await deleteCollection(attendanceCol(c, rid)).catch(()=>{});
        await roundsCol(c).doc(rid).delete().catch(()=>{});
      }

      await deleteCollection(playersCol(c));
      await deleteCollection(ratingsCol(c));
      await deleteCollection(snapshotsCol(c));

      const rid = newRoundId();
      const at = nowMs();
      await roundDoc(c, rid).set({ id: rid, createdAt: nowIso(), createdAtMs: at }, { merge:true });
      await matchDoc(c).set({ code:c, open:true, activeRoundId: rid, activeRoundAtMs: at, updatedAt: nowIso() }, { merge:true });
    }

    async function removePlayerAndRelatedRatings(code, playerId){
      const c = String(code||"").toUpperCase();

      await playersCol(c).doc(playerId).delete().catch(()=>{});
      if(state.activeRoundId) await attendanceCol(c, state.activeRoundId).doc(playerId).delete().catch(()=>{});

      async function deleteRatingsWhere(field, value){
        let qs = await ratingsCol(c).where(field, "==", value).limit(200).get();
        while(!qs.empty){
          const batch = db.batch();
          qs.docs.forEach(d=> batch.delete(d.ref));
          await batch.commit();
          if(qs.size < 200) break;
          qs = await ratingsCol(c).where(field, "==", value).limit(200).get();
        }
      }

      await deleteRatingsWhere("raterId", playerId);
      await deleteRatingsWhere("targetId", playerId);

      await matchDoc(c).set({ updatedAt: nowIso() }, { merge:true });
    }

    // ===============================
    // Sala
    // ===============================
    async function createRoom(){
      try{
        if(!canCreateRooms()) return alert("A criação de salas fica disponível para Admin ou Desenvolvedor.");
        const code = genCode(6);
        const patch = { adminPass: (ADMIN_PASS || "admin123") };
        await ensureRoom(code, patch);
        state.code = code;
        session.code = code;
        session.playerId = "";
        persistSession();
        syncRoomUrl(code);
        attachRoom(code);
        rememberCurrentGroup(true);
        if(session.developer) loadDeveloperRooms(false);
        setInfo("Sala criada. Compartilhe o código ou o link da sala para os outros entrarem.");
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    async function createFreeTrialRoom(){
      try{
        const ownerName = String(prompt("Nome do responsável pelo teste grátis:", "") || "").trim();
        if(!ownerName) return;
        const ownerWhatsApp = String(prompt("WhatsApp do responsável:", "") || "").trim();
        const roomName = String(prompt("Nome do grupo / quadra:", `Teste de ${ownerName}`) || `Teste de ${ownerName}`).trim();
        const code = genCode(6);
        const generatedAdminPass = genPlayerCode(8);
        const trialUntil = datePlusDays(7);
        await ensureRoom(code, {
          roomName,
          roomSubtitle: ownerName,
          ownerName,
          ownerWhatsApp,
          adminPass: generatedAdminPass,
          plan: "free",
          commercialStatus: "teste",
          trialEndsAt: trialUntil,
          clientNotes: "Teste grátis criado pelo fluxo inicial.",
          open: true
        });
        setAccessMode("admin");
        state.code = code;
        session.code = code;
        session.playerId = "";
        persistSession();
        syncRoomUrl(code);
        attachRoom(code);
        rememberCurrentGroup(true);
        const lines = [
          `Teste grátis · Manchette Volleyball`,
          `Sala: ${code}`,
          `Grupo: ${roomName}`,
          `Link: ${buildRoomUrl(code)}`,
          `Senha admin: ${generatedAdminPass}`,
          `Teste até: ${fmtDatePt(trialUntil)}`
        ];
        try{ await copyToClipboard(lines.join("\n")); }catch{}
        alert(`Teste grátis criado.\n\nSala: ${code}\nSenha admin: ${generatedAdminPass}\n\nOs dados foram copiados para facilitar o envio ao cliente.`);
        setInfo("Teste grátis criado. Use esta mesma sala para fazer upgrade depois para Básico ou PRO.");
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    function openDemoRoom(){
      setAccessMode("player");
      setInfo("A demonstração visual fica no site comercial. Para testar de verdade, use 'Criar teste grátis' ou entre com um código válido.");
      render();
    }

    async function joinRoomByCode(rawCode){
      try{
        const code = normalizeRoomCode(rawCode);
        if(!code) return;
        const mode = accessMode();
        const snap = await matchDoc(code).get();
        if(!snap.exists){
          if(mode === "developer" || mode === "admin"){
            alert("Sala não encontrada. Use 'Criar nova' para abrir uma sala nova ou confirme o código informado.");
          }else{
            alert("Sala não encontrada. Verifique o código enviado pelo organizador.");
          }
          return;
        }
        const data = snap.data() || {};
        if(mode === "admin" && !session.developer){
          const expectedPass = String(data.adminPass || ADMIN_PASS || "").trim();
          const typedPass = String(window.prompt(`Digite a senha admin da sala ${code}:`, "") || "").trim();
          if(!typedPass) return;
          if(typedPass !== expectedPass) return alert("Senha admin inválida para esta sala.");
        }
        const restriction = roomRestrictionMessage(data, mode);
        if(restriction) return alert(restriction);

        const prevCode = normalizeRoomCode(session.code);
        state.code = code;
        session.code = code;

        if(code !== prevCode){
          session.playerId = "";
          session.prevPlayerId = "";
        }
        persistSession();
        syncRoomUrl(code);
        attachRoom(code);
        rememberCurrentGroup(true);
        const entryMsg = mode === "developer"
          ? "<b>Entrou na sala como Desenvolvedor.</b> Você tem visão e controle avançado desta sala."
          : mode === "admin"
            ? "<b>Entrou na sala como Admin.</b> Os controles administrativos já estão liberados."
            : "<b>Entrou na sala.</b> Agora inscreva seu nome ou entre com seu Código do Jogador.";
        setInfo(entryMsg);
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    async function joinRoom(){
      const code = ($("roomCode")?.value || "").trim().toUpperCase();
      return joinRoomByCode(code);
    }

    async function pasteRoomCodeAndJoin(){
      try{
        if(!navigator.clipboard || !navigator.clipboard.readText){
          return alert("Seu navegador não liberou a leitura da área de transferência. Cole o código manualmente no campo.");
        }
        const raw = await navigator.clipboard.readText();
        const code = normalizeRoomCode(String(raw || "").replace(/\s+/g, ""));
        if(!code) return alert("Nenhum código de sala foi encontrado na área de transferência.");
        if($("roomCode")) $("roomCode").value = code;
        return joinRoomByCode(code);
      }catch(e){
        const msg = e && e.message ? e.message : String(e || "Erro ao colar o código.");
        if(/denied|notallowed|permission/i.test(msg)){
          alert("O navegador bloqueou o acesso à área de transferência. Permita a leitura ou cole o código manualmente no campo.");
          return;
        }
        setSyncError(msg);
      }
    }

    function leaveRoom(){
      detachRoom();
      session.code = "";
      session.playerId = "";
      session.prevPlayerId = "";
      persistSession();
      state.code = "";
      syncRoomUrl("");
      state.players = {};
      state.attendance = {};
      state.ratings = {};
      state.snapshots = {};
      state.activeRoundId = "";
      state.activeRoundAtMs = 0;
      state.open = true;
      state.syncError = "";
      state.info = "";
      state.roomGroups = {};
      state.activeInternalGroupId = "";
      state.activeInternalGroupName = "";
      resetLiveNotify("");
      render();
    }

    // ===============================
    // Jogador
    // ===============================
    async function registerMe(){
      try{
        const code = state.code;
        if(!code) return;
        if(!state.activeRoundId) return alert("Rodada não carregou. Recarregue a página.");

        const addingAnother = !!session.prevPlayerId;

        // Bloqueia nova inscrição quando já está logado neste aparelho
        const already = me();
        if(already){
          return alert("Você já está logado. Para mudar seus dados use 'Atualizar minha inscrição' ou 'Sair da lista'. Para inscrever outra pessoa, use 'Adicionar jogador'.");
        }

        if(!addingAnother){
          const sameDevicePlayer = findRegisteredPlayerForThisDevice(state.players || {});
          if(sameDevicePlayer && sameDevicePlayer.id){
            session.playerId = sameDevicePlayer.id;
            persistSession();
            render();
            return alert("Este celular já possui uma inscrição nesta sala. Use essa mesma inscrição ou peça para o Admin remover você da lista antes de se cadastrar novamente.");
          }
        }

        const name = ($("playerName")?.value || "").trim();
        const baseNote = clamp(Number($("playerNote")?.value || 5), MIN_NOTA, MAX_NOTA);
        const position = ($("playerPos")?.value || "Coringa");

        if(!name) return alert("Digite seu nome.");
        if(!state.open) return alert("Inscrição fechada.");

        const id = safeId();
        const accessCode = genPlayerCode(10);

        const player = { id, name, baseNote, position, accessCode, createdAt: nowIso() };
        if(!addingAnother) player.deviceId = getDeviceId();

        session.playerId = id;
        persistSession();

        await setPlayer(code, player);

        // ✅ ao cadastrar, já confirma presença na rodada atual (jogar hoje)
        await setAttendance(code, state.activeRoundId, id, {
          present: true,
          team: null,
          checkedInAtMs: nowMs(),
          updatedAt: nowIso()
        });

        if($("playerName")) $("playerName").value = "";
        setInfo("Você entrou na lista e confirmou presença (jogar hoje). Seu Código do Jogador: " + accessCode + " (guarde para entrar em outro celular/PC).");
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

async function registerMeSendWhatsApp(){
  // Abre uma janela antes (evita bloqueio de popup em alguns navegadores)
  const pre = window.open("about:blank", "_blank");

  try{
    const code = state.code;
    if(!code){ if(pre) pre.close(); return alert("Entre na sala primeiro (código da partida)."); }
    if(!state.activeRoundId){ if(pre) pre.close(); return alert("Rodada não carregou. Recarregue a página."); }

    // ✅ Se já está logado: apenas envia os dados no WhatsApp (não cadastra de novo)
    const logged = me();
    if(logged){
      let accessCode = logged.accessCode;
      if(!accessCode){
        // gera se estiver vazio (caso antigo)
        accessCode = await ensureAccessCodeForPlayer(code, logged.id);
      }
      const msg = buildInviteMessage(logged.name || "Jogador", String(code).toUpperCase(), String(accessCode));
      const url = "https://wa.me/?text=" + encodeURIComponent(msg);
      if(pre) pre.location.href = url;
      else window.open(url, "_blank");
      setInfo("WhatsApp aberto com sua mensagem pronta. Agora é só tocar em ENVIAR.");
      return;
    }

    const addingAnother = !!session.prevPlayerId;
    if(!addingAnother){
      const sameDevicePlayer = findRegisteredPlayerForThisDevice(state.players || {});
      if(sameDevicePlayer && sameDevicePlayer.id){
        session.playerId = sameDevicePlayer.id;
        persistSession();
        render();
        if(pre) try{ pre.close(); }catch{}
        return alert("Este celular já possui uma inscrição nesta sala. Use essa mesma inscrição ou peça para o Admin remover você da lista antes de se cadastrar novamente.");
      }
    }

    // ✅ Se NÃO está logado: cadastra e já abre WhatsApp
    const name = ($("playerName")?.value || "").trim();
    const baseNote = clamp(Number($("playerNote")?.value || 5), MIN_NOTA, MAX_NOTA);
    const position = ($("playerPos")?.value || "Coringa");

    if(!name) { if(pre) pre.close(); return alert("Digite seu nome."); }
    if(!state.open) { if(pre) pre.close(); return alert("Inscrição fechada."); }

    const id = safeId();
    const accessCode = genPlayerCode(10);

    const player = { id, name, baseNote, position, accessCode, createdAt: nowIso() };
    if(!addingAnother) player.deviceId = getDeviceId();

    session.playerId = id;
    persistSession();

    await setPlayer(code, player);

    await setAttendance(code, state.activeRoundId, id, {
      present: true,
      team: null,
      checkedInAtMs: nowMs(),
      updatedAt: nowIso()
    });

    // limpa campos
    if($("playerName")) $("playerName").value = "";

    // monta mensagem e abre WhatsApp
    const msg = buildInviteMessage(name, String(code).toUpperCase(), accessCode);
    const url = "https://wa.me/?text=" + encodeURIComponent(msg);
    if(pre) pre.location.href = url;
    else window.open(url, "_blank");

    setInfo("Inscrição criada. Código do Jogador: " + accessCode + " — WhatsApp aberto com a mensagem pronta. Agora é só tocar em ENVIAR.");
  }catch(e){
    if(pre) try{ pre.close(); }catch{}
    setSyncError(e && e.message ? e.message : e);
  }
}


    async function updateMyProfile(){
      const code = state.code;
      const m = me();
      if(!code || !m) return;

      try{
        const name = String($("myNameInput")?.value || m.name || "").trim();
        if(!name || name.length < 2) return alert("Informe um nome válido (mín. 2 letras).");
        const baseNote = clamp(Number($("myNoteSelect")?.value || m.baseNote || 5), MIN_NOTA, MAX_NOTA);
        const position = ($("myPosSelect")?.value || m.position || "Coringa");

        await setPlayer(code, { id: m.id, name, baseNote, position, updatedAt: nowIso() });
        setInfo("Inscrição atualizada (nome/nota/posição).");
      }catch(e){
        setSyncError(e && e.message ? e.message : e);
      }
}


    
function startAddPlayer(){
  const code = state.code;
  if(!code) return alert("Entre em uma sala primeiro (código da partida).");
  if(session.playerId) session.prevPlayerId = session.playerId;
  session.playerId = "";
  persistSession();
  // limpa o formulário de cadastro
  if($("playerName")) $("playerName").value = "";
  if($("playerNote")) $("playerNote").value = "5";
  if($("playerPos")) $("playerPos").value = "Coringa";
  setInfo("Modo adicionar jogador: inscreva a pessoa e depois passe o Código do Jogador para ela recuperar no celular/PC.");
  render();
  try{ window.scrollTo({top: 0, behavior: "smooth"}); }catch{ window.scrollTo(0,0); }
}

function backToPrevPlayer(){
  if(!session.prevPlayerId) return;
  session.playerId = session.prevPlayerId;
  session.prevPlayerId = "";
  persistSession();
  // Reanexa listeners para garantir que times/presença não "sumam" ao trocar de jogador
  if(state.code) attachRoom(state.code);
  setInfo("Você voltou para seu jogador.");
  render();
}

function recoverMyAccessFromDevice(){
  const found = findRegisteredPlayerForThisDevice(state.players || {});
  if(!found || !found.id) return alert("Não encontrei uma inscrição deste aparelho nesta sala.");
  session.playerId = found.id;
  persistSession();
  setInfo(`Acesso recuperado para <b>${escapeHtml(found.name || "Jogador")}</b>.`);
  render();
}

async function markPresence(present){
      const code = state.code;
      let m = me();
      if(!code) return alert("Entre na sala primeiro (código da partida).");
      if(!m){
        m = await ensureMeLoaded();
        if(!m) return alert("Sua inscrição ainda não carregou. Aguarde 1 segundo e tente novamente.");
      }
      if(!state.activeRoundId) return alert("Rodada não carregou. Recarregue a página.");
      if(!state.open) return alert("Inscrição fechada.");

      try{
        await setAttendance(code, state.activeRoundId, m.id, {
          present: !!present,
          team: present ? teamOf(m.id) : null,
          checkedInAtMs: present ? nowMs() : null,
          updatedAt: nowIso()
        });
        setInfo(present ? "<b>Presença confirmada.</b>" : "Ausência marcada para esta rodada.");
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    async function sairDaLista(){
      const code = state.code;
      const m = me();
      if(!code || !m) return;
      const ok = confirm("Sair da lista desta sala? (remove também as notas relacionadas)");
      if(!ok) return;

      try{
        await removePlayerAndRelatedRatings(code, m.id);
        session.playerId = "";
        persistSession();
        setInfo("Você saiu da lista.");
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    async function chooseTeam(team){
      try{
        let m = me();
        if(!m){ m = await ensureMeLoaded(); }
        if(!m) return alert("Inscreva-se para escolher time.");
        if(!state.open) return alert("Inscrição fechada.");
        if(!state.activeRoundId) return alert("Rodada não carregou. Recarregue a página.");
        if(!isPresent(m.id)) return alert("Confirme presença antes de escolher time.");

        const byTarget = byTargetScores(state.ratings);
        const playersArr = Object.values(state.players||{});
        // Limite 6x6: máximo 6 por time; acima de 12 distribuídos, extras ficam em espera
        const currentTeam = teamOf(m.id); // 1, 2 ou null
        let count1 = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)===1).length;
        let count2 = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)===2).length;

        // Para permitir troca de time, desconsidera você do seu time atual
        if (currentTeam === 1) count1 = Math.max(0, count1 - 1);
        if (currentTeam === 2) count2 = Math.max(0, count2 - 1);

        const totalAssignedExcludingMe = count1 + count2;

        // Se você ainda não tem time e já existem 12 jogadores distribuídos, você fica em espera
        if (currentTeam == null && totalAssignedExcludingMe >= TEAM_MAX*2) {
          return alert("Os times já estão completos (6x6). Você ficará em espera.");
        }

        // Checa lotação do time alvo (considerando que você vai entrar nele)
        if (team === 1 && count1 >= TEAM_MAX) {
          return alert("Time 1 já está completo (6 jogadores).");
        }
        if (team === 2 && count2 >= TEAM_MAX) {
          return alert("Time 2 já está completo (6 jogadores).");
        }


        // monta times considerando APENAS presentes
        const t1 = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)===1 && p.id!==m.id);
        const t2 = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)===2 && p.id!==m.id);

        const t1x = (team===1) ? t1.concat([m]) : t1;
        const t2x = (team===2) ? t2.concat([m]) : t2;

        const msg = balanceMessage(t1x, t2x, byTarget);

        if(msg.text && !msg.ok){
          const ok = confirm(msg.text + "\n\nQuer mesmo escolher este time?");
          if(!ok) return;
        }

        await setAttendance(state.code, state.activeRoundId, m.id, { team });
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    // ===============================
    // Admin
    // ===============================
    function adminLogin(){
      setAccessMode("admin");
      setInfo("Modo Admin ativado. Agora digite o código da sala e entre. A senha será pedida ao entrar.");
    }

    function developerLogin(){
      const pass = ($("homeDeveloperPass")?.value || "").trim();
      if(pass !== DEVELOPER_PASS) return alert("Senha de Desenvolvedor inválida.");
      setAccessMode("developer");
      if($("homeDeveloperPass")) $("homeDeveloperPass").value = "";
      setInfo("Modo Desenvolvedor ativado.");
    }

    function playerLogin(){
      setAccessMode("player");
      setInfo("Modo Jogador ativado.");
    }

    function adminLogout(){
      session.playerId = "";
      session.prevPlayerId = "";
      session.adminPassDraft = "";
      setAccessMode("player");
      setInfo("Você voltou ao modo Jogador.");
    }

    async function toggleOpen(){
      if(!session.admin) return alert("Somente admin.");
      await metaUpdate(state.code, { open: !state.open });
    }

    async function newRound(){
      if(!session.admin) return alert("Somente admin.");
      const ok = confirm("Nova rodada: todos começam AUSENTES e sem time. Cada jogador confirma presença novamente. Continuar?");
      if(!ok) return;

      try{
        const code = state.code;
        const rid = newRoundId();
        const at = nowMs();
        await roundDoc(code, rid).set({ id: rid, createdAt: nowIso(), createdAtMs: at }, { merge:true });
        await matchDoc(code).set({ activeRoundId: rid, activeRoundAtMs: at, updatedAt: nowIso() }, { merge:true });
        setInfo("Nova rodada iniciada. Agora cada jogador confirma presença.");
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    
async function randomizeTeams(){
      if(!session.admin) return alert("Somente admin.");
      if(!state.activeRoundId) return alert("Rodada não carregou.");
      const byTarget = byTargetScores(state.ratings);

      // Apenas presentes
      const playersArr = Object.values(state.players||{}).filter(p=> isPresent(p.id));
      if(playersArr.length < 2) return alert("Poucos presentes para sortear.");

      // Ordena por ordem de confirmação de presença (mais antigos primeiro)
      const withCheckin = playersArr.map(p => ({
        p,
        t: (state.attendance[p.id] && state.attendance[p.id].checkedInAtMs) || 0
      })).sort((a,b)=> a.t - b.t);

      // Seleciona no máximo 12 (6x6). Os demais ficam em espera (team null)
      const selected = withCheckin.slice(0, TEAM_MAX*2).map(x=>x.p);

      const sorted = [...selected].sort((a,b)=> computedNote(b,byTarget) - computedNote(a,byTarget));
      let sum1=0, sum2=0;
      const assign = {};
      sorted.forEach(p=>{
        const sk = computedNote(p,byTarget);
        if(sum1 <= sum2){ assign[p.id]=1; sum1+=sk; } else { assign[p.id]=2; sum2+=sk; }
      });

      const batch = db.batch();
      const code = state.code;
      const rid = state.activeRoundId;

      // Aplica times aos 12 selecionados
      Object.keys(assign).forEach(pid=>{
        batch.set(attendanceCol(code, rid).doc(pid), { team: assign[pid], present:true, updatedAt: nowIso() }, { merge:true });
      });

      // Garante que os demais presentes fiquem em espera (team null)
      playersArr.forEach(p=>{
        if(!assign[p.id]){
          batch.set(attendanceCol(code, rid).doc(p.id), { team: null, present:true, updatedAt: nowIso() }, { merge:true });
        }
      });

      batch.set(matchDoc(code), { updatedAt: nowIso() }, { merge:true });
      await batch.commit();
      setInfo("Times sorteados (6x6). Jogadores extras ficaram em espera.");
    }

    async function adminRemovePlayer(playerId, playerName){
      if(!session.admin) return alert("Somente admin.");
      const ok = confirm(`Remover ${playerName} da sala? (remove também as notas relacionadas)`);
      if(!ok) return;

      try{
        await removePlayerAndRelatedRatings(state.code, playerId);
        setInfo(`${playerName} removido.`);
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    async function resetCurrentRoom(){
      if(!session.admin) return alert("Somente admin.");
      if(!confirm("Resetar jogadores, avaliações, rodadas e histórico desta sala? (zera tudo)")) return;
      session.playerId = "";
      persistSession();
      await resetRoom(state.code);
      setInfo("Sala resetada (tudo zerado).");
    }

    // ===============================
    // Avaliação (oculta)
    // ===============================
    function openRatingModal(){
      const m = me();
      if(!m) return alert("Inscreva-se para avaliar.");
      // Não exigimos presença para avaliar (permite avaliar mesmo após "Nova rodada").

      $("ratingBack").classList.remove("hidden");
      $("rateMe").textContent = "Você: " + m.name + " (avaliações ocultas)";

      // ✅ lista todos os cadastrados (exceto você)
      const sel = $("rateTarget");
      sel.innerHTML = `<option value="">Selecione</option>`;
      for(const p of Object.values(state.players||{})){
        if(p.id === m.id) continue;
        // (não filtramos por presença)
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        sel.appendChild(opt);
      }

      window.__score = 8;
      renderScoreButtons();
    }
    async function openRatingFlow(){
      try{
        let m = me();
        if(!m) m = await ensureMeLoaded();
        if(!m) return alert("Inscreva-se para avaliar.");
        const scoreFromProfile = clamp(Number(document.getElementById("myNoteSelect")?.value || m.baseNote || RATE_BASELINE), MIN_NOTA, MAX_NOTA);
        if(!hasSelfRatedCurrentRound(m)){
          await markSelfRatedNow(m, scoreFromProfile);
          setInfo("<b>Nota atualizada.</b> Você pode continuar avaliando os jogadores normalmente.");
        }
        openRatingModal();
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    function closeRatingModal(){ $("ratingBack").classList.add("hidden"); }

    function renderScoreButtons(){
      const row = $("scoreRow");
      row.innerHTML = "";
      for(let n=MIN_NOTA; n<=MAX_NOTA; n++){
        const btn = document.createElement("button");
        btn.className = "px-3 py-2 rounded-lg border " + (window.__score===n ? "bg-gray-900 text-white border-gray-900" : "bg-white hover:bg-gray-50");
        btn.textContent = String(n);
        btn.onclick = ()=>{ window.__score = n; renderScoreButtons(); };
        row.appendChild(btn);
      }
    }

    async function sendRating(){
      try{
        const m = me();
        if(!m) return;
        // Não exigimos presença para avaliar (permite avaliar mesmo após "Nova rodada").
        const targetId = $("rateTarget").value;
        if(!targetId) return alert("Selecione quem avaliar.");
        if(targetId === m.id) return alert("Você não pode se avaliar.");

        const score = clamp(Number(window.__score || 8), MIN_NOTA, MAX_NOTA);
        const id = m.id + "_" + targetId; // 1 nota por par (sobrescreve)
        const rating = { id, raterId: m.id, targetId, score, createdAt: nowIso() };

        await setRating(state.code, rating);
        closeRatingModal();
        setInfo("Avaliação enviada.");
      }catch(e){ setSyncError(e && e.message ? e.message : e); }
    }

    // ===============================
    // Compartilhar (admin) + Histórico + PNG
    // ===============================
    function buildTeamsPayloadFromCurrent(){
      const playersArr = Object.values(state.players||{});
      const byTarget = byTargetScores(state.ratings||{});

      // ✅ só presentes e com time
      const t1 = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)===1);
      const t2 = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)===2);

      const avg1 = teamAvg(t1, byTarget);
      const avg2 = teamAvg(t2, byTarget);

      const team1 = t1.map(p=>({
        name: p.name,
        position: p.position || "",
        note: Number(computedNote(p, byTarget).toFixed(1))
      }));
      const team2 = t2.map(p=>({
        name: p.name,
        position: p.position || "",
        note: Number(computedNote(p, byTarget).toFixed(1))
      }));

      return {
        id: "",
        code: String(state.code||"").toUpperCase(),
        roundId: String(state.activeRoundId||""),
        createdAt: nowIso(),
        createdAtMs: Date.now(),
        by: (me() ? me().name : ""),
        matchLabel: getMatchScheduleMeta().hasSchedule ? getMatchScheduleMeta().matchLabel : "",
        matchLocation: state.matchLocation || "",
        avg1: Number(avg1.toFixed(2)),
        avg2: Number(avg2.toFixed(2)),
        team1,
        team2
      };
    }

    function formatTeamsText(payload){
      const code = payload.code || "";
      const team1 = payload.team1 || [];
      const team2 = payload.team2 || [];
      const avg1 = (payload.avg1 ?? 0).toFixed(2);
      const avg2 = (payload.avg2 ?? 0).toFixed(2);

      const left = [
        `TIME 1 (média ${avg1})`,
        ...team1.map(p => `${p.name}${p.position ? " ("+p.position+")" : ""} - ${Number(p.note).toFixed(1)}`)
      ];
      const right = [
        `TIME 2 (média ${avg2})`,
        ...team2.map(p => `${p.name}${p.position ? " ("+p.position+")" : ""} - ${Number(p.note).toFixed(1)}`)
      ];

      const width = Math.min(42, Math.max(...left.map(s=>s.length), 18));
      const rows = Math.max(left.length, right.length);
      const lines = [];
      for(let i=0;i<rows;i++){
        const L = (left[i] || "").padEnd(width, " ");
        const R = (right[i] || "");
        lines.push(L + " | " + R);
      }

      const header = `🏐 TIMES - ${code}\n🗓️ ${when}\n\n`;
      const body = "```\n" + lines.join("\n") + "\n```";
      return header + body;
    }

    async function copyToClipboard(text){
      try{
        await navigator.clipboard.writeText(text);
        setInfo("Tabela copiada. Agora é só colar no WhatsApp.");
      }catch{
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try{
          document.execCommand("copy");
          setInfo("Tabela copiada. Agora é só colar no WhatsApp.");
        }catch{
          alert("Não consegui copiar automaticamente. Selecione e copie manualmente.");
        }
        document.body.removeChild(ta);
      }
    }

    function openWhatsAppWithText(text){
      const url = "https://wa.me/?text=" + encodeURIComponent(text);
      window.open(url, "_blank");
    }

    function baseSiteUrl(){
      try{
        return (location.origin || "") + (location.pathname || "");
      }catch{
        return "";
      }
    }

    function buildInviteMessage(nome, sala, codigoJogador){
  const sched = getMatchScheduleMeta();
  const linkSala = buildRoomUrl(sala);
  const lines = [
    `MANCHETTE VOLLEYBALL`,
    `SEU ACESSO`,
    `Nome: ${nome}`,
    `Sala: ${sala}`,
    `Código do Jogador: ${codigoJogador}`,
    linkSala ? `Link direto: ${linkSala}` : ``
  ];

  if(sched.hasSchedule){
    lines.push(`PARTIDA: ${sched.matchLabel}`);
  }
  if(state.matchLocation){
    lines.push(`LOCAL: ${state.matchLocation}`);
  }

  lines.push(
    `COMO USAR (rápido): `,
    `1) Abra o site`,
    ` 2) Clique em ENTRAR e digite o código da sala: ${sala}`,
    `3) Em "Já se inscreveu?", digite o seu Código do Jogador: ${codigoJogador}`,
    `4) Confirme PRESENÇA `,
    `5) Escolha o TIME (1 ou 2) `,
    `6) Avalie jogadores (nota oculta 5–10) `,
    `DICA: - A "Minha nota" é sua autoavaliação (5–10). - Você pode atualizar depois em "Atualizar minha inscrição".`
  );

  return lines.join("\n");
}


function openWhatsApp(text, numberDigits){
  const base = numberDigits ? ("https://wa.me/" + numberDigits + "?text=") : "https://wa.me/?text=";
  window.open(base + encodeURIComponent(text), "_blank");
}



    async function copyCurrentTeams(){
      if(!session.admin) return alert("Somente o admin pode compartilhar/baixar.");
      const payload = buildTeamsPayloadFromCurrent();
      if((payload.team1.length + payload.team2.length) === 0) return alert("Ainda não há times montados para copiar.");
      const text = formatTeamsText(payload);
      await copyToClipboard(text);
    }

    function whatsCurrentTeams(){
      if(!session.admin) return alert("Somente o admin pode compartilhar/baixar.");
      const payload = buildTeamsPayloadFromCurrent();
      if((payload.team1.length + payload.team2.length) === 0) return alert("Ainda não há times montados para enviar.");
      const text = formatTeamsText(payload);
      openWhatsAppWithText(text);
    }

    async function saveTeamsSnapshot(){
      if(!session.admin) return alert("Somente o admin pode compartilhar/baixar.");
      const code = String(state.code||"").toUpperCase();
      if(!code) return;

      const payload = buildTeamsPayloadFromCurrent();
      if((payload.team1.length + payload.team2.length) === 0) return alert("Ainda não há times para salvar.");

      const id = safeId();
      payload.id = id;

      try{
        await snapshotsCol(code).doc(id).set(payload, { merge:false });
        setInfo("Times salvos no histórico.");
      }catch(e){
        setSyncError(e && e.message ? e.message : e);
      }
    }

    async function deleteSnapshot(id){
      if(!session.admin) return;
      const code = String(state.code||"").toUpperCase();
      if(!confirm("Excluir este registro do histórico?")) return;
      try{
        await snapshotsCol(code).doc(id).delete();
        setInfo("Registro excluído.");
      }catch(e){
        setSyncError(e && e.message ? e.message : e);
      }
    }

    function snapshotTextById(id){
      const s = state.snapshots && state.snapshots[id] ? state.snapshots[id] : null;
      if(!s) return "";
      return formatTeamsText(s);
    }

    function buildExportElement(payload){
      const wrap = document.createElement("div");
      wrap.style.width = "1100px";
      wrap.style.background = "#ffffff";
      wrap.style.padding = "24px";
      wrap.style.borderRadius = "18px";
      wrap.style.fontFamily = "system-ui,-apple-system,Segoe UI,Roboto,Arial";
      wrap.style.color = "#111827";

      const code = payload.code || "";
      const matchLabel = payload.matchLabel || "";
      const matchLocation = payload.matchLocation || "";
      const avg1 = (payload.avg1 ?? 0).toFixed(2);
      const avg2 = (payload.avg2 ?? 0).toFixed(2);

      function col(title, color, avg, list){
        const rows = (list||[]).map(p => `
          <div style="border:1px solid #e5e7eb;border-radius:16px;padding:14px 16px;margin-bottom:12px;">
            <div style="font-weight:800;font-size:18px;">${escapeHtml(p.name||"")}</div>
            <div style="margin-top:4px;font-size:14px;color:#374151;">
              ${escapeHtml(p.position||"")} · Nota ${Number(p.note||0).toFixed(1)}
            </div>
          </div>
        `).join("") || `<div style="font-size:14px;color:#6b7280;">Vazio</div>`;

        return `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div style="font-size:28px;font-weight:900;color:${color};">${title}</div>
              <div style="font-size:16px;color:#374151;">Média: ${avg}</div>
            </div>
            ${rows}
          </div>
        `;
      }

      wrap.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;">
          <div style="font-size:30px;font-weight:950;">🏐 Manchette VolleyBall</div>
          <div style="text-align:right;font-size:14px;color:#374151;">
            <div><b>Código:</b> ${escapeHtml(code)}</div>
            ${matchLabel ? `<div><b>Partida:</b> ${escapeHtml(matchLabel)}</div>` : ``}
            ${matchLocation ? `<div><b>Local:</b> ${escapeHtml(matchLocation)}</div>` : ``}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
          ${col("Time 1", "#2563eb", avg1, payload.team1)}
          ${col("Time 2", "#ea580c", avg2, payload.team2)}
        </div>
      `;
      return wrap;
    }

    async function downloadTeamsPng(){
      if(!session.admin) return alert("Somente o admin pode compartilhar/baixar.");
      if(typeof html2canvas !== "function") return alert("Biblioteca de exportação não carregou. Recarregue a página.");
      const payload = buildTeamsPayloadFromCurrent();
      if((payload.team1.length + payload.team2.length) === 0) return alert("Ainda não há times para baixar.");

      const temp = buildExportElement(payload);
      temp.style.position = "fixed";
      temp.style.left = "-10000px";
      temp.style.top = "0";
      document.body.appendChild(temp);

      try{
        const canvas = await html2canvas(temp, { scale: 2, backgroundColor: "#ffffff" });
        const code = payload.code || "times";
        const stamp = new Date().toISOString().slice(0,10);
        canvas.toBlob((blob)=>{
          if(!blob) return alert("Não consegui gerar o PNG.");
          const a = document.createElement("a");
          const url = URL.createObjectURL(blob);
          a.href = url;
          a.download = `times-${code}-${stamp}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(()=>URL.revokeObjectURL(url), 2000);
          setInfo("PNG baixado.");
        }, "image/png");
      }catch(e){
        alert("Falha ao gerar PNG: " + (e && e.message ? e.message : e));
      }finally{
        document.body.removeChild(temp);
      }
    }

    // ===============================
    // UI builders
    // ===============================
    function playerCard(p, byTarget, meId, isAdmin){
      const note = computedNote(p, byTarget).toFixed(1);
      const you = (meId && p.id===meId) ? `<span class="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">você</span>` : "";
      const del = (isAdmin && (!meId || p.id!==meId)) ? `
        <button data-del="${p.id}" data-name="${escapeHtml(p.name)}" class="px-2 py-1 rounded-lg border hover:bg-gray-50 text-[11px]">
          Remover
        </button>` : "";
      return `
        <div class="rounded-lg border p-2 flex items-center justify-between gap-2 bg-white">
          <div>
            <div class="font-semibold text-sm">${escapeHtml(p.name)}</div>
            <div class="text-[11px] text-gray-600">${escapeHtml(p.position)} · Nota ${note}</div>
          </div>
          <div class="flex items-center gap-2">
            ${you}
            ${del}
          </div>
        </div>
      `;
    }

    function waitingCard(p, byTarget, meId, isAdmin){
      const note = computedNote(p, byTarget).toFixed(1);
      const isMe = (meId && p.id===meId);
      const del = (isAdmin && !isMe) ? `
        <button data-del="${p.id}" data-name="${escapeHtml(p.name)}" class="px-2 py-1 rounded-lg border hover:bg-gray-50 text-[11px]">
          Remover
        </button>` : "";
      return `
        <div class="rounded-lg border p-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-white">
          <div>
            <div class="font-semibold text-sm">${escapeHtml(p.name)}</div>
            <div class="text-[11px] text-gray-600">${escapeHtml(p.position)} · Nota ${note}</div>
          </div>
          <div class="flex items-center gap-2">
            <div class="text-xs text-gray-500">${isMe ? "Você confirmou presença e ainda não escolheu time." : "Apenas o próprio jogador escolhe."}</div>
            ${del}
          </div>
        </div>
      `;
    }

    function absentCard(p, byTarget, meId, isAdmin){
      const note = computedNote(p, byTarget).toFixed(1);
      const isMe = (meId && p.id===meId);
      const you = isMe ? `<span class="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-700">você</span>` : "";
      const del = (isAdmin && !isMe) ? `
        <button data-del="${p.id}" data-name="${escapeHtml(p.name)}" class="px-2 py-1 rounded-lg border hover:bg-gray-50 text-[11px]">
          Remover
        </button>` : "";
      return `
        <div class="rounded-lg border p-2 flex items-center justify-between gap-2 bg-white">
          <div>
            <div class="font-semibold text-sm">${escapeHtml(p.name)}</div>
            <div class="text-[11px] text-gray-600">${escapeHtml(p.position)} · Nota ${note}</div>
          </div>
          <div class="flex items-center gap-2">
            ${you}
            ${del}
          </div>
        </div>
      `;
    }

    function renderLobby(savedGroups, allSavedGroupsCount, groupsLimit){
      const mode = accessMode();
      const canCreate = canCreateRooms();
      const modeText = mode === "developer"
        ? "Você entra com acesso global, sem precisar agir como jogador dentro da sala."
        : mode === "admin"
          ? "Os controles administrativos já ficam liberados quando você entra na sala."
          : "Modo ideal para participantes confirmarem presença, escolherem time e avaliarem.";
      return `
        <div class="mt-6 rounded-2xl border bg-gray-50 p-4">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 class="font-bold text-gray-800">Escolha seu tipo de acesso</h3>
              <p class="text-sm text-gray-600">Modo atual: <b>${escapeHtml(accessModeLabel())}</b>. ${escapeHtml(modeText)}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              ${mode !== 'player' ? `<button id="btnAccessLogout" class="px-3 py-2 rounded-lg border hover:bg-white text-sm font-semibold">Voltar para Jogador</button>` : ``}
            </div>
          </div>
          <div class="mt-4 grid gap-3 lg:grid-cols-3">
            <div class="rounded-2xl border bg-white p-4">
              <div class="text-sm font-bold text-sky-700">Jogador</div>
              <p class="mt-1 text-xs text-gray-600">Para entrar na sala, confirmar presença, escolher time e avaliar.</p>
              <button id="btnAccessPlayer" class="mt-3 w-full px-3 py-2 rounded-lg bg-sky-600 text-white hover:bg-sky-700 font-semibold">Entrar como Jogador</button>
            </div>
            <div class="rounded-2xl border bg-white p-4">
              <div class="text-sm font-bold text-gray-800">Admin</div>
              <p class="mt-1 text-xs text-gray-600">Para organizar uma sala específica. A senha será pedida apenas ao entrar na sala.</p>
              <button id="btnAccessAdmin" class="mt-3 w-full px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 font-semibold">Entrar como Admin</button>
            </div>
            <div class="rounded-2xl border bg-white p-4">
              <div class="text-sm font-bold text-amber-700">Desenvolvedor</div>
              <p class="mt-1 text-xs text-gray-600">Acesso mestre ao sistema inteiro, salas, planos e suporte.</p>
              <input id="homeDeveloperPass" type="password" placeholder="Senha Desenvolvedor" class="mt-3 w-full px-3 py-2 rounded-lg border" />
              <button id="btnAccessDeveloper" class="mt-2 w-full px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 font-semibold">Entrar como Desenvolvedor</button>
            </div>
          </div>
        </div>

        <div class="mt-6 grid gap-3 sm:grid-cols-3">
          <div class="flex gap-2 sm:col-span-2">
            <input id="roomCode" placeholder="Código da partida (ex.: A2K9ZP)" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" class="flex-1 px-3 py-2 rounded-lg border" />
            <button id="btnPasteJoin" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold whitespace-nowrap">Colar e entrar</button>
          </div>
          <div class="flex gap-2">
            <button id="btnJoin" class="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold">Entrar</button>
            <button id="btnCreate" class="flex-1 px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold ${canCreate ? '' : 'opacity-50 cursor-not-allowed'}" ${canCreate ? '' : 'disabled'}>Criar nova</button>
          </div>
        </div>
        <div class="mt-3 text-sm text-gray-600">
          Dica: use sempre o mesmo código da sala para manter as notas de semana a semana. ${canCreate ? '' : 'A criação de nova sala fica liberada para Admin e Desenvolvedor.'}
        </div>

        <div class="mt-5 rounded-2xl border bg-gray-50 p-4">
          <div class="flex items-center justify-between gap-2">
            <div>
              <h3 class="font-bold text-gray-800">Salas recentes</h3>
              <p class="text-xs text-gray-500">Salas que você usou recentemente para entrar com um toque.</p>
            </div>
            <span class="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-700">${allSavedGroupsCount}/${groupsLimit >= 999 ? '∞' : groupsLimit} grupo(s)</span>
          </div>

          ${savedGroups.length ? `
            <div class="mt-3 space-y-2">
              ${savedGroups.map(g => `
                <div class="rounded-xl border bg-white p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div class="font-semibold text-gray-800">${escapeHtml(g.roomName || ('Grupo ' + g.code))}</div>
                    <div class="text-xs text-gray-500">Sala ${escapeHtml(g.code)}${g.roomSubtitle ? ' · ' + escapeHtml(g.roomSubtitle) : ''}</div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button data-open-group="${escapeHtml(g.code)}" class="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold">Abrir</button>
                    ${mode !== 'player' ? `<button data-delete-group="${escapeHtml(g.code)}" class="px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm font-semibold">Excluir</button>` : ``}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="mt-3 text-sm text-gray-500">Nenhuma sala recente ainda. Entre em uma sala e ela ficará salva aqui para acesso rápido.</div>
          `}
          ${!featureAllowed('multiGroups') ? `<div class="mt-3">${premiumLockCard('Grupos', 'No plano Free você salva 1 grupo. No Básico você libera até 3 e no PRO grupos praticamente ilimitados.', 'grupos')}</div>` : ``}
        </div>
        ${renderDeveloperRoomsPanel()}
      `;
    }


    function renderPlayerAccessBlock({ meObj, myNote, myPresent, myTeam, mySelfRated, team1Count, team2Count, remaining1, remaining2, waiting, fullTeams, bMsg }){
      const hasPlayerSession = accessMode() === "player" && !!session.playerId;
      const deviceRegistered = accessMode() === "player" && !!findRegisteredPlayerForThisDevice(state.players || {});

      if((hasPlayerSession || deviceRegistered) && !meObj){
        return `
          <div class="rounded-xl border bg-blue-50 p-3">
            <div class="text-sm font-extrabold text-blue-800">Reconectando seu acesso</div>
            <div class="mt-1 text-xs text-blue-700">Este celular já tem uma inscrição salva nesta sala. Aguarde alguns segundos ou toque abaixo para recuperar agora.</div>
            <button id="btnReconnectMe" class="mt-3 w-full px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold">
              Recuperar meu acesso
            </button>
          </div>
        `;
      }

      if(!meObj){
        return `
          ${(!session.prevPlayerId && deviceRegistered) ? `
            <div class="rounded-xl border bg-amber-50 p-3 text-sm text-amber-800">
              Este celular já possui uma inscrição nesta sala. Use <b>Recuperar meu acesso</b> ou peça para o Admin remover sua inscrição antes de cadastrar novamente.
            </div>
          ` : ``}
          <div class="grid gap-2">
            <input id="playerName" placeholder="Seu nome" class="px-3 py-2 rounded-lg border" />

            <div class="grid gap-1">
              <label class="text-sm text-gray-700 font-semibold">Minha nota (autoavaliação) · 5–10</label>
              <div class="grid grid-cols-2 gap-2">
                <select id="playerNote" class="px-3 py-2 rounded-lg border">
                  <option value="5" selected>Minha nota 5</option>
                  <option value="6">Minha nota 6</option>
                  <option value="7">Minha nota 7</option>
                  <option value="8">Minha nota 8</option>
                  <option value="9">Minha nota 9</option>
                  <option value="10">Minha nota 10</option>
                </select>
                <select id="playerPos" class="px-3 py-2 rounded-lg border">
                  ${POSICOES.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
                </select>
              </div>
            </div>

            <button id="btnRegister" class="px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold ${(state.open && !( !session.prevPlayerId && deviceRegistered )) ? "" : "opacity-50 cursor-not-allowed"}" ${(state.open && !( !session.prevPlayerId && deviceRegistered )) ? "" : "disabled"}>
              Entrar na lista
            </button>

            <button id="btnRegisterSendWA" class="px-3 py-2 rounded-lg bg-green-700 text-white hover:bg-green-800 font-semibold ${(state.open && !( !session.prevPlayerId && deviceRegistered )) ? "" : "opacity-50 cursor-not-allowed"}" ${(state.open && !( !session.prevPlayerId && deviceRegistered )) ? "" : "disabled"}>
              📲 Enviar Inscrição
            </button>
          </div>

          ${session.prevPlayerId ? `
            <button id="btnBackToMe" class="mt-3 w-full px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">
              Voltar para meu jogador
            </button>
          ` : ``}

          <div class="mt-3 rounded-xl border bg-gray-50 p-3">
            <div class="text-sm font-extrabold text-gray-800">Já se inscreveu?</div>
            <div class="mt-1 text-xs text-gray-600">Digite seu <b>Código do Jogador</b> para recuperar sua inscrição neste aparelho.</div>
            <div class="mt-2 flex gap-2">
              <input id="accessCodeInput" placeholder="Ex.: A1B2C3D4E5" class="px-2 py-1.5 rounded-lg border flex-1 font-mono tracking-wider text-sm" />
              <button id="btnClaimAccessCode" class="px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold text-sm">Entrar</button>
            </div>
          </div>
          <div class="text-xs text-gray-500 mt-2">Dica: ao se inscrever, anote seu Código do Jogador.</div>
        `;
      }

      return `
        <div class="text-xs text-gray-600">Você já está logado. Para inscrever outra pessoa, use <b>Adicionar jogador</b>.</div>

        <div class="text-sm text-gray-700">
          Logado como <span class="font-semibold">${escapeHtml(meObj.name)}</span> · Nota ${myNote} ·
          ${myPresent ? `<span class="text-green-700 font-semibold">Presente</span>` : `<span class="text-gray-500 font-semibold">Ausente</span>`}
          ${myTeam ? ` · Time ${myTeam}` : ``}
        </div>

        <div class="mt-2 flex gap-2">
          <button id="btnPresent" class="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold ${(state.open && !myPresent) ? "" : "opacity-50 cursor-not-allowed"}" ${(state.open && !myPresent) ? "" : "disabled"}>
            Confirmar presença
          </button>
          <button id="btnAbsent" class="flex-1 px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold ${(state.open && myPresent) ? "" : "opacity-50 cursor-not-allowed"}" ${(state.open && myPresent) ? "" : "disabled"}>
            Marcar ausência
          </button>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-2">
          <button id="btnAddPlayer" class="px-3 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 font-semibold">
            Adicionar jogador
          </button>
          ${session.prevPlayerId ? `
            <button id="btnBackToMe2" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">
              Voltar para meu jogador
            </button>
          ` : `
            <button class="px-3 py-2 rounded-lg border text-gray-400 cursor-not-allowed" disabled>
              Voltar para meu jogador
            </button>
          `}
        </div>

        <div class="mt-1 text-xs text-gray-600">
          Dica: use <b>Adicionar jogador</b> para inscrever alguém pelo seu celular e passe o <b>Código do Jogador</b> para ele recuperar no aparelho dele.
        </div>

        <div class="border-t pt-3">
          <div class="grid gap-2">
            <div class="mt-3 px-3 py-2 rounded-xl border bg-gradient-to-r from-blue-50 to-orange-50 text-center text-base sm:text-lg font-extrabold text-blue-700">
              🏐 <span class="text-orange-600">Escolha seu Time</span> 👇
            </div>

            <div class="flex flex-wrap gap-2">
              <button id="btnTeam1" class="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold ${(meObj && myPresent && state.open && (!fullTeams || myTeam!=null)) ? "" : "opacity-50 cursor-not-allowed"}" ${(meObj && myPresent && state.open && (!fullTeams || myTeam!=null)) ? "" : "disabled"}>${escapeHtml((state.team1Name||"Time 1"))} (${team1Count}/${TEAM_MAX})</button>
              <button id="btnTeam2" class="px-3 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 font-semibold ${(meObj && myPresent && state.open && (!fullTeams || myTeam!=null)) ? "" : "opacity-50 cursor-not-allowed"}" ${(meObj && myPresent && state.open && (!fullTeams || myTeam!=null)) ? "" : "disabled"}>${escapeHtml((state.team2Name||"Time 2"))} (${team2Count}/${TEAM_MAX})</button>
            </div>

            <div class="text-xs text-gray-600">
              Vagas: <span class="font-semibold text-blue-700">${remaining1}</span> no ${escapeHtml((state.team1Name||"Time 1"))} ·
              <span class="font-semibold text-orange-700">${remaining2}</span> no ${escapeHtml((state.team2Name||"Time 2"))} ·
              <span class="font-semibold">${waiting.length}</span> em espera
            </div>

            <button id="btnRate" class="w-full px-3 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 font-semibold">Dar nota / avaliar jogadores</button>
          </div>

          ${bMsg.text ? `
            <div class="mt-3 p-3 rounded-xl ${bMsg.ok ? "bg-green-50" : "bg-yellow-50"} border">
              <div class="text-sm font-semibold text-center">${escapeHtml(bMsg.text)}</div>
            </div>
          ` : ``}
        </div>

        <div class="mt-3 rounded-xl border bg-white p-3">
          <div class="text-sm font-extrabold text-gray-800">Atualizar minha inscrição</div>
          <div class="mt-2">
            <input id="myNameInput" class="w-full px-3 py-2 rounded-lg border" placeholder="Meu nome" value="${escapeHtml(meObj.name||"")}" />
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <select id="myNoteSelect" class="px-3 py-2 rounded-lg border">
              ${[5,6,7,8,9,10].map(n=>`<option value="${n}" ${clamp(Number(meObj.baseNote||5), MIN_NOTA, MAX_NOTA)===n?'selected':''}>Minha nota ${n}</option>`).join("")}
            </select>
            <select id="myPosSelect" class="px-3 py-2 rounded-lg border">
              ${POSICOES.map(p=>`<option value="${escapeHtml(p)}" ${(meObj.position||"Coringa")===p?'selected':''}>${escapeHtml(p)}</option>`).join("")}
            </select>
          </div>
          <button id="btnSaveMyProfile" class="mt-2 w-full px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 font-semibold">
            Salvar inscrição
          </button>
          <div class="mt-2 text-xs text-gray-500">Atualize nome, nota e posição sem sair da sala.</div>
        </div>

        <div class="mt-3 rounded-xl border bg-white p-3">
          <div class="text-sm font-extrabold text-gray-800">Meu Código do Jogador</div>
          <div class="mt-1 text-xs text-gray-500">Use este código para entrar na mesma inscrição em outro celular/PC.</div>
          <div class="mt-2 flex items-center gap-2">
            <div class="flex-1 px-2 py-1.5 rounded-lg border bg-gray-50 font-mono tracking-wider text-center text-sm">
              ${meObj.accessCode ? escapeHtml(meObj.accessCode) : "—"}
            </div>
            <button id="btnCopyMyAccessCode" class="px-2 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-800 font-semibold text-sm ${meObj.accessCode ? "" : "opacity-50 cursor-not-allowed"}" ${meObj.accessCode ? "" : "disabled"}>
              Copiar
            </button>
          </div>
          ${!meObj.accessCode ? `
            <button id="btnGenMyAccessCode" class="mt-2 w-full px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold text-sm">
              Gerar meu código
            </button>
          ` : ``}
        </div>

        <button id="btnSairLista" class="w-full px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 font-semibold">
          Sair da lista
        </button>

        ${myPresent ? `` : `
          <div class="mt-2 text-sm text-gray-600">
            Para jogar nesta rodada, clique em <b>Confirmar presença</b>.
          </div>
        `}
      `;
    }


    function render(){
      const app = $("app");
      const code = (state.code || "").toUpperCase();
      const roundLabel = state.activeRoundAtMs ? fmtBR(state.activeRoundAtMs) : "";
      const scheduleMeta = getMatchScheduleMeta();
      const matchLabel = scheduleMeta.hasSchedule ? scheduleMeta.matchLabel : "";
      const closeLabel = scheduleMeta.hasClose ? scheduleMeta.closeLabel : "";
      const countdownLabel = scheduleMeta.hasSchedule ? scheduleMeta.countdownLabel : "";

      const playersArr = Object.values(state.players||{});
      const byTarget = byTargetScores(state.ratings||{});
      const plan = currentPlan();
      const planName = planLabel(plan);
      const accessName = accessModeLabel();
      const groupsLimit = maxGroupsForPlan(plan);
      const savedGroups = getSavedGroupsForCurrentPlan();
      const allSavedGroupsCount = getSavedGroups().length;
      const roomDisplayName = (state.roomName || "").trim() || "Manchette Volleyball";
      const roomSubtitle = (state.roomSubtitle || "").trim();
      const team1Label = (state.team1Name || "").trim() || "Time 1";
      const team2Label = (state.team2Name || "").trim() || "Time 2";
      const canUseHistory = featureAllowed("history");
      const canUseRanking = featureAllowed("ranking");
      const canUseStats = featureAllowed("stats");
      const canUseReports = featureAllowed("reports");
      const canUseCustomization = featureAllowed("customization");
      const rankingLimit = plan === "basico" ? 5 : 999;

      try{ document.title = state.code ? `${roomDisplayName} | ${String(state.code).toUpperCase()}` : "Manchette Volleyball"; }catch{}

      const meObj = me();
      const myNote = meObj ? computedNote(meObj, byTarget).toFixed(1) : "";
      const myPresent = meObj ? isPresent(meObj.id) : false;
      const myTeam = meObj ? teamOf(meObj.id) : null;
      const mySelfRated = meObj ? hasSelfRatedCurrentRound(meObj) : false;
      const hasPlayerSession = accessMode() === "player" && !!session.playerId;

      const presentPlayers = playersArr.filter(p=> isPresent(p.id));
      const team1 = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)===1);

      const team2 = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)===2);
      const waiting = playersArr.filter(p=> isPresent(p.id) && teamOf(p.id)==null);
      const absent = playersArr.filter(p=> !isPresent(p.id));
      const team1Count = team1.length;
      const team2Count = team2.length;
      const totalAssigned = team1Count + team2Count;
      const remaining1 = Math.max(0, TEAM_MAX - team1Count);
      const remaining2 = Math.max(0, TEAM_MAX - team2Count);
      const fullTeams = totalAssigned >= TEAM_MAX*2;


      const t1Avg = teamAvg(team1, byTarget).toFixed(2);
      const t2Avg = teamAvg(team2, byTarget).toFixed(2);
      const bMsg = balanceMessage(team1, team2, byTarget);
      const rankingData = buildRankingData(playersArr, byTarget);
      const dashboardStats = computeDashboardStats(playersArr, presentPlayers, waiting, team1, team2, byTarget);
      const historyData = snapshotsArray();
      const historyVisible = canUseHistory ? historyData.slice(0, plan === "basico" ? 5 : 10) : [];
      const commercialSummary = roomMetaSummary(state);
      const commercialAlertHtml = commercialAlertBoxHtml(state);

      const openBadge = state.open
        ? `<span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">INSCRIÇÃO ABERTA</span>`
        : `<span class="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">FECHADA</span>`;

      app.innerHTML = `
        <div class="bg-white rounded-2xl shadow p-4 sm:p-6">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-gray-800">🏐 ${escapeHtml(roomDisplayName)}</h1>
              <p class="text-sm text-gray-500">${roomSubtitle ? escapeHtml(roomSubtitle) + " · " : ""}Rodada atual: <b>${escapeHtml(roundLabel || "—")}</b></p>
              ${scheduleMeta.hasSchedule ? `
                <div class="mt-1 space-y-1 text-sm text-gray-600">
                  <div>⏰ Próxima partida: <b>${escapeHtml(matchLabel)}</b></div>
                  ${state.matchLocation ? `<div>📍 Local: <b>${escapeHtml(state.matchLocation)}</b></div>` : ``}
                  <div>🕒 Inscrições até: <b>${escapeHtml(closeLabel)}</b></div>
                  <div>⌛ Faltam <b>${escapeHtml(countdownLabel)}</b></div>
                </div>
              ` : ``}
              ${state.room ? `` : ``}
            </div>

            <div class="flex flex-wrap gap-2 items-center">
              ${code ? `
                <span class="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                  <span class="text-gray-500">Código:</span>
                  <span class="font-semibold tracking-widest">${escapeHtml(code)}</span>
                </span>
                <button id="btnCopy" class="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 font-semibold">Copiar</button>
                <button id="btnLeave" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">Sair</button>
              ` : ``}
            </div>
          </div>

          ${state.info ? `
            <div class="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-900">
              ${safeBoldInfo(state.info)}
            </div>
          ` : ``}

          ${commercialAlertHtml}

          ${state.syncError ? `
            <div class="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              <b>Erro:</b> ${escapeHtml(state.syncError)}<br/>
              Se aparecer <b>Missing or insufficient permissions</b>, ajuste as Rules do Firestore no Firebase Console.
            </div>
          ` : ``}

          ${!code ? `${renderLobby(savedGroups, allSavedGroupsCount, groupsLimit)}` : `
            <div class="mt-4 grid gap-4 lg:grid-cols-3">
              <div class="lg:col-span-1 bg-white rounded-2xl border p-4 space-y-3">
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-semibold">Inscrição</h2>
                  ${openBadge}
                </div>

                ${renderPlayerAccessBlock({ meObj, myNote, myPresent, myTeam, mySelfRated, team1Count, team2Count, remaining1, remaining2, waiting, fullTeams, bMsg })}

                ${session.admin ? `
                <div class="border-t pt-3">
                  <h3 class="font-semibold mb-2">Compartilhar</h3>

                    <div class="flex flex-wrap gap-2">
                      <button id="btnCopyTeams" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold ${(team1.length+team2.length) ? "" : "opacity-50 cursor-not-allowed"}" ${(team1.length+team2.length) ? "" : "disabled"}>Copiar tabela</button>
                      <button id="btnWATeams" class="px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold ${(team1.length+team2.length) ? "" : "opacity-50 cursor-not-allowed"}" ${(team1.length+team2.length) ? "" : "disabled"}>WhatsApp</button>
                      <button id="btnDownloadPng" class="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold ${(team1.length+team2.length) ? "" : "opacity-50 cursor-not-allowed"}" ${(team1.length+team2.length) ? "" : "disabled"}>Baixar lista</button>
                      <button id="btnSaveTeams" class="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 font-semibold ${(team1.length+team2.length) ? "" : "opacity-50 cursor-not-allowed"}" ${(team1.length+team2.length) ? "" : "disabled"}>Salvar no histórico</button>
                    </div>
                    <div class="mt-2 text-xs text-gray-500">Somente admin. Copie/manda no WhatsApp (texto) ou baixar lista.</div>

                    <div class="mt-4">
                      <div class="flex items-center justify-between">
                        <div class="font-semibold">Histórico (últimos 10)</div>
                        <div class="text-xs text-gray-500">${Object.keys(state.snapshots||{}).length} salvo(s)</div>
                      </div>

                      ${Object.keys(state.snapshots||{}).length ? `
                        <div class="mt-2 space-y-2">
                          ${Object.values(state.snapshots||{}).sort((a,b)=>(b.createdAtMs||0)-(a.createdAtMs||0)).slice(0,3).map(s => `
                            <div class="rounded-xl border p-3">
                              <div class="flex items-center justify-between gap-2">
                                <div class="text-sm font-semibold">${escapeHtml(fmtBR(s.createdAtMs || s.createdAt))}${s.by ? ` · ${escapeHtml(s.by)}` : ""}</div>
                                <div class="flex flex-wrap gap-2">
                                  <button data-snapcopy="${s.id}" class="px-2 py-1 rounded-lg border hover:bg-gray-50 text-xs">Copiar</button>
                                  <button data-snapwa="${s.id}" class="px-2 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 text-xs font-semibold">WhatsApp</button>
                                  <button data-snapdel="${s.id}" class="px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-semibold">Excluir</button>
                                </div>
                              </div>

                              <div class="mt-2 grid grid-cols-2 gap-3 text-xs text-gray-700">
                                <div>
                                  <div class="font-semibold text-blue-700">Time 1</div>
                                  ${(s.team1||[]).length ? (s.team1||[]).map(p => `<div>${escapeHtml(p.name)} · ${Number(p.note).toFixed(1)}</div>`).join("") : `<div class="text-gray-500">Vazio</div>`}
                                </div>
                                <div>
                                  <div class="font-semibold text-orange-700">Time 2</div>
                                  ${(s.team2||[]).length ? (s.team2||[]).map(p => `<div>${escapeHtml(p.name)} · ${Number(p.note).toFixed(1)}</div>`).join("") : `<div class="text-gray-500">Vazio</div>`}
                                </div>
                              </div>
                            </div>
                          `).join("")}
                        </div>
                        <div class="mt-2 text-xs text-gray-500">Mostrando os 3 mais recentes.</div>
                      ` : `
                        ${canUseHistory ? `<div class="mt-2 text-sm text-gray-500">Ainda não há times salvos.</div>` : `<div class="mt-2">${premiumLockCard("Histórico de partidas", "No plano Free o histórico fica bloqueado. Libere no Básico ou PRO.", "histórico de partidas")}</div>`}
                      `}
                    </div>
                  </div>
                ` : ``}

                <div class="border-t pt-3">
                  <div class="flex items-center justify-between gap-2 mb-2"><h3 class="font-semibold">Grupos</h3><span class="text-[11px] px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">${roomGroupsArray().length}/${groupsLimit >= 999 ? "∞" : groupsLimit}</span></div>
                  <div class="rounded-xl border p-3 bg-gray-50">
                    <div class="flex items-center justify-between gap-2">
                      <div class="text-sm text-gray-700">
                        <div class="font-semibold">${activeInternalGroupLabel() ? escapeHtml(activeInternalGroupLabel()) : 'Grupo atual sem nome salvo'}</div>
                        <div class="text-xs text-gray-500">Crie variações dentro desta sala.</div>
                      </div>
                      ${session.admin ? `<div class="flex flex-wrap gap-2"><button id="btnSaveGroup" class="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-semibold text-sm">Criar grupo</button>${activeInternalGroupLabel() ? `<button id="btnUpdateGroup" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold text-sm">Atualizar grupo</button>` : ``}</div>` : ``}
                    </div>
                    
                    ${roomGroupsArray().length ? `
                      <div class="mt-3 space-y-2">
                        ${roomGroupsArray().map(g => `
                          <div class="rounded-xl border bg-white p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${String(g.id||'')===String(state.activeInternalGroupId||'') ? 'border-indigo-300 ring-1 ring-indigo-200' : ''}">
                            <div>
                              <div class="font-semibold text-gray-800">${escapeHtml(g.name || ('Grupo ' + g.id))}</div>
                              <div class="text-xs text-gray-500">${g.roomSubtitle ? escapeHtml(g.roomSubtitle) + ' · ' : ''}Atualizado em ${escapeHtml(fmtBR(g.updatedAtMs || g.updatedAt || ''))}</div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                              ${session.admin ? `<button data-open-internal-group="${escapeHtml(g.id)}" class="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold">Abrir</button><button data-delete-internal-group="${escapeHtml(g.id)}" class="px-3 py-2 rounded-lg border hover:bg-gray-50 text-sm font-semibold">Excluir</button>` : ``}
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    ` : `<div class="mt-3 text-sm text-gray-500">Nenhum grupo interno salvo nesta sala ainda.</div>`}
                    ${!featureAllowed("multiGroups") ? `<div class="mt-3">${premiumLockCard("Mais grupos internos", "No plano Free você salva 1 grupo interno. No Básico você libera até 3 e no PRO grupos praticamente ilimitados.", "grupos internos")}</div>` : ``}
                  </div>
                </div>

                <div class="border-t pt-3">
                  ${session.admin ? `
                    <div class="text-sm text-green-700 font-semibold">✓ ${session.developer ? "Desenvolvedor ativo" : "Admin ativo"}</div>
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                      <button id="btnNotifToggleRoom" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold text-sm">${notificationsEnabled() ? "Desativar notificações" : "Ativar notificações"}</button>
                      <span class="text-xs text-gray-500">${escapeHtml(notificationStatusLabel())}</span>
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                      <button id="btnToggleOpen" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">${state.open ? "Fechar" : "Abrir"} inscrição</button>
                      <button id="btnNewRound" class="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-semibold">Nova rodada</button>
                      <button id="btnSort" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">Sortear equilibrado</button>
                      <button id="btnReset" class="px-3 py-2 rounded-lg bg-red-700 text-white hover:bg-red-800 font-semibold">Resetar</button>
                      <button id="btnAdminOut" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">${session.developer ? "Sair do modo Desenvolvedor" : "Sair do modo Admin"}</button>
                    </div>
                    <div class="text-xs text-gray-500 mt-2">
                      <b>Nova rodada</b>: todo mundo volta a <b>Ausente</b> e confirma presença novamente. <b>Resetar</b> zera tudo.
                    </div>
                    <div class="mt-3 rounded-xl border p-3 bg-gray-50"><div class="text-sm font-semibold">Plano da sala</div><div class="mt-2 text-xs text-gray-500">Plano atual: <b>${escapeHtml(planName)}</b>. A alteração de plano fica disponível somente no Painel do Desenvolvedor.</div></div>
                    <div class="mt-3 rounded-xl border p-3 bg-gray-50">
                      <div class="text-sm font-semibold">Horário da partida</div>
                      <div class="mt-2 grid gap-2 sm:grid-cols-2">
                        <input id="matchDate" type="date" value="${escapeHtml(state.matchDate || "")}" class="px-3 py-2 rounded-lg border" />
                        <input id="matchTime" type="time" value="${escapeHtml(state.matchTime || "")}" class="px-3 py-2 rounded-lg border" />
                      </div>
                      <div class="mt-2">
                        <label class="block text-xs font-semibold text-gray-600 mb-1">Local</label>
                        <input id="matchLocation" type="text" maxlength="20" value="${escapeHtml(state.matchLocation || "")}" class="px-3 py-2 rounded-lg border w-full" placeholder="Local" />
                      </div>
                      <div class="mt-2">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-semibold text-gray-600">Fecha em</span>
                          <input id="closeBeforeMin" type="number" min="0" step="5" value="${escapeHtml(String(state.closeBeforeMin ?? 15))}" class="px-3 py-2 rounded-lg border w-28" placeholder="0" />
                          <span class="text-sm font-semibold text-gray-600">m</span>
                        </div>
                      </div>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        <button id="btnSaveSchedule" class="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 font-semibold">Salvar horário</button>
                        <button id="btnClearSchedule" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">Limpar horário</button>
                      </div>
                      <div class="mt-2 text-xs text-gray-500">O sistema mostra a contagem regressiva e fecha a inscrição automaticamente no prazo definido.</div>
                    </div>

                    <div class="mt-3 rounded-xl border p-3 bg-gray-50">
                      <div class="text-sm font-semibold">Personalização</div>
                      ${canUseCustomization ? `
                        <div class="mt-2 grid gap-2">
                          <input id="roomNameInput" type="text" maxlength="40" value="${escapeHtml(state.roomName || "Manchette Volleyball")}" class="px-3 py-2 rounded-lg border" placeholder="Nome do grupo/app" />
                          <input id="roomSubtitleInput" type="text" maxlength="60" value="${escapeHtml(state.roomSubtitle || "")}" class="px-3 py-2 rounded-lg border" placeholder="Subtítulo do grupo" />
                          <div class="grid grid-cols-2 gap-2">
                            <input id="team1NameInput" type="text" maxlength="20" value="${escapeHtml(state.team1Name || "Time 1")}" class="px-3 py-2 rounded-lg border" placeholder="Nome do Time 1" />
                            <input id="team2NameInput" type="text" maxlength="20" value="${escapeHtml(state.team2Name || "Time 2")}" class="px-3 py-2 rounded-lg border" placeholder="Nome do Time 2" />
                          </div>
                          <div class="flex items-center gap-2">
                            <label class="text-xs font-semibold text-gray-600">Cor principal</label>
                            <input id="themeColorInput" type="color" value="${escapeHtml(state.themeColor || "#2563eb")}" class="h-10 w-20 rounded-lg border bg-white p-1" />
                          </div>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          <button id="btnSavePersonalization" class="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-semibold">Salvar personalização</button>
                          <button id="btnCopyRoomLink" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">Copiar link da sala</button>
                        </div>
                        <div class="mt-2 text-xs text-gray-500">Use isso para nomear grupos, deixar a interface mais profissional e compartilhar um link direto da sala.</div>
                      ` : `
                        <div class="mt-3">${premiumLockCard("Personalização avançada", "Libere nome do grupo, subtítulo, nomes dos times, cor principal e link profissional no plano PRO.", "personalização")}</div>
                        <div class="mt-2">
                          <button id="btnCopyRoomLink" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold">Copiar link da sala</button>
                        </div>
                      `}
                    </div>
                  ` : ``}
                </div>
              </div>

              <div class="lg:col-span-2 grid gap-4 md:grid-cols-2">
                <div class="bg-white rounded-2xl border p-3">
                  <div class="flex items-center justify-between">
                    <h2 class="text-lg font-bold text-blue-700">${escapeHtml(team1Label)} <span class="text-sm font-semibold text-gray-600">(${team1Count}/${TEAM_MAX})</span></h2>
                    <div class="text-sm text-gray-600">Média: ${t1Avg}</div>
                  </div>
                  <div class="mt-2 space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    ${team1.length ? team1.map(p => playerCard(p, byTarget, meObj && meObj.id, session.admin)).join("") : `<div class="text-sm text-gray-500">Vazio</div>`}
                  </div>
                </div>

                <div class="bg-white rounded-2xl border p-3">
                  <div class="flex items-center justify-between">
                    <h2 class="text-lg font-bold text-orange-700">${escapeHtml(team2Label)} <span class="text-sm font-semibold text-gray-600">(${team2Count}/${TEAM_MAX})</span></h2>
                    <div class="text-sm text-gray-600">Média: ${t2Avg}</div>
                  </div>
                  <div class="mt-2 space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    ${team2.length ? team2.map(p => playerCard(p, byTarget, meObj && meObj.id, session.admin)).join("") : `<div class="text-sm text-gray-500">Vazio</div>`}
                  </div>
                </div>

                <div class="bg-white rounded-2xl border p-3 md:col-span-2">
                  <div class="flex items-center justify-between">
                    <h2 class="text-lg font-semibold">Presentes · Aguardando escolha</h2>
                    <div class="text-sm text-gray-600">Presentes: ${presentPlayers.length} · Total cadastrados: ${playersArr.length}</div>
                  </div>
                  <div class="mt-2 space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    ${waiting.length ? waiting.map(p => waitingCard(p, byTarget, meObj && meObj.id, session.admin)).join("") : `<div class="text-sm text-gray-500">Ninguém aguardando.</div>`}
                  </div>
                </div>

                <div class="bg-white rounded-2xl border p-3 md:col-span-2">
                  <div class="flex items-center justify-between">
                    <h2 class="text-lg font-semibold">Ausentes (rodada atual)</h2>
                    <div class="text-sm text-gray-600">Ausentes: ${absent.length}</div>
                  </div>
                  <div class="mt-2 space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    ${absent.length ? absent.map(p => absentCard(p, byTarget, meObj && meObj.id, session.admin)).join("") : `<div class="text-sm text-gray-500">Ninguém ausente.</div>`}
                  </div>
                </div>

                <div class="bg-white rounded-2xl border p-4 md:col-span-2">
                  ${plan === "free" ? `
                    <div>
                      <h2 class="text-lg font-semibold">Painel de gestão</h2>
                      <p class="text-sm text-gray-500">No plano Free você usa a base do app para cadastro, presença, avaliações e montagem de times.</p>
                    </div>
                    <div class="mt-4 grid gap-3">
                      ${premiumLockCard("Histórico de partidas", "Salve e consulte partidas anteriores no plano Básico ou PRO.", "histórico de partidas")}
                      ${premiumLockCard("Ranking e estatísticas", "Compare atletas e acompanhe números do grupo nos planos superiores.", "ranking e estatísticas")}
                      ${premiumLockCard("Relatórios e personalização", "Relatórios completos e personalização profissional ficam liberados no plano PRO.", "relatórios e personalização")}
                    </div>
                  ` : `
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h2 class="text-lg font-semibold">${plan === "pro" ? "Painel avançado" : "Painel de gestão"}</h2>
                        <p class="text-sm text-gray-500">${plan === "pro" ? "Ranking, estatísticas, relatórios e histórico para gestão mais profissional." : "Ranking, estatísticas e histórico essenciais para o organizador."}</p>
                      </div>
                      ${canUseReports ? `
                        <div class="flex flex-wrap gap-2">
                          <button id="btnCopyReport" class="px-3 py-2 rounded-lg border hover:bg-gray-50 font-semibold text-sm">Copiar relatório</button>
                          <button id="btnWAReport" class="px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 font-semibold text-sm">WhatsApp</button>
                          <button id="btnDownloadReport" class="px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 font-semibold text-sm">Baixar TXT</button>
                        </div>
                      ` : `
                        <div class="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Relatórios completos ficam disponíveis no plano PRO.
                        </div>
                      `}
                    </div>

                    <div class="mt-4 grid gap-4 xl:grid-cols-3">
                      <div class="rounded-2xl border p-3 bg-gray-50">
                        <div class="font-semibold text-gray-800">Ranking atual</div>
                        <div class="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-1">
                          ${rankingData.length ? rankingData.slice(0, rankingLimit).map((r, idx) => `
                            <div class="rounded-xl border bg-white px-3 py-2 flex items-center justify-between gap-3">
                              <div>
                                <div class="text-sm font-semibold text-gray-800">${idx+1}. ${escapeHtml(r.name)}</div>
                                <div class="text-[11px] text-gray-500">${escapeHtml(r.position)} · históricos ${r.appearances} ${r.present ? "· presente" : ""}</div>
                              </div>
                              <div class="text-sm font-bold text-blue-700">${r.note.toFixed(1)}</div>
                            </div>
                          `).join("") : `<div class="text-sm text-gray-500">Sem ranking ainda.</div>`}
                        </div>
                        ${plan === "basico" ? `<div class="mt-2 text-xs text-amber-700">Plano Básico mostra os 5 primeiros. Ranking completo no PRO.</div>` : ``}
                      </div>

                      <div class="rounded-2xl border p-3 bg-gray-50">
                        <div class="font-semibold text-gray-800">Estatísticas</div>
                        <div class="mt-3 grid grid-cols-2 gap-2">
                          <div class="rounded-xl bg-white border p-3">
                            <div class="text-[11px] text-gray-500">Jogadores</div>
                            <div class="text-xl font-extrabold text-gray-800">${dashboardStats.totalPlayers}</div>
                          </div>
                          <div class="rounded-xl bg-white border p-3">
                            <div class="text-[11px] text-gray-500">Presentes</div>
                            <div class="text-xl font-extrabold text-gray-800">${dashboardStats.presentPlayers}</div>
                          </div>
                          <div class="rounded-xl bg-white border p-3">
                            <div class="text-[11px] text-gray-500">Média geral</div>
                            <div class="text-xl font-extrabold text-gray-800">${dashboardStats.avgGeneral}</div>
                          </div>
                          <div class="rounded-xl bg-white border p-3">
                            <div class="text-[11px] text-gray-500">Avaliações</div>
                            <div class="text-xl font-extrabold text-gray-800">${dashboardStats.ratingsCount}</div>
                          </div>
                          <div class="rounded-xl bg-white border p-3 col-span-2">
                            <div class="text-[11px] text-gray-500">Posição mais comum</div>
                            <div class="text-base font-extrabold text-gray-800">${escapeHtml(dashboardStats.topPos)}</div>
                          </div>
                          <div class="rounded-xl bg-white border p-3 col-span-2">
                            <div class="text-[11px] text-gray-500">Melhor nota atual</div>
                            <div class="text-base font-extrabold text-gray-800">${dashboardStats.best ? escapeHtml(dashboardStats.best.name) + " · " + dashboardStats.best.note.toFixed(1) : "—"}</div>
                          </div>
                        </div>
                      </div>

                      <div class="rounded-2xl border p-3 bg-gray-50">
                        <div class="font-semibold text-gray-800">Histórico de partidas</div>
                        <div class="mt-3 space-y-2 max-h-[360px] overflow-y-auto pr-1">
                          ${historyVisible.length ? historyVisible.map((snap, idx) => `
                            <div class="rounded-xl border bg-white px-3 py-2">
                              <div class="flex items-center justify-between gap-2">
                                <div class="text-sm font-semibold text-gray-800">${idx+1}. ${escapeHtml(fmtBR(snap.createdAtMs || snap.createdAt))}</div>
                                <div class="text-[11px] text-gray-500">${(Array.isArray(snap.team1)?snap.team1.length:0)+(Array.isArray(snap.team2)?snap.team2.length:0)} jogadores</div>
                              </div>
                              <div class="mt-1 text-[11px] text-gray-500">
                                ${escapeHtml(team1Label)} ${Number(snap.avg1 || 0).toFixed(2)} · ${escapeHtml(team2Label)} ${Number(snap.avg2 || 0).toFixed(2)}
                              </div>
                            </div>
                          `).join("") : `<div class="text-sm text-gray-500">Nenhuma partida salva ainda.</div>`}
                        </div>
                        ${plan === "basico" ? `<div class="mt-2 text-xs text-amber-700">Histórico básico liberado. Recursos completos no PRO.</div>` : ``}
                      </div>
                    </div>
                  `}
                </div>
              </div>
            </div>
          `}
        </div>
      `;

      // Wire events
      if(code){
        $("btnCopy").onclick = async ()=> {
          try{ await navigator.clipboard.writeText(code); setInfo("Código copiado."); }
          catch{ setInfo("Não foi possível copiar automaticamente."); }
        };
        $("btnLeave").onclick = ()=> leaveRoom();

        if($("btnRegister")) $("btnRegister").onclick = ()=> registerMe();
        if($("btnRegisterSendWA")) $("btnRegisterSendWA").onclick = ()=> registerMeSendWhatsApp();
        if($("btnSaveMyProfile")) $("btnSaveMyProfile").onclick = ()=> updateMyProfile();

if($("btnCopyMyAccessCode")) $("btnCopyMyAccessCode").onclick = ()=> {
  const m = me();
  if(m && m.accessCode) copyText(String(m.accessCode));
};
if($("btnGenMyAccessCode")) $("btnGenMyAccessCode").onclick = async ()=> {
  const m = me();
  if(!m) return;
  try{
    const ac = await ensureAccessCodeForPlayer(state.code, m.id);
    setInfo("Código gerado: " + ac);
  }catch(e){
    setSyncError(e && e.message ? e.message : e);
  }
};
if($("btnClaimAccessCode")) $("btnClaimAccessCode").onclick = ()=> claimPlayerByAccessCode();

        if($("btnAddPlayer")) $("btnAddPlayer").onclick = ()=> startAddPlayer();
        if($("btnBackToMe")) $("btnBackToMe").onclick = ()=> backToPrevPlayer();
        if($("btnBackToMe2")) $("btnBackToMe2").onclick = ()=> backToPrevPlayer();

        if($("btnSairLista")) $("btnSairLista").onclick = ()=> sairDaLista();

        if($("btnPresent")) $("btnPresent").onclick = ()=> markPresence(true);
        if($("btnAbsent")) $("btnAbsent").onclick = ()=> markPresence(false);

        if($("btnRate")) $("btnRate").onclick = ()=> openRatingFlow();
        if($("btnTeam1")) $("btnTeam1").onclick = ()=> chooseTeam(1);
        if($("btnTeam2")) $("btnTeam2").onclick = ()=> chooseTeam(2);

        // Compartilhar (admin)
        if($("btnCopyTeams")) $("btnCopyTeams").onclick = ()=> copyCurrentTeams();
        if($("btnWATeams")) $("btnWATeams").onclick = ()=> whatsCurrentTeams();
        if($("btnDownloadPng")) $("btnDownloadPng").onclick = ()=> downloadTeamsPng();
        if($("btnSaveTeams")) $("btnSaveTeams").onclick = ()=> saveTeamsSnapshot();

        document.querySelectorAll("[data-snapcopy]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const id = btn.getAttribute("data-snapcopy");
            copyToClipboard(snapshotTextById(id));
          });
        });
        document.querySelectorAll("[data-snapwa]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const id = btn.getAttribute("data-snapwa");
            openWhatsAppWithText(snapshotTextById(id));
          });
        });
        document.querySelectorAll("[data-snapdel]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const id = btn.getAttribute("data-snapdel");
            deleteSnapshot(id);
          });
        });

        if($("btnToggleOpen")) $("btnToggleOpen").onclick = ()=> toggleOpen();
        if($("btnNewRound")) $("btnNewRound").onclick = ()=> newRound();
        if($("btnSort")) $("btnSort").onclick = ()=> randomizeTeams();
        if($("btnReset")) $("btnReset").onclick = ()=> resetCurrentRoom();

        if($("btnSaveGroup")) $("btnSaveGroup").onclick = ()=> saveCurrentInternalGroup();
        if($("btnUpdateGroup")) $("btnUpdateGroup").onclick = ()=> updateCurrentInternalGroup();
        document.querySelectorAll("[data-open-internal-group]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const id = btn.getAttribute("data-open-internal-group");
            openInternalGroup(id);
          });
        });
        document.querySelectorAll("[data-delete-internal-group]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const id = btn.getAttribute("data-delete-internal-group");
            deleteInternalGroup(id);
          });
        });
        if($("btnCopyReport")) $("btnCopyReport").onclick = ()=> copyManagementReport(playersArr, presentPlayers, waiting, team1, team2, byTarget);
        if($("btnWAReport")) $("btnWAReport").onclick = ()=> whatsManagementReport(playersArr, presentPlayers, waiting, team1, team2, byTarget);
        if($("btnDownloadReport")) $("btnDownloadReport").onclick = ()=> downloadManagementReport(playersArr, presentPlayers, waiting, team1, team2, byTarget);
        if($("btnSavePersonalization")) $("btnSavePersonalization").onclick = ()=> savePersonalization();
        if($("btnDevCloseAllOpen")) $("btnDevCloseAllOpen").onclick = ()=> developerCloseAllOpenRooms();
        if($("btnCopyRoomLink")) $("btnCopyRoomLink").onclick = ()=> copyToClipboard(buildRoomUrl(code));

        document.querySelectorAll("[data-open-group]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-open-group");
            joinRoomByCode(roomCode);
          });
        });
        document.querySelectorAll("[data-delete-group]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-delete-group");
            removeSavedGroup(roomCode);
            setInfo("Grupo removido da lista salva.");
          });
        });

        if($("btnDevRefresh")) $("btnDevRefresh").onclick = ()=> loadDeveloperRooms(true);
        if($("btnCreateTrialRoom")) $("btnCreateTrialRoom").onclick = ()=> createFreeTrialRoom();
        if($("btnDevDeleteExceptProtected")) $("btnDevDeleteExceptProtected").onclick = ()=> developerDeleteAllExceptProtected();
        if($("devRoomFilter")) $("devRoomFilter").oninput = (e)=> developerSetFilter(e.target.value);
        document.querySelectorAll("[data-dev-open]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-open");
            openDeveloperRoom(roomCode);
          });
        });
        document.querySelectorAll("[data-dev-copylink]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-copylink");
            copyToClipboard(buildRoomUrl(roomCode));
          });
        });
        document.querySelectorAll("[data-dev-copyaccess]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-copyaccess");
            developerCopyAdminAccess(roomCode);
          });
        });
        document.querySelectorAll("[data-dev-saveall]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-saveall");
            developerSaveRoomAll(roomCode);
          });
        });
        document.querySelectorAll("[data-dev-convert-basic]").forEach(btn=>{
          btn.onclick = ()=> developerConvertTrialToPaid(btn.getAttribute("data-dev-convert-basic"), "basico");
        });
        document.querySelectorAll("[data-dev-convert-pro]").forEach(btn=>{
          btn.onclick = ()=> developerConvertTrialToPaid(btn.getAttribute("data-dev-convert-pro"), "pro");
        });
        document.querySelectorAll("[data-dev-extendtrial]").forEach(btn=>{
          btn.onclick = ()=> developerExtendTrial(btn.getAttribute("data-dev-extendtrial"), 7);
        });
        document.querySelectorAll("[data-dev-renewmonth]").forEach(btn=>{
          btn.onclick = ()=> developerRenewMonthly(btn.getAttribute("data-dev-renewmonth"), 1);
        });
        document.querySelectorAll("[data-dev-copyclient]").forEach(btn=>{
          btn.onclick = async ()=> {
            const roomCode = btn.getAttribute("data-dev-copyclient");
            const room = (state.developerRooms || []).find(r => normalizeRoomCode(r.code) === normalizeRoomCode(roomCode)) || {};
            const lines = [
              `Resumo comercial · Manchette Volleyball`,
              `Sala: ${room.code || roomCode}`,
              room.roomName ? `Grupo: ${room.roomName}` : "",
              room.ownerName ? `Cliente: ${room.ownerName}` : "",
              room.ownerWhatsApp ? `WhatsApp: ${room.ownerWhatsApp}` : "",
              `Plano: ${planLabel(room.plan || 'free')}`,
              `Status: ${commercialStatusLabel(room.commercialStatus || 'ativo')}`,
              room.trialEndsAt ? `Teste até: ${fmtDatePt(room.trialEndsAt)}` : "",
              room.paidUntil ? `Vence em: ${fmtDatePt(room.paidUntil)}` : "",
              room.clientNotes ? `Obs.: ${room.clientNotes}` : ""
            ].filter(Boolean);
            await copyToClipboard(lines.join("\n"));
            setInfo(`Resumo da sala ${roomCode} copiado.`);
          };
        });
        document.querySelectorAll("[data-dev-reset]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-reset");
            developerResetRoom(roomCode);
          });
        });
        document.querySelectorAll("[data-dev-remove]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-remove");
            developerDeleteRoom(roomCode);
          });
        });
        document.querySelectorAll("[data-dev-toggle]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-toggle");
            const openState = btn.getAttribute("data-dev-openstate") === "1";
            developerToggleOpenRoom(roomCode, openState);
          });
        });
        document.querySelectorAll("[data-dev-activate]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-activate");
            developerSetCommercialStatus(roomCode, "ativo");
          });
        });
        document.querySelectorAll("[data-dev-block]").forEach(btn=>{
          btn.addEventListener("click", ()=>{
            const roomCode = btn.getAttribute("data-dev-block");
            developerSetCommercialStatus(roomCode, "bloqueado");
          });
        });

        if($("btnAccessPlayer")) $("btnAccessPlayer").onclick = ()=> playerLogin();
        if($("btnAccessAdmin")) $("btnAccessAdmin").onclick = ()=> adminLogin();
        if($("btnAccessDeveloper")) $("btnAccessDeveloper").onclick = ()=> developerLogin();
        if($("btnOpenDemo")) $("btnOpenDemo").onclick = ()=> openDemoRoom();
        if($("btnOpenDemo2")) $("btnOpenDemo2").onclick = ()=> openDemoRoom();
        if($("btnStartFreeTrial")) $("btnStartFreeTrial").onclick = ()=> createFreeTrialRoom();
        if($("btnAccessLogout")) $("btnAccessLogout").onclick = ()=> adminLogout();
        if($("btnAdminOut")) $("btnAdminOut").onclick = ()=> adminLogout();
        if($("btnNotifToggle")) $("btnNotifToggle").onclick = ()=> notificationsEnabled() ? disableSystemNotifications() : enableSystemNotifications();
        if($("btnNotifToggleRoom")) $("btnNotifToggleRoom").onclick = ()=> notificationsEnabled() ? disableSystemNotifications() : enableSystemNotifications();
        if($("btnCurrentExtendTrial")) $("btnCurrentExtendTrial").onclick = ()=> developerExtendTrial(code, 7);
        if($("btnCurrentConvertBasic")) $("btnCurrentConvertBasic").onclick = ()=> developerConvertTrialToPaid(code, "basico");
        if($("btnCurrentRenewMonth")) $("btnCurrentRenewMonth").onclick = ()=> developerRenewMonthly(code, 1);
        if($("btnSaveSchedule")) $("btnSaveSchedule").onclick = ()=> saveMatchSchedule();
        if($("btnClearSchedule")) $("btnClearSchedule").onclick = ()=> clearMatchSchedule();

        if(session.admin){
          document.querySelectorAll("[data-del]").forEach(btn=>{
            btn.addEventListener("click", ()=>{
              const pid = btn.getAttribute("data-del");
              const nm = btn.getAttribute("data-name") || "Jogador";
              adminRemovePlayer(pid, nm);
            });
          });
        }
  } else {
    // Prefill do último código (não entra automaticamente)
    if($("roomCode")){
      const last = String(session.code || load(LS_LAST_CODE, "") || "").toUpperCase();
      if(!$("roomCode").value) $("roomCode").value = last;
    }
    if($("btnAccessPlayer")) $("btnAccessPlayer").onclick = ()=> playerLogin();
    if($("btnAccessAdmin")) $("btnAccessAdmin").onclick = ()=> adminLogin();
    if($("btnAccessDeveloper")) $("btnAccessDeveloper").onclick = ()=> developerLogin();
    if($("btnAccessLogout")) $("btnAccessLogout").onclick = ()=> adminLogout();
    if($("btnNotifToggle")) $("btnNotifToggle").onclick = ()=> notificationsEnabled() ? disableSystemNotifications() : enableSystemNotifications();
    $("btnJoin").onclick = ()=> joinRoom();
    if($("btnPasteJoin")) $("btnPasteJoin").onclick = ()=> pasteRoomCodeAndJoin();
    $("btnCreate").onclick = ()=> createRoom();
    if($("roomCode")) {
      $("roomCode").addEventListener("input", ()=>{
        const normalized = normalizeRoomCode(($('roomCode')?.value || '').replace(/\s+/g, ''));
        if($('roomCode').value !== normalized) $('roomCode').value = normalized;
      });
      $("roomCode").addEventListener("paste", ()=>{
        setTimeout(()=>{
          const pasted = normalizeRoomCode(($('roomCode')?.value || '').replace(/\s+/g, ''));
          if(pasted){
            $('roomCode').value = pasted;
            joinRoomByCode(pasted);
          }
        }, 20);
      });
    }

    document.querySelectorAll("[data-open-group]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const roomCode = btn.getAttribute("data-open-group");
        joinRoomByCode(roomCode);
      });
    });
    document.querySelectorAll("[data-delete-group]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const roomCode = btn.getAttribute("data-delete-group");
        removeSavedGroup(roomCode);
        setInfo("Grupo removido da lista salva.");
      });
    });
  }
}

    function wireModals(){
      $("btnRateClose").onclick = ()=> closeRatingModal();
      $("ratingBack").addEventListener("click", (e)=>{ if(e.target === $("ratingBack")) closeRatingModal(); });
      $("btnSendRating").onclick = ()=> sendRating();
    }

    // ===============================
    // Boot
    // ===============================
    (function boot(){

// Mostra erros de JS na tela (para evitar ficar só "Carregando...")
window.addEventListener("error", (ev)=>{
  try{
    const msg = (ev && ev.message) ? ev.message : String(ev);
    setSyncError("Erro de JavaScript: " + msg);
  }catch{}
});
window.addEventListener("unhandledrejection", (ev)=>{
  try{
    const msg = (ev && ev.reason && ev.reason.message) ? ev.reason.message : String(ev.reason || ev);
    setSyncError("Promise rejeitada: " + msg);
  }catch{}
});


      wireModals();

      try{
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
      }catch(e){
        $("app").innerHTML = `
          <div class="bg-white rounded-2xl shadow p-4 sm:p-6 text-red-700">
            <b>Erro inicializando Firebase:</b> ${escapeHtml(e && e.message ? e.message : e)}<br/>
            Confira se o firebaseConfig está correto.
          </div>
        `;
        console.error(e);
        return;
      }

      render();
      if(session.developer) loadDeveloperRooms(true);

      const roomFromQuery = roomCodeFromUrl();
      if(roomFromQuery){
        joinRoomByCode(roomFromQuery);
      }else{
        const rememberedRoom = normalizeRoomCode(session.code || load(LS_LAST_CODE, ""));
        if(rememberedRoom && ((accessMode() === "player" && !!session.playerId) || accessMode() === "developer")){
          joinRoomByCode(rememberedRoom);
        }
      }

      if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register("sw.js").catch(()=>{});
        });
      }

      setInterval(()=>{
        if(state.code){
          maybeAutoCloseSchedule();
          render();
        }
      }, 30000);
// Testes leves (console)
      console.assert(median([5,6,7])===6, "median ímpar");
      console.assert(median([5,6,7,8])===6.5, "median par");
      const bm0 = balanceMessage([{id:"a",baseNote:7}], [], {});
      console.assert(bm0.text==="", "não deveria alertar antes de 5 escolhas");

      state.attendance = {};
      console.assert(isPresent("x")==false, "default ausente");
    })();
  