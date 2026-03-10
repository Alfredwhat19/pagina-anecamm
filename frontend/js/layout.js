const buildHeader = (currentPage) => `
  <header class="topbar" id="top">
    <div class="brand-wrap">
      <img src="../assets/images/Logo.jpg" alt="Logo ANECAMM" class="logo" />
      <div>
        <p class="brand-kicker">Asociacion Nacional</p>
        <h1>ANECAMM</h1>
      </div>
    </div>

    <button id="menuToggle" class="menu-toggle" aria-expanded="false" aria-controls="mainNav" type="button">Menu</button>

    <nav id="mainNav" class="main-nav" aria-label="Navegacion principal">
      <a href="./index.html#inicio" class="${currentPage === "index.html" ? "active" : ""}">Inicio</a>
      <a href="./index.html#galeria" class="${currentPage === "index.html" ? "active" : ""}">Miembros</a>
      <a href="./afiliaciones-no-disponible.html" class="${["afiliaciones.html", "afiliaciones-no-disponible.html"].includes(currentPage) ? "active" : ""}">Afiliaciones</a>
      <a href="./directorio.html" class="${currentPage === "directorio.html" ? "active" : ""}">Directorio</a>
      <a href="./index.html#contacto" class="${currentPage === "index.html" ? "active" : ""}">Contacto</a>
      <a href="./index.html#noticias" class="${currentPage === "index.html" ? "active" : ""}">Galeria</a>
      <a href="./eventos.html#eventos" class="${currentPage === "eventos.html" ? "active" : ""}">Eventos</a>
    </nav>
  </header>
`;

const buildFooter = () => `
  <footer class="site-footer">
    <p>ANECAMM · Asociacion Nacional de Escuelas, Clubes y Academias de Muay Thai de Mexico A.C.</p>
    <p><a href="#top">Volver arriba</a></p>
  </footer>
`;

const initSharedLayout = () => {
  const page = window.location.pathname.split("/").pop() || "index.html";
  const headerHost = document.getElementById("siteHeader");
  const footerHost = document.getElementById("siteFooter");
  if (headerHost) headerHost.innerHTML = buildHeader(page);
  if (footerHost) footerHost.innerHTML = buildFooter();
};

initSharedLayout();
