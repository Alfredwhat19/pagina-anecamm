const STORAGE_KEY = "anecamm_clubes";
const form = document.getElementById("clubForm");
const directoryBody = document.getElementById("directoryBody");
const statusMsg = document.getElementById("statusMsg");
const clearBtn = document.getElementById("clearData");
const directorySearch = document.getElementById("directorySearch");
const carousels = Array.from(document.querySelectorAll(".js-carousel"));
const nav = document.getElementById("mainNav");
const menuToggle = document.getElementById("menuToggle");
const checkoutLink = form?.querySelector('a.btn[href]');
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const CERT_DOWNLOAD_KEY_PREFIX = "anecamm_cert_downloaded_";
const CERT_SIGNED_BY = "Firmado por ANECAMM por Arjan Oliver Guerrero Díaz";

let directoryQuery = "";
let directoryData = [];
let isSubmittingCheckout = false;

const showStatus = (message, isError = false) => {
  if (!statusMsg) return;
  statusMsg.textContent = message;
  statusMsg.classList.toggle("error", isError);
};

const parsePaidAt = (paidAt) => {
  if (!paidAt || typeof paidAt !== "string") return null;
  const normalized = paidAt.includes("T") ? paidAt : paidAt.replace(" ", "T");
  const hasTimezone = /Z|[+-]\d{2}:?\d{2}$/.test(normalized);
  const withTimezone = hasTimezone ? normalized : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatEsDate = (date) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

const buildDocumentId = (clubId, createdAt) => {
  const datePart = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `ANECAMM-${clubId}-${datePart}`;
};

const createPdfRenderContainer = (html) => {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const styles = Array.from(parsed.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .join("\n");
  const pdfOverrides = `
    .pdf24_view {
      font-size: 1em !important;
      transform: none !important;
      -webkit-transform: none !important;
      -moz-transform: none !important;
      transform-origin: top left !important;
      -webkit-transform-origin: top left !important;
      -moz-transform-origin: top left !important;
    }

    .pdf24_02 {
      width: 45em !important;
      height: 60em !important;
      overflow: hidden !important;
      box-shadow: none !important;
      margin: 0 !important;
    }

    body > div {
      box-shadow: none !important;
      margin: 0 !important;
    }
  `;

  const renderRoot = document.createElement("div");
  // Keep the node rendered and measurable for html2canvas, but move it off-screen.
  renderRoot.style.position = "absolute";
  renderRoot.style.left = "-10000px";
  renderRoot.style.top = "0";
  renderRoot.style.zIndex = "0";
  renderRoot.style.pointerEvents = "none";
  renderRoot.style.opacity = "1";
  renderRoot.style.visibility = "visible";
  renderRoot.style.background = "#ffffff";
  renderRoot.style.width = "8.5in";
  renderRoot.style.minWidth = "8.5in";
  renderRoot.style.height = "11in";
  renderRoot.style.minHeight = "11in";
  renderRoot.style.overflow = "hidden";
  renderRoot.innerHTML = `<style>${styles}\n${pdfOverrides}</style>${parsed.body.innerHTML}`;

  document.body.appendChild(renderRoot);
  return renderRoot;
};

const downloadPdfFile = async (filename, html) => {
  if (typeof window.html2pdf !== "function") {
    throw new Error("La libreria para generar PDF no esta disponible.");
  }

  const renderRoot = createPdfRenderContainer(html);

  try {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    await window
      .html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        },
        jsPDF: {
          unit: "in",
          format: "letter",
          orientation: "portrait",
        },
      })
      .from(renderRoot)
      .save();
  } finally {
    renderRoot.remove();
  }
};

const fetchCertificateData = async (sessionId) => {
  const response = await fetch(
    `/api/afiliacion-documento?session_id=${encodeURIComponent(sessionId)}`
  );
  const payload = await response.json().catch(() => ({}));

  return { response, payload };
};

const buildCertificateHtml = async (data) => {
  const createdAt = parsePaidAt(data.paid_at);
  if (!createdAt) {
    throw new Error("No se pudo interpretar la fecha de pago.");
  }

  const expiresAt = new Date(createdAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const documentId = data.document_id || buildDocumentId(data.id, createdAt);

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Certificado ANECAMM</title>
        <style>
          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #111111;
            font-family: "Georgia", "Times New Roman", serif;
          }

          body {
            width: 8.5in;
            min-height: 11in;
          }

          .certificate {
            position: relative;
            width: 8.5in;
            min-height: 11in;
            padding: 0.55in;
            background:
              linear-gradient(135deg, rgba(151, 11, 26, 0.08), rgba(151, 11, 26, 0)),
              #ffffff;
          }

          .frame {
            min-height: calc(11in - 1.1in);
            border: 4px solid #970b1a;
            outline: 1px solid #d2b46d;
            outline-offset: -14px;
            padding: 0.7in 0.65in;
          }

          .eyebrow {
            margin: 0;
            text-align: center;
            font-family: Arial, sans-serif;
            font-size: 13px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #970b1a;
          }

          .title {
            margin: 0.22in 0 0;
            text-align: center;
            font-size: 34px;
            line-height: 1.15;
          }

          .subtitle {
            margin: 0.18in auto 0;
            max-width: 6.2in;
            text-align: center;
            font-size: 16px;
            line-height: 1.65;
          }

          .club-name {
            margin: 0.45in 0 0;
            text-align: center;
            font-size: 28px;
            font-weight: 700;
            color: #970b1a;
            text-transform: uppercase;
          }

          .city {
            margin: 0.12in 0 0;
            text-align: center;
            font-size: 18px;
          }

          .details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.24in;
            margin-top: 0.5in;
          }

          .card {
            border: 1px solid #dbc38c;
            background: #fffaf0;
            padding: 0.2in 0.22in;
          }

          .label {
            margin: 0;
            font-family: Arial, sans-serif;
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #6d6d6d;
          }

          .value {
            margin: 0.08in 0 0;
            font-size: 20px;
            line-height: 1.35;
          }

          .footer {
            margin-top: 0.55in;
            padding-top: 0.3in;
            border-top: 1px solid #d7d7d7;
          }

          .signature {
            margin: 0;
            text-align: center;
            font-size: 18px;
          }

          .meta {
            margin-top: 0.26in;
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.8;
            color: #333333;
          }
        </style>
      </head>
      <body>
        <main class="certificate">
          <section class="frame">
            <p class="eyebrow">ANECAMM</p>
            <h1 class="title">Certificado de Afiliacion</h1>
            <p class="subtitle">
              La Asociacion Nacional de Escuelas, Clubes y Academias de Muaythai de Mexico A.C.
              acredita a este club como miembro activo dentro del directorio oficial de ANECAMM.
            </p>

            <h2 class="club-name">${data.nombre_club}</h2>
            <p class="city">${data.ciudad_estado}</p>

            <section class="details">
              <article class="card">
                <p class="label">Instructor responsable</p>
                <p class="value">${data.instructor}</p>
              </article>
              <article class="card">
                <p class="label">Vigencia</p>
                <p class="value">${formatEsDate(createdAt)} al ${formatEsDate(expiresAt)}</p>
              </article>
            </section>

            <footer class="footer">
              <p class="signature">${CERT_SIGNED_BY}</p>
              <div class="meta">
                <div><strong>ID del documento:</strong> ${documentId}</div>
                <div><strong>Fecha de emision:</strong> ${formatEsDate(createdAt)}</div>
                <div><strong>Valido hasta:</strong> ${formatEsDate(expiresAt)}</div>
              </div>
            </footer>
          </section>
        </main>
      </body>
    </html>
  `;
};

const attemptCertificateDownload = async (sessionId) => {
  const { response, payload } = await fetchCertificateData(sessionId);

  if (response.status === 409) {
    return { pending: true };
  }

  if (!response.ok || !payload?.ok || !payload?.data) {
    const message = payload?.error || "No se pudo preparar el documento.";
    throw new Error(message);
  }

  const html = await buildCertificateHtml(payload.data);
  const filename = `afiliacion-${payload.data.id}.pdf`;
  await downloadPdfFile(filename, html);

  return { ok: true };
};

const maybeDownloadCertificate = (sessionId) => {
  if (!sessionId) return;

  const storageKey = `${CERT_DOWNLOAD_KEY_PREFIX}${sessionId}`;
  if (sessionStorage.getItem(storageKey)) return;

  let attempts = 0;
  const maxAttempts = 8;
  const waitMs = 2000;

  const run = async () => {
    try {
      const result = await attemptCertificateDownload(sessionId);
      if (result?.ok) {
        sessionStorage.setItem(storageKey, "1");
        showStatus("Pago confirmado. Descargando tu documento...");
        return;
      }

      if (result?.pending && attempts < maxAttempts) {
        attempts += 1;
        showStatus("Pago confirmado. Generando tu documento...");
        setTimeout(run, waitMs);
        return;
      }

      showStatus(
        "Pago confirmado, pero el documento aun no esta listo. Intenta recargar en unos segundos.",
        true
      );
    } catch (error) {
      console.error(error);
      showStatus(error.message || "No se pudo descargar el documento.", true);
    }
  };

  run();
};

const createTextCell = (value) => {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
};

const getSafeHttpUrl = (value) => {
  if (typeof value !== "string") return null;

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
};

const createSocialCell = (value) => {
  const cell = document.createElement("td");
  const safeUrl = getSafeHttpUrl(value);

  if (!safeUrl) {
    cell.textContent = "-";
    return cell;
  }

  const link = document.createElement("a");
  link.href = safeUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Ver perfil";
  cell.appendChild(link);

  return cell;
};

const createDirectoryRow = (club) => {
  const row = document.createElement("tr");
  row.appendChild(createTextCell(club.nombre_club || ""));
  row.appendChild(createTextCell(club.ciudad_estado || ""));
  row.appendChild(createTextCell(club.instructor || ""));
  row.appendChild(createTextCell("-"));
  row.appendChild(createSocialCell(club.red_social));
  row.appendChild(createTextCell(club.estatus || ""));
  return row;
};

const renderDirectoryMessage = (message) => {
  if (!directoryBody) return;

  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 6;
  cell.textContent = message;
  row.appendChild(cell);
  directoryBody.replaceChildren(row);
};

const filterClubs = (clubs, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return clubs;

  return clubs.filter((club) => {
    const searchable = [
      club.nombre_club,
      club.ciudad_estado,
      club.instructor,
      club.red_social,
      club.estatus,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(q);
  });
};

const renderDirectory = () => {
  if (!directoryBody) return;

  const clubs = filterClubs(directoryData, directoryQuery);
  if (!clubs.length) {
    renderDirectoryMessage("No hay resultados para mostrar.");
    return;
  }

  directoryBody.replaceChildren(...clubs.map((club) => createDirectoryRow(club)));
};

async function cargarDirectorio() {
  if (!directoryBody) return;

  try {
    const response = await fetch("/api/directorio");
    if (!response.ok) {
      throw new Error(`Error ${response.status}`);
    }

    directoryData = await response.json();
    renderDirectory();
  } catch (error) {
    renderDirectoryMessage("No se pudo cargar el directorio.");
    console.error(error);
  }
}

const showCheckoutStateFromUrl = () => {
  if (!statusMsg) return;

  const params = new URLSearchParams(window.location.search);

  if (params.get("success") === "true") {
    showStatus("Pago confirmado. Tu afiliacion sera visible al confirmarse el webhook.");
    const sessionId = params.get("session_id");
    maybeDownloadCertificate(sessionId);
  }

  if (params.get("cancel") === "true") {
    showStatus("Pago cancelado. Puedes intentarlo nuevamente.", true);
  }
};

const createCheckoutSession = async () => {
  if (!form || isSubmittingCheckout) return;

  const fd = new FormData(form);
  const nombreClub = (fd.get("club") || "").toString().trim();
  const direccion = (fd.get("direccion") || "").toString().trim();
  const ciudadEstado = (fd.get("ciudadEstado") || "").toString().trim();
  const instructor = (fd.get("instructor") || "").toString().trim();
  const redSocial = (fd.get("redSocial") || "").toString().trim();
  const logo = fd.get("logo");
  const fotoGrupal = fd.get("foto");

  if (!nombreClub || !direccion || !ciudadEstado || !instructor) {
    showStatus("Completa los datos obligatorios del club.", true);
    return;
  }

  if (!(logo instanceof File) || logo.size <= 0) {
    showStatus("Debes seleccionar un logotipo.", true);
    return;
  }

  if (logo.size > MAX_FILE_SIZE_BYTES) {
    showStatus("El logotipo excede el tamaño maximo permitido de 5 MB.", true);
    return;
  }

  if (!(fotoGrupal instanceof File) || fotoGrupal.size <= 0) {
    showStatus("Debes seleccionar una foto grupal.", true);
    return;
  }

  if (fotoGrupal.size > MAX_FILE_SIZE_BYTES) {
    showStatus("La foto grupal excede el tamaño maximo permitido de 5 MB.", true);
    return;
  }

  const payload = new FormData();
  payload.append("nombre_club", nombreClub);
  payload.append("direccion", direccion);
  payload.append("ciudad_estado", ciudadEstado);
  payload.append("instructor", instructor);
  payload.append("red_social", redSocial);
  payload.append("logo", logo);
  payload.append("foto_grupal", fotoGrupal);

  isSubmittingCheckout = true;
  showStatus("Redirigiendo a Stripe...");

  try {
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      body: payload,
    });

    const result = await response.json();
    if (!response.ok || !result?.ok || !result?.checkoutUrl) {
      throw new Error(result?.error || `Error ${response.status}`);
    }

    window.location = result.checkoutUrl;
  } catch (error) {
    console.error(error);
    showStatus("No se pudo iniciar el pago. Intenta de nuevo.", true);
    isSubmittingCheckout = false;
  }
};

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    createCheckoutSession();
  });
}

if (checkoutLink) {
  checkoutLink.addEventListener("click", (event) => {
    event.preventDefault();
    createCheckoutSession();
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    showStatus("La demo local ya no se utiliza en esta version.");
  });
}

if (directorySearch) {
  directorySearch.addEventListener("input", (event) => {
    directoryQuery = event.target.value;
    renderDirectory();
  });
}

const initCarousel = (carouselRoot) => {
  if (!carouselRoot) return;

  const track = carouselRoot.querySelector(".carousel-track");
  const slides = Array.from(carouselRoot.querySelectorAll(".carousel-slide"));
  const prevBtn = carouselRoot.querySelector(".carousel-btn.prev");
  const nextBtn = carouselRoot.querySelector(".carousel-btn.next");
  const dotsId = `${carouselRoot.id}Dots`;
  const dotsRoot = document.getElementById(dotsId);
  if (!track || !slides.length || !prevBtn || !nextBtn) return;

  let index = 0;
  let autoplay = null;
  let touchStartX = 0;
  let touchEndX = 0;

  const getVisible = (breakpoint) => {
    const value = Number.parseInt(carouselRoot.dataset[breakpoint], 10);
    return Number.isInteger(value) && value > 0 ? value : null;
  };

  const visibleCount = () => {
    const mobile = getVisible("visibleMobile") || 1;
    const tablet = getVisible("visibleTablet") || 2;
    const desktop = getVisible("visibleDesktop") || 3;
    if (window.matchMedia("(max-width: 560px)").matches) return mobile;
    if (window.matchMedia("(max-width: 980px)").matches) return tablet;
    return desktop;
  };

  const slideWidth = () => {
    const computed = window.getComputedStyle(track);
    const gap = Number.parseFloat(computed.columnGap || computed.gap || "0") || 0;
    return slides[0].getBoundingClientRect().width + gap;
  };

  const maxIndex = () => Math.max(0, slides.length - visibleCount());

  const buildDots = () => {
    if (!dotsRoot) return;
    const pages = maxIndex() + 1;
    dotsRoot.innerHTML = "";
    for (let i = 0; i < pages; i += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Ir a grupo ${i + 1}`);
      dot.addEventListener("click", () => moveTo(i));
      dotsRoot.appendChild(dot);
    }
  };

  const paintDots = () => {
    if (!dotsRoot) return;
    const dots = Array.from(dotsRoot.querySelectorAll("button"));
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  };

  const moveTo = (nextIndex) => {
    index = Math.min(Math.max(nextIndex, 0), maxIndex());
    track.style.transform = `translateX(-${index * slideWidth()}px)`;
    paintDots();
  };

  const next = () => moveTo(index >= maxIndex() ? 0 : index + 1);
  const prev = () => moveTo(index <= 0 ? maxIndex() : index - 1);

  const stopAutoplay = () => {
    if (autoplay) {
      clearInterval(autoplay);
      autoplay = null;
    }
  };

  const startAutoplay = () => {
    stopAutoplay();
    autoplay = setInterval(next, 3400);
  };

  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);

  carouselRoot.addEventListener("mouseenter", stopAutoplay);
  carouselRoot.addEventListener("mouseleave", startAutoplay);

  carouselRoot.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].clientX;
  });

  carouselRoot.addEventListener("touchend", (event) => {
    touchEndX = event.changedTouches[0].clientX;
    const delta = touchStartX - touchEndX;
    if (Math.abs(delta) < 30) return;
    if (delta > 0) next();
    if (delta < 0) prev();
  });

  window.addEventListener("resize", () => {
    buildDots();
    moveTo(index);
  });

  buildDots();
  moveTo(0);
  startAutoplay();
};

const initCarousels = () => {
  if (!carousels.length) return;
  carousels.forEach((carouselRoot) => initCarousel(carouselRoot));
};

const initMenu = () => {
  if (!menuToggle || !nav) return;

  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
};

const initActiveNav = () => {
  if (!nav) return;

  const links = Array.from(nav.querySelectorAll("a"));
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  links.forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.includes(".html")) {
      const targetPage = href.split("#")[0].replace("./", "");
      link.classList.toggle("active", targetPage === currentPage);
    }
  });

  const sections = links
    .map((link) => {
      const href = link.getAttribute("href") || "";
      if (!href.includes("#")) return null;
      const hash = `#${href.split("#")[1]}`;
      return document.querySelector(hash);
    })
    .filter(Boolean);

  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const id = `#${entry.target.id}`;
        links.forEach((link) => {
          const href = link.getAttribute("href") || "";
          if (href.endsWith(id) || href === id) {
            link.classList.add("active");
          }
        });
      });
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
  );

  sections.forEach((section) => observer.observe(section));
};

document.addEventListener("DOMContentLoaded", () => {
  showCheckoutStateFromUrl();
  cargarDirectorio();
  initCarousels();
  initMenu();
  initActiveNav();
});





