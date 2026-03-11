
  // PWA install prompt (Android/Chrome/Edge)
  let deferredInstallPrompt = null;
  const btnInstall = document.getElementById("btnInstallApp");

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnInstall && !isStandalone()) btnInstall.classList.remove("hidden");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (btnInstall) btnInstall.classList.add("hidden");
  });

  if (btnInstall) {
    btnInstall.addEventListener("click", async () => {
      if (isIos()) {
        alert("No iPhone: abra no Safari > Compartilhar > Adicionar à Tela de Início.");
        return;
      }
      if (!deferredInstallPrompt) {
        alert("Instalação ainda não disponível. Tente no Chrome/Edge e aguarde alguns segundos.");
        return;
      }
      btnInstall.classList.add("hidden");
      deferredInstallPrompt.prompt();
      try { await deferredInstallPrompt.userChoice; } catch (_) {}
      deferredInstallPrompt = null;
    });

    // iOS: mostrar botão como ajuda (não instala automaticamente)
    if (isIos() && !isStandalone()) {
      btnInstall.classList.remove("hidden");
      btnInstall.textContent = "📲 Como instalar (iPhone)";
    }
  }
